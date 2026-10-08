import { Field, Float, Int, ObjectType } from '@nestjs/graphql';

import type { ObjectId, Types } from 'mongoose';
import { Member, TotalCounter } from '../member/member';
import { MeLiked } from '../like/like';
import { BoardArticleCategory, BoardArticleStatus } from '../../enums/board-article.enum';

@ObjectType()
export class BoardArticle {
	@Field(() => String)
	_id!: ObjectId;

	@Field(() => BoardArticleCategory)
	articleCategory!: BoardArticleCategory;

	@Field(() => BoardArticleStatus)
	articleStatus!: BoardArticleStatus;

	@Field(() => String)
	articleTitle!: string;

	@Field(() => String)
	articleContent!: string;

	@Field(() => String, { nullable: true })
	articleImage?: string;

	@Field(() => Int)
	articleViews!: number;

	@Field(() => Int)
	articleLikes!: number;

	@Field(() => Int)
	articleComments!: number;

	@Field(() => Float)
	articleRating!: number;

	@Field(() => Int)
	articleReviews!: number;

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

	@Field(() => [MeLiked], { nullable: true })
	meLiked?: MeLiked[];
}

@ObjectType()
export class BoardArticles {
	@Field(() => [BoardArticle])
	list!: BoardArticle[];

	@Field(() => [TotalCounter], { nullable: true })
	metaCounter!: TotalCounter[];
}
