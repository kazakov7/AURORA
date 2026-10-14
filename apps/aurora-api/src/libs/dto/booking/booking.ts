import { Field, Float, Int, ObjectType } from '@nestjs/graphql';
import { ObjectId } from 'mongoose';
import { BookingCategory, BookingStatus } from '../../enums/booking.enum';
import { Member, TotalCounter } from '../member/member';
import { Property } from '../property/property';
import { Review } from '../review/review';
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

	@Field(() => String, { nullable: true })
	cancelReason?: string;

	/** When the stay or the tour starts and ends: checkIn/checkOut for hotels, the booked tour dates for tours **/
	@Field(() => Date, { nullable: true })
	bookingStartDate?: Date;

	@Field(() => Date, { nullable: true })
	bookingEndDate?: Date;

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

	/** The guest's own rating of the booked hotel or tour (only in getMyBookings) **/
	@Field(() => Review, { nullable: true })
	ratingData?: Review;
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
