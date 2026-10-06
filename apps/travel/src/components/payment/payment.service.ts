import { BadRequestException, Injectable, InternalServerErrorException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import Stripe from 'stripe';
import { Payment, PaymentCheckout } from '../../libs/dto/payment/payment';
import { StartPropertyPaymentInput, StartTourPaymentInput } from '../../libs/dto/payment/payment.input';
import { BookingCategory, BookingStatus } from '../../libs/enums/booking.enum';
import { Messages } from '../../libs/enums/common.enum';
import { PaymentProvider, PaymentStatus } from '../../libs/enums/payment.enum';
import { PropertyStatus } from '../../libs/enums/property.enum';
import { TourStatus } from '../../libs/enums/tour.enum';

const HOLD_DURATION_MS = 15 * 60 * 1000;
const KRW = 'KRW';

@Injectable()
export class PaymentService implements OnModuleInit, OnModuleDestroy {
	private readonly stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '');
	private expiryTimer?: NodeJS.Timeout;

	constructor(
		@InjectModel('Payment') private readonly paymentModel: Model<any>,
		@InjectModel('Booking') private readonly bookingModel: Model<any>,
		@InjectModel('Property') private readonly propertyModel: Model<any>,
		@InjectModel('Tour') private readonly tourModel: Model<any>,
		@InjectConnection() private readonly connection: Connection,
	) {}

	public onModuleInit(): void {
		this.expiryTimer = setInterval(() => void this.expirePendingBookings(), 60 * 1000);
	}

	public onModuleDestroy(): void {
		if (this.expiryTimer) clearInterval(this.expiryTimer);
	}

	public async startPropertyPayment(
		memberId: Types.ObjectId,
		input: StartPropertyPaymentInput,
	): Promise<PaymentCheckout> {
		const existing = await this.getPaymentByKey(input.idempotencyKey);
		if (existing) return this.shapeCheckout(existing);

		await this.expirePendingBookings();
		const propertyId = new Types.ObjectId(input.propertyId);
		this.validateBookingDates(input.checkIn, input.checkOut);
		let booking = await this.findReusablePropertyHold(memberId, propertyId, input);
		if (!booking) booking = await this.createPropertyHold(memberId, propertyId, input);

		return this.createStripePayment(booking, memberId, input.idempotencyKey);
	}

	public async startTourPayment(memberId: Types.ObjectId, input: StartTourPaymentInput): Promise<PaymentCheckout> {
		const existing = await this.getPaymentByKey(input.idempotencyKey);
		if (existing) return this.shapeCheckout(existing);

		await this.expirePendingBookings();
		const tourId = new Types.ObjectId(input.tourId);
		let booking = await this.findReusableTourHold(memberId, tourId, input);
		if (!booking) booking = await this.createTourHold(memberId, tourId, input);

		return this.createStripePayment(booking, memberId, input.idempotencyKey);
	}

	public async cancelPendingBooking(
		memberId: Types.ObjectId,
		bookingId: Types.ObjectId,
		bookingCategory: BookingCategory,
	): Promise<any> {
		const booking = await this.bookingModel
			.findOneAndUpdate(
				{ _id: bookingId, memberId, bookingCategory, bookingStatus: BookingStatus.PENDING },
				{ bookingStatus: BookingStatus.CANCELLED, cancelledAt: new Date() },
				{ new: true },
			)
			.exec();

		if (!booking) throw new BadRequestException(Messages.BOOKING_CANNOT_CANCEL);
		await this.releaseTourSeats(booking);
		await this.cancelPendingPaymentIntents(booking._id as Types.ObjectId, 'Booking cancelled by member');
		return booking;
	}

	public async handleStripeWebhook(rawBody: Buffer, signature?: string): Promise<void> {
		if (!signature || !process.env.STRIPE_WEBHOOK_SECRET) throw new BadRequestException(Messages.PAYMENT_FAILED);

		let event: Stripe.Event;
		try {
			event = this.stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);
		} catch (error) {
			throw new BadRequestException(Messages.PAYMENT_FAILED);
		}

		const paymentIntent = event.data.object as Stripe.PaymentIntent;
		switch (event.type) {
			case 'payment_intent.succeeded':
				await this.confirmPaidBooking(paymentIntent.id);
				break;
			case 'payment_intent.payment_failed':
			case 'payment_intent.canceled':
				await this.markPaymentFailed(paymentIntent.id, paymentIntent.last_payment_error?.message ?? event.type);
				break;
		}
	}

	public async expirePendingBookings(): Promise<void> {
		const expiredBookings = await this.bookingModel
			.find({ bookingStatus: BookingStatus.PENDING, expiresAt: { $lte: new Date() } })
			.select('_id')
			.lean()
			.exec();

		for (const expiredBooking of expiredBookings) {
			const booking = await this.bookingModel
				.findOneAndUpdate(
					{ _id: expiredBooking._id, bookingStatus: BookingStatus.PENDING, expiresAt: { $lte: new Date() } },
					{ bookingStatus: BookingStatus.CANCELLED, cancelledAt: new Date() },
					{ new: true },
				)
				.exec();

			if (!booking) continue;
			await this.releaseTourSeats(booking);
			await this.cancelPendingPaymentIntents(booking._id as Types.ObjectId, 'Booking hold expired');
		}
	}

	private async createPropertyHold(
		memberId: Types.ObjectId,
		propertyId: Types.ObjectId,
		input: StartPropertyPaymentInput,
	): Promise<any> {
		const session = await this.connection.startSession();
		try {
			let booking: any;
			await session.withTransaction(async () => {
				const property = await this.propertyModel
					.findOne({ _id: propertyId, propertyStatus: PropertyStatus.ACTIVE, deletedAt: null })
					.session(session)
					.exec();
				if (!property) throw new BadRequestException(Messages.PROPERTY_CANNOT_BE_BOOKED);
				if (input.bookingGuests > property.maxGuests) throw new BadRequestException(Messages.PROPERTY_NOT_AVAILABLE);
				this.validateKrwAmount(property.pricePerNight, property.currency);

				await this.propertyModel
					.updateOne({ _id: propertyId }, { $inc: { availabilityVersion: 1 } }, { session })
					.exec();
				const conflict = await this.bookingModel
					.exists({
						bookingCategory: BookingCategory.PROPERTY,
						bookingRefId: propertyId,
						checkIn: { $lt: input.checkOut },
						checkOut: { $gt: input.checkIn },
						$or: [
							{ bookingStatus: BookingStatus.CONFIRMED },
							{ bookingStatus: BookingStatus.PENDING, expiresAt: null },
							{ bookingStatus: BookingStatus.PENDING, expiresAt: { $gt: new Date() } },
						],
					})
					.session(session)
					.exec();
				if (conflict) throw new BadRequestException(Messages.BOOKING_NOT_AVAILABLE);

				const nights = this.getNights(input.checkIn, input.checkOut);
				const result = await this.bookingModel.create(
					[
						{
							memberId,
							bookingCategory: BookingCategory.PROPERTY,
							bookingStatus: BookingStatus.PENDING,
							bookingRefId: propertyId,
							checkoutKey: input.idempotencyKey,
							checkIn: input.checkIn,
							checkOut: input.checkOut,
							bookingGuests: input.bookingGuests,
							bookingTotalPrice: property.pricePerNight * nights,
							bookingCurrency: property.currency,
							priceSnapshot: {
								propertyId,
								propertyName: property.propertyName,
								pricePerNight: property.pricePerNight,
								currency: property.currency,
								nights,
							},
							bookingNote: input.bookingNote,
							expiresAt: this.getHoldExpiry(),
						},
					],
					{ session },
				);
				booking = result[0];
			});
			return booking;
		} catch (error) {
			if ((error as { code?: number }).code === 11000) {
				const booking = await this.bookingModel.findOne({ memberId, checkoutKey: input.idempotencyKey }).exec();
				if (booking) return booking;
			}
			throw error;
		} finally {
			await session.endSession();
		}
	}

	private async createTourHold(memberId: Types.ObjectId, tourId: Types.ObjectId, input: StartTourPaymentInput): Promise<any> {
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		const tour: any = await this.tourModel
			.findOneAndUpdate(
				{
					_id: tourId,
					tourStatus: TourStatus.ACTIVE,
					deletedAt: null,
					tourStartDate: { $gte: today },
					$expr: { $lte: [{ $add: ['$tourReservedSeats', input.bookingGuests] }, '$tourCapacity'] },
				},
				{ $inc: { tourReservedSeats: input.bookingGuests } },
				{ new: true },
			)
			.lean()
			.exec();
		if (!tour) throw new BadRequestException(Messages.TOUR_FULL);
		try {
			this.validateKrwAmount(tour.tourPrice, tour.tourCurrency);
		} catch (error) {
			await this.tourModel.updateOne({ _id: tourId }, { $inc: { tourReservedSeats: -input.bookingGuests } }).exec();
			throw error;
		}

		try {
			return await this.bookingModel.create({
				memberId,
				bookingCategory: BookingCategory.TOUR,
				bookingStatus: BookingStatus.PENDING,
				bookingRefId: tourId,
				checkoutKey: input.idempotencyKey,
				bookingGuests: input.bookingGuests,
				bookingTotalPrice: tour.tourPrice * input.bookingGuests,
				bookingCurrency: tour.tourCurrency,
				priceSnapshot: {
					tourId,
					tourName: tour.tourName,
					pricePerPerson: tour.tourPrice,
					currency: tour.tourCurrency,
					tourStartDate: tour.tourStartDate,
					tourEndDate: tour.tourEndDate,
					seats: input.bookingGuests,
				},
				bookingNote: input.bookingNote,
				expiresAt: this.getHoldExpiry(),
			});
		} catch (error) {
			await this.tourModel.updateOne({ _id: tourId }, { $inc: { tourReservedSeats: -input.bookingGuests } }).exec();
			if ((error as { code?: number }).code === 11000) {
				const booking = await this.bookingModel.findOne({ memberId, checkoutKey: input.idempotencyKey }).exec();
				if (booking) return booking;
			}
			throw new BadRequestException(Messages.CREATE_FAILED);
		}
	}

	private async createStripePayment(booking: any, memberId: Types.ObjectId, idempotencyKey: string): Promise<PaymentCheckout> {
		this.validateKrwAmount(booking.bookingTotalPrice, booking.bookingCurrency);
		try {
			const intent = await this.stripe.paymentIntents.create(
				{
					amount: booking.bookingTotalPrice,
					currency: 'krw',
					metadata: { bookingId: booking._id.toString(), memberId: memberId.toString() },
				},
				{ idempotencyKey },
			);
			const payment = await this.paymentModel.create({
				bookingId: booking._id,
				memberId,
				paymentProvider: PaymentProvider.STRIPE,
				paymentStatus: PaymentStatus.PENDING,
				paymentAmount: booking.bookingTotalPrice,
				paymentCurrency: booking.bookingCurrency,
				providerPaymentId: intent.id,
				idempotencyKey,
			});
			if (!intent.client_secret) throw new InternalServerErrorException(Messages.PAYMENT_FAILED);
			return { payment: payment as Payment, clientSecret: intent.client_secret };
		} catch (error) {
			if ((error as { code?: number }).code === 11000) {
				const payment = await this.getPaymentByKey(idempotencyKey);
				if (payment) return this.shapeCheckout(payment);
			}
			await this.cancelPendingBookingBySystem(booking._id as Types.ObjectId, 'Unable to create payment');
			throw new BadRequestException(Messages.PAYMENT_FAILED);
		}
	}

	private async confirmPaidBooking(providerPaymentId: string): Promise<void> {
		const session = await this.connection.startSession();
		let shouldRefund = false;
		try {
			await session.withTransaction(async () => {
				const payment = await this.paymentModel.findOne({ providerPaymentId }).session(session).exec();
				if (
					!payment ||
					payment.paymentStatus === PaymentStatus.SUCCEEDED ||
					payment.paymentStatus === PaymentStatus.REFUNDED
				)
					return;
				const booking = await this.bookingModel
					.findOneAndUpdate(
						{ _id: payment.bookingId, bookingStatus: BookingStatus.PENDING, expiresAt: { $gt: new Date() } },
						{ bookingStatus: BookingStatus.CONFIRMED, confirmedPaymentId: payment._id, expiresAt: null },
						{ new: true, session },
					)
					.exec();
				if (!booking) {
					shouldRefund = true;
					return;
				}
				await this.paymentModel.updateOne({ _id: payment._id }, { paymentStatus: PaymentStatus.SUCCEEDED }, { session }).exec();
				if (booking.bookingCategory === BookingCategory.PROPERTY) {
					await this.propertyModel.updateOne({ _id: booking.bookingRefId }, { $inc: { propertyBookings: 1 } }, { session }).exec();
				}
			});
		} finally {
			await session.endSession();
		}
		if (shouldRefund) await this.refundPayment(providerPaymentId);
	}

	private async markPaymentFailed(providerPaymentId: string, failureReason: string): Promise<void> {
		await this.paymentModel
			.updateOne(
				{ providerPaymentId, paymentStatus: { $in: [PaymentStatus.PENDING, PaymentStatus.FAILED] } },
				{ paymentStatus: PaymentStatus.FAILED, failureReason },
			)
			.exec();
	}

	private async refundPayment(providerPaymentId: string): Promise<void> {
		try {
			const intent = await this.stripe.paymentIntents.retrieve(providerPaymentId);
			if (intent.latest_charge) await this.stripe.refunds.create({ payment_intent: providerPaymentId });
			await this.paymentModel.updateOne({ providerPaymentId }, { paymentStatus: PaymentStatus.REFUNDED, refundedAt: new Date() }).exec();
		} catch (error) {
			throw new InternalServerErrorException(Messages.PAYMENT_REFUND_FAILED);
		}
	}

	private async cancelPendingPaymentIntents(bookingId: Types.ObjectId, failureReason: string): Promise<void> {
		const payments = await this.paymentModel.find({ bookingId, paymentStatus: { $in: [PaymentStatus.PENDING, PaymentStatus.FAILED] } }).exec();
		for (const payment of payments) {
			try {
				await this.stripe.paymentIntents.cancel(payment.providerPaymentId);
			} catch (error) {}
			await this.paymentModel
				.updateOne({ _id: payment._id, paymentStatus: { $ne: PaymentStatus.SUCCEEDED } }, { paymentStatus: PaymentStatus.FAILED, failureReason })
				.exec();
		}
	}

	private async cancelPendingBookingBySystem(bookingId: Types.ObjectId, failureReason: string): Promise<void> {
		const booking = await this.bookingModel
			.findOneAndUpdate(
				{ _id: bookingId, bookingStatus: BookingStatus.PENDING },
				{ bookingStatus: BookingStatus.CANCELLED, cancelledAt: new Date() },
				{ new: true },
			)
			.exec();
		if (!booking) return;
		await this.releaseTourSeats(booking);
		await this.cancelPendingPaymentIntents(booking._id as Types.ObjectId, failureReason);
	}

	private async releaseTourSeats(booking: any): Promise<void> {
		if (booking.bookingCategory !== BookingCategory.TOUR) return;
		await this.tourModel
			.updateOne({ _id: booking.bookingRefId }, { $inc: { tourReservedSeats: -booking.bookingGuests } })
			.exec();
	}

	private async findReusablePropertyHold(memberId: Types.ObjectId, propertyId: Types.ObjectId, input: StartPropertyPaymentInput): Promise<any> {
		return this.bookingModel
			.findOne({
				memberId,
				bookingCategory: BookingCategory.PROPERTY,
				bookingRefId: propertyId,
				bookingStatus: BookingStatus.PENDING,
				checkIn: input.checkIn,
				checkOut: input.checkOut,
				bookingGuests: input.bookingGuests,
				expiresAt: { $gt: new Date() },
			})
			.exec();
	}

	private async findReusableTourHold(memberId: Types.ObjectId, tourId: Types.ObjectId, input: StartTourPaymentInput): Promise<any> {
		return this.bookingModel
			.findOne({
				memberId,
				bookingCategory: BookingCategory.TOUR,
				bookingRefId: tourId,
				bookingStatus: BookingStatus.PENDING,
				bookingGuests: input.bookingGuests,
				expiresAt: { $gt: new Date() },
			})
			.exec();
	}

	private async getPaymentByKey(idempotencyKey: string): Promise<any> {
		return this.paymentModel.findOne({ idempotencyKey }).exec();
	}

	private async shapeCheckout(payment: any): Promise<PaymentCheckout> {
		const intent = await this.stripe.paymentIntents.retrieve(payment.providerPaymentId);
		if (!intent.client_secret) throw new InternalServerErrorException(Messages.PAYMENT_FAILED);
		return { payment: payment as Payment, clientSecret: intent.client_secret };
	}

	private validateKrwAmount(amount: number, currency: string): void {
		if (currency !== KRW || !Number.isInteger(amount) || amount < 0) throw new BadRequestException(Messages.INVALID_DATA);
	}

	private validateBookingDates(checkIn: Date, checkOut: Date): void {
		if (!(checkIn instanceof Date) || !(checkOut instanceof Date) || checkOut <= checkIn) {
			throw new BadRequestException(Messages.INVALID_DATA);
		}
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		if (checkIn < today) throw new BadRequestException(Messages.INVALID_DATA);
	}

	private getNights(checkIn: Date, checkOut: Date): number {
		return Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));
	}

	private getHoldExpiry(): Date {
		return new Date(Date.now() + HOLD_DURATION_MS);
	}
}
