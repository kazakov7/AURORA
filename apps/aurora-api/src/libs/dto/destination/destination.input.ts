import { Field, Float, InputType, Int } from '@nestjs/graphql';
import { Transform, Type } from 'class-transformer';
import {
	ArrayMaxSize,
	IsArray,
	IsEnum,
	IsIn,
	IsInt,
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
import { availableDestinationSorts, imageSourceRegex, isProvided, trimString } from '../../config';
import { Direction } from '../../enums/common.enum';
import { DestinationStatus } from '../../enums/destination';

@InputType()
export class DestinationInput {
	@Field(() => String)
	@Transform(trimString)
	@IsString()
	@IsNotEmpty()
	@MaxLength(100)
	destinationName: string;

	@Field(() => String)
	@Transform(trimString)
	@IsString()
	@IsNotEmpty()
	@MaxLength(100)
	destinationCountry: string;

	@Field(() => Float, { nullable: true })
	@IsOptional()
	@IsNumber()
	@Min(-90)
	@Max(90)
	latitude?: number;

	@Field(() => Float, { nullable: true })
	@IsOptional()
	@IsNumber()
	@Min(-180)
	@Max(180)
	longitude?: number;

	// Optional, but never null: the image list is non-nullable in the schema
	@Field(() => [String], { nullable: true })
	@ValidateIf(isProvided)
	@IsArray()
	@ArrayMaxSize(10)
	@IsString({ each: true })
	@MaxLength(1000, { each: true })
	@Matches(imageSourceRegex, { each: true })
	destinationImages?: string[];

	@Field(() => String, { nullable: true })
	@IsOptional()
	@IsString()
	@MaxLength(2000)
	destinationDesc?: string;
}

@InputType()
export class DestinationSearch {
	@Field(() => String, { nullable: true })
	@IsOptional()
	@IsString()
	@MaxLength(100)
	destinationCountry?: string;

	/** Exact country names, e.g. every country of a continent **/
	@Field(() => [String], { nullable: true })
	@IsOptional()
	@IsArray()
	@ArrayMaxSize(50)
	@IsString({ each: true })
	@MaxLength(100, { each: true })
	destinationCountryList?: string[];

	@Field(() => String, { nullable: true })
	@IsOptional()
	@IsString()
	@MaxLength(100)
	text?: string;
}

@InputType()
export class DestinationsInquiry {
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
	@IsIn(availableDestinationSorts)
	sort?: string;

	@Field(() => Direction, { nullable: true })
	@IsOptional()
	direction?: Direction;

	@Field(() => DestinationSearch)
	@IsNotEmpty()
	@ValidateNested()
	@Type(() => DestinationSearch)
	search: DestinationSearch;
}

@InputType()
export class AdminDestinationSearch extends DestinationSearch {
	@Field(() => DestinationStatus, { nullable: true })
	@IsOptional()
	@IsEnum(DestinationStatus)
	destinationStatus?: DestinationStatus;
}

@InputType()
export class AdminDestinationsInquiry {
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
	@IsIn(availableDestinationSorts)
	sort?: string;

	@Field(() => Direction, { nullable: true })
	@IsOptional()
	direction?: Direction;

	@Field(() => AdminDestinationSearch)
	@IsNotEmpty()
	@ValidateNested()
	@Type(() => AdminDestinationSearch)
	search: AdminDestinationSearch;
}
