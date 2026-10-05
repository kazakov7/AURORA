import { Field, Float, InputType, Int } from '@nestjs/graphql';
import {
	IsArray,
	IsEnum,
	IsIn,
	IsInt,
	IsNotEmpty,
	IsNumber,
	IsOptional,
	IsString,
	MaxLength,
	Min,
} from 'class-validator';
import { Types } from 'mongoose';
import { PropertyStatus, PropertyType } from '../../enums/property.enum';
import { Direction } from '../../enums/common.enum';
import { availablePropertySorts } from '../../config';

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

	@Field()
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
	propertyCity?: string;

	@Field()
	@IsNotEmpty()
	@IsString()
	propertyAddress: string;

	@Field(() => Float)
	@IsNumber()
	@Min(0)
	@IsNotEmpty()
	pricePerNight: number;

	@Field()
	@IsString()
	@IsNotEmpty()
	currency: string;

	@Field(() => Int)
	@IsInt()
	@Min(1)
	@IsNotEmpty()
	maxGuests: number;

	@Field(() => Int, { nullable: true })
	@IsOptional()
	@IsInt()
	@Min(0)
	bedrooms?: number;

	@Field(() => Int, { nullable: true })
	@IsOptional()
	@IsInt()
	@Min(0)
	beds?: number;

	@Field(() => Int, { nullable: true })
	@IsOptional()
	@IsInt()
	@Min(0)
	bathrooms?: number;

	@Field(() => [String], { nullable: true })
	@IsOptional()
	@IsArray()
	@IsString({ each: true })
	amenities?: string[];

	@Field(() => [String], { nullable: true })
	@IsOptional()
	@IsArray()
	@IsString({ each: true })
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
	@Field(() => [String], { nullable: true })
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
	text?: string;
}

@InputType()
export class PropertiesInquiry {
	@IsNotEmpty()
	@Min(1)
	@Field(() => Int)
	page!: number;

	@IsNotEmpty()
	@Min(1)
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
	@Field(() => PISearch)
	search!: PISearch;
}
@InputType()
export class OrdinaryInquery {
	@IsNotEmpty()
	@Min(1)
	@Field(() => Int)
	page!: number;

	@IsNotEmpty()
	@Min(1)
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
	@Min(1)
	@Field(() => Int)
	page!: number;

	@IsNotEmpty()
	@Min(1)
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
	@Min(1)
	@Field(() => Int)
	page!: number;

	@IsNotEmpty()
	@Min(1)
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
	@Field(() => ALPISearch)
	search!: ALPISearch;
}
