import { Schema, Types } from 'mongoose';
import { BookingCategory, BookingStatus } from '../libs/enums/booking.enum';

const BookingSchema = new Schema(
	{
		memberId: {
			type: Types.ObjectId,
			ref: 'Member',
			required: true,
			index: true,
		},

		bookingCategory: {
			type: String,
			enum: BookingCategory,
			required: true,
			index: true,
		},
		bookingStatus: {
			type: String,
			enum: BookingStatus,
			default: BookingStatus.PENDING,
		},

		bookingRefId: {
			type: Types.ObjectId,
			required: true,
			index: true,
		},

		checkoutKey: {
			type: String,
			trim: true,
		},

		confirmedPaymentId: {
			type: Schema.Types.ObjectId,
			ref: 'Payment',
			default: null,
		},

		checkIn: Date,

		checkOut: Date,

		bookingGuests: {
			type: Number,
			required: true,
			min: 1,
		},

		bookingTotalPrice: {
			type: Number,
			required: true,
			min: 0,
		},

		bookingCurrency: {
			type: String,
			required: true,
		},

		priceSnapshot: {
			type: Schema.Types.Mixed,
			required: true,
		},

		bookingNote: {
			type: String,
			trim: true,
		},

		expiresAt: Date,

		cancelledAt: {
			type: Date,
			default: null,
		},

		/** Why an admin cancelled the booking; shown to the guest **/
		cancelReason: {
			type: String,
			trim: true,
		},
	},
	{
		timestamps: true,
		collection: 'bookings',
	},
);

BookingSchema.index(
	{ bookingCategory: 1, bookingRefId: 1, bookingStatus: 1, checkIn: 1, checkOut: 1 },
	{ name: 'booking_inventory_dates_idx' },
);
BookingSchema.index({ memberId: 1, createdAt: 1 }, { name: 'booking_member_history_idx' });
BookingSchema.index({ bookingStatus: 1, expiresAt: 1 }, { name: 'booking_expiry_idx' });
BookingSchema.index(
	{ memberId: 1, checkoutKey: 1 },
	{
		unique: true,
		partialFilterExpression: { checkoutKey: { $type: 'string' } },
		name: 'booking_member_checkout_key_uq',
	},
);

export default BookingSchema;
