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
import { Types } from 'mongoose';
import { PropertyStatus, PropertyType } from '../../enums/property.enum';
import { Direction } from '../../enums/common.enum';
import { availablePropertySorts, imageSourceRegex, isProvided, trimString } from '../../config';

@InputType()
export class CreatePropertyInput {
	@Field(() => String)
	@IsString()
	@IsNotEmpty()
	destinationId: string;

	@Field(() => PropertyType)
	@IsNotEmpty()
	@IsEnum(PropertyType)
	propertyType: PropertyType;

	@Field(() => String)
	@Transform(trimString)
	@IsString()
	@IsNotEmpty()
	@MaxLength(200)
	propertyName: string;

	@Field({ nullable: true })
	@IsOptional()
	@IsString()
	@MaxLength(3000)
	propertyDesc?: string;

	@Field({ nullable: true })
	@IsOptional()
	@IsString()
	@MaxLength(100)
	propertyCity?: string;

	@Field(() => String)
	@Transform(trimString)
	@IsNotEmpty()
	@IsString()
	@MaxLength(200)
	propertyAddress: string;

	@Field(() => Float)
	@IsNumber({ maxDecimalPlaces: 2 })
	@Min(0.01)
	@IsNotEmpty()
	pricePerNight: number;

	@Field(() => String)
	@IsString()
	@IsNotEmpty()
	@IsIn(['USD'])
	currency: string;

	@Field(() => Int)
	@IsInt()
	@Min(1)
	@IsNotEmpty()
	maxGuests: number;

	// Optional, but never null: the counts and lists below are non-nullable in the schema
	@Field(() => Int, { nullable: true })
	@ValidateIf(isProvided)
	@IsInt()
	@Min(0)
	bedrooms?: number;

	@Field(() => Int, { nullable: true })
	@ValidateIf(isProvided)
	@IsInt()
	@Min(0)
	beds?: number;

	@Field(() => Int, { nullable: true })
	@ValidateIf(isProvided)
	@IsInt()
	@Min(0)
	bathrooms?: number;

	@Field(() => [String], { nullable: true })
	@ValidateIf(isProvided)
	@IsArray()
	@ArrayMaxSize(50)
	@IsString({ each: true })
	@MaxLength(50, { each: true })
	amenities?: string[];

	@Field(() => [String], { nullable: true })
	@ValidateIf(isProvided)
	@IsArray()
	@ArrayMaxSize(10)
	@IsString({ each: true })
	@MaxLength(1000, { each: true })
	@Matches(imageSourceRegex, { each: true })
	propertyImages?: string[];

	/** Resolverdagi authenticated agentdan qo'yiladi. */
	memberId?: Types.ObjectId;
}

@InputType()
export class PricePerNightRange {
	@Field(() => Float)
	@IsNumber()
	@Min(0)
	start!: number;

	@Field(() => Float)
	@IsNumber()
	@Min(0)
	end!: number;
}

@InputType()
export class PISearch {
	@IsOptional()
	@Field(() => String, { nullable: true })
	memberId?: Types.ObjectId;

	@IsOptional()
	@Field(() => String, { nullable: true })
	destinationId?: string;

	@IsOptional()
	@Field(() => [String], { nullable: true })
	propertyCityList?: string[];

	@IsOptional()
	@Field(() => [PropertyType], { nullable: true })
	propertyTypeList?: PropertyType[];

	@IsOptional()
	@Field(() => Int, { nullable: true })
	@IsInt()
	@Min(1)
	minGuests?: number;

	@IsOptional()
	@Field(() => Int, { nullable: true })
	@IsInt()
	@Min(0)
	bedrooms?: number;

	@IsOptional()
	@Field(() => Int, { nullable: true })
	@IsInt()
	@Min(0)
	beds?: number;

	@IsOptional()
	@Field(() => [String], { nullable: true })
	@IsArray()
	@IsString({ each: true })
	amenities?: string[];

	@IsOptional()
	@ValidateNested()
	@Type(() => PricePerNightRange)
	@Field(() => PricePerNightRange, { nullable: true })
	pricePerNightRange?: PricePerNightRange;

	@IsOptional()
	@Field(() => Date, { nullable: true })
	checkIn?: Date;

	@IsOptional()
	@Field(() => Date, { nullable: true })
	checkOut?: Date;

	@IsOptional()
	@Field(() => String, { nullable: true })
	@IsString()
	@MaxLength(100)
	text?: string;
}

@InputType()
export class PropertiesInquiry {
	@IsNotEmpty()
	@IsInt()
	@Min(1)
	@Field(() => Int)
	page!: number;

	@IsNotEmpty()
	@IsInt()
	@Min(1)
	@Max(100)
	@Field(() => Int)
	limit!: number;

	@IsOptional()
	@IsIn(availablePropertySorts)
	@Field(() => String, { nullable: true })
	sort?: string;

	@IsOptional()
	@Field(() => Direction, { nullable: true })
	direction?: Direction;

	@IsNotEmpty()
	@ValidateNested()
	@Type(() => PISearch)
	@Field(() => PISearch)
	search!: PISearch;
}
@InputType()
export class OrdinaryInquery {
	@IsNotEmpty()
	@IsInt()
	@Min(1)
	@Field(() => Int)
	page!: number;

	@IsNotEmpty()
	@IsInt()
	@Min(1)
	@Max(100)
	@Field(() => Int)
	limit!: number;
}

@InputType()
class APISearch {
	@IsOptional()
	@Field(() => PropertyStatus, { nullable: true })
	propertyStatus?: PropertyStatus;
}

@InputType()
export class AgentPropertiesInquiry {
	@IsNotEmpty()
	@IsInt()
	@Min(1)
	@Field(() => Int)
	page!: number;

	@IsNotEmpty()
	@IsInt()
	@Min(1)
	@Max(100)
	@Field(() => Int)
	limit!: number;

	@IsOptional()
	@IsIn(availablePropertySorts)
	@Field(() => String, { nullable: true })
	sort?: string;

	@IsOptional()
	@Field(() => Direction, { nullable: true })
	direction?: Direction;

	@IsNotEmpty()
	@ValidateNested()
	@Type(() => APISearch)
	@Field(() => APISearch)
	search!: APISearch;
}
@InputType()
class ALPISearch {
	@IsOptional()
	@Field(() => PropertyStatus, { nullable: true })
	propertyStatus?: PropertyStatus;

	@IsOptional()
	@Field(() => [String], { nullable: true })
	destinationIdList?: string[];

	@IsOptional()
	@Field(() => [String], { nullable: true })
	propertyCityList?: string[];
}

@InputType()
export class AllPropertiesInquiry {
	@IsNotEmpty()
	@IsInt()
	@Min(1)
	@Field(() => Int)
	page!: number;

	@IsNotEmpty()
	@IsInt()
	@Min(1)
	@Max(100)
	@Field(() => Int)
	limit!: number;

	@IsOptional()
	@IsIn(availablePropertySorts)
	@Field(() => String, { nullable: true })
	sort?: string;

	@IsOptional()
	@Field(() => Direction, { nullable: true })
	direction?: Direction;

	@IsNotEmpty()
	@ValidateNested()
	@Type(() => ALPISearch)
	@Field(() => ALPISearch)
	search!: ALPISearch;
}
