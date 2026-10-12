import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { Types } from 'mongoose';
import { PaymentCheckout } from '../../libs/dto/payment/payment';
import {
	StartPropertyPaymentInput,
	StartTourPaymentInput,
} from '../../libs/dto/payment/payment.input';
import { AuthMember } from '../auth/decorators/authMember.decorator';
import { AuthGuard } from '../auth/guards/auth.guard';
import { PaymentService } from './payment.service';

@Resolver()
export class PaymentResolver {
	constructor(private readonly paymentService: PaymentService) {}

	@UseGuards(AuthGuard)
	@Mutation(() => PaymentCheckout)
	public async startPropertyPayment(
		@Args('input') input: StartPropertyPaymentInput,
		@AuthMember('_id') memberId: Types.ObjectId,
	): Promise<PaymentCheckout> {
		return this.paymentService.startPropertyPayment(memberId, input);
	}

	@UseGuards(AuthGuard)
	@Mutation(() => PaymentCheckout)
	public async startTourPayment(
		@Args('input') input: StartTourPaymentInput,
		@AuthMember('_id') memberId: Types.ObjectId,
	): Promise<PaymentCheckout> {
		return this.paymentService.startTourPayment(memberId, input);
	}
}
