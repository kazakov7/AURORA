import { Field, Float, InputType } from '@nestjs/graphql';
import { IsArray, IsOptional, IsString, MaxLength, IsNumber } from 'class-validator';

@InputType()
export class DestinationUpdate {
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
	destinationImages?: string[];

	@Field(() => String, { nullable: true })
	@IsOptional()
	@IsString()
	@MaxLength(2000)
	destinationDesc?: string;
}
