import { Field, InputType } from '@nestjs/graphql';
import { IsNotEmpty, IsOptional, Length } from 'class-validator';

import { ObjectId, Types } from 'mongoose';
import { BoardArticleStatus } from '../../enums/board-article.enum';

@InputType()
export class BoardArticleUpdate {
	@IsNotEmpty()
	@Field(() => String)
	_id!: Types.ObjectId;

	@IsOptional()
	@Length(3, 50)
	@Field(() => String, { nullable: true })
	articleTitle?: string;

	@IsOptional()
	@Length(3, 250)
	@Field(() => String, { nullable: true })
	articleContent?: string;

	@IsOptional()
	@Field(() => String, { nullable: true })
	articleImage?: string;

	@IsOptional()
	@Field(() => BoardArticleStatus, { nullable: true })
	articleStatus?: BoardArticleStatus;
}
