import { BadRequestException, Controller, Headers, Post, RawBodyRequest, Req } from '@nestjs/common';
import { Request } from 'express';
import { PaymentService } from './payment.service';

@Controller('payments')
export class PaymentController {
	constructor(private readonly paymentService: PaymentService) {}

	@Post('stripe/webhook')
	public async stripeWebhook(
		@Req() request: RawBodyRequest<Request>,
		@Headers('stripe-signature') signature?: string,
	): Promise<{ received: boolean }> {
		if (!request.rawBody) throw new BadRequestException();
		await this.paymentService.handleStripeWebhook(request.rawBody, signature);
		return { received: true };
	}
}
