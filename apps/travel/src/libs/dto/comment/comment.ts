import { Field, Int, ObjectType } from '@nestjs/graphql';
import { ObjectId, Types } from 'mongoose';

import { Member, TotalCounter } from '../member/member';
import { CommentGroup, CommentStatus } from '../../enums/comment.enum';

@ObjectType()
export class Comment {
	@Field(() => String)
	_id!: Types.ObjectId;

	@Field(() => CommentStatus)
	commentStatus!: CommentStatus;

	@Field(() => CommentGroup)
	commentGroup!: CommentGroup;

	@Field(() => String)
	commentContent!: string;

	@Field(() => String)
	commentRefId!: Types.ObjectId;

	@Field(() => String)
	memberId!: Types.ObjectId;

	@Field(() => Date)
	createdAt!: Date;

	@Field(() => Date)
	updatedAt!: Date;

	@Field(() => Date, { nullable: true })
	deletedAt?: Date;

	/** from aggregation **/

	@Field(() => Member, { nullable: true })
	memberData?: Member;
}

@ObjectType()
export class Comments {
	@Field(() => [Comment])
	list!: Comment[];

	@Field(() => [TotalCounter], { nullable: true })
	metaCounter!: TotalCounter[];
}
