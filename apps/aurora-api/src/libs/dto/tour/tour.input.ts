import { Field, Float, InputType, Int } from '@nestjs/graphql';
import { Transform, Type } from 'class-transformer';
import {
	ArrayMaxSize,
	ArrayMinSize,
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
	Matches,
	Max,
	MaxLength,
	Min,
	ValidateIf,
	ValidateNested,
} from 'class-validator';
import { Types } from 'mongoose';
import { availableTourSorts, imageSourceRegex, isProvided, trimString } from '../../config';
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
	@Transform(trimString)
	@IsString()
	@IsNotEmpty()
	@MaxLength(200)
	tourName: string;

	@Field(() => String)
	@Transform(trimString)
	@IsString()
	@IsNotEmpty()
	@MaxLength(5000)
	tourDesc: string;

	@Field(() => Float)
	@IsNumber({ maxDecimalPlaces: 2 })
	@Min(0.01)
	tourPrice: number;

	// Optional, but never null: an omitted currency takes the USD default of the schema
	@Field(() => String, { nullable: true })
	@ValidateIf(isProvided)
	@IsString()
	@IsIn(['USD'])
	tourCurrency?: string;

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

	@Field(() => String)
	@Transform(trimString)
	@IsString()
	@IsNotEmpty()
	@MaxLength(100)
	tourDepartureCountry: string;

	@Field(() => String)
	@Transform(trimString)
	@IsString()
	@IsNotEmpty()
	@MaxLength(100)
	tourDepartureCity: string;

	@Field(() => String)
	@Transform(trimString)
	@IsString()
	@IsNotEmpty()
	@MaxLength(200)
	tourDeparturePlace: string;

	@Field({ nullable: true })
	@IsOptional()
	@IsString()
	@MaxLength(100)
	tourDestinationCity?: string;

	@Field(() => [String])
	@IsArray()
	@ArrayMinSize(3)
	@ArrayMaxSize(10)
	@IsString({ each: true })
	@MaxLength(1000, { each: true })
	@Matches(imageSourceRegex, { each: true })
	tourImages: string[];

	@Field({ nullable: true })
	@IsOptional()
	@IsString()
	@MaxLength(3000)
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
	@ValidateNested()
	@Type(() => TourStartDateRange)
	tourStartDateRange?: TourStartDateRange;

	@Field(() => TourPriceRange, { nullable: true })
	@IsOptional()
	@ValidateNested()
	@Type(() => TourPriceRange)
	tourPriceRange?: TourPriceRange;

	@Field(() => Int, { nullable: true })
	@IsOptional()
	@IsInt()
	@Min(1)
	minAvailableSeats?: number;

	@Field(() => String, { nullable: true })
	@IsOptional()
	@IsString()
	@MaxLength(100)
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
	@ValidateNested()
	@Type(() => TourSearch)
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
	@ValidateNested()
	@Type(() => AgentTourSearch)
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
	@ValidateNested()
	@Type(() => AdminTourSearch)
	search: AdminTourSearch;
}
