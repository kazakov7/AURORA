import { InputType, Field, Float, Int } from '@nestjs/graphql';
import { IsOptional, IsEnum, IsString, MaxLength, IsNumber, Min, IsInt, IsArray, IsNotEmpty } from 'class-validator';
import { PropertyStatus, PropertyType } from '../../enums/property.enum';
import { Types } from 'mongoose';

@InputType()
export class UpdatePropertyInput {
	@Field(() => String)
	_id: Types.ObjectId;

	@Field(() => PropertyType, { nullable: true })
	@IsOptional()
	@IsEnum(PropertyType)
	propertyType?: PropertyType;

	@Field({ nullable: true })
	@IsOptional()
	@IsString()
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
	propertyCity?: string;

	@Field({ nullable: true })
	@IsOptional()
	@IsString()
	propertyAddress?: string;

	@Field(() => Float, { nullable: true })
	@IsOptional()
	@IsNumber()
	@Min(0)
	pricePerNight?: number;

	@Field({ nullable: true })
	@IsOptional()
	@IsString()
	currency?: string;

	@Field(() => Int, { nullable: true })
	@IsOptional()
	@IsInt()
	@Min(1)
	maxGuests?: number;

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

@InputType()
export class UpdatePropertyStatusInput {
	@Field(() => String)
	@IsNotEmpty()
	_id: Types.ObjectId;

	@Field(() => PropertyStatus)
	@IsEnum(PropertyStatus)
	propertyStatus: PropertyStatus;
}
