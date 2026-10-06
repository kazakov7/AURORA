import { Field, Float, InputType, Int } from '@nestjs/graphql';
import { IsArray, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { availableDestinationSorts } from '../../config';
import { Direction } from '../../enums/common.enum';

@InputType()
export class DestinationInput {
	@Field(() => String)
	@IsString()
	@IsNotEmpty()
	destinationName: string;


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
	@IsString({ each: true })
	destinationImages?: string[];

	@Field(() => String, { nullable: true })
	@IsOptional()
	@IsString()
	@MaxLength(2000)
	destinationDesc?: string;
}

@InputType()
export class DestinationSearch {
	@Field(() => String, { nullable: true })
	@IsOptional()
	@IsString()
	destinationCountry?: string;

	@Field(() => String, { nullable: true })
	@IsOptional()
	@IsString()
	text?: string;
}

@InputType()
export class DestinationsInquiry {
	@Field(() => Int)
	@IsInt()
	@Min(1)
	page: number;

	@Field(() => Int)
	@IsInt()
	@Min(1)
	limit: number;

	@Field(() => String, { nullable: true })
	@IsOptional()
	@IsIn(availableDestinationSorts)
	sort?: string;

	@Field(() => Direction, { nullable: true })
	@IsOptional()
	direction?: Direction;

	@Field(() => DestinationSearch)
	@IsNotEmpty()
	search: DestinationSearch;
}

@InputType()
export class AdminDestinationsInquiry extends DestinationsInquiry { }
