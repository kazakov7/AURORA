import { Field, Int, ObjectType } from '@nestjs/graphql';
import { ReviewGroup, ReviewStatus } from '../../enums/review.enum';

@ObjectType()
export class Review {
	@Field(() => String)
	_id: string;

	@Field(() => String)
	memberId: string;

	@Field(() => String)
	bookingId: string;

	@Field(() => ReviewGroup)
	reviewGroup: ReviewGroup;

	@Field(() => String)
	reviewRefId: string;

	@Field(() => Int)
	reviewRating: number;

	@Field({ nullable: true })
	reviewContent?: string;

	@Field(() => ReviewStatus)
	reviewStatus: ReviewStatus;

	@Field(() => Date, { nullable: true })
	deletedAt?: Date;

	@Field(() => Date)
	createdAt: Date;

	@Field(() => Date)
	updatedAt: Date;
}
