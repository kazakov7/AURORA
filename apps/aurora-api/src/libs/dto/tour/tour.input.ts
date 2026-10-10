import { Field, Float, InputType, Int } from '@nestjs/graphql';
import {
	IsArray,
	IsDate,
	IsEnum,
	IsIn,
	IsInt,
	IsMongoId,
	IsNotEmpty,
	IsNumber,
	IsOptional,
	IsString,
	Max,
	MaxLength,
	Min,
} from 'class-validator';
import { Types } from 'mongoose';
import { availableTourSorts } from '../../config';
import { Direction } from '../../enums/common.enum';
import { TourStatus } from '../../enums/tour.enum';

@InputType()
export class TourInput {
	/** Resolverdagi authenticated agentdan qo'yiladi. */
	memberId?: Types.ObjectId;

	@Field(() => String)
	@IsMongoId()
	@IsNotEmpty()
	destinationId: string;

	@Field(() => String)
	@IsString()
	@IsNotEmpty()
	@MaxLength(200)
	tourName: string;


	@Field({ nullable: true })
	@IsOptional()
	@IsString()
	@MaxLength(5000)
	tourDesc?: string;

	@Field(() => Float)
	@IsNumber()
	@Min(0.01)
	tourPrice: number;

	@Field(() => String)
	@IsString()
	@IsNotEmpty()
	@IsIn(['USD'])
	tourCurrency: string;

	@Field(() => Date)
	@IsDate()
	tourStartDate: Date;

	@Field(() => Date)
	@IsDate()
	tourEndDate: Date;

	@Field(() => Int)
	@IsInt()
	@Min(1)
	tourCapacity: number;

	@Field({ nullable: true })
	@IsOptional()
	@IsString()
	tourDepartureCountry?: string;

	@Field({ nullable: true })
	@IsOptional()
	@IsString()
	tourDepartureCity?: string;

	@Field({ nullable: true })
	@IsOptional()
	@IsString()
	tourDeparturePlace?: string;

	@Field({ nullable: true })
	@IsOptional()
	@IsString()
	tourDestinationCity?: string;

	@Field(() => [String], { nullable: true })
	@IsOptional()
	@IsArray()
	@IsString({ each: true })
	tourImages?: string[];

	@Field({ nullable: true })
	@IsOptional()
	@IsString()
	tourAdditionalInfo?: string;
}

@InputType()
export class TourPriceRange {
	@Field(() => Float)
	@IsNumber()
	@Min(0)
	start: number;

	@Field(() => Float)
	@IsNumber()
	@Min(0)
	end: number;
}

@InputType()
export class TourStartDateRange {
	@Field(() => Date)
	@IsDate()
	start: Date;

	@Field(() => Date)
	@IsDate()
	end: Date;
}

@InputType()
export class TourSearch {
	@Field(() => String, { nullable: true })
	@IsOptional()
	memberId?: string;

	@Field(() => String, { nullable: true })
	@IsOptional()
	destinationId?: string;

	@Field(() => String, { nullable: true })
	@IsOptional()
	tourDepartureCity?: string;

	@Field(() => String, { nullable: true })
	@IsOptional()
	tourDestinationCity?: string;

	@Field(() => TourStartDateRange, { nullable: true })
	@IsOptional()
	tourStartDateRange?: TourStartDateRange;

	@Field(() => TourPriceRange, { nullable: true })
	@IsOptional()
	tourPriceRange?: TourPriceRange;

	@Field(() => Int, { nullable: true })
	@IsOptional()
	@IsInt()
	@Min(1)
	minAvailableSeats?: number;

	@Field(() => String, { nullable: true })
	@IsOptional()
	@IsString()
	text?: string;
}

@InputType()
export class ToursInquiry {
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
	@IsIn(availableTourSorts)
	sort?: string;

	@Field(() => Direction, { nullable: true })
	@IsOptional()
	direction?: Direction;

	@Field(() => TourSearch)
	@IsNotEmpty()
	search: TourSearch;
}

@InputType()
export class OrdinaryTourInquiry {
	@Field(() => Int)
	@IsInt()
	@Min(1)
	page: number;

	@Field(() => Int)
	@IsInt()
	@Min(1)
	@Max(100)
	limit: number;
}

@InputType()
class AgentTourSearch {
	@Field(() => TourStatus, { nullable: true })
	@IsOptional()
	@IsEnum(TourStatus)
	tourStatus?: TourStatus;
}

@InputType()
export class AgentToursInquiry {
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
	@IsIn(availableTourSorts)
	sort?: string;

	@Field(() => Direction, { nullable: true })
	@IsOptional()
	direction?: Direction;

	@Field(() => AgentTourSearch)
	@IsNotEmpty()
	search: AgentTourSearch;
}

@InputType()
class AdminTourSearch {
	@Field(() => TourStatus, { nullable: true })
	@IsOptional()
	@IsEnum(TourStatus)
	tourStatus?: TourStatus;

	@Field(() => String, { nullable: true })
	@IsOptional()
	destinationId?: string;

	@Field(() => String, { nullable: true })
	@IsOptional()
	tourDepartureCity?: string;
}

@InputType()
export class AllToursInquiry {
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
	@IsIn(availableTourSorts)
	sort?: string;

	@Field(() => Direction, { nullable: true })
	@IsOptional()
	direction?: Direction;

	@Field(() => AdminTourSearch)
	@IsNotEmpty()
	search: AdminTourSearch;
}
