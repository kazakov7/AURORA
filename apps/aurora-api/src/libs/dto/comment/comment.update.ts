import { Field, InputType } from '@nestjs/graphql';
import { IsNotEmpty, IsOptional, Length } from 'class-validator';

import { ObjectId, Types } from 'mongoose';

@InputType()
export class CommentUpdate {
	@IsNotEmpty()
	@Field(() => String)
	_id!: Types.ObjectId;

	@IsOptional()
	@Length(1, 100)
	@Field(() => String, { nullable: true })
	commentContent?: string;
}
