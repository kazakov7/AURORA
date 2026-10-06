import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
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
import { lookUpAuthMemberLiked, lookupMember, shapeIntoMongoObjectId } from '../../libs/config';
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
import { DestinationService } from '../destination/destination.service';

@Injectable()
export class TourService {
	constructor(
		@InjectModel('Tour') private readonly tourModel: Model<Tour>,
		private readonly memberService: MemberService,
		private readonly likeService: LikeService,
		private readonly viewService: ViewService,
		private readonly agentService: AgentService,
		private readonly destinationService: DestinationService,
	) { }

	public async createTour(input: TourInput): Promise<Tour> {
		if (!input.memberId) throw new BadRequestException(Messages.NOT_AUTHENTICATED);
		await this.agentService.assertApprovedAgent(input.memberId, AgentType.TOUR);
		this.validateTourDates(input.tourStartDate, input.tourEndDate);
		const destinationId = shapeIntoMongoObjectId(input.destinationId);
		await this.destinationService.getActiveDestination(destinationId);

		try {
			const result = await this.tourModel.create({ ...input, destinationId });
			await this.memberService.memberStatusEditor({
				_id: result.memberId as Types.ObjectId,
				targetKey: 'memberTours',
				modifier: 1,
			});
			await this.destinationService.destinationStatsEditor({
				_id: destinationId,
				targetKey: 'destinationTours',
				modifier: 1,
			});
			return result as unknown as Tour;
		} catch (error) {
			console.error('Tour creation failed:', error);
			throw new BadRequestException(Messages.CREATE_FAILED);
		}
	}

	public async getTour(memberId: Types.ObjectId, tourId: Types.ObjectId): Promise<Tour> {
		const targetTour = await this.tourModel
			.findOne({ _id: tourId, tourStatus: TourStatus.ACTIVE, deletedAt: null })
			.lean<Tour>()
			.exec();

		if (!targetTour) throw new InternalServerErrorException(Messages.TOUR_NOT_FOUND);

		if (memberId) {
			const newView = await this.viewService.recordView({ memberId, viewRefId: tourId, viewGroup: ViewGroup.TOUR });
			if (newView) {
				await this.tourStatsEditor({ _id: tourId, targetKey: 'tourViews', modifier: 1 });
				targetTour.tourViews += 1;
			}

			targetTour.meLiked = await this.likeService.checkLikeExistence({
				memberId,
				likeRefId: tourId,
				likeGroup: LikeGroup.TOUR,
			});
		}

		targetTour.memberData = await this.memberService.getMember(
			null,
			targetTour.memberId as unknown as Types.ObjectId,
		);
		return targetTour;
	}

	public async tourStatsEditor(input: StatisticModifier): Promise<Tour> {
		const result = await this.tourModel
			.findByIdAndUpdate(input._id, { $inc: { [input.targetKey]: input.modifier } }, { new: true })
			.exec();

		return result as unknown as Tour;
	}

	public async updateTour(memberId: Types.ObjectId, input: TourUpdateInput): Promise<Tour> {
		await this.agentService.assertApprovedAgent(memberId, AgentType.TOUR);
		const existingTour = await this.tourModel
			.findOne({
				_id: input._id,
				memberId,
				tourStatus: { $ne: TourStatus.INACTIVE },
				deletedAt: null,
			})
			.lean<Tour>()
			.exec();

		if (!existingTour) throw new InternalServerErrorException(Messages.UPDATE_FAILED);

		this.validateTourDates(input.tourStartDate ?? existingTour.tourStartDate, input.tourEndDate ?? existingTour.tourEndDate);
		if (input.tourCapacity !== undefined && input.tourCapacity < existingTour.tourReservedSeats) {
			throw new BadRequestException(Messages.TOUR_FULL);
		}

		const search: T = {
			_id: input._id,
			memberId,
			tourStatus: { $ne: TourStatus.INACTIVE },
			deletedAt: null,
		};
		if (input.tourCapacity !== undefined) {
			search.$expr = { $lte: ['$tourReservedSeats', input.tourCapacity] };
		}

		const result = await this.tourModel.findOneAndUpdate(search, input, { new: true }).exec();
		if (!result) throw new InternalServerErrorException(Messages.UPDATE_FAILED);
		return result as unknown as Tour;
	}

	public async getTours(memberId: Types.ObjectId, input: ToursInquiry): Promise<Tours> {
		const match: T = { tourStatus: TourStatus.ACTIVE, deletedAt: null };
		this.shapeMatchQuery(match, input);

		const sort: T = { [input.sort ?? 'tourStartDate']: input.direction ?? Direction.ASC };
		const result = await this.tourModel
			.aggregate([
				{ $match: match },
				{ $sort: sort },
				{
					$facet: {
						list: [
							{ $skip: (input.page - 1) * input.limit },
							{ $limit: input.limit },
							lookUpAuthMemberLiked(memberId),
							lookupMember,
							{ $unwind: '$memberData' },
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
			if (tourStartDateRange.end < tourStartDateRange.start) throw new BadRequestException(Messages.INVALID_DATA);
			match.tourStartDate = { $gte: tourStartDateRange.start, $lte: tourStartDateRange.end };
		}

		if (tourPriceRange) {
			if (tourPriceRange.end < tourPriceRange.start) throw new BadRequestException(Messages.INVALID_DATA);
			match.tourPrice = { $gte: tourPriceRange.start, $lte: tourPriceRange.end };
		}

		if (minAvailableSeats) {
			match.$expr = {
				$gte: [{ $subtract: ['$tourCapacity', '$tourReservedSeats'] }, minAvailableSeats],
			};
		}

		if (text) {
			const regex = new RegExp(text, 'i');
			match.$or = [
				{ tourName: regex },
				{ tourDesc: regex },
				{ tourDepartureCity: regex },
				{ tourDestinationCity: regex },
			];
		}
	}

	public async getFavoriteTours(memberId: Types.ObjectId, input: OrdinaryTourInquiry): Promise<Tours> {
		return this.likeService.getFavoriteTours(memberId, input);
	}

	public async getVisitedTours(memberId: Types.ObjectId, input: OrdinaryTourInquiry): Promise<Tours> {
		return this.viewService.getVisitedTours(memberId, input);
	}

	public async likeTargetTour(memberId: Types.ObjectId, likeRefId: Types.ObjectId): Promise<Tour> {
		const target = await this.tourModel.findOne({
			_id: likeRefId,
			tourStatus: TourStatus.ACTIVE,
			deletedAt: null,
		});
		if (!target) throw new InternalServerErrorException(Messages.TOUR_NOT_FOUND);

		const modifier = await this.likeService.toggleLike({ memberId, likeRefId, likeGroup: LikeGroup.TOUR });
		const result = await this.tourStatsEditor({ _id: likeRefId, targetKey: 'tourLikes', modifier });
		if (!result) throw new InternalServerErrorException(Messages.SOMETHING_WENT_WRONG);
		return result;
	}

	public async getAgentTours(memberId: Types.ObjectId, input: AgentToursInquiry): Promise<Tours> {
		const match: T = {
			memberId,
			tourStatus: input.search.tourStatus ?? { $ne: TourStatus.INACTIVE },
			deletedAt: null,
		};
		return this.getTourList(match, input);
	}

	public async getAllToursByAdmin(input: AllToursInquiry): Promise<Tours> {
		const match: T = { deletedAt: null };
		if (input.search.tourStatus) match.tourStatus = input.search.tourStatus;
		if (input.search.destinationId) match.destinationId = shapeIntoMongoObjectId(input.search.destinationId);
		if (input.search.tourDepartureCity) match.tourDepartureCity = input.search.tourDepartureCity;
		return this.getTourList(match, input);
	}

	public async updateTourStatusByAdmin(input: UpdateTourStatusInput): Promise<Tour> {
		const result = await this.tourModel
			.findOneAndUpdate({ _id: input._id, deletedAt: null }, { tourStatus: input.tourStatus }, { new: true })
			.exec();

		if (!result) throw new InternalServerErrorException(Messages.UPDATE_FAILED);
		return result as unknown as Tour;
	}

	public async removeTourByAdmin(tourId: Types.ObjectId): Promise<Tour> {
		const result = await this.tourModel
			.findOneAndUpdate(
				{ _id: tourId, tourStatus: TourStatus.INACTIVE, deletedAt: null },
				{ deletedAt: new Date() },
				{ new: true },
			)
			.exec();

		if (!result) throw new InternalServerErrorException(Messages.REMOVE_FAILED);
		await this.memberService.memberStatusEditor({
			_id: result.memberId as Types.ObjectId,
			targetKey: 'memberTours',
			modifier: -1,
		});
		return result as unknown as Tour;
	}

	private async getTourList(match: T, input: Pick<ToursInquiry, 'page' | 'limit' | 'sort' | 'direction'>): Promise<Tours> {
		const sort: T = { [input.sort ?? 'createdAt']: input.direction ?? Direction.DESC };
		const result = await this.tourModel
			.aggregate([
				{ $match: match },
				{ $sort: sort },
				{
					$facet: {
						list: [
							{ $skip: (input.page - 1) * input.limit },
							{ $limit: input.limit },
							lookupMember,
							{ $unwind: '$memberData' },
						],
						metaCounter: [{ $count: 'total' }],
					},
				},
			])
			.exec();

		return result[0] as Tours;
	}

	private validateTourDates(tourStartDate: Date, tourEndDate: Date): void {
		if (!(tourStartDate instanceof Date) || !(tourEndDate instanceof Date) || tourEndDate <= tourStartDate) {
			throw new BadRequestException(Messages.INVALID_DATA);
		}
	}
}
