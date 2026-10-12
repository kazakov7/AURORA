import { InputType, Field, Float, Int } from '@nestjs/graphql';
import { Transform } from 'class-transformer';
import {
	IsOptional,
	IsEnum,
	IsIn,
	IsString,
	MaxLength,
	IsNumber,
	Min,
	IsInt,
	IsArray,
	IsNotEmpty,
	ArrayMaxSize,
	Matches,
	ValidateIf,
} from 'class-validator';
import { PropertyStatus, PropertyType } from '../../enums/property.enum';
import { Types } from 'mongoose';
import { imageSourceRegex, isProvided, trimString } from '../../config';

/** Every field may be omitted, but only propertyDesc and propertyCity may be null: the rest are non-nullable in the schema **/
@InputType()
export class UpdatePropertyInput {
	@Field(() => String)
	_id: Types.ObjectId;

	@Field(() => PropertyType, { nullable: true })
	@ValidateIf(isProvided)
	@IsEnum(PropertyType)
	propertyType?: PropertyType;

	@Field({ nullable: true })
	@ValidateIf(isProvided)
	@Transform(trimString)
	@IsString()
	@IsNotEmpty()
	@MaxLength(200)
	propertyName?: string;

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

	@Field({ nullable: true })
	@ValidateIf(isProvided)
	@Transform(trimString)
	@IsString()
	@IsNotEmpty()
	@MaxLength(200)
	propertyAddress?: string;

	// More than two decimals cannot be charged, so such a price would make the hotel unbookable
	@Field(() => Float, { nullable: true })
	@ValidateIf(isProvided)
	@IsNumber({ maxDecimalPlaces: 2 })
	@Min(0.01)
	pricePerNight?: number;

	@Field({ nullable: true })
	@ValidateIf(isProvided)
	@IsString()
	@IsIn(['USD'])
	currency?: string;

	@Field(() => Int, { nullable: true })
	@ValidateIf(isProvided)
	@IsInt()
	@Min(1)
	maxGuests?: number;

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
}

@InputType()
export class UpdatePropertyStatusInput {
	@Field(() => String)
	@IsNotEmpty()
	_id: Types.ObjectId;

	@Field(() => PropertyStatus)
	@IsEnum(PropertyStatus)
	propertyStatus: PropertyStatus;
}
