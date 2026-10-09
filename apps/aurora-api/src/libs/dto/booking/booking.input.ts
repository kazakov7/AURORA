import { Field, InputType, Int } from '@nestjs/graphql';
import { IsArray, IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { BookingStatus } from '../../enums/booking.enum';

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
	@Max(100)
	limit: number;

	@Field(() => BookingSearch, { nullable: true })
	@IsOptional()
	search?: BookingSearch;
}
