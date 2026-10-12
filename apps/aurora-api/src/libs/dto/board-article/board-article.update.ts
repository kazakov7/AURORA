import { Field, InputType } from '@nestjs/graphql';
import { Transform } from 'class-transformer';
import {
	IsEnum,
	IsMongoId,
	IsNotEmpty,
	IsOptional,
	IsString,
	Length,
	Matches,
	MaxLength,
	ValidateIf,
} from 'class-validator';

import { Types } from 'mongoose';
import { BoardArticleStatus, BoardArticleCategory } from '../../enums/board-article.enum';
import { imageSourceRegex, isProvided, trimString } from '../../config';

/** Every field may be omitted, but only articleImage may be null: the rest are non-nullable in the schema **/
@InputType()
export class BoardArticleUpdate {
	@ValidateIf(isProvided)
	@IsEnum(BoardArticleCategory)
	@Field(() => BoardArticleCategory, { nullable: true })
	articleCategory?: BoardArticleCategory;

	@IsNotEmpty()
	@IsMongoId()
	@Field(() => String)
	_id!: Types.ObjectId;

	@ValidateIf(isProvided)
	@Transform(trimString)
	@IsString()
	@Length(3, 100)
	@Field(() => String, { nullable: true })
	articleTitle?: string;

	@ValidateIf(isProvided)
	@Transform(trimString)
	@IsString()
	@Length(3, 2000)
	@Field(() => String, { nullable: true })
	articleContent?: string;

	@IsOptional()
	@IsString()
	@MaxLength(1000)
	@Matches(imageSourceRegex)
	@Field(() => String, { nullable: true })
	articleImage?: string;

	@ValidateIf(isProvided)
	@IsEnum(BoardArticleStatus)
	@Field(() => BoardArticleStatus, { nullable: true })
	articleStatus?: BoardArticleStatus;
}
