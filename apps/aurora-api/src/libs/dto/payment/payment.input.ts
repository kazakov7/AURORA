import { Field, InputType, Int } from '@nestjs/graphql';
import { IsDate, IsInt, IsMongoId, IsNotEmpty, IsOptional, IsUUID, Length, Min } from 'class-validator';

@InputType()
export class StartPropertyPaymentInput {
	@Field(() => String)
	@IsMongoId()
	@IsNotEmpty()
	propertyId!: string;

	@Field(() => Date)
	@IsDate()
	checkIn!: Date;

	@Field(() => Date)
	@IsDate()
	checkOut!: Date;

	@Field(() => Int)
	@IsInt()
	@Min(1)
	bookingGuests!: number;

	@Field(() => String)
	@IsUUID()
	idempotencyKey!: string;

	@Field(() => String, { nullable: true })
	@IsOptional()
	@Length(3, 500)
	bookingNote?: string;
}

@InputType()
export class StartTourPaymentInput {
	@Field(() => String)
	@IsMongoId()
	@IsNotEmpty()
	tourId!: string;

	@Field(() => Int)
	@IsInt()
	@Min(1)
	bookingGuests!: number;

	@Field(() => String)
	@IsUUID()
	idempotencyKey!: string;

	@Field(() => String, { nullable: true })
	@IsOptional()
	@Length(3, 500)
	bookingNote?: string;
}
