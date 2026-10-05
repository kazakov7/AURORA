import { Field, InputType, Int } from '@nestjs/graphql';
import { IsArray, IsDate, IsEnum, IsInt, IsNotEmpty, IsOptional, Length, Min } from 'class-validator';
import { Types } from 'mongoose';
import { BookingStatus } from '../../enums/booking.enum';

@InputType()
export class CreatePropertyBookingInput {
	@Field(() => String)
	@IsNotEmpty()
	propertyId: Types.ObjectId;

	@Field(() => Date)
	@IsDate()
	checkIn: Date;

	@Field(() => Date)
	@IsDate()
	checkOut: Date;

	@Field(() => Int)
	@IsInt()
	@Min(1)
	bookingGuests: number;

	@Field(() => String, { nullable: true })
	@IsOptional()
	@Length(3, 500)
	bookingNote?: string;
}

@InputType()
export class CreateTourBookingInput {
	@Field(() => String)
	@IsNotEmpty()
	tourId: Types.ObjectId;

	@Field(() => Int)
	@IsInt()
	@Min(1)
	bookingGuests: number;

	@Field(() => String, { nullable: true })
	@IsOptional()
	@Length(3, 500)
	bookingNote?: string;
}

@InputType()
export class BookingSearch {
	@Field(() => [BookingStatus], { nullable: true })
	@IsOptional()
	@IsArray()
	@IsEnum(BookingStatus, { each: true })
	bookingStatusList?: BookingStatus[];
}

@InputType()
export class BookingsInquiry {
	@Field(() => Int)
	@IsInt()
	@Min(1)
	page: number;

	@Field(() => Int)
	@IsInt()
	@Min(1)
	limit: number;

	@Field(() => BookingSearch, { nullable: true })
	@IsOptional()
	search?: BookingSearch;
}
