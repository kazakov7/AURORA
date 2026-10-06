import { UseGuards } from '@nestjs/common';
import { Args, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Types } from 'mongoose';
import { shapeIntoMongoObjectId } from '../../libs/config';
import { Notifications, Notification } from '../../libs/dto/notification/notification';
import { MarkNotificationAsReadInput, NotificationsInquiry } from '../../libs/dto/notification/notification.input';
import { AuthMember } from '../auth/decorators/authMember.decorator';
import { AuthGuard } from '../auth/guards/auth.guard';
import { NotificationService } from './notification.service';

@Resolver()
export class NotificationResolver {
	constructor(private readonly notificationService: NotificationService) { }

	@UseGuards(AuthGuard)
	@Query(() => Notifications)
	public async getMyNotifications(
		@Args('input') input: NotificationsInquiry,
		@AuthMember('_id') memberId: Types.ObjectId,
	): Promise<Notifications> {
		return await this.notificationService.getMyNotifications(memberId, input);
	}

	@UseGuards(AuthGuard)
	@Query(() => Int)
	public async getUnreadNotificationCount(@AuthMember('_id') memberId: Types.ObjectId): Promise<number> {
		return await this.notificationService.getUnreadNotificationCount(memberId);
	}

	@UseGuards(AuthGuard)
	@Mutation(() => Notification)
	public async markNotificationAsRead(
		@Args('input') input: MarkNotificationAsReadInput,
		@AuthMember('_id') memberId: Types.ObjectId,
	): Promise<Notification> {
		return await this.notificationService.markNotificationAsRead(memberId, shapeIntoMongoObjectId(input.notificationId));
	}

	@UseGuards(AuthGuard)
	@Mutation(() => Int)
	public async markAllNotificationsAsRead(@AuthMember('_id') memberId: Types.ObjectId): Promise<number> {
		return await this.notificationService.markAllNotificationsAsRead(memberId);
	}
}
