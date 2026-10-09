import { registerEnumType } from '@nestjs/graphql';

export enum SupportCategory {
	BOOKING = 'BOOKING',
	PROPERTY = 'PROPERTY',
	TOUR = 'TOUR',
	ACCOUNT = 'ACCOUNT',
	TECHNICAL = 'TECHNICAL',
	OTHER = 'OTHER',
}
registerEnumType(SupportCategory, {
	name: 'SupportCategory',
});

export enum SupportStatus {
	OPEN = 'OPEN',
	IN_PROGRESS = 'IN_PROGRESS',
	RESOLVED = 'RESOLVED',
	CLOSED = 'CLOSED',
}
registerEnumType(SupportStatus, {
	name: 'SupportStatus',
});
