import { Field, InputType, Int } from '@nestjs/graphql';
import { IsInt, IsMongoId, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

@InputType()
export class ReviewUpdate {
	@Field({ nullable: true })
	@IsOptional()
	@IsString()
	@MaxLength(3000)
	reviewContent?: string;
}

@InputType()
export class DestinationReviewUpdate {
	@Field(() => String)
	@IsMongoId()
	_id!: string;

	@Field(() => Int, { nullable: true })
	@IsOptional()
	@IsInt()
	@Min(1)
	@Max(5)
	reviewRating?: number;

	@Field({ nullable: true })
	@IsOptional()
	@IsString()
	@MaxLength(3000)
	reviewContent?: string;
}
