import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ChatGateway } from '../chat/chat.gateway';
import { Notification, Notifications } from '../../libs/dto/notification/notification';
import { NotificationsInquiry } from '../../libs/dto/notification/notification.input';
import { Direction, Messages } from '../../libs/enums/common.enum';
import { MemberStatus } from '../../libs/enums/member.enum';
import { NotificationGroup, NotificationStatus, NotificationType } from '../../libs/enums/notification.enum';
import { T } from '../../libs/types/common';

export interface CreateNotificationInput {
	receiverId: Types.ObjectId;
	authorId?: Types.ObjectId;
	notificationType: NotificationType;
	notificationGroup: NotificationGroup;
	notificationRefId?: Types.ObjectId;
	notificationTitle: string;
	notificationDesc?: string;
	notificationEventKey?: string;
}

@Injectable()
export class NotificationService {
	constructor(
		@InjectModel('Notification') private readonly notificationModel: Model<any>,
		@InjectModel('Member') private readonly memberModel: Model<any>,
		private readonly chatGateway: ChatGateway,
	) { }

	public async createNotification(input: CreateNotificationInput): Promise<Notification | null> {
		// A completed business transition must never fail or be rolled back because
		// its notification could not be dispatched, so failures are logged only.
		try {
			if (input.authorId?.equals(input.receiverId)) return null;
			const receiver = await this.memberModel
				.findOne({ _id: input.receiverId, memberStatus: MemberStatus.ACTIVE, deletedAt: null })
				.exec();
			if (!receiver) return null;

			if (input.authorId) {
				const author = await this.memberModel
					.findOne({ _id: input.authorId, memberStatus: MemberStatus.ACTIVE, deletedAt: null })
					.exec();
				if (!author) return null;
			}

			if (input.notificationType === NotificationType.SYSTEM && input.notificationGroup !== NotificationGroup.SYSTEM) {
				throw new BadRequestException(Messages.BAD_REQUEST);
			}

			const result = await this.notificationModel.findOneAndUpdate(
				input.notificationEventKey
					? { receiverId: input.receiverId, notificationEventKey: input.notificationEventKey }
					: { _id: new Types.ObjectId() },
				{ $setOnInsert: { ...input, notificationStatus: NotificationStatus.WAIT } },
				{ new: true, upsert: true, includeResultMetadata: true },
			).exec();
			const notification = result.value as Notification;
			if (notification && !result.lastErrorObject?.updatedExisting) {
				this.chatGateway.emitNotification(input.receiverId, notification);
			}
			return notification;
		} catch (err) {
			console.error('Notification creation failed:', err);
			return null;
		}
	}

	public async getMyNotifications(memberId: Types.ObjectId, input: NotificationsInquiry): Promise<Notifications> {
		const match: T = { receiverId: memberId };
		if (input.search?.notificationStatus) match.notificationStatus = input.search.notificationStatus;
		if (input.search?.notificationType) match.notificationType = input.search.notificationType;
		if (input.search?.notificationGroup) match.notificationGroup = input.search.notificationGroup;

		const sort: T = { [input.sort ?? 'createdAt']: input.direction ?? Direction.DESC, _id: Direction.DESC };
		const result = await this.notificationModel
			.aggregate([
				{ $match: match },
				{ $sort: sort },
				{
					$facet: {
						list: [
							{ $skip: (input.page - 1) * input.limit },
							{ $limit: input.limit },
							{
								$lookup: {
									from: 'members', localField: 'authorId', foreignField: '_id', as: 'authorData',
								},
							},
							{ $unwind: { path: '$authorData', preserveNullAndEmptyArrays: true } },
							{
								$project: {
									'authorData.memberNick': 1, 'authorData.memberFullName': 1, 'authorData.memberImage': 1,
									receiverId: 1, authorId: 1, notificationType: 1, notificationStatus: 1,
									notificationGroup: 1, notificationRefId: 1, notificationTitle: 1, notificationDesc: 1, createdAt: 1,
								},
							},
						],
						metaCounter: [{ $count: 'total' }],
					},
				},
			])
			.exec();
		return result[0] ?? { list: [], metaCounter: [] };
	}

	public async getUnreadNotificationCount(memberId: Types.ObjectId): Promise<number> {
		return await this.notificationModel.countDocuments({ receiverId: memberId, notificationStatus: NotificationStatus.WAIT }).exec();
	}

	public async markNotificationAsRead(memberId: Types.ObjectId, notificationId: Types.ObjectId): Promise<Notification> {
		const result = await this.notificationModel
			.findOneAndUpdate(
				{ _id: notificationId, receiverId: memberId },
				{ $set: { notificationStatus: NotificationStatus.READ } },
				{ new: true },
			)
			.exec();
		if (!result) throw new InternalServerErrorException(Messages.NOTIFICATION_NOT_FOUND);
		return result;
	}

	public async markAllNotificationsAsRead(memberId: Types.ObjectId): Promise<number> {
		const result = await this.notificationModel
			.updateMany(
				{ receiverId: memberId, notificationStatus: NotificationStatus.WAIT },
				{ $set: { notificationStatus: NotificationStatus.READ } },
			)
			.exec();
		return result.modifiedCount;
	}

	public async notifyActiveAdmins(
		input: Omit<CreateNotificationInput, 'receiverId'>,
		excludedReceiverIds: Types.ObjectId[] = [],
	): Promise<void> {
		const admins = await this.memberModel.find({ memberType: 'ADMIN', memberStatus: MemberStatus.ACTIVE, deletedAt: null }).select('_id').lean().exec();
		const excludedReceiverIdSet = new Set(excludedReceiverIds.map((receiverId) => receiverId.toString()));
		await Promise.all((admins as any[]).filter((admin) => !excludedReceiverIdSet.has(admin._id.toString())).map((admin) => this.createNotification({
			...input,
			receiverId: admin._id as Types.ObjectId,
			notificationEventKey: input.notificationEventKey ? `${input.notificationEventKey}:${admin._id}` : undefined,
		})));
	}
}
