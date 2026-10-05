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
import { availableOptions, availablePropertySorts } from '../../config';
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

	@Field({ nullable: true })
	@IsOptional()
	@IsString()
	propertyAddress?: string;

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

	@Field()
	memberId: Types.ObjectId;
}
@InputType()
export class PricesRange {
	@Field(() => Int)
	start!: number;

	@Field(() => Int)
	end!: number;
}

@InputType()
export class SquaresRange {
	@Field(() => Int)
	start!: number;

	@Field(() => Int)
	end!: number;
}

@InputType()
export class PeriodsRange {
	@Field(() => Date)
	start!: Date;

	@Field(() => Date)
	end!: Date;
}

@InputType()
export class PISearch {
	@IsOptional()
	@Field(() => String, { nullable: true })
	memberId?: Types.ObjectId;

	@IsOptional()
	@Field(() => [String], { nullable: true })
	locationList?: String[];

	@IsOptional()
	@Field(() => [PropertyType], { nullable: true })
	typeList?: PropertyType[];

	@IsOptional()
	@Field(() => [Int], { nullable: true })
	roomsList?: number[];

	@IsOptional()
	@Field(() => [Int], { nullable: true })
	bedsList?: number[];

	@IsOptional()
	@IsIn(availableOptions, { each: true })
	@Field(() => [String], { nullable: true })
	options?: string[];

	@IsOptional()
	@Field(() => PricesRange, { nullable: true })
	pricesRange?: PricesRange;

	@IsOptional()
	@Field(() => PeriodsRange, { nullable: true })
	periodsRange?: PeriodsRange;

	@IsOptional()
	@Field(() => SquaresRange, { nullable: true })
	squaresRange?: SquaresRange;

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
	propertyLocationList?: String[];
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