import { Field, Float, InputType, Int } from '@nestjs/graphql';
import { IsArray, IsDate, IsMongoId, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { Types } from 'mongoose';
@InputType()
export class TourInput {
	memberId?: Types.ObjectId;

	@Field()
	@IsMongoId()
	@IsNotEmpty()
	destinationId: Types.ObjectId;

	@Field()
	@IsString()
	@IsNotEmpty()
	tourName: string;

	@Field()
	@IsString()
	@IsNotEmpty()
	tourSlug: string;

	@Field({ nullable: true })
	@IsOptional()
	@IsString()
	tourDesc?: string;

	@Field(() => Float)
	@IsNumber()
	@Min(0)
	tourPrice: number;

	@Field()
	@IsString()
	@IsNotEmpty()
	tourCurrency: string;

	@Field()
	@IsDate()
	tourStartDate: Date;

	@Field()
	@IsDate()
	tourEndDate: Date;

	@Field(() => Int)
	@IsNumber()
	@Min(1)
	tourCapacity: number;

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
