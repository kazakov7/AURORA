import {
	BadRequestException,
	Injectable,
	InternalServerErrorException,
	NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Properties, Property } from '../../libs/dto/property/property';
import {
	AgentPropertiesInquiry,
	AllPropertiesInquiry,
	CreatePropertyInput,
	OrdinaryInquery,
	PropertiesInquiry,
} from '../../libs/dto/property/property.input';
import {
	UpdatePropertyInput,
	UpdatePropertyStatusInput,
} from '../../libs/dto/property/property.update';
import { Direction, Messages } from '../../libs/enums/common.enum';
import { LikeGroup } from '../../libs/enums/like.enum';
import { PropertyStatus } from '../../libs/enums/property.enum';
import { ViewGroup } from '../../libs/enums/view.enum';
import { StatisticModifier, T } from '../../libs/types/common';
import {
	lookUpAuthMemberLiked,
	lookupMember,
	shapeIntoMongoObjectId,
	escapeRegExp,
} from '../../libs/config';
import { BookingService } from '../booking/booking.service';
import { LikeService } from '../like/like.service';
import { MemberService } from '../member/member.service';
import { ViewService } from '../view/view.service';
import { AgentService } from '../agent/agent.service';
import { AgentType } from '../../libs/enums/agent.enum';
import { BookingCategory } from '../../libs/enums/booking.enum';
import { MemberStatus, MemberType } from '../../libs/enums/member.enum';
import { DestinationService } from '../destination/destination.service';
import { NotificationService } from '../notification/notification.service';
import { NotificationGroup, NotificationType } from '../../libs/enums/notification.enum';

@Injectable()
export class PropertyService {
	constructor(
		@InjectModel('Property') private readonly propertyModel: Model<Property>,
		private readonly memberService: MemberService,
		private readonly likeService: LikeService,
		private readonly viewService: ViewService,
		private readonly bookingService: BookingService,
		private readonly agentService: AgentService,
		private readonly destinationService: DestinationService,
		private readonly notificationService: NotificationService,
	) {}

	public async createProperty(input: CreatePropertyInput): Promise<Property> {
		if (!input.memberId) throw new BadRequestException(Messages.NOT_AUTHENTICATED);
		await this.agentService.assertApprovedAgent(input.memberId, AgentType.HOTEL);
		const destinationId = shapeIntoMongoObjectId(input.destinationId);
		await this.destinationService.getActiveDestination(destinationId);

		try {
			const result = await this.propertyModel.create({ ...input, destinationId });
			return result as unknown as Property;
		} catch (error) {
			console.error('Property creation failed:', error);
			throw new BadRequestException(Messages.CREATE_FAILED);
		}
	}

	public async getProperty(
		memberId: Types.ObjectId,
		propertyId: Types.ObjectId,
		memberType?: MemberType,
	): Promise<Property> {
		const targetProperty = await this.propertyModel
			.findOne({ _id: propertyId, deletedAt: null })
			.lean<Property>()
			.exec();

		if (!targetProperty) throw new NotFoundException(Messages.PROPERTY_NOT_FOUND);

		const isActive = targetProperty.propertyStatus === PropertyStatus.ACTIVE;
		const canPreview = memberType === MemberType.ADMIN || targetProperty.memberId.equals(memberId);
		if (!isActive && !canPreview) throw new NotFoundException(Messages.PROPERTY_NOT_FOUND);

		if (memberId && isActive) {
			const newView = await this.viewService.recordView({
				memberId,
				viewRefId: propertyId,
				viewGroup: ViewGroup.PROPERTY,
			});

			if (newView) {
				await this.propertyStatsEditor({
					_id: propertyId,
					targetKey: 'propertyViews',
					modifier: 1,
				});
				targetProperty.propertyViews += 1;
			}
		}

		if (memberId) {
			targetProperty.meLiked = await this.likeService.checkLikeExistence({
				memberId,
				likeRefId: propertyId,
				likeGroup: LikeGroup.PROPERTY,
			});
		}

		// A missing owner account must not break the page: the hotel is returned without the host
		targetProperty.memberData = await this.memberService
			.getMember(memberId, targetProperty.memberId as unknown as Types.ObjectId, false)
			.catch((err) => {
				if (err instanceof NotFoundException) return null;
				throw err;
			});

		return targetProperty;
	}

	public async propertyStatsEditor(input: StatisticModifier): Promise<Property> {
		const result = await this.propertyModel
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

		return result as unknown as Property;
	}

	public async updateProperty(
		memberId: Types.ObjectId,
		input: UpdatePropertyInput,
	): Promise<Property> {
		await this.agentService.assertApprovedAgent(memberId, AgentType.HOTEL);
		const search: T = {
			_id: input._id,
			memberId,
			propertyStatus: { $ne: PropertyStatus.INACTIVE },
			deletedAt: null,
		};
		const existingProperty = await this.propertyModel.findOne(search).lean<Property>().exec();

		if (!existingProperty) throw new InternalServerErrorException(Messages.UPDATE_FAILED);

		// An edited REJECTED hotel returns to the admin queue; every other status is kept as it is
		const update: T = { ...input };
		if (existingProperty.propertyStatus === PropertyStatus.REJECTED) {
			update.propertyStatus = PropertyStatus.PENDING;
		}

		search.propertyStatus = existingProperty.propertyStatus;
		const result = await this.propertyModel.findOneAndUpdate(search, update, { new: true }).exec();
		if (!result) throw new InternalServerErrorException(Messages.UPDATE_FAILED);
		return result as unknown as Property;
	}

	public async getProperties(
		memberId: Types.ObjectId,
		input: PropertiesInquiry,
	): Promise<Properties> {
		const match: T = { propertyStatus: PropertyStatus.ACTIVE, deletedAt: null };
		this.shapeMatchQuery(match, input);

		const { checkIn, checkOut } = input.search;
		if (checkIn && checkOut) {
			const unavailablePropertyIds = await this.bookingService.getUnavailablePropertyIds(
				checkIn,
				checkOut,
			);
			if (unavailablePropertyIds.length) match._id = { $nin: unavailablePropertyIds };
		}

		const result = await this.propertyModel
			.aggregate([
				{ $match: match },
				{ $sort: this.shapeSort(input) },
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

		return result[0] as Properties;
	}

	private shapeMatchQuery(match: T, input: PropertiesInquiry): void {
		const {
			memberId,
			destinationId,
			propertyCityList,
			propertyTypeList,
			minGuests,
			bedrooms,
			beds,
			amenities,
			pricePerNightRange,
			checkIn,
			checkOut,
			text,
		} = input.search;

		if (
			(checkIn && !checkOut) ||
			(!checkIn && checkOut) ||
			(checkIn && checkOut && checkOut <= checkIn)
		) {
			throw new BadRequestException(Messages.INVALID_DATA);
		}

		if (memberId) match.memberId = shapeIntoMongoObjectId(memberId);
		if (destinationId?.length) match.destinationId = shapeIntoMongoObjectId(destinationId);
		if (propertyCityList?.length) match.propertyCity = { $in: propertyCityList };
		if (propertyTypeList?.length) match.propertyType = { $in: propertyTypeList };
		if (minGuests) match.maxGuests = { $gte: minGuests };
		if (typeof bedrooms === 'number') match.bedrooms = { $gte: bedrooms };
		if (typeof beds === 'number') match.beds = { $gte: beds };
		if (amenities?.length) match.amenities = { $all: amenities };

		if (pricePerNightRange) {
			if (pricePerNightRange.end < pricePerNightRange.start) {
				throw new BadRequestException(Messages.INVALID_DATA);
			}
			match.pricePerNight = { $gte: pricePerNightRange.start, $lte: pricePerNightRange.end };
		}

		const normalizedText = text?.trim();
		if (normalizedText) {
			const regex = new RegExp(escapeRegExp(normalizedText), 'i');
			match.$or = [{ propertyName: regex }, { propertyDesc: regex }, { propertyCity: regex }];
		}
	}

	/** The _id tie-breaker keeps pages stable when many hotels share the same sort value **/
	private shapeSort(input: Pick<PropertiesInquiry, 'sort' | 'direction'>): T {
		const direction = input.direction ?? Direction.DESC;
		return { [input.sort ?? 'createdAt']: direction, _id: direction };
	}

	public async getFavorites(memberId: Types.ObjectId, input: OrdinaryInquery): Promise<Properties> {
		return this.likeService.getFavoriteProperties(memberId, input);
	}

	public async getVisited(memberId: Types.ObjectId, input: OrdinaryInquery): Promise<Properties> {
		return this.viewService.getVisitedProperties(memberId, input);
	}

	public async likeTargetProperty(
		memberId: Types.ObjectId,
		likeRefId: Types.ObjectId,
	): Promise<Property> {
		const target = await this.propertyModel.findOne({
			_id: likeRefId,
			propertyStatus: PropertyStatus.ACTIVE,
			deletedAt: null,
		});
		if (!target) throw new NotFoundException(Messages.PROPERTY_NOT_FOUND);

		const modifier = await this.likeService.toggleLike({
			memberId,
			likeRefId,
			likeGroup: LikeGroup.PROPERTY,
		});
		if (modifier === 1)
			await this.notificationService.createNotification({
				receiverId: target.memberId,
				authorId: memberId,
				notificationType: NotificationType.LIKE,
				notificationGroup: NotificationGroup.PROPERTY,
				notificationRefId: likeRefId,
				notificationTitle: 'New hotel like',
				notificationDesc: 'Someone liked your hotel.',
				notificationEventKey: `property-like:${memberId}:${likeRefId}`,
			});
		const result = await this.propertyModel.findById(likeRefId).exec();
		if (!result) throw new InternalServerErrorException(Messages.SOMETHING_WENT_WRONG);
		return result as unknown as Property;
	}

	public async getAgentProperties(
		memberId: Types.ObjectId,
		input: AgentPropertiesInquiry,
	): Promise<Properties> {
		// The owner sees every status, so a hotel an admin turned off does not vanish from the list
		const match: T = { memberId, deletedAt: null };
		if (input.search.propertyStatus) match.propertyStatus = input.search.propertyStatus;

		const result = await this.propertyModel.aggregate([
			{ $match: match },
			{ $sort: this.shapeSort(input) },
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
		]);

		return result[0] as Properties;
	}

	public async getAllPropertiesByAdmin(input: AllPropertiesInquiry): Promise<Properties> {
		const { propertyStatus, destinationIdList, propertyCityList } = input.search;
		const match: T = { deletedAt: null };
		if (propertyStatus) match.propertyStatus = propertyStatus;
		if (destinationIdList?.length)
			match.destinationId = { $in: destinationIdList.map(shapeIntoMongoObjectId) };
		if (propertyCityList?.length) match.propertyCity = { $in: propertyCityList };

		const result = await this.propertyModel.aggregate([
			{ $match: match },
			{ $sort: this.shapeSort(input) },
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
		]);

		return result[0] as Properties;
	}

	public async updatePropertyStatusByAdmin(
		input: UpdatePropertyStatusInput,
		adminId?: Types.ObjectId,
	): Promise<Property> {
		const existingProperty = await this.propertyModel
			.findOne({ _id: input._id, deletedAt: null })
			.lean<Property>()
			.exec();

		if (!existingProperty) throw new NotFoundException(Messages.PROPERTY_NOT_FOUND);
		if (existingProperty.propertyStatus === input.propertyStatus) return existingProperty;
		if (input.propertyStatus === PropertyStatus.ACTIVE)
			await this.assertCanActivate(existingProperty);

		// Matching the status that was just read applies each change, and its counters, exactly once
		const result = await this.propertyModel
			.findOneAndUpdate(
				{ _id: input._id, propertyStatus: existingProperty.propertyStatus, deletedAt: null },
				{ propertyStatus: input.propertyStatus },
				{ new: true },
			)
			.exec();

		if (!result) throw new InternalServerErrorException(Messages.UPDATE_FAILED);

		const wasActive = existingProperty.propertyStatus === PropertyStatus.ACTIVE;
		const isActive = result.propertyStatus === PropertyStatus.ACTIVE;
		if (wasActive !== isActive) await this.activeCountersEditor(result, isActive ? 1 : -1);
		if (wasActive && !isActive) {
			await this.bookingService.notifyInactiveListingGuests(BookingCategory.PROPERTY, [result._id]);
		}

		await this.notificationService.createNotification({
			receiverId: result.memberId as Types.ObjectId,
			authorId: adminId,
			notificationType: NotificationType.SYSTEM,
			notificationGroup: NotificationGroup.SYSTEM,
			notificationRefId: result._id as Types.ObjectId,
			notificationTitle: 'Hotel listing status updated',
			notificationDesc: `Your hotel listing status is now ${result.propertyStatus}.`,
			// The update time makes each change its own event, so a status set again is announced again
			notificationEventKey: `property-status:${result._id}:${result.updatedAt.getTime()}`,
		});
		return result as unknown as Property;
	}

	public async removePropertyByAdmin(propertyId: Types.ObjectId): Promise<Property> {
		// Guests with a stay still ahead keep their booking, so such a hotel cannot be removed yet
		if (await this.bookingService.hasUpcomingPropertyBooking(propertyId)) {
			throw new BadRequestException(Messages.PROPERTY_HAS_BOOKINGS);
		}

		const result = await this.propertyModel
			.findOneAndUpdate(
				{ _id: propertyId, propertyStatus: PropertyStatus.INACTIVE, deletedAt: null },
				{ deletedAt: new Date() },
				{ new: true },
			)
			.exec();

		if (!result) throw new InternalServerErrorException(Messages.REMOVE_FAILED);
		return result as unknown as Property;
	}

	/** A hotel goes live only in an active destination and under an owner whose account is active **/
	private async assertCanActivate(property: Property): Promise<void> {
		await this.destinationService.getActiveDestination(property.destinationId);
		const owner = await this.memberService.getMember(null, property.memberId, false);
		if (owner.memberStatus !== MemberStatus.ACTIVE) {
			throw new BadRequestException(Messages.MEMBER_BLOCKED);
		}
	}

	/** memberProperties and destinationProperties count ACTIVE hotels, so they move when one enters or leaves ACTIVE **/
	private async activeCountersEditor(property: Property, modifier: number): Promise<void> {
		await this.memberService.memberStatusEditor({
			_id: property.memberId,
			targetKey: 'memberProperties',
			modifier,
		});
		await this.destinationService.destinationStatsEditor({
			_id: property.destinationId,
			targetKey: 'destinationProperties',
			modifier,
		});
	}
}
