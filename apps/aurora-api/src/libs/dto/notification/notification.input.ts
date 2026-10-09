import { Field, InputType, Int } from '@nestjs/graphql';
import { IsEnum, IsIn, IsInt, IsNotEmpty, IsOptional, Max, Min } from 'class-validator';
import { Direction } from '../../enums/common.enum';
import { NotificationGroup, NotificationStatus, NotificationType } from '../../enums/notification.enum';

@InputType()
class NotificationSearch {
	@Field(() => NotificationStatus, { nullable: true })
	@IsOptional()
	@IsEnum(NotificationStatus)
	notificationStatus?: NotificationStatus;

	@Field(() => NotificationType, { nullable: true })
	@IsOptional()
	@IsEnum(NotificationType)
	notificationType?: NotificationType;

	@Field(() => NotificationGroup, { nullable: true })
	@IsOptional()
	@IsEnum(NotificationGroup)
	notificationGroup?: NotificationGroup;
}

@InputType()
export class NotificationsInquiry {
	@Field(() => Int)
	@IsInt()
	@Min(1)
	page: number;

	@Field(() => Int)
	@IsInt()
	@Min(1)
	@Max(100)
	limit: number;

	@Field(() => String, { nullable: true })
	@IsOptional()
	@IsIn(['createdAt', 'notificationStatus', 'notificationType'])
	sort?: string;

	@Field(() => Direction, { nullable: true })
	@IsOptional()
	direction?: Direction;

	@Field(() => NotificationSearch, { nullable: true })
	@IsOptional()
	search?: NotificationSearch;
}

@InputType()
export class MarkNotificationAsReadInput {
	@Field(() => String)
	@IsNotEmpty()
	notificationId: string;
}
