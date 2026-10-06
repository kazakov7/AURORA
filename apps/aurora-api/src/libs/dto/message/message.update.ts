import { Field, InputType } from '@nestjs/graphql';
import { ObjectId } from 'mongoose';
import { IsNotEmpty, IsOptional, Length } from 'class-validator';

@InputType()
export class MessageUpdate {
	@IsNotEmpty()
	@Field(() => String)
	_id: ObjectId;

	@IsOptional()
	@Length(1, 1000)
	@Field(() => String, { nullable: true })
	messageContent?: string;
}
