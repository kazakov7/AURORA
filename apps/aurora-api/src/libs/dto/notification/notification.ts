import { Field, ObjectType } from '@nestjs/graphql';
import { NotificationGroup, NotificationStatus, NotificationType } from '../../enums/notification.enum';
import { TotalCounter } from '../member/member';

@ObjectType()
export class Notification {
	@Field(() => String)
	_id: string;

	@Field(() => String)
	receiverId: string;

	@Field(() => String, { nullable: true })
	authorId?: string;

	@Field(() => NotificationType)
	notificationType: NotificationType;

	@Field(() => NotificationStatus)
	notificationStatus: NotificationStatus;

	@Field(() => NotificationGroup)
	notificationGroup: NotificationGroup;

	@Field(() => String, { nullable: true })
	notificationRefId?: string;

	@Field(() => String)
	notificationTitle: string;

	@Field({ nullable: true })
	notificationDesc?: string;

	@Field(() => Date)
	createdAt: Date;
}

@ObjectType()
export class Notifications {
	@Field(() => [Notification])
	list: Notification[];

	@Field(() => [TotalCounter], { nullable: true })
	metaCounter?: TotalCounter[];
}
