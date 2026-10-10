import { Field, Float, Int, ObjectType } from '@nestjs/graphql';
import { ObjectId } from 'mongoose';
import { BookingCategory, BookingStatus } from '../../enums/booking.enum';
import { Member, TotalCounter } from '../member/member';
import { Property } from '../property/property';
import { Tour } from '../tour/tour';

@ObjectType()
export class Booking {
	@Field(() => String)
	_id: ObjectId;

	@Field(() => String)
	memberId: ObjectId;

	@Field(() => BookingCategory)
	bookingCategory: BookingCategory;

	@Field(() => BookingStatus)
	bookingStatus: BookingStatus;

	@Field(() => String)
	bookingRefId: ObjectId;

	checkoutKey?: string;

	confirmedPaymentId?: ObjectId;

	@Field(() => Date, { nullable: true })
	checkIn?: Date;

	@Field(() => Date, { nullable: true })
	checkOut?: Date;

	@Field(() => Int)
	bookingGuests: number;

	@Field(() => Float)
	bookingTotalPrice: number;

	@Field(() => String)
	bookingCurrency: string;

	priceSnapshot: Record<string, unknown>;

	@Field(() => String, { nullable: true })
	bookingNote?: string;

	@Field(() => Date, { nullable: true })
	cancelledAt?: Date;

	@Field(() => Date, { nullable: true })
	expiresAt?: Date;

	@Field(() => Date)
	createdAt: Date;

	@Field(() => Date)
	updatedAt: Date;

	/** from aggregation ($lookup) */
	@Field(() => Member, { nullable: true })
	memberData?: Member;

	/** bookingCategory === PROPERTY bo'lganda to'ldiriladi */
	@Field(() => Property, { nullable: true })
	propertyData?: Property;

	@Field(() => Tour, { nullable: true })
	tourData?: Tour;
}

@ObjectType()
export class Bookings {
	@Field(() => [Booking])
	list: Booking[];

	@Field(() => [TotalCounter], { nullable: true })
	metaCounter: TotalCounter[];
}

/** Public calendar DTO. It deliberately contains no member, payment, or booking metadata. */
@ObjectType()
export class PropertyAvailabilityRange {
	@Field(() => Date)
	checkIn: Date;

	@Field(() => Date)
	checkOut: Date;
}
