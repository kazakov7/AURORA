import { Field, Float, InputType } from '@nestjs/graphql';
import { IsArray, IsEnum, IsMongoId, IsNotEmpty, IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';
import { DestinationStatus } from '../../enums/destination';

@InputType()
export class DestinationUpdate {
	@Field(() => String)
	@IsMongoId()
	_id: string;

	@Field(() => String, { nullable: true })
	@IsOptional()
	@IsString()
	destinationName?: string;

	@Field(() => String, { nullable: true })
	@IsOptional()
	@IsString()
	destinationSlug?: string;

	@Field(() => String, { nullable: true })
	@IsOptional()
	@IsString()
	destinationCountry?: string;

	@Field(() => Float, { nullable: true })
	@IsOptional()
	@IsNumber()
	latitude?: number;

	@Field(() => Float, { nullable: true })
	@IsOptional()
	@IsNumber()
	longitude?: number;

	@Field(() => [String], { nullable: true })
	@IsOptional()
	@IsArray()
	@IsString({ each: true })
	destinationImages?: string[];

	@Field(() => String, { nullable: true })
	@IsOptional()
	@IsString()
	@MaxLength(2000)
	destinationDesc?: string;
}

@InputType()
export class UpdateDestinationStatusInput {
	@Field(() => String)
	@IsMongoId()
	@IsNotEmpty()
	_id: string;

	@Field(() => DestinationStatus)
	@IsEnum(DestinationStatus)
	destinationStatus: DestinationStatus;
}
