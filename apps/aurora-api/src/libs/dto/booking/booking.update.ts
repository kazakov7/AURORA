import { Field, InputType } from '@nestjs/graphql';
import { ObjectId } from 'mongoose';
import { IsNotEmpty, IsOptional, Length } from 'class-validator';

@InputType()
export class BookingUpdate {
	@IsNotEmpty()
	@Field(() => String)
	_id: ObjectId;

	@IsOptional()
	@Length(3, 500)
	@Field(() => String, { nullable: true })
	bookingNote?: string;

}
