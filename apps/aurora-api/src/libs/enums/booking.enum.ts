import { registerEnumType } from '@nestjs/graphql';

export enum BookingCategory {
	PROPERTY = 'PROPERTY',
	TOUR = 'TOUR',
}
registerEnumType(BookingCategory, {
	name: 'BookingCategory',
});
export enum BookingStatus {
	PENDING = 'PENDING',
	CONFIRMED = 'CONFIRMED',
	COMPLETED = 'COMPLETED',
	CANCELLED = 'CANCELLED',
}
registerEnumType(BookingStatus, {
	name: 'BookingStatus',
});
