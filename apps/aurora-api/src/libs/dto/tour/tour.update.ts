import { Field, Float, InputType, Int } from '@nestjs/graphql';
import { Transform } from 'class-transformer';
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
	MaxLength,
	Min,
	ValidateIf,
} from 'class-validator';
import { Types } from 'mongoose';
import { TourStatus } from '../../enums/tour.enum';
import { imageSourceRegex, isProvided, trimString } from '../../config';

/** Every field may be omitted, but only tourDestinationCity and tourAdditionalInfo may be null: the rest are required on create **/
@InputType()
export class TourUpdateInput {
	@Field(() => String)
	@IsMongoId()
	_id: Types.ObjectId;

	@Field(() => String, { nullable: true })
	@ValidateIf(isProvided)
	@IsMongoId()
	destinationId?: string;

	@Field({ nullable: true })
	@ValidateIf(isProvided)
	@Transform(trimString)
	@IsString()
	@IsNotEmpty()
	@MaxLength(200)
	tourName?: string;

	@Field({ nullable: true })
	@ValidateIf(isProvided)
	@Transform(trimString)
	@IsString()
	@IsNotEmpty()
	@MaxLength(5000)
	tourDesc?: string;

	// More than two decimals cannot be charged, so such a price would make the tour unbookable
	@Field(() => Float, { nullable: true })
	@ValidateIf(isProvided)
	@IsNumber({ maxDecimalPlaces: 2 })
	@Min(0.01)
	tourPrice?: number;

	@Field({ nullable: true })
	@ValidateIf(isProvided)
	@IsString()
	@IsIn(['USD'])
	tourCurrency?: string;

	@Field(() => Date, { nullable: true })
	@ValidateIf(isProvided)
	@IsDate()
	tourStartDate?: Date;

	@Field(() => Date, { nullable: true })
	@ValidateIf(isProvided)
	@IsDate()
	tourEndDate?: Date;

	@Field(() => Int, { nullable: true })
	@ValidateIf(isProvided)
	@IsInt()
	@Min(1)
	tourCapacity?: number;

	@Field({ nullable: true })
	@ValidateIf(isProvided)
	@Transform(trimString)
	@IsString()
	@IsNotEmpty()
	@MaxLength(100)
	tourDepartureCountry?: string;

	@Field({ nullable: true })
	@ValidateIf(isProvided)
	@Transform(trimString)
	@IsString()
	@IsNotEmpty()
	@MaxLength(100)
	tourDepartureCity?: string;

	@Field({ nullable: true })
	@ValidateIf(isProvided)
	@Transform(trimString)
	@IsString()
	@IsNotEmpty()
	@MaxLength(200)
	tourDeparturePlace?: string;

	@Field({ nullable: true })
	@IsOptional()
	@IsString()
	@MaxLength(100)
	tourDestinationCity?: string;

	@Field(() => [String], { nullable: true })
	@ValidateIf(isProvided)
	@IsArray()
	@ArrayMinSize(3)
	@ArrayMaxSize(10)
	@IsString({ each: true })
	@MaxLength(1000, { each: true })
	@Matches(imageSourceRegex, { each: true })
	tourImages?: string[];

	@Field({ nullable: true })
	@IsOptional()
	@IsString()
	@MaxLength(3000)
	tourAdditionalInfo?: string;
}

@InputType()
export class UpdateTourStatusInput {
	@Field(() => String)
	@IsNotEmpty()
	@IsMongoId()
	_id: Types.ObjectId;

	@Field(() => TourStatus)
	@IsEnum(TourStatus)
	tourStatus: TourStatus;
}
