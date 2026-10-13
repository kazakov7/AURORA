import {
	BadRequestException,
	Injectable,
	InternalServerErrorException,
	NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Tours, Tour } from '../../libs/dto/tour/tour';
import {
	AgentToursInquiry,
	AllToursInquiry,
	OrdinaryTourInquiry,
	TourInput,
	ToursInquiry,
} from '../../libs/dto/tour/tour.input';
import { TourUpdateInput, UpdateTourStatusInput } from '../../libs/dto/tour/tour.update';
import {
	lookUpAuthMemberLiked,
	lookupMember,
	shapeIntoMongoObjectId,
	escapeRegExp,
} from '../../libs/config';
import { Direction, Messages } from '../../libs/enums/common.enum';
import { LikeGroup } from '../../libs/enums/like.enum';
import { TourStatus } from '../../libs/enums/tour.enum';
import { ViewGroup } from '../../libs/enums/view.enum';
import { StatisticModifier, T } from '../../libs/types/common';
import { LikeService } from '../like/like.service';
import { MemberService } from '../member/member.service';
import { ViewService } from '../view/view.service';
import { AgentService } from '../agent/agent.service';
import { AgentType } from '../../libs/enums/agent.enum';
import { BookingCategory } from '../../libs/enums/booking.enum';
import { MemberStatus, MemberType } from '../../libs/enums/member.enum';
import { DestinationService } from '../destination/destination.service';
import { NotificationService } from '../notification/notification.service';
import { BookingService } from '../booking/booking.service';
import { NotificationGroup, NotificationType } from '../../libs/enums/notification.enum';

@Injectable()
export class TourService {
	constructor(
		@InjectModel('Tour') private readonly tourModel: Model<Tour>,
		private readonly memberService: MemberService,
		private readonly likeService: LikeService,
		private readonly viewService: ViewService,
		private readonly agentService: AgentService,
		private readonly destinationService: DestinationService,
		private readonly notificationService: NotificationService,
		private readonly bookingService: BookingService,
	) {}

	public async createTour(input: TourInput): Promise<Tour> {
		if (!input.memberId) throw new BadRequestException(Messages.NOT_AUTHENTICATED);
		await this.agentService.assertApprovedAgent(input.memberId, AgentType.TOUR);
		this.validateTourDates(input.tourStartDate, input.tourEndDate);
		const destinationId = shapeIntoMongoObjectId(input.destinationId);
		await this.destinationService.getActiveDestination(destinationId);

		try {
			const result = await this.tourModel.create({ ...input, destinationId });
			return result as unknown as Tour;
		} catch (error) {
			console.error('Tour creation failed:', error);
			throw new BadRequestException(Messages.CREATE_FAILED);
		}
	}

	public async getTour(
		memberId: Types.ObjectId,
		tourId: Types.ObjectId,
		memberType?: MemberType,
	): Promise<Tour> {
		const targetTour = await this.tourModel
			.findOne({ _id: tourId, deletedAt: null })
			.lean<Tour>()
			.exec();

		if (!targetTour) throw new NotFoundException(Messages.TOUR_NOT_FOUND);

		const isActive = targetTour.tourStatus === TourStatus.ACTIVE;
		const canPreview = memberType === MemberType.ADMIN || targetTour.memberId.equals(memberId);
		if (!isActive && !canPreview) throw new NotFoundException(Messages.TOUR_NOT_FOUND);

		if (memberId && isActive) {
			const newView = await this.viewService.recordView({
				memberId,
				viewRefId: tourId,
				viewGroup: ViewGroup.TOUR,
			});
			if (newView) {
				await this.tourStatsEditor({ _id: tourId, targetKey: 'tourViews', modifier: 1 });
				targetTour.tourViews += 1;
			}
		}

		if (memberId) {
			targetTour.meLiked = await this.likeService.checkLikeExistence({
				memberId,
				likeRefId: tourId,
				likeGroup: LikeGroup.TOUR,
			});
		}

		// A missing owner account must not break the page: the tour is returned without the host
		targetTour.memberData = await this.memberService
			.getMember(null, targetTour.memberId as unknown as Types.ObjectId)
			.catch((err) => {
				if (err instanceof NotFoundException) return null;
				throw err;
			});
		return targetTour;
	}

	public async tourStatsEditor(input: StatisticModifier): Promise<Tour> {
		const result = await this.tourModel
			.findByIdAndUpdate(
				input._id,
				[
					{
						$set: {
							[input.targetKey]: {
								$max: [0, { $add: [{ $ifNull: [`$${input.targetKey}`, 0] }, input.modifier] }],
							},
						},
					},
				] as any,
				{ new: true },
			)
			.exec();

		return result as unknown as Tour;
	}

	public async updateTour(memberId: Types.ObjectId, input: TourUpdateInput): Promise<Tour> {
		await this.agentService.assertApprovedAgent(memberId, AgentType.TOUR);
		const search: T = {
			_id: input._id,
			memberId,
			tourStatus: { $ne: TourStatus.INACTIVE },
			deletedAt: null,
		};
		const existingTour = await this.tourModel.findOne(search).lean<Tour>().exec();

		if (!existingTour) throw new InternalServerErrorException(Messages.UPDATE_FAILED);

		const isRescheduled =
			this.isDateChanged(input.tourStartDate, existingTour.tourStartDate) ||
			this.isDateChanged(input.tourEndDate, existingTour.tourEndDate);
		const isMoved =
			Boolean(input.destinationId) && !existingTour.destinationId.equals(input.destinationId);

		// Guests paid for the dates and the country they booked, so a tour with booked seats keeps both
		if ((isRescheduled || isMoved) && existingTour.tourReservedSeats > 0) {
			throw new BadRequestException(Messages.TOUR_HAS_BOOKINGS);
		}
		if (isRescheduled) {
			this.validateTourDates(
				input.tourStartDate ?? existingTour.tourStartDate,
				input.tourEndDate ?? existingTour.tourEndDate,
				this.isDateChanged(input.tourStartDate, existingTour.tourStartDate),
			);
		}
		if (isMoved)
			await this.destinationService.getActiveDestination(
				shapeIntoMongoObjectId(input.destinationId),
			);
		if (input.tourCapacity !== undefined && input.tourCapacity < existingTour.tourReservedSeats) {
			throw new BadRequestException(Messages.TOUR_FULL);
		}

		// An edited REJECTED tour returns to the admin queue; every other status is kept as it is
		const update: T = { ...input };
		if (existingTour.tourStatus === TourStatus.REJECTED) update.tourStatus = TourStatus.PENDING;

		// Matching the values that were just read keeps a booking made in between from being overridden
		search.tourStatus = existingTour.tourStatus;
		search.destinationId = existingTour.destinationId;
		if (isRescheduled || isMoved) search.tourReservedSeats = 0;
		if (input.tourCapacity !== undefined) {
			search.$expr = { $lte: ['$tourReservedSeats', input.tourCapacity] };
		}

		const result = await this.tourModel.findOneAndUpdate(search, update, { new: true }).exec();
		if (!result) throw new InternalServerErrorException(Messages.UPDATE_FAILED);

		if (isMoved && result.tourStatus === TourStatus.ACTIVE) {
			await this.destinationService.destinationStatsEditor({
				_id: existingTour.destinationId,
				targetKey: 'destinationTours',
				modifier: -1,
			});
			await this.destinationService.destinationStatsEditor({
				_id: result.destinationId,
				targetKey: 'destinationTours',
				modifier: 1,
			});
		}
		return result as unknown as Tour;
	}

	public async getTours(memberId: Types.ObjectId, input: ToursInquiry): Promise<Tours> {
		const match: T = { tourStatus: TourStatus.ACTIVE, deletedAt: null };
		this.shapeMatchQuery(match, input);

		const result = await this.tourModel
			.aggregate([
				{ $match: match },
				{ $sort: this.shapeSort(input.sort ?? 'tourStartDate', input.direction ?? Direction.ASC) },
				{
					$facet: {
						list: [
							{ $skip: (input.page - 1) * input.limit },
							{ $limit: input.limit },
							lookUpAuthMemberLiked(memberId),
							lookupMember,
							{ $unwind: { path: '$memberData', preserveNullAndEmptyArrays: true } },
						],
						metaCounter: [{ $count: 'total' }],
					},
				},
			])
			.exec();

		return result[0] as Tours;
	}

	private shapeMatchQuery(match: T, input: ToursInquiry): void {
		const {
			memberId,
			destinationId,
			tourDepartureCity,
			tourDestinationCity,
			tourStartDateRange,
			tourPriceRange,
			minAvailableSeats,
			text,
		} = input.search;

		if (memberId) match.memberId = shapeIntoMongoObjectId(memberId);
		if (destinationId) match.destinationId = shapeIntoMongoObjectId(destinationId);
		if (tourDepartureCity) match.tourDepartureCity = tourDepartureCity;
		if (tourDestinationCity) match.tourDestinationCity = tourDestinationCity;

		if (tourStartDateRange) {
			if (tourStartDateRange.end < tourStartDateRange.start)
				throw new BadRequestException(Messages.INVALID_DATA);
			match.tourStartDate = { $gte: tourStartDateRange.start, $lte: tourStartDateRange.end };
		}

		if (tourPriceRange) {
			if (tourPriceRange.end < tourPriceRange.start)
				throw new BadRequestException(Messages.INVALID_DATA);
			match.tourPrice = { $gte: tourPriceRange.start, $lte: tourPriceRange.end };
		}

		if (minAvailableSeats) {
			match.$expr = {
				$gte: [{ $subtract: ['$tourCapacity', '$tourReservedSeats'] }, minAvailableSeats],
			};
		}

		const normalizedText = text?.trim();
		if (normalizedText) {
			const regex = new RegExp(escapeRegExp(normalizedText), 'i');
			match.$or = [
				{ tourName: regex },
				{ tourDesc: regex },
				{ tourDepartureCity: regex },
				{ tourDestinationCity: regex },
			];
		}
	}

	public async getFavoriteTours(
		memberId: Types.ObjectId,
		input: OrdinaryTourInquiry,
	): Promise<Tours> {
		return this.likeService.getFavoriteTours(memberId, input);
	}

	public async getVisitedTours(
		memberId: Types.ObjectId,
		input: OrdinaryTourInquiry,
	): Promise<Tours> {
		return this.viewService.getVisitedTours(memberId, input);
	}

	public async likeTargetTour(memberId: Types.ObjectId, likeRefId: Types.ObjectId): Promise<Tour> {
		const target = await this.tourModel.findOne({
			_id: likeRefId,
			tourStatus: TourStatus.ACTIVE,
			deletedAt: null,
		});
		if (!target) throw new NotFoundException(Messages.TOUR_NOT_FOUND);

		const modifier = await this.likeService.toggleLike({
			memberId,
			likeRefId,
			likeGroup: LikeGroup.TOUR,
		});
		if (modifier === 1)
			await this.notificationService.createNotification({
				receiverId: target.memberId as Types.ObjectId,
				authorId: memberId,
				notificationType: NotificationType.LIKE,
				notificationGroup: NotificationGroup.TOUR,
				notificationRefId: likeRefId,
				notificationTitle: 'New tour like',
				notificationDesc: 'Someone liked your tour.',
				notificationEventKey: `tour-like:${memberId}:${likeRefId}`,
			});
		const result = await this.tourModel.findById(likeRefId).exec();
		if (!result) throw new InternalServerErrorException(Messages.SOMETHING_WENT_WRONG);
		return result;
	}

	public async getAgentTours(memberId: Types.ObjectId, input: AgentToursInquiry): Promise<Tours> {
		// The owner sees every status, so a tour an admin turned off does not vanish from the list
		const match: T = { memberId, deletedAt: null };
		if (input.search.tourStatus) match.tourStatus = input.search.tourStatus;
		return this.getTourList(match, input);
	}

	public async getAllToursByAdmin(input: AllToursInquiry): Promise<Tours> {
		const match: T = { deletedAt: null };
		if (input.search.tourStatus) match.tourStatus = input.search.tourStatus;
		if (input.search.destinationId)
			match.destinationId = shapeIntoMongoObjectId(input.search.destinationId);
		if (input.search.tourDepartureCity) match.tourDepartureCity = input.search.tourDepartureCity;
		return this.getTourList(match, input);
	}

	public async updateTourStatusByAdmin(
		input: UpdateTourStatusInput,
		adminId?: Types.ObjectId,
	): Promise<Tour> {
		const existingTour = await this.tourModel
			.findOne({ _id: input._id, deletedAt: null })
			.lean<Tour>()
			.exec();

		if (!existingTour) throw new NotFoundException(Messages.TOUR_NOT_FOUND);
		if (existingTour.tourStatus === input.tourStatus) return existingTour;
		if (input.tourStatus === TourStatus.ACTIVE) await this.assertCanActivate(existingTour);

		// Matching the status that was just read applies each change, and its counters, exactly once
		const result = await this.tourModel
			.findOneAndUpdate(
				{ _id: input._id, tourStatus: existingTour.tourStatus, deletedAt: null },
				{ tourStatus: input.tourStatus },
				{ new: true },
			)
			.exec();

		if (!result) throw new InternalServerErrorException(Messages.UPDATE_FAILED);

		const wasActive = existingTour.tourStatus === TourStatus.ACTIVE;
		const isActive = result.tourStatus === TourStatus.ACTIVE;
		if (wasActive !== isActive) await this.activeCountersEditor(result, isActive ? 1 : -1);
		if (wasActive && !isActive) {
			await this.bookingService.notifyInactiveListingGuests(BookingCategory.TOUR, [result._id]);
		}

		await this.notificationService.createNotification({
			receiverId: result.memberId as Types.ObjectId,
			authorId: adminId,
			notificationType: NotificationType.SYSTEM,
			notificationGroup: NotificationGroup.SYSTEM,
			notificationRefId: result._id as Types.ObjectId,
			notificationTitle: 'Tour listing status updated',
			notificationDesc: `Your tour listing status is now ${result.tourStatus}.`,
			// The update time makes each change its own event, so a status set again is announced again
			notificationEventKey: `tour-status:${result._id}:${result.updatedAt.getTime()}`,
		});
		return result as unknown as Tour;
	}

	public async removeTourByAdmin(tourId: Types.ObjectId): Promise<Tour> {
		const search: T = { _id: tourId, tourStatus: TourStatus.INACTIVE, deletedAt: null };
		const targetTour = await this.tourModel.findOne(search).lean<Tour>().exec();
		if (!targetTour) throw new InternalServerErrorException(Messages.REMOVE_FAILED);

		// Guests whose tour is still ahead keep their seats, so such a tour cannot be removed yet.
		// An INACTIVE tour takes no new bookings, so the seats read here cannot grow before the update
		if (targetTour.tourReservedSeats > 0 && targetTour.tourEndDate > new Date()) {
			throw new BadRequestException(Messages.TOUR_HAS_BOOKINGS);
		}

		const result = await this.tourModel
			.findOneAndUpdate(search, { deletedAt: new Date() }, { new: true })
			.exec();

		if (!result) throw new InternalServerErrorException(Messages.REMOVE_FAILED);
		return result as unknown as Tour;
	}

	/** A tour goes live only in an active destination and under an owner whose account is active **/
	private async assertCanActivate(tour: Tour): Promise<void> {
		await this.destinationService.getActiveDestination(tour.destinationId);
		const owner = await this.memberService.getMember(null, tour.memberId, false);
		if (owner.memberStatus !== MemberStatus.ACTIVE) {
			throw new BadRequestException(Messages.MEMBER_BLOCKED);
		}
	}

	/** memberTours and destinationTours count ACTIVE tours, so they move when one enters or leaves ACTIVE **/
	private async activeCountersEditor(tour: Tour, modifier: number): Promise<void> {
		await this.memberService.memberStatusEditor({
			_id: tour.memberId,
			targetKey: 'memberTours',
			modifier,
		});
		await this.destinationService.destinationStatsEditor({
			_id: tour.destinationId,
			targetKey: 'destinationTours',
			modifier,
		});
	}

	private async getTourList(
		match: T,
		input: Pick<ToursInquiry, 'page' | 'limit' | 'sort' | 'direction'>,
	): Promise<Tours> {
		const result = await this.tourModel
			.aggregate([
				{ $match: match },
				{ $sort: this.shapeSort(input.sort ?? 'createdAt', input.direction ?? Direction.DESC) },
				{
					$facet: {
						list: [
							{ $skip: (input.page - 1) * input.limit },
							{ $limit: input.limit },
							lookupMember,
							{ $unwind: { path: '$memberData', preserveNullAndEmptyArrays: true } },
						],
						metaCounter: [{ $count: 'total' }],
					},
				},
			])
			.exec();

		return result[0] as Tours;
	}

	/** A tour ends after it starts, and a new start date cannot lie in the past: such a tour could never be booked **/
	private validateTourDates(tourStartDate: Date, tourEndDate: Date, isNewStart = true): void {
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		if (
			!(tourStartDate instanceof Date) ||
			!(tourEndDate instanceof Date) ||
			tourEndDate <= tourStartDate ||
			(isNewStart && tourStartDate < today)
		) {
			throw new BadRequestException(Messages.INVALID_DATA);
		}
	}

	/** Forms send every field back, so a date only counts as changed when its value differs **/
	private isDateChanged(input: Date | undefined, current: Date): boolean {
		return input !== undefined && input.getTime() !== new Date(current).getTime();
	}

	/** The _id tie-breaker keeps pages stable when many tours share the same sort value **/
	private shapeSort(sort: string, direction: Direction): T {
		return { [sort]: direction, _id: direction };
	}
}
