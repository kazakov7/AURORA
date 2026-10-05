import { Field, Int, ObjectType } from '@nestjs/graphql';
import { ReviewGroup, ReviewStatus } from '../../enums/review.enum';
import { Member, TotalCounter } from '../member/member';
import { Types } from 'mongoose';

@ObjectType()
export class Review {
	@Field(() => String)
	_id: Types.ObjectId;

	@Field(() => String)
	memberId: Types.ObjectId;

	@Field(() => String, { nullable: true })
	bookingId?: Types.ObjectId;

	@Field(() => ReviewGroup)
	reviewGroup: ReviewGroup;

	@Field(() => String)
	reviewRefId: Types.ObjectId;

	@Field(() => Int)
	reviewRating: number;

	@Field({ nullable: true })
	reviewContent?: string;

	@Field(() => ReviewStatus)
	reviewStatus: ReviewStatus;

	@Field(() => Member, { nullable: true })
	memberData?: Member;

	@Field(() => Date, { nullable: true })
	deletedAt?: Date;

	@Field(() => Date)
	createdAt: Date;

	@Field(() => Date)
	updatedAt: Date;
}

@ObjectType()
export class Reviews {
	@Field(() => [Review])
	list!: Review[];

	@Field(() => [TotalCounter], { nullable: true })
	metaCounter!: TotalCounter[];
}
