import { Field, Float, InputType } from '@nestjs/graphql';
import { IsOptional, IsString, MaxLength, IsArray, IsNotEmpty, IsNumber } from 'class-validator';

@InputType()
export class DestinationInput {
	@Field(() => String)
	@IsString()
	@IsNotEmpty()
	destinationName: string;

	@Field(() => String)
	@IsString()
	@IsNotEmpty()
	destinationSlug: string;

	@Field(() => String)
	@IsString()
	@IsNotEmpty()
	destinationCountry: string;

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
