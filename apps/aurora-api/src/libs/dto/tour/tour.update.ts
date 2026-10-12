import { Field, Float, InputType, Int } from '@nestjs/graphql';
import {
	IsArray,
	IsEnum,
	IsIn,
	IsInt,
	IsMongoId,
	IsNotEmpty,
	IsNumber,
	IsOptional,
	IsString,
	MaxLength,
	Min,
} from 'class-validator';
import { Types } from 'mongoose';
import { TourStatus } from '../../enums/tour.enum';

@InputType()
export class TourUpdateInput {
	@Field(() => String)
	@IsMongoId()
	_id: Types.ObjectId;

	@Field(() => String, { nullable: true })
	@IsOptional()
	@IsMongoId()
	destinationId?: string;

	@Field({ nullable: true })
	@IsOptional()
	@IsString()
	@MaxLength(200)
	tourName?: string;

	@Field({ nullable: true })
	@IsOptional()
	@IsString()
	@MaxLength(5000)
	tourDesc?: string;

	@Field(() => Float, { nullable: true })
	@IsOptional()
	@IsNumber()
	@Min(0.01)
	tourPrice?: number;

	@Field({ nullable: true })
	@IsOptional()
	@IsString()
	@IsIn(['USD'])
	tourCurrency?: string;

	@Field(() => Date, { nullable: true })
	@IsOptional()
	tourStartDate?: Date;

	@Field(() => Date, { nullable: true })
	@IsOptional()
	tourEndDate?: Date;

	@Field(() => Int, { nullable: true })
	@IsOptional()
	@IsInt()
	@Min(1)
	tourCapacity?: number;

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
export class UpdateTourStatusInput {
	@Field(() => String)
	@IsNotEmpty()
	@IsMongoId()
	_id: Types.ObjectId;

	@Field(() => TourStatus)
	@IsEnum(TourStatus)
	tourStatus: TourStatus;
}
