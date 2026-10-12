import { Field, InputType, Int } from '@nestjs/graphql';
import {
	IsEnum,
	IsInt,
	IsMongoId,
	IsNotEmpty,
	IsOptional,
	IsString,
	Max,
	MaxLength,
	Min,
} from 'class-validator';
import { ReviewGroup } from '../../enums/review.enum';

@InputType()
export class RatingInput {
	@Field(() => ReviewGroup)
	@IsEnum(ReviewGroup)
	reviewGroup!: ReviewGroup;

	@Field(() => String)
	@IsMongoId()
	@IsNotEmpty()
	reviewRefId!: string;

	@Field(() => Int)
	@IsInt()
	@Min(1)
	@Max(5)
	reviewRating!: number;
}

@InputType()
export class ReviewInput {
	memberId?: string;

	@Field(() => String)
	@IsMongoId()
	@IsNotEmpty()
	bookingId: string;

	@Field(() => Int)
	@IsInt()
	@Min(1)
	@Max(5)
	reviewRating: number;

	@Field({ nullable: true })
	@IsOptional()
	@IsString()
	@MaxLength(3000)
	reviewContent?: string;
}

@InputType()
export class DestinationReviewInput {
	@Field(() => String)
	@IsMongoId()
	@IsNotEmpty()
	destinationId!: string;

	@Field(() => Int)
	@IsInt()
	@Min(1)
	@Max(5)
	reviewRating!: number;

	@Field({ nullable: true })
	@IsOptional()
	@IsString()
	@MaxLength(3000)
	reviewContent?: string;
}

@InputType()
export class DestinationReviewsInquiry {
	@Field(() => Int)
	@IsInt()
	@Min(1)
	page!: number;

	@Field(() => Int)
	@IsInt()
	@Min(1)
	@Max(100)
	limit!: number;
}
