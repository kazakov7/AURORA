import { Field, Float, InputType } from '@nestjs/graphql';
import { Transform } from 'class-transformer';
import {
	ArrayMaxSize,
	IsArray,
	IsEnum,
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
} from 'class-validator';
import { DestinationStatus } from '../../enums/destination';
import { imageSourceRegex, isProvided, trimString } from '../../config';

/** Every field may be omitted, but only the coordinates and the description may be null: the rest are non-nullable in the schema **/
@InputType()
export class DestinationUpdate {
	@Field(() => String)
	@IsMongoId()
	_id: string;

	@Field(() => DestinationStatus, { nullable: true })
	@ValidateIf(isProvided)
	@IsEnum(DestinationStatus)
	destinationStatus?: DestinationStatus;

	// The slug follows the name, so it is never set on its own
	@Field(() => String, { nullable: true })
	@ValidateIf(isProvided)
	@Transform(trimString)
	@IsString()
	@IsNotEmpty()
	@MaxLength(100)
	destinationName?: string;

	@Field(() => String, { nullable: true })
	@ValidateIf(isProvided)
	@Transform(trimString)
	@IsString()
	@IsNotEmpty()
	@MaxLength(100)
	destinationCountry?: string;

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
