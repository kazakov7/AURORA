import { Field, InputType, Int } from '@nestjs/graphql';
import { Type } from 'class-transformer';
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
	ValidateNested,
} from 'class-validator';
import { ReviewGroup, ReviewStatus } from '../../enums/review.enum';

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

/** ADMIN **/

@InputType()
class AllDestinationReviewsSearch {
	@Field(() => ReviewStatus, { nullable: true })
	@IsOptional()
	@IsEnum(ReviewStatus)
	reviewStatus?: ReviewStatus;

	@Field(() => String, { nullable: true })
	@IsOptional()
	@IsString()
	@MaxLength(100)
	text?: string;
}

@InputType()
export class AllDestinationReviewsInquiry {
	@Field(() => Int)
	@IsInt()
	@Min(1)
	page!: number;

	@Field(() => Int)
	@IsInt()
	@Min(1)
	@Max(100)
	limit!: number;

	@Field(() => AllDestinationReviewsSearch, { nullable: true })
	@IsOptional()
	@ValidateNested()
	@Type(() => AllDestinationReviewsSearch)
	search?: AllDestinationReviewsSearch;
}
