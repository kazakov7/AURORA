import { Field, Float, InputType, Int } from '@nestjs/graphql';
import {
	IsArray,
	IsEnum,
	IsInt,
	IsNotEmpty,
	IsNumber,
	IsOptional,
	IsString,
	MaxLength,
	Min,
} from 'class-validator';
import { PropertyType } from '../../enums/property.enum';
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
}
