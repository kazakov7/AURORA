import { Field, InputType } from '@nestjs/graphql';
import { ObjectId } from 'mongoose';
import { IsNotEmpty, IsOptional, Length } from 'class-validator';

/**
 * Amalda bu DTO asosan ichki (service) ishlatish uchun:
 * yangi xabar kelganda lastMessage / lastMessageAt yangilanadi.
 */
@InputType()
export class ChatUpdate {
	@IsNotEmpty()
	@Field(() => String)
	_id: ObjectId;

	@IsOptional()
	@Length(1, 1000)
	@Field(() => String, { nullable: true })
	lastMessage?: string;

	/** service ichida new Date() bilan o'rnatiladi */
	lastMessageAt?: Date;
}
