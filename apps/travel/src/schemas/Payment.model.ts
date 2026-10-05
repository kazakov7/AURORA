import { Schema } from 'mongoose';
import { PaymentProvider, PaymentStatus } from '../libs/enums/payment.enum';

const PaymentSchema = new Schema(
	{
		bookingId: { type: Schema.Types.ObjectId, ref: 'Booking', required: true },
		memberId: { type: Schema.Types.ObjectId, ref: 'Member', required: true },
		paymentProvider: { type: String, enum: PaymentProvider, default: PaymentProvider.STRIPE },
		paymentStatus: { type: String, enum: PaymentStatus, default: PaymentStatus.PENDING },
		paymentAmount: { type: Number, required: true, min: 0 },
		paymentCurrency: { type: String, required: true },
		providerPaymentId: { type: String, required: true, unique: true },
		idempotencyKey: { type: String, required: true, unique: true },
		failureReason: String,
		refundedAt: Date,
	},
	{ timestamps: true, collection: 'payments' },
);

PaymentSchema.index({ bookingId: 1, createdAt: 1 }, { name: 'payment_booking_idx' });
PaymentSchema.index({ memberId: 1, createdAt: 1 }, { name: 'payment_member_idx' });

export default PaymentSchema;
