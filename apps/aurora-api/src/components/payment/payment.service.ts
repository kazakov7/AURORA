import {
	BadRequestException,
	Injectable,
	InternalServerErrorException,
	OnModuleDestroy,
	OnModuleInit,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import Stripe from 'stripe';
import { Payment, PaymentCheckout } from '../../libs/dto/payment/payment';
import {
	StartPropertyPaymentInput,
	StartTourPaymentInput,
} from '../../libs/dto/payment/payment.input';
import { CancelBookingByAdminInput } from '../../libs/dto/booking/booking.input';
import { BookingCategory, BookingStatus } from '../../libs/enums/booking.enum';
import { Messages } from '../../libs/enums/common.enum';
import { PaymentProvider, PaymentStatus } from '../../libs/enums/payment.enum';
import { PropertyStatus } from '../../libs/enums/property.enum';
import { TourStatus } from '../../libs/enums/tour.enum';
import { GUEST_CANCEL_WINDOW_MS, HOLD_DURATION_MS, USD } from '../../libs/config';
import { NotificationService } from '../notification/notification.service';
import { NotificationGroup, NotificationType } from '../../libs/enums/notification.enum';

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
		private readonly notificationService: NotificationService,
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
		const propertyId = new Types.ObjectId(input.propertyId);
		this.validateBookingDates(input.checkIn, input.checkOut);
		const existing = await this.getPaymentByKey(input.idempotencyKey);
		if (existing) {
			await this.assertPaymentMatchesRequest(
				existing,
				memberId,
				BookingCategory.PROPERTY,
				propertyId,
				input,
			);
			return this.shapeCheckout(existing);
		}

		await this.expirePendingBookings();
		let booking = await this.findReusablePropertyHold(memberId, propertyId, input);
		if (!booking) booking = await this.createPropertyHold(memberId, propertyId, input);
		const pendingPayment = await this.findPendingPaymentForBooking(booking._id as Types.ObjectId);
		if (pendingPayment) return this.shapeCheckout(pendingPayment);

		return this.createStripePayment(booking, memberId, input.idempotencyKey);
	}

	public async startTourPayment(
		memberId: Types.ObjectId,
		input: StartTourPaymentInput,
	): Promise<PaymentCheckout> {
		const tourId = new Types.ObjectId(input.tourId);
		const existing = await this.getPaymentByKey(input.idempotencyKey);
		if (existing) {
			await this.assertPaymentMatchesRequest(
				existing,
				memberId,
				BookingCategory.TOUR,
				tourId,
				input,
			);
			return this.shapeCheckout(existing);
		}

		await this.expirePendingBookings();
		let booking = await this.findReusableTourHold(memberId, tourId, input);
		if (!booking) booking = await this.createTourHold(memberId, tourId, input);
		const pendingPayment = await this.findPendingPaymentForBooking(booking._id as Types.ObjectId);
		if (pendingPayment) return this.shapeCheckout(pendingPayment);

		return this.createStripePayment(booking, memberId, input.idempotencyKey);
	}

	public async cancelPendingBooking(
		memberId: Types.ObjectId,
		bookingId: Types.ObjectId,
		bookingCategory: BookingCategory,
	): Promise<any> {
		const booking = await this.cancelPendingBookingAtomically({
			_id: bookingId,
			memberId,
			bookingCategory,
			bookingStatus: BookingStatus.PENDING,
		});

		if (!booking) throw new BadRequestException(Messages.BOOKING_CANNOT_CANCEL);
		await this.cancelPendingPaymentIntents(
			booking._id as Types.ObjectId,
			'Booking cancelled by member',
		);
		await this.notifyBookingTransition(booking, BookingStatus.CANCELLED, memberId);
		return booking;
	}

	/** The guest cancels a payment hold any time, and a paid booking until 48 hours before it starts **/
	public async cancelBooking(
		memberId: Types.ObjectId,
		bookingId: Types.ObjectId,
		bookingCategory: BookingCategory,
	): Promise<any> {
		const booking = await this.bookingModel
			.findOne({ _id: bookingId, memberId, bookingCategory })
			.lean<any>()
			.exec();
		if (booking?.bookingStatus === BookingStatus.PENDING) {
			return this.cancelPendingBooking(memberId, bookingId, bookingCategory);
		}
		if (booking?.bookingStatus !== BookingStatus.CONFIRMED) {
			throw new BadRequestException(Messages.BOOKING_CANNOT_CANCEL);
		}

		const startsAt = await this.getBookingStart(booking);
		if (!startsAt || startsAt.getTime() - Date.now() < GUEST_CANCEL_WINDOW_MS) {
			throw new BadRequestException(Messages.BOOKING_CANCEL_WINDOW_PASSED);
		}
		return this.cancelConfirmedBooking(booking, memberId);
	}

	/** An admin cancels a payment hold or a paid booking at any time; a paid one is refunded in full **/
	public async cancelBookingByAdmin(
		input: CancelBookingByAdminInput,
		adminId: Types.ObjectId,
	): Promise<any> {
		const bookingId = input._id as unknown as Types.ObjectId;
		const booking = await this.bookingModel.findById(bookingId).lean<any>().exec();

		if (booking?.bookingStatus === BookingStatus.PENDING) {
			const cancelled = await this.cancelPendingBookingAtomically({
				_id: bookingId,
				bookingStatus: BookingStatus.PENDING,
			});
			if (!cancelled) throw new BadRequestException(Messages.BOOKING_CANNOT_CANCEL);
			await this.bookingModel
				.updateOne({ _id: bookingId }, { cancelReason: input.cancelReason })
				.exec();
			await this.cancelPendingPaymentIntents(bookingId, 'Booking cancelled by admin');
			await this.notifyBookingTransition(cancelled, BookingStatus.CANCELLED, adminId);
			return { ...cancelled.toObject(), cancelReason: input.cancelReason };
		}
		if (booking?.bookingStatus !== BookingStatus.CONFIRMED) {
			throw new BadRequestException(Messages.BOOKING_CANNOT_CANCEL);
		}
		return this.cancelConfirmedBooking(booking, adminId, input.cancelReason);
	}

	public async handleStripeWebhook(rawBody: Buffer, signature?: string): Promise<void> {
		if (!signature || !process.env.STRIPE_WEBHOOK_SECRET)
			throw new BadRequestException(Messages.PAYMENT_FAILED);

		let event: Stripe.Event;
		try {
			event = this.stripe.webhooks.constructEvent(
				rawBody,
				signature,
				process.env.STRIPE_WEBHOOK_SECRET,
			);
		} catch (error) {
			throw new BadRequestException(Messages.PAYMENT_FAILED);
		}

		const paymentIntent = event.data.object as Stripe.PaymentIntent;
		switch (event.type) {
			case 'payment_intent.succeeded':
				await this.confirmPaidBooking(paymentIntent);
				break;
			case 'payment_intent.payment_failed':
			case 'payment_intent.canceled':
				await this.markPaymentFailed(
					paymentIntent.id,
					paymentIntent.last_payment_error?.message ?? event.type,
				);
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
			const booking = await this.cancelPendingBookingAtomically({
				_id: expiredBooking._id,
				bookingStatus: BookingStatus.PENDING,
				expiresAt: { $lte: new Date() },
			});

			if (!booking) continue;
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
				if (input.bookingGuests > property.maxGuests)
					throw new BadRequestException(Messages.PROPERTY_NOT_AVAILABLE);
				this.validateCheckoutAmount(property.pricePerNight, property.currency);

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
				const booking = await this.findMatchingPropertyHold(memberId, propertyId, input);
				if (booking) return booking;
			}
			throw error;
		} finally {
			await session.endSession();
		}
	}

	private async createTourHold(
		memberId: Types.ObjectId,
		tourId: Types.ObjectId,
		input: StartTourPaymentInput,
	): Promise<any> {
		const session = await this.connection.startSession();
		try {
			let booking: any;
			await session.withTransaction(async () => {
				const today = new Date();
				today.setHours(0, 0, 0, 0);
				const tour: any = await this.tourModel
					.findOneAndUpdate(
						{
							_id: tourId,
							tourStatus: TourStatus.ACTIVE,
							deletedAt: null,
							tourStartDate: { $gte: today },
							$expr: {
								$lte: [{ $add: ['$tourReservedSeats', input.bookingGuests] }, '$tourCapacity'],
							},
						},
						{ $inc: { tourReservedSeats: input.bookingGuests } },
						{ new: true, session },
					)
					.lean()
					.exec();
				if (!tour) throw new BadRequestException(Messages.TOUR_FULL);
				this.validateCheckoutAmount(tour.tourPrice, tour.tourCurrency);

				const result = await this.bookingModel.create(
					[
						{
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
						},
					],
					{ session },
				);
				booking = result[0];
			});
			return booking;
		} catch (error) {
			if ((error as { code?: number }).code === 11000) {
				const booking = await this.findMatchingTourHold(memberId, tourId, input);
				if (booking) return booking;
			}
			if (error instanceof BadRequestException) throw error;
			throw new BadRequestException(Messages.CREATE_FAILED);
		} finally {
			await session.endSession();
		}
	}

	private async createStripePayment(
		booking: any,
		memberId: Types.ObjectId,
		idempotencyKey: string,
	): Promise<PaymentCheckout> {
		const stripeCharge = this.getStripeCharge(booking.bookingTotalPrice, booking.bookingCurrency);
		try {
			const intent = await this.stripe.paymentIntents.create(
				{
					amount: stripeCharge.amount,
					currency: stripeCharge.currency,
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
				if (payment && this.paymentBelongsToBooking(payment, booking, memberId)) {
					return this.shapeCheckout(payment);
				}
			}
			await this.cancelPendingBookingBySystem(
				booking._id as Types.ObjectId,
				'Unable to create payment',
			);
			throw new BadRequestException(Messages.PAYMENT_FAILED);
		}
	}

	private async confirmPaidBooking(paymentIntent: Stripe.PaymentIntent): Promise<void> {
		const session = await this.connection.startSession();
		let shouldRefund = false;
		let refundBookingId: Types.ObjectId | null = null;
		let confirmedBooking: any | null = null;
		try {
			await session.withTransaction(async () => {
				const payment = await this.paymentModel
					.findOne({ providerPaymentId: paymentIntent.id })
					.session(session)
					.exec();
				if (
					!payment ||
					payment.paymentStatus === PaymentStatus.SUCCEEDED ||
					payment.paymentStatus === PaymentStatus.REFUNDED
				)
					return;
				refundBookingId = payment.bookingId as Types.ObjectId;
				const expectedCharge = this.getStripeCharge(payment.paymentAmount, payment.paymentCurrency);
				const receivedAmount = paymentIntent.amount_received ?? paymentIntent.amount;
				if (
					receivedAmount !== expectedCharge.amount ||
					paymentIntent.currency?.toLowerCase() !== expectedCharge.currency
				) {
					shouldRefund = true;
					await this.paymentModel
						.updateOne(
							{
								_id: payment._id,
								paymentStatus: { $in: [PaymentStatus.PENDING, PaymentStatus.FAILED] },
							},
							{
								paymentStatus: PaymentStatus.FAILED,
								failureReason: 'Payment amount or currency mismatch',
							},
							{ session },
						)
						.exec();
					return;
				}
				const booking = await this.bookingModel
					.findOneAndUpdate(
						{
							_id: payment.bookingId,
							bookingStatus: BookingStatus.PENDING,
							expiresAt: { $gt: new Date() },
						},
						{
							bookingStatus: BookingStatus.CONFIRMED,
							confirmedPaymentId: payment._id,
							expiresAt: null,
						},
						{ new: true, session },
					)
					.exec();
				if (!booking) {
					shouldRefund = true;
					return;
				}
				confirmedBooking = booking;
				await this.paymentModel
					.updateOne({ _id: payment._id }, { paymentStatus: PaymentStatus.SUCCEEDED }, { session })
					.exec();
				if (booking.bookingCategory === BookingCategory.PROPERTY) {
					await this.propertyModel
						.updateOne(
							{ _id: booking.bookingRefId },
							{ $inc: { propertyBookings: 1 } },
							{ session },
						)
						.exec();
				}
			});
		} finally {
			await session.endSession();
		}
		if (shouldRefund) {
			await this.refundPayment(paymentIntent.id);
			if (refundBookingId)
				await this.cancelPendingBookingBySystem(refundBookingId, 'Payment verification failed');
		}
		if (confirmedBooking)
			await this.notifyBookingTransition(confirmedBooking, BookingStatus.CONFIRMED);
	}

	private async markPaymentFailed(providerPaymentId: string, failureReason: string): Promise<void> {
		await this.paymentModel
			.updateOne(
				{
					providerPaymentId,
					paymentStatus: { $in: [PaymentStatus.PENDING, PaymentStatus.FAILED] },
				},
				{ paymentStatus: PaymentStatus.FAILED, failureReason },
			)
			.exec();
	}

	/**
	 * The money goes back first: if the refund fails the booking stays CONFIRMED, so a booking is
	 * never cancelled without its refund. The refund is idempotent, so a retry cannot pay out twice.
	 */
	private async cancelConfirmedBooking(
		booking: any,
		actorId: Types.ObjectId,
		cancelReason?: string,
	): Promise<any> {
		const payment = await this.paymentModel.findById(booking.confirmedPaymentId).lean<any>().exec();
		if (!payment?.providerPaymentId)
			throw new InternalServerErrorException(Messages.PAYMENT_REFUND_FAILED);
		await this.refundPayment(payment.providerPaymentId);

		const session = await this.connection.startSession();
		let cancelled: any | null = null;
		try {
			await session.withTransaction(async () => {
				cancelled = await this.bookingModel
					.findOneAndUpdate(
						{ _id: booking._id, bookingStatus: BookingStatus.CONFIRMED },
						{
							bookingStatus: BookingStatus.CANCELLED,
							cancelledAt: new Date(),
							...(cancelReason && { cancelReason }),
						},
						{ new: true, session },
					)
					.exec();
				if (!cancelled) return;

				// The seats of a tour and the booking count of a hotel were taken when it was paid
				if (cancelled.bookingCategory === BookingCategory.TOUR) {
					await this.releaseTourSeats(cancelled, session);
				} else {
					await this.propertyModel
						.updateOne(
							{ _id: cancelled.bookingRefId },
							[
								{
									$set: {
										propertyBookings: {
											$max: [0, { $subtract: [{ $ifNull: ['$propertyBookings', 0] }, 1] }],
										},
									},
								},
							] as any,
							{ session },
						)
						.exec();
				}
			});
		} finally {
			await session.endSession();
		}

		if (!cancelled) throw new BadRequestException(Messages.BOOKING_CANNOT_CANCEL);
		await this.notifyBookingTransition(cancelled, BookingStatus.CANCELLED, actorId);
		return cancelled;
	}

	/** A stay starts at check-in, a tour at the start date that was booked **/
	private async getBookingStart(booking: any): Promise<Date | null> {
		if (booking.checkIn) return new Date(booking.checkIn);
		if (booking.priceSnapshot?.tourStartDate) return new Date(booking.priceSnapshot.tourStartDate);
		const tour: any = await this.tourModel
			.findById(booking.bookingRefId)
			.select('tourStartDate')
			.lean()
			.exec();
		return tour?.tourStartDate ?? null;
	}

	private async refundPayment(providerPaymentId: string): Promise<void> {
		try {
			const intent = await this.stripe.paymentIntents.retrieve(providerPaymentId);
			if (intent.latest_charge) {
				await this.stripe.refunds.create(
					{ payment_intent: providerPaymentId },
					{ idempotencyKey: `booking-refund:${providerPaymentId}` },
				);
			}
			await this.paymentModel
				.updateOne(
					{ providerPaymentId },
					{ paymentStatus: PaymentStatus.REFUNDED, refundedAt: new Date() },
				)
				.exec();
		} catch (error) {
			throw new InternalServerErrorException(Messages.PAYMENT_REFUND_FAILED);
		}
	}

	private async cancelPendingPaymentIntents(
		bookingId: Types.ObjectId,
		failureReason: string,
	): Promise<void> {
		const payments = await this.paymentModel
			.find({ bookingId, paymentStatus: { $in: [PaymentStatus.PENDING, PaymentStatus.FAILED] } })
			.exec();
		for (const payment of payments) {
			try {
				await this.stripe.paymentIntents.cancel(payment.providerPaymentId);
			} catch (error) {}
			await this.paymentModel
				.updateOne(
					{ _id: payment._id, paymentStatus: { $ne: PaymentStatus.SUCCEEDED } },
					{ paymentStatus: PaymentStatus.FAILED, failureReason },
				)
				.exec();
		}
	}

	private async cancelPendingBookingBySystem(
		bookingId: Types.ObjectId,
		failureReason: string,
	): Promise<void> {
		const booking = await this.cancelPendingBookingAtomically({
			_id: bookingId,
			bookingStatus: BookingStatus.PENDING,
		});
		if (!booking) return;
		await this.cancelPendingPaymentIntents(booking._id as Types.ObjectId, failureReason);
	}

	private async notifyBookingTransition(
		booking: any,
		status: BookingStatus,
		actorId?: Types.ObjectId,
	): Promise<void> {
		const owner: any =
			booking.bookingCategory === BookingCategory.PROPERTY
				? await this.propertyModel.findById(booking.bookingRefId).select('memberId').lean().exec()
				: await this.tourModel.findById(booking.bookingRefId).select('memberId').lean().exec();
		const eventKey = `booking:${status.toLowerCase()}:${booking._id}`;
		const isConfirmed = status === BookingStatus.CONFIRMED;
		const guestId = booking.memberId as Types.ObjectId;
		const input = {
			notificationType: NotificationType.BOOKING,
			notificationGroup: NotificationGroup.BOOKING,
			notificationRefId: booking._id as Types.ObjectId,
		};
		// The guest is the author of owner/admin notifications so clients can tell
		// a received reservation apart from the receiver's own booking.
		const guestInput = {
			...input,
			notificationTitle: isConfirmed ? 'Booking confirmed' : 'Booking cancelled',
			notificationDesc: isConfirmed
				? 'Your booking payment has been confirmed.'
				: 'Your booking has been cancelled.',
		};
		const ownerInput = {
			...input,
			authorId: guestId,
			notificationTitle: isConfirmed ? 'New reservation confirmed' : 'Reservation cancelled',
			notificationDesc: isConfirmed
				? 'A traveler confirmed a reservation for your listing.'
				: 'A reservation for your listing has been cancelled.',
		};
		const adminInput = {
			...input,
			authorId: guestId,
			notificationTitle: isConfirmed ? 'Booking confirmed' : 'Booking cancelled',
			notificationDesc: isConfirmed
				? 'A platform booking has been confirmed.'
				: 'A platform booking has been cancelled.',
		};
		const recipientIds = [guestId, owner?.memberId as Types.ObjectId]
			.filter(
				(recipientId): recipientId is Types.ObjectId =>
					Boolean(recipientId) && !actorId?.equals(recipientId),
			)
			.filter(
				(recipientId, index, recipients) =>
					recipients.findIndex((value) => value.equals(recipientId)) === index,
			);

		await Promise.all(
			recipientIds.map((receiverId) =>
				this.notificationService.createNotification({
					...(receiverId.equals(guestId) ? guestInput : ownerInput),
					receiverId,
					notificationEventKey: `${eventKey}:${receiverId}`,
				}),
			),
		);
		await this.notificationService.notifyActiveAdmins(
			{ ...adminInput, notificationEventKey: eventKey },
			[...recipientIds, ...(actorId ? [actorId] : [])],
		);
	}

	private async cancelPendingBookingAtomically(search: any): Promise<any | null> {
		const session = await this.connection.startSession();
		try {
			let cancelledBooking: any | null = null;
			await session.withTransaction(async () => {
				cancelledBooking = await this.bookingModel
					.findOneAndUpdate(
						search,
						{ bookingStatus: BookingStatus.CANCELLED, cancelledAt: new Date() },
						{ new: true, session },
					)
					.exec();
				if (!cancelledBooking || cancelledBooking.bookingCategory !== BookingCategory.TOUR) return;
				await this.releaseTourSeats(cancelledBooking, session);
			});
			return cancelledBooking;
		} finally {
			await session.endSession();
		}
	}

	private async releaseTourSeats(booking: any, session?: any): Promise<void> {
		if (booking.bookingCategory !== BookingCategory.TOUR) return;
		await this.tourModel
			.updateOne(
				{ _id: booking.bookingRefId },
				[
					{
						$set: {
							tourReservedSeats: {
								$max: [
									0,
									{ $subtract: [{ $ifNull: ['$tourReservedSeats', 0] }, booking.bookingGuests] },
								],
							},
						},
					},
				] as any,
				{ session },
			)
			.exec();
	}

	private async findReusablePropertyHold(
		memberId: Types.ObjectId,
		propertyId: Types.ObjectId,
		input: StartPropertyPaymentInput,
	): Promise<any> {
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

	private async findMatchingPropertyHold(
		memberId: Types.ObjectId,
		propertyId: Types.ObjectId,
		input: StartPropertyPaymentInput,
	): Promise<any> {
		return this.bookingModel
			.findOne({
				memberId,
				bookingCategory: BookingCategory.PROPERTY,
				bookingRefId: propertyId,
				bookingStatus: BookingStatus.PENDING,
				checkoutKey: input.idempotencyKey,
				checkIn: input.checkIn,
				checkOut: input.checkOut,
				bookingGuests: input.bookingGuests,
				expiresAt: { $gt: new Date() },
			})
			.exec();
	}

	private async findReusableTourHold(
		memberId: Types.ObjectId,
		tourId: Types.ObjectId,
		input: StartTourPaymentInput,
	): Promise<any> {
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

	private async findMatchingTourHold(
		memberId: Types.ObjectId,
		tourId: Types.ObjectId,
		input: StartTourPaymentInput,
	): Promise<any> {
		return this.bookingModel
			.findOne({
				memberId,
				bookingCategory: BookingCategory.TOUR,
				bookingRefId: tourId,
				bookingStatus: BookingStatus.PENDING,
				checkoutKey: input.idempotencyKey,
				bookingGuests: input.bookingGuests,
				expiresAt: { $gt: new Date() },
			})
			.exec();
	}

	private async assertPaymentMatchesRequest(
		payment: any,
		memberId: Types.ObjectId,
		bookingCategory: BookingCategory,
		bookingRefId: Types.ObjectId,
		input: StartPropertyPaymentInput | StartTourPaymentInput,
	): Promise<void> {
		if (!this.objectIdEquals(payment.memberId, memberId))
			throw new BadRequestException(Messages.PAYMENT_FAILED);
		const match: any = {
			_id: payment.bookingId,
			memberId,
			bookingCategory,
			bookingRefId,
			bookingGuests: input.bookingGuests,
		};
		if (bookingCategory === BookingCategory.PROPERTY) {
			const propertyInput = input as StartPropertyPaymentInput;
			match.checkIn = propertyInput.checkIn;
			match.checkOut = propertyInput.checkOut;
		}
		if (!(await this.bookingModel.exists(match).exec()))
			throw new BadRequestException(Messages.PAYMENT_FAILED);
	}

	private paymentBelongsToBooking(payment: any, booking: any, memberId: Types.ObjectId): boolean {
		return (
			this.objectIdEquals(payment.memberId, memberId) &&
			this.objectIdEquals(payment.bookingId, booking._id)
		);
	}

	private objectIdEquals(value: unknown, expected: Types.ObjectId): boolean {
		try {
			return new Types.ObjectId(value as any).equals(expected);
		} catch (error) {
			return false;
		}
	}

	private async getPaymentByKey(idempotencyKey: string): Promise<any> {
		return this.paymentModel.findOne({ idempotencyKey }).exec();
	}

	private async findPendingPaymentForBooking(bookingId: Types.ObjectId): Promise<any> {
		return this.paymentModel.findOne({ bookingId, paymentStatus: PaymentStatus.PENDING }).exec();
	}

	private async shapeCheckout(payment: any): Promise<PaymentCheckout> {
		const intent = await this.stripe.paymentIntents.retrieve(payment.providerPaymentId);
		if (!intent.client_secret) throw new InternalServerErrorException(Messages.PAYMENT_FAILED);
		return { payment: payment as Payment, clientSecret: intent.client_secret };
	}

	private validateCheckoutAmount(amount: number, currency: string): void {
		this.getStripeCharge(amount, currency);
	}

	private getStripeCharge(amount: number, currency: string): { amount: number; currency: string } {
		const normalizedCurrency = currency?.trim().toUpperCase();
		const decimalPlaces = normalizedCurrency === USD ? 2 : undefined;

		if (decimalPlaces === undefined || !Number.isFinite(amount) || amount <= 0) {
			throw new BadRequestException(Messages.INVALID_DATA);
		}

		const stripeAmount = Math.round(amount * 10 ** decimalPlaces);
		if (
			!Number.isSafeInteger(stripeAmount) ||
			Math.abs(stripeAmount / 10 ** decimalPlaces - amount) > 0.000001
		) {
			throw new BadRequestException(Messages.INVALID_DATA);
		}

		return { amount: stripeAmount, currency: normalizedCurrency.toLowerCase() };
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
