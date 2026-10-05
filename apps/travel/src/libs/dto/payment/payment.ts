import { Field, Float, ObjectType } from '@nestjs/graphql';
import { PaymentProvider, PaymentStatus } from '../../enums/payment.enum';

@ObjectType()
export class Payment {
	@Field(() => String)
	_id: string;

	@Field(() => String)
	bookingId: string;

	@Field(() => String)
	memberId: string;

	@Field(() => PaymentProvider)
	paymentProvider: PaymentProvider;

	@Field(() => PaymentStatus)
	paymentStatus: PaymentStatus;

	@Field(() => Float)
	paymentAmount: number;

	@Field()
	paymentCurrency: string;

	@Field()
	providerPaymentId: string;

	@Field()
	idempotencyKey: string;

	@Field({ nullable: true })
	failureReason?: string;

	@Field(() => Date, { nullable: true })
	refundedAt?: Date;

	@Field(() => Date)
	createdAt: Date;

	@Field(() => Date)
	updatedAt: Date;
}

@ObjectType()
export class PaymentCheckout {
	@Field(() => Payment)
	payment!: Payment;

	@Field()
	clientSecret!: string;
}
