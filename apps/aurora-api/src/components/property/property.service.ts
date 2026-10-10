import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
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
import { UpdatePropertyInput, UpdatePropertyStatusInput } from '../../libs/dto/property/property.update';
import { Direction, Messages } from '../../libs/enums/common.enum';
import { LikeGroup } from '../../libs/enums/like.enum';
import { PropertyStatus } from '../../libs/enums/property.enum';
import { ViewGroup } from '../../libs/enums/view.enum';
import { StatisticModifier, T } from '../../libs/types/common';
import { lookUpAuthMemberLiked, lookupMember, shapeIntoMongoObjectId, escapeRegExp } from '../../libs/config';
import { BookingService } from '../booking/booking.service';
import { LikeService } from '../like/like.service';
import { MemberService } from '../member/member.service';
import { ViewService } from '../view/view.service';
import { AgentService } from '../agent/agent.service';
import { AgentType } from '../../libs/enums/agent.enum';
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
	) { }

	public async createProperty(input: CreatePropertyInput): Promise<Property> {
		if (!input.memberId) throw new BadRequestException(Messages.NOT_AUTHENTICATED);
		await this.agentService.assertApprovedAgent(input.memberId, AgentType.HOTEL);
		const destinationId = shapeIntoMongoObjectId(input.destinationId);
		await this.destinationService.getActiveDestination(destinationId);

		try {
			const result = await this.propertyModel.create({ ...input, destinationId });
			await this.memberService.memberStatusEditor({
				_id: result.memberId as Types.ObjectId,
				targetKey: 'memberProperties',
				modifier: 1,
			});
			await this.destinationService.destinationStatsEditor({
				_id: destinationId,
				targetKey: 'destinationProperties',
				modifier: 1,
			});
			return result as unknown as Property;
		} catch (error) {
			console.error('Property creation failed:', error);
			throw new BadRequestException(Messages.CREATE_FAILED);
		}
	}

	public async getProperty(memberId: Types.ObjectId, propertyId: Types.ObjectId): Promise<Property> {
		const targetProperty = await this.propertyModel
			.findOne({ _id: propertyId, propertyStatus: PropertyStatus.ACTIVE, deletedAt: null })
			.lean<Property>()
			.exec();

		if (!targetProperty) throw new InternalServerErrorException(Messages.PROPERTY_NOT_FOUND);

		if (memberId) {
			const newView = await this.viewService.recordView({
				memberId,
				viewRefId: propertyId,
				viewGroup: ViewGroup.PROPERTY,
			});

			if (newView) {
				await this.propertyStatsEditor({ _id: propertyId, targetKey: 'propertyViews', modifier: 1 });
				targetProperty.propertyViews += 1;
			}

			targetProperty.meLiked = await this.likeService.checkLikeExistence({
				memberId,
				likeRefId: propertyId,
				likeGroup: LikeGroup.PROPERTY,
			});
		}

		targetProperty.memberData = await this.memberService.getMember(
			memberId,
			targetProperty.memberId as unknown as Types.ObjectId,
			false,
		);

		return targetProperty;
	}

	public async propertyStatsEditor(input: StatisticModifier): Promise<Property> {
		const result = await this.propertyModel
			.findByIdAndUpdate(
				input._id,
				[{ $set: { [input.targetKey]: { $max: [0, { $add: [{ $ifNull: [`$${input.targetKey}`, 0] }, input.modifier] }] } } }] as any,
				{ new: true },
			)
			.exec();

		return result as unknown as Property;
	}

	public async updateProperty(memberId: Types.ObjectId, input: UpdatePropertyInput): Promise<Property> {
		await this.agentService.assertApprovedAgent(memberId, AgentType.HOTEL);
		const result = await this.propertyModel
			.findOneAndUpdate(
				{
					_id: input._id,
					memberId,
					propertyStatus: { $ne: PropertyStatus.INACTIVE },
					deletedAt: null,
				},
				input,
				{ new: true },
			)
			.exec();

		if (!result) throw new InternalServerErrorException(Messages.UPDATE_FAILED);
		return result as unknown as Property;
	}

	public async getProperties(memberId: Types.ObjectId, input: PropertiesInquiry): Promise<Properties> {
		const match: T = { propertyStatus: PropertyStatus.ACTIVE, deletedAt: null };
		this.shapeMatchQuery(match, input);

		const { checkIn, checkOut } = input.search;
		if (checkIn && checkOut) {
			const unavailablePropertyIds = await this.bookingService.getUnavailablePropertyIds(checkIn, checkOut);
			if (unavailablePropertyIds.length) match._id = { $nin: unavailablePropertyIds };
		}

		const sort: T = { [input.sort ?? 'createdAt']: input.direction ?? Direction.DESC };
		const result = await this.propertyModel
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

		if ((checkIn && !checkOut) || (!checkIn && checkOut) || (checkIn && checkOut && checkOut <= checkIn)) {
			throw new BadRequestException(Messages.INVALID_DATA);
		}

		if (memberId) match.memberId = shapeIntoMongoObjectId(memberId);
		if (destinationId?.length) match.destinationId = shapeIntoMongoObjectId(destinationId);
		if (propertyCityList?.length) match.propertyCity = { $in: propertyCityList };
		if (propertyTypeList?.length) match.propertyType = { $in: propertyTypeList };
		if (minGuests) match.maxGuests = { $gte: minGuests };
		if (bedrooms !== undefined) match.bedrooms = { $gte: bedrooms };
		if (beds !== undefined) match.beds = { $gte: beds };
		if (amenities?.length) match.amenities = { $all: amenities };

		if (pricePerNightRange) {
			if (pricePerNightRange.end < pricePerNightRange.start) {
				throw new BadRequestException(Messages.INVALID_DATA);
			}
			match.pricePerNight = { $gte: pricePerNightRange.start, $lte: pricePerNightRange.end };
		}

		if (text) {
			const regex = new RegExp(escapeRegExp(text), 'i');
			match.$or = [{ propertyName: regex }, { propertyDesc: regex }, { propertyCity: regex }];
		}
	}

	public async getFavorites(memberId: Types.ObjectId, input: OrdinaryInquery): Promise<Properties> {
		return this.likeService.getFavoriteProperties(memberId, input);
	}

	public async getVisited(memberId: Types.ObjectId, input: OrdinaryInquery): Promise<Properties> {
		return this.viewService.getVisitedProperties(memberId, input);
	}

	public async likeTargetProperty(memberId: Types.ObjectId, likeRefId: Types.ObjectId): Promise<Property> {
		const target = await this.propertyModel.findOne({
			_id: likeRefId,
			propertyStatus: PropertyStatus.ACTIVE,
			deletedAt: null,
		});
		if (!target) throw new InternalServerErrorException(Messages.PROPERTY_NOT_FOUND);

		const modifier = await this.likeService.toggleLike({ memberId, likeRefId, likeGroup: LikeGroup.PROPERTY });
		if (modifier === 1) await this.notificationService.createNotification({
			receiverId: target.memberId as Types.ObjectId, authorId: memberId, notificationType: NotificationType.LIKE,
			notificationGroup: NotificationGroup.PROPERTY, notificationRefId: likeRefId,
			notificationTitle: 'New hotel like', notificationDesc: 'Someone liked your hotel.',
			notificationEventKey: `property-like:${memberId}:${likeRefId}`,
		});
		const result = await this.propertyModel.findById(likeRefId).exec();
		if (!result) throw new InternalServerErrorException(Messages.SOMETHING_WENT_WRONG);
		return result as unknown as Property;
	}

	public async getAgentProperties(memberId: Types.ObjectId, input: AgentPropertiesInquiry): Promise<Properties> {
		const match: T = {
			memberId,
			propertyStatus: input.search.propertyStatus ?? { $ne: PropertyStatus.INACTIVE },
			deletedAt: null,
		};
		const sort: T = { [input.sort ?? 'createdAt']: input.direction ?? Direction.DESC };

		const result = await this.propertyModel.aggregate([
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
		]);

		return result[0] as Properties;
	}

	public async getAllPropertiesByAdmin(input: AllPropertiesInquiry): Promise<Properties> {
		const { propertyStatus, destinationIdList, propertyCityList } = input.search;
		const match: T = { deletedAt: null };
		if (propertyStatus) match.propertyStatus = propertyStatus;
		if (destinationIdList?.length) match.destinationId = { $in: destinationIdList.map(shapeIntoMongoObjectId) };
		if (propertyCityList?.length) match.propertyCity = { $in: propertyCityList };

		const sort: T = { [input.sort ?? 'createdAt']: input.direction ?? Direction.DESC };
		const result = await this.propertyModel.aggregate([
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
		]);

		return result[0] as Properties;
	}

	public async updatePropertyStatusByAdmin(input: UpdatePropertyStatusInput, adminId?: Types.ObjectId): Promise<Property> {
		const result = await this.propertyModel
			.findOneAndUpdate({ _id: input._id, deletedAt: null }, { propertyStatus: input.propertyStatus }, { new: true })
			.exec();

		if (!result) throw new InternalServerErrorException(Messages.UPDATE_FAILED);
		await this.notificationService.createNotification({
			receiverId: result.memberId as Types.ObjectId, authorId: adminId, notificationType: NotificationType.SYSTEM,
			notificationGroup: NotificationGroup.SYSTEM, notificationRefId: result._id as Types.ObjectId,
			notificationTitle: 'Hotel listing status updated', notificationDesc: `Your hotel listing status is now ${result.propertyStatus}.`,
			notificationEventKey: `property-status:${result._id}:${result.propertyStatus}`,
		});
		return result as unknown as Property;
	}

	public async removePropertyByAdmin(propertyId: Types.ObjectId): Promise<Property> {
		const result = await this.propertyModel
			.findOneAndUpdate(
				{ _id: propertyId, propertyStatus: PropertyStatus.INACTIVE, deletedAt: null },
				{ deletedAt: new Date() },
				{ new: true },
			)
			.exec();

		if (!result) throw new InternalServerErrorException(Messages.REMOVE_FAILED);

		await this.memberService.memberStatusEditor({
			_id: result.memberId as Types.ObjectId,
			targetKey: 'memberProperties',
			modifier: -1,
		});

		return result as unknown as Property;
	}
}
