import { registerEnumType } from '@nestjs/graphql';

export enum NotificationType {
	LIKE = 'LIKE',
	COMMENT = 'COMMENT',
	FOLLOW = 'FOLLOW',
	BOOKING = 'BOOKING',
	REVIEW = 'REVIEW',
	MESSAGE = 'MESSAGE',
	SYSTEM = 'SYSTEM',
	SUPPORT = 'SUPPORT',
}
registerEnumType(NotificationType, {
	name: 'NotificationType',
});

export enum NotificationStatus {
	WAIT = 'WAIT',
	READ = 'READ',
}
registerEnumType(NotificationStatus, {
	name: 'NotificationStatus',
});

export enum NotificationGroup {
	MEMBER = 'MEMBER',
	PROPERTY = 'PROPERTY',
	TOUR = 'TOUR',
	ARTICLE = 'ARTICLE',
	COMMENT = 'COMMENT',
	BOOKING = 'BOOKING',
	SYSTEM = 'SYSTEM',
	CHAT = 'CHAT',
	MESSAGE = 'MESSAGE',
	SUPPORT = 'SUPPORT',
}
registerEnumType(NotificationGroup, {
	name: 'NotificationGroup',
});
