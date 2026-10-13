import { Field, InputType, Int } from '@nestjs/graphql';
import { Transform, Type } from 'class-transformer';
import {
	IsArray,
	IsDate,
	IsEnum,
	IsInt,
	IsMongoId,
	IsNotEmpty,
	IsOptional,
	IsString,
	Max,
	MaxLength,
	Min,
	ValidateNested,
} from 'class-validator';
import { BookingCategory, BookingStatus } from '../../enums/booking.enum';
import { trimString } from '../../config';

@InputType()
export class BookingSearch {
	@Field(() => [BookingStatus], { nullable: true })
	@IsOptional()
	@IsArray()
	@IsEnum(BookingStatus, { each: true })
	bookingStatusList?: BookingStatus[];

	@Field(() => BookingCategory, { nullable: true })
	@IsOptional()
	@IsEnum(BookingCategory)
	bookingCategory?: BookingCategory;
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
	@Max(100)
	limit: number;

	@Field(() => BookingSearch, { nullable: true })
	@IsOptional()
	@ValidateNested()
	@Type(() => BookingSearch)
	search?: BookingSearch;
}

@InputType()
export class CancelBookingByAdminInput {
	@Field(() => String)
	@IsMongoId()
	_id: string;

	@Field(() => String)
	@Transform(trimString)
	@IsString()
	@IsNotEmpty()
	@MaxLength(500)
	cancelReason: string;
}

@InputType()
export class PropertyAvailabilityInquiry {
	@Field(() => String)
	@IsMongoId()
	propertyId: string;

	@Field(() => Date)
	@IsDate()
	startDate: Date;

	@Field(() => Date)
	@IsDate()
	endDate: Date;
}
