jest.mock('stripe', () => ({
	__esModule: true,
	default: jest.fn().mockImplementation(() => ({
		paymentIntents: {
			create: jest.fn().mockImplementation((_payload, options) =>
				Promise.resolve({
					id: `pi_${options.idempotencyKey}`,
					client_secret: `secret_${options.idempotencyKey}`,
				}),
			),
			retrieve: jest
				.fn()
				.mockImplementation((id) =>
					Promise.resolve({ id, client_secret: `secret_${id}`, latest_charge: 'ch_test' }),
				),
			cancel: jest.fn().mockResolvedValue({}),
		},
		refunds: { create: jest.fn().mockResolvedValue({}) },
		webhooks: { constructEvent: jest.fn() },
	})),
}));

import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Types } from 'mongoose';
import request from 'supertest';
import { PaymentService } from '../src/components/payment/payment.service';
import { TravelHistoryService } from '../src/components/travel-history/travel-history.service';
import { BookingCategory, BookingStatus } from '../src/libs/enums/booking.enum';
import { Messages } from '../src/libs/enums/common.enum';
import { PaymentStatus } from '../src/libs/enums/payment.enum';
import { clearDatabase, createTestApp, graphQL, model, seedMember } from './helpers/e2e.helper';

describe('Booking, Payment and TravelHistory (integration/e2e)', () => {
	let app: INestApplication;

	beforeAll(async () => {
		app = await createTestApp();
	});

	afterEach(async () => {
		await clearDatabase(app);
		jest.clearAllMocks();
	});

	afterAll(async () => {
		await app.close();
	});

	async function catalogFixtures() {
		const owner = await seedMember(app, 'commerceagent');
		const destination = await model(app, 'Destination').create({
			destinationName: 'Indonesia',
			destinationSlug: 'indonesia',
			destinationCountry: 'ID',
			destinationStatus: 'ACTIVE',
		});
		const property = await model(app, 'Property').create({
			memberId: owner._id,
			destinationId: destination._id,
			propertyType: 'HOTEL',
			propertyStatus: 'ACTIVE',
			propertyName: 'Bali Aura',
			propertyAddress: 'Bali',
			pricePerNight: 120000,
			currency: 'USD',
			maxGuests: 3,
		});
		const tour = await model(app, 'Tour').create({
			memberId: owner._id,
			destinationId: destination._id,
			tourStatus: 'ACTIVE',
			tourName: 'Bali Tour',
			tourPrice: 70000,
			tourCurrency: 'USD',
			tourStartDate: new Date(Date.now() + 86_400_000),
			tourEndDate: new Date(Date.now() + 172_800_000),
			tourCapacity: 2,
			tourReservedSeats: 0,
		});
		return { owner, destination, property, tour };
	}

	const DAY = 86_400_000;
	/** A stay date is a whole UTC day, the way the calendar sends it **/
	const stayDate = (fromToday: number) =>
		new Date((Math.floor(Date.now() / DAY) + fromToday) * DAY);
	const PROPERTY_PAY = `mutation Pay($input: StartPropertyPaymentInput!) {
		startPropertyPayment(input: $input) { payment { bookingId providerPaymentId } }
	}`;
	const TOUR_PAY = `mutation Pay($input: StartTourPaymentInput!) {
		startTourPayment(input: $input) { payment { bookingId providerPaymentId } }
	}`;

	function stayInput(propertyId: unknown, fromDay: number, nights = 1) {
		return {
			input: {
				propertyId: String(propertyId),
				checkIn: stayDate(fromDay),
				checkOut: stayDate(fromDay + nights),
				bookingGuests: 1,
				idempotencyKey: randomUUID(),
			},
		};
	}

	function succeededWebhook(providerPaymentId: string, amountReceived: number) {
		const paymentService = app.get(PaymentService) as any;
		paymentService.stripe.webhooks.constructEvent.mockReturnValue({
			type: 'payment_intent.succeeded',
			data: { object: { id: providerPaymentId, amount_received: amountReceived, currency: 'usd' } },
		});
		return request(app.getHttpServer())
			.post('/payments/stripe/webhook')
			.set('stripe-signature', 'test-signature')
			.set('Content-Type', 'application/json')
			.send('{}');
	}

	it('creates a trusted property hold, rejects overlap and confirms exactly once', async () => {
		const userOne = await seedMember(app, 'bookuser1');
		const userTwo = await seedMember(app, 'bookuser2');
		const { property } = await catalogFixtures();
		const checkIn = stayDate(3);
		const checkOut = stayDate(5);
		const idempotencyKey = randomUUID();
		const mutation = `mutation Pay($input: StartPropertyPaymentInput!) {
			startPropertyPayment(input: $input) {
				clientSecret
				payment { _id bookingId paymentStatus paymentAmount paymentCurrency providerPaymentId }
			}
		}`;
		const first = await graphQL(
			app,
			mutation,
			{
				input: {
					propertyId: property._id.toString(),
					checkIn,
					checkOut,
					bookingGuests: 2,
					idempotencyKey,
				},
			},
			userOne.accessToken,
		);
		expect(first.body.errors).toBeUndefined();
		expect(first.body.data.startPropertyPayment.payment.paymentAmount).toBe(240000);
		// Checkout has no return page, so a payment method that redirects away is never offered
		expect((app.get(PaymentService) as any).stripe.paymentIntents.create).toHaveBeenCalledWith(
			expect.objectContaining({
				automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
			}),
			{ idempotencyKey },
		);
		const bookingId = first.body.data.startPropertyPayment.payment.bookingId;
		expect((await model(app, 'Booking').findById(bookingId).lean()).bookingStatus).toBe(
			BookingStatus.PENDING,
		);

		const retry = await graphQL(
			app,
			mutation,
			{
				input: {
					propertyId: property._id.toString(),
					checkIn,
					checkOut,
					bookingGuests: 2,
					idempotencyKey,
				},
			},
			userOne.accessToken,
		);
		expect(retry.body.data.startPropertyPayment.payment._id).toBe(
			first.body.data.startPropertyPayment.payment._id,
		);

		const overlap = await graphQL(
			app,
			mutation,
			{
				input: {
					propertyId: property._id.toString(),
					checkIn,
					checkOut,
					bookingGuests: 1,
					idempotencyKey: randomUUID(),
				},
			},
			userTwo.accessToken,
		);
		expect(overlap.body.errors).toBeDefined();

		const paymentService = app.get(PaymentService) as any;
		const providerPaymentId = first.body.data.startPropertyPayment.payment.providerPaymentId;
		paymentService.stripe.webhooks.constructEvent.mockReturnValue({
			type: 'payment_intent.succeeded',
			data: { object: { id: providerPaymentId, amount_received: 24000000, currency: 'usd' } },
		});
		const webhook = () =>
			request(app.getHttpServer())
				.post('/payments/stripe/webhook')
				.set('stripe-signature', 'test-signature')
				.set('Content-Type', 'application/json')
				.send('{}');
		expect((await webhook()).status).toBe(201);
		expect((await webhook()).status).toBe(201);
		paymentService.stripe.webhooks.constructEvent.mockReturnValue({
			type: 'payment_intent.payment_failed',
			data: {
				object: { id: providerPaymentId, last_payment_error: { message: 'late failure event' } },
			},
		});
		expect((await webhook()).status).toBe(201);
		const booking = await model(app, 'Booking').findById(bookingId).lean();
		const payment = await model(app, 'Payment').findOne({ providerPaymentId }).lean();
		expect(booking.bookingStatus).toBe(BookingStatus.CONFIRMED);
		expect(payment.paymentStatus).toBe(PaymentStatus.SUCCEEDED);
		expect((await model(app, 'Property').findById(property._id).lean()).propertyBookings).toBe(1);

		const guestNotifications = await model(app, 'Notification')
			.find({ receiverId: userOne._id, notificationType: 'BOOKING' })
			.lean();
		const ownerNotifications = await model(app, 'Notification')
			.find({ receiverId: property.memberId, notificationType: 'BOOKING' })
			.lean();
		expect(guestNotifications).toHaveLength(1);
		expect(guestNotifications[0].notificationTitle).toBe('Booking confirmed');
		expect(guestNotifications[0].authorId).toBeUndefined();
		expect(ownerNotifications).toHaveLength(1);
		expect(ownerNotifications[0].notificationTitle).toBe('New reservation confirmed');
		expect(ownerNotifications[0].authorId.toString()).toBe(userOne._id.toString());
	});

	it('permits only one parallel Property hold for an overlapping date range', async () => {
		const userOne = await seedMember(app, 'parallelone');
		const userTwo = await seedMember(app, 'paralleltwo');
		const { property } = await catalogFixtures();
		const mutation = `mutation Pay($input: StartPropertyPaymentInput!) {
			startPropertyPayment(input: $input) { payment { _id bookingId } }
		}`;
		const checkIn = stayDate(3);
		const checkOut = stayDate(5);
		const [first, second] = await Promise.all([
			graphQL(
				app,
				mutation,
				{
					input: {
						propertyId: property._id.toString(),
						checkIn,
						checkOut,
						bookingGuests: 1,
						idempotencyKey: randomUUID(),
					},
				},
				userOne.accessToken,
			),
			graphQL(
				app,
				mutation,
				{
					input: {
						propertyId: property._id.toString(),
						checkIn,
						checkOut,
						bookingGuests: 1,
						idempotencyKey: randomUUID(),
					},
				},
				userTwo.accessToken,
			),
		]);

		expect([first, second].filter((result) => !result.body.errors)).toHaveLength(1);
		expect(
			await model(app, 'Booking').countDocuments({
				bookingRefId: property._id,
				bookingStatus: BookingStatus.PENDING,
			}),
		).toBe(1);
	});

	it('reserves tour seats atomically and rejects capacity overflow', async () => {
		const userOne = await seedMember(app, 'tourbook1');
		const userTwo = await seedMember(app, 'tourbook2');
		const { tour } = await catalogFixtures();
		const mutation = `mutation Pay($input: StartTourPaymentInput!) {
			startTourPayment(input: $input) { payment { _id bookingId paymentAmount } clientSecret }
		}`;
		const first = await graphQL(
			app,
			mutation,
			{ input: { tourId: tour._id.toString(), bookingGuests: 2, idempotencyKey: randomUUID() } },
			userOne.accessToken,
		);
		expect(first.body.errors).toBeUndefined();
		expect(first.body.data.startTourPayment.payment.paymentAmount).toBe(140000);

		const overflow = await graphQL(
			app,
			mutation,
			{ input: { tourId: tour._id.toString(), bookingGuests: 1, idempotencyKey: randomUUID() } },
			userTwo.accessToken,
		);
		expect(overflow.body.errors).toBeDefined();
		expect((await model(app, 'Tour').findById(tour._id).lean()).tourReservedSeats).toBe(2);
	});

	it('returns both Property and Tour reservations from getMyBookings', async () => {
		const user = await seedMember(app, 'allbookingsuser');
		const { property, tour } = await catalogFixtures();
		const checkIn = stayDate(3);
		const checkOut = stayDate(5);

		const propertyCheckout = await graphQL(
			app,
			`mutation Pay($input: StartPropertyPaymentInput!) {
				startPropertyPayment(input: $input) { payment { bookingId } }
			}`,
			{
				input: {
					propertyId: property._id.toString(),
					checkIn,
					checkOut,
					bookingGuests: 1,
					idempotencyKey: randomUUID(),
				},
			},
			user.accessToken,
		);
		const tourCheckout = await graphQL(
			app,
			`mutation Pay($input: StartTourPaymentInput!) {
				startTourPayment(input: $input) { payment { bookingId } }
			}`,
			{ input: { tourId: tour._id.toString(), bookingGuests: 1, idempotencyKey: randomUUID() } },
			user.accessToken,
		);
		expect(propertyCheckout.body.errors).toBeUndefined();
		expect(tourCheckout.body.errors).toBeUndefined();

		const result = await graphQL(
			app,
			`query MyBookings($input: BookingsInquiry!) {
				getMyBookings(input: $input) {
					list {
						bookingCategory
						propertyData { propertyName }
						tourData { tourName }
					}
					metaCounter { total }
				}
			}`,
			{ input: { page: 1, limit: 10, search: {} } },
			user.accessToken,
		);

		expect(result.body.errors).toBeUndefined();
		expect(result.body.data.getMyBookings.metaCounter[0].total).toBe(2);
		expect(result.body.data.getMyBookings.list).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					bookingCategory: BookingCategory.PROPERTY,
					propertyData: { propertyName: property.propertyName },
				}),
				expect.objectContaining({
					bookingCategory: BookingCategory.TOUR,
					tourData: { tourName: tour.tourName },
				}),
			]),
		);
	});

	it('permits only one parallel reservation for the last Tour seat', async () => {
		const userOne = await seedMember(app, 'lastseatone');
		const userTwo = await seedMember(app, 'lastseattwo');
		const { tour } = await catalogFixtures();
		await model(app, 'Tour').updateOne({ _id: tour._id }, { tourCapacity: 1 }).exec();
		const mutation = `mutation Pay($input: StartTourPaymentInput!) {
			startTourPayment(input: $input) { payment { bookingId } }
		}`;

		const results = await Promise.all([
			graphQL(
				app,
				mutation,
				{ input: { tourId: tour._id.toString(), bookingGuests: 1, idempotencyKey: randomUUID() } },
				userOne.accessToken,
			),
			graphQL(
				app,
				mutation,
				{ input: { tourId: tour._id.toString(), bookingGuests: 1, idempotencyKey: randomUUID() } },
				userTwo.accessToken,
			),
		]);

		expect(results.filter((result) => !result.body.errors)).toHaveLength(1);
		expect(
			await model(app, 'Booking').countDocuments({
				bookingRefId: tour._id,
				bookingStatus: BookingStatus.PENDING,
			}),
		).toBe(1);
		expect((await model(app, 'Tour').findById(tour._id).lean()).tourReservedSeats).toBe(1);
	});

	it('lets one of eight racing guests hold a room and three of eight hold a three-seat tour', async () => {
		const guests = await Promise.all(
			Array.from({ length: 8 }, (_, index) => seedMember(app, `racer${index}`)),
		);
		const { property, tour } = await catalogFixtures();
		await model(app, 'Tour').updateOne({ _id: tour._id }, { tourCapacity: 3 }).exec();

		const stays = await Promise.all(
			guests.map((guest) =>
				graphQL(app, PROPERTY_PAY, stayInput(property._id, 6, 2), guest.accessToken),
			),
		);
		const seats = await Promise.all(
			guests.map((guest) =>
				graphQL(
					app,
					TOUR_PAY,
					{
						input: { tourId: tour._id.toString(), bookingGuests: 1, idempotencyKey: randomUUID() },
					},
					guest.accessToken,
				),
			),
		);

		expect(stays.filter((result) => !result.body.errors)).toHaveLength(1);
		expect(seats.filter((result) => !result.body.errors)).toHaveLength(3);
		expect(await model(app, 'Booking').countDocuments({ bookingRefId: property._id })).toBe(1);
		expect(await model(app, 'Booking').countDocuments({ bookingRefId: tour._id })).toBe(3);
		expect((await model(app, 'Tour').findById(tour._id).lean()).tourReservedSeats).toBe(3);
		// Every loser hears a business reason, not a server error
		for (const result of [...stays, ...seats].filter((item) => item.body.errors)) {
			expect(result.body.errors[0].extensions.code).toBe('BAD_REQUEST');
		}
	});

	it('keeps one Tour hold and one Payment for concurrent duplicate requests', async () => {
		const user = await seedMember(app, 'dupetour');
		const { tour } = await catalogFixtures();
		const idempotencyKey = randomUUID();
		const mutation = `mutation Pay($input: StartTourPaymentInput!) {
			startTourPayment(input: $input) { payment { _id bookingId providerPaymentId } }
		}`;
		const variables = { input: { tourId: tour._id.toString(), bookingGuests: 1, idempotencyKey } };

		const [first, second] = await Promise.all([
			graphQL(app, mutation, variables, user.accessToken),
			graphQL(app, mutation, variables, user.accessToken),
		]);

		expect(first.body.errors).toBeUndefined();
		expect(second.body.errors).toBeUndefined();
		expect(first.body.data.startTourPayment.payment._id).toBe(
			second.body.data.startTourPayment.payment._id,
		);
		expect(
			await model(app, 'Booking').countDocuments({
				memberId: user._id,
				checkoutKey: idempotencyKey,
			}),
		).toBe(1);
		expect(await model(app, 'Payment').countDocuments({ idempotencyKey })).toBe(1);
		expect((await model(app, 'Tour').findById(tour._id).lean()).tourReservedSeats).toBe(1);
	});

	it('rolls back a Tour seat increment when booking creation fails inside the transaction', async () => {
		const user = await seedMember(app, 'faulttour');
		const { tour } = await catalogFixtures();
		const bookingModel = model(app, 'Booking');
		const createSpy = jest
			.spyOn(bookingModel, 'create')
			.mockRejectedValueOnce(new Error('fault injection after seat increment'));

		try {
			const result = await graphQL(
				app,
				`mutation Pay($input: StartTourPaymentInput!) { startTourPayment(input: $input) { clientSecret } }`,
				{ input: { tourId: tour._id.toString(), bookingGuests: 1, idempotencyKey: randomUUID() } },
				user.accessToken,
			);
			expect(result.body.errors).toBeDefined();
		} finally {
			createSpy.mockRestore();
		}

		expect(await bookingModel.countDocuments({ bookingRefId: tour._id })).toBe(0);
		expect((await model(app, 'Tour').findById(tour._id).lean()).tourReservedSeats).toBe(0);
	});

	it('expires an unpaid Tour hold, returns seats and refunds a late successful payment', async () => {
		const user = await seedMember(app, 'expiretour');
		const { tour } = await catalogFixtures();
		const mutation = `mutation Pay($input: StartTourPaymentInput!) {
			startTourPayment(input: $input) { payment { bookingId providerPaymentId } }
		}`;
		const checkout = await graphQL(
			app,
			mutation,
			{ input: { tourId: tour._id.toString(), bookingGuests: 1, idempotencyKey: randomUUID() } },
			user.accessToken,
		);
		expect(checkout.body.errors).toBeUndefined();
		const { bookingId, providerPaymentId } = checkout.body.data.startTourPayment.payment;
		await model(app, 'Booking')
			.updateOne({ _id: bookingId }, { expiresAt: new Date(Date.now() - 1_000) })
			.exec();

		const paymentService = app.get(PaymentService) as any;
		await paymentService.expirePendingBookings();
		expect((await model(app, 'Booking').findById(bookingId).lean()).bookingStatus).toBe(
			BookingStatus.CANCELLED,
		);
		expect((await model(app, 'Payment').findOne({ providerPaymentId }).lean()).paymentStatus).toBe(
			PaymentStatus.FAILED,
		);
		expect((await model(app, 'Tour').findById(tour._id).lean()).tourReservedSeats).toBe(0);

		paymentService.stripe.webhooks.constructEvent.mockReturnValue({
			type: 'payment_intent.succeeded',
			data: { object: { id: providerPaymentId, amount_received: 7000000, currency: 'usd' } },
		});
		const lateWebhook = () =>
			request(app.getHttpServer())
				.post('/payments/stripe/webhook')
				.set('stripe-signature', 'test-signature')
				.set('Content-Type', 'application/json')
				.send('{}');
		const duplicateWebhooks = await Promise.all([lateWebhook(), lateWebhook()]);
		expect(duplicateWebhooks.every((response) => response.status === 201)).toBe(true);
		expect((await model(app, 'Booking').findById(bookingId).lean()).bookingStatus).toBe(
			BookingStatus.CANCELLED,
		);
		expect((await model(app, 'Payment').findOne({ providerPaymentId }).lean()).paymentStatus).toBe(
			PaymentStatus.REFUNDED,
		);
		expect((await model(app, 'Tour').findById(tour._id).lean()).tourReservedSeats).toBe(0);
		expect(paymentService.stripe.refunds.create).toHaveBeenCalledWith(
			{ payment_intent: providerPaymentId },
			{ idempotencyKey: `booking-refund:${providerPaymentId}` },
		);
	});

	it('releases Tour inventory once under simultaneous expiration workers', async () => {
		const user = await seedMember(app, 'expireparallel');
		const { tour } = await catalogFixtures();
		const checkout = await graphQL(
			app,
			`mutation Pay($input: StartTourPaymentInput!) {
				startTourPayment(input: $input) { payment { bookingId } }
			}`,
			{ input: { tourId: tour._id.toString(), bookingGuests: 2, idempotencyKey: randomUUID() } },
			user.accessToken,
		);
		const bookingId = checkout.body.data.startTourPayment.payment.bookingId;
		await model(app, 'Booking')
			.updateOne({ _id: bookingId }, { expiresAt: new Date(Date.now() - 1_000) })
			.exec();
		const paymentService = app.get(PaymentService);

		await Promise.all([
			paymentService.expirePendingBookings(),
			paymentService.expirePendingBookings(),
		]);

		expect((await model(app, 'Booking').findById(bookingId).lean()).bookingStatus).toBe(
			BookingStatus.CANCELLED,
		);
		expect((await model(app, 'Tour').findById(tour._id).lean()).tourReservedSeats).toBe(0);
	});

	it('rejects repeated cancellation without releasing Tour seats twice', async () => {
		const user = await seedMember(app, 'cancelonce');
		const { tour } = await catalogFixtures();
		const checkout = await graphQL(
			app,
			`mutation Pay($input: StartTourPaymentInput!) {
				startTourPayment(input: $input) { payment { bookingId } }
			}`,
			{ input: { tourId: tour._id.toString(), bookingGuests: 1, idempotencyKey: randomUUID() } },
			user.accessToken,
		);
		const bookingId = checkout.body.data.startTourPayment.payment.bookingId;
		const mutation = `mutation Cancel($bookingId: String!) {
			cancelTourBooking(bookingId: $bookingId) { _id bookingStatus }
		}`;

		const first = await graphQL(app, mutation, { bookingId }, user.accessToken);
		const second = await graphQL(app, mutation, { bookingId }, user.accessToken);

		expect(first.body.data.cancelTourBooking.bookingStatus).toBe(BookingStatus.CANCELLED);
		expect(second.body.errors).toBeDefined();
		expect((await model(app, 'Tour').findById(tour._id).lean()).tourReservedSeats).toBe(0);
	});

	it('rejects a reused Payment idempotency key owned by another member', async () => {
		const userOne = await seedMember(app, 'keyownerone');
		const userTwo = await seedMember(app, 'keyownertwo');
		const { property } = await catalogFixtures();
		const idempotencyKey = randomUUID();
		const checkIn = stayDate(3);
		const checkOut = stayDate(4);
		const mutation = `mutation Pay($input: StartPropertyPaymentInput!) {
			startPropertyPayment(input: $input) { payment { _id } }
		}`;
		const input = {
			propertyId: property._id.toString(),
			checkIn,
			checkOut,
			bookingGuests: 1,
			idempotencyKey,
		};

		const first = await graphQL(app, mutation, { input }, userOne.accessToken);
		const second = await graphQL(app, mutation, { input }, userTwo.accessToken);

		expect(first.body.errors).toBeUndefined();
		expect(second.body.errors).toBeDefined();
		expect(await model(app, 'Booking').countDocuments({ checkoutKey: idempotencyKey })).toBe(1);
	});

	it('refunds and cancels a booking when a signed success event has the wrong amount', async () => {
		const user = await seedMember(app, 'amountcheck');
		const { tour } = await catalogFixtures();
		const checkout = await graphQL(
			app,
			`mutation Pay($input: StartTourPaymentInput!) {
				startTourPayment(input: $input) { payment { bookingId providerPaymentId } }
			}`,
			{ input: { tourId: tour._id.toString(), bookingGuests: 1, idempotencyKey: randomUUID() } },
			user.accessToken,
		);
		const { bookingId, providerPaymentId } = checkout.body.data.startTourPayment.payment;
		const paymentService = app.get(PaymentService) as any;
		paymentService.stripe.webhooks.constructEvent.mockReturnValue({
			type: 'payment_intent.succeeded',
			data: { object: { id: providerPaymentId, amount_received: 1, currency: 'usd' } },
		});

		const result = await request(app.getHttpServer())
			.post('/payments/stripe/webhook')
			.set('stripe-signature', 'test-signature')
			.set('Content-Type', 'application/json')
			.send('{}');

		expect(result.status).toBe(201);
		expect((await model(app, 'Booking').findById(bookingId).lean()).bookingStatus).toBe(
			BookingStatus.CANCELLED,
		);
		expect((await model(app, 'Payment').findOne({ providerPaymentId }).lean()).paymentStatus).toBe(
			PaymentStatus.REFUNDED,
		);
		expect((await model(app, 'Tour').findById(tour._id).lean()).tourReservedSeats).toBe(0);
		expect(paymentService.stripe.refunds.create).toHaveBeenCalledWith(
			{ payment_intent: providerPaymentId },
			{ idempotencyKey: `booking-refund:${providerPaymentId}` },
		);
	});

	it('rejects checkout without JWT and webhook requests without a Stripe signature', async () => {
		const unauthorizedCheckout = await graphQL(
			app,
			`mutation Pay($input: StartPropertyPaymentInput!) { startPropertyPayment(input: $input) { clientSecret } }`,
			{
				input: {
					propertyId: new Types.ObjectId().toString(),
					checkIn: stayDate(3),
					checkOut: stayDate(4),
					bookingGuests: 1,
					idempotencyKey: randomUUID(),
				},
			},
		);
		expect(unauthorizedCheckout.body.errors).toBeDefined();

		const unsignedWebhook = await request(app.getHttpServer())
			.post('/payments/stripe/webhook')
			.set('Content-Type', 'application/json')
			.send('{}');
		expect(unsignedWebhook.status).toBe(400);
	});

	it('rejects a Stripe webhook when signature verification fails', async () => {
		const paymentService = app.get(PaymentService) as any;
		paymentService.stripe.webhooks.constructEvent.mockImplementationOnce(() => {
			throw new Error('invalid signature');
		});

		const result = await request(app.getHttpServer())
			.post('/payments/stripe/webhook')
			.set('stripe-signature', 'invalid-signature')
			.set('Content-Type', 'application/json')
			.send('{}');

		expect(result.status).toBe(400);
	});

	it('rejects invalid property dates and guest capacity', async () => {
		const user = await seedMember(app, 'invalidbook');
		const { property } = await catalogFixtures();
		const mutation = `mutation Pay($input: StartPropertyPaymentInput!) {
			startPropertyPayment(input: $input) { clientSecret }
		}`;
		const invalidDates = await graphQL(
			app,
			mutation,
			{
				input: {
					propertyId: property._id.toString(),
					checkIn: stayDate(5),
					checkOut: stayDate(4),
					bookingGuests: 1,
					idempotencyKey: randomUUID(),
				},
			},
			user.accessToken,
		);
		expect(invalidDates.body.errors).toBeDefined();

		const tooManyGuests = await graphQL(
			app,
			mutation,
			{
				input: {
					propertyId: property._id.toString(),
					checkIn: stayDate(5),
					checkOut: stayDate(6),
					bookingGuests: 4,
					idempotencyKey: randomUUID(),
				},
			},
			user.accessToken,
		);
		expect(tooManyGuests.body.errors).toBeDefined();
	});

	it('rejects stay dates that are not whole UTC days', async () => {
		const user = await seedMember(app, 'localmidnight');
		const { property } = await catalogFixtures();
		/** What the old checkout sent from Korea: local midnight, 15:00 UTC of the day before **/
		const seoulMidnight = (fromToday: number) =>
			new Date(stayDate(fromToday).getTime() - 9 * 60 * 60 * 1000);
		const { input } = stayInput(property._id, 3);

		const result = await graphQL(
			app,
			PROPERTY_PAY,
			{ input: { ...input, checkIn: seoulMidnight(3), checkOut: seoulMidnight(4) } },
			user.accessToken,
		);

		expect(result.body.errors?.[0].message).toBe(Messages.INVALID_DATA);
		expect(await model(app, 'Booking').countDocuments({ memberId: user._id })).toBe(0);
	});

	it('creates one TravelHistory only after confirmed travel completion', async () => {
		const user = await seedMember(app, 'historyuser');
		const { destination, property } = await catalogFixtures();
		const booking = await model(app, 'Booking').create({
			memberId: user._id,
			bookingCategory: 'PROPERTY',
			bookingStatus: 'CONFIRMED',
			bookingRefId: property._id,
			checkIn: new Date(Date.now() - 2 * 86_400_000),
			checkOut: new Date(Date.now() - 86_400_000),
			bookingGuests: 1,
			bookingTotalPrice: 120000,
			bookingCurrency: 'USD',
			priceSnapshot: { pricePerNight: 120000 },
		});
		const travelHistoryService = app.get(TravelHistoryService);
		await travelHistoryService.completeExpiredBookings();
		await travelHistoryService.completeExpiredBookings();
		expect((await model(app, 'Booking').findById(booking._id).lean()).bookingStatus).toBe(
			'COMPLETED',
		);
		expect(await model(app, 'TravelHistory').countDocuments({ bookingId: booking._id })).toBe(1);

		const histories = await graphQL(
			app,
			`query Histories($input: TravelHistoriesInquiry!) {
				getMyTravelHistories(input: $input) { list { bookingId destinationId visitedAt } metaCounter { total } }
			}`,
			{ input: { page: 1, limit: 10 } },
			user.accessToken,
		);
		expect(histories.body.errors).toBeUndefined();
		expect(histories.body.data.getMyTravelHistories.list[0].destinationId).toBe(
			destination._id.toString(),
		);
	});

	it('does not let a host book their own hotel or tour', async () => {
		const { owner, property, tour } = await catalogFixtures();

		const ownStay = await graphQL(app, PROPERTY_PAY, stayInput(property._id, 3), owner.accessToken);
		const ownTour = await graphQL(
			app,
			TOUR_PAY,
			{ input: { tourId: tour._id.toString(), bookingGuests: 1, idempotencyKey: randomUUID() } },
			owner.accessToken,
		);

		expect(ownStay.body.errors?.[0].message).toBe(Messages.BOOKING_OWN_LISTING);
		expect(ownTour.body.errors?.[0].message).toBe(Messages.BOOKING_OWN_LISTING);
		expect(await model(app, 'Booking').countDocuments({})).toBe(0);
		expect((await model(app, 'Tour').findById(tour._id).lean()).tourReservedSeats).toBe(0);
	});

	it('keeps at most three unpaid holds per member, and an expired hold frees its place', async () => {
		const user = await seedMember(app, 'holdlimit');
		const { property } = await catalogFixtures();
		for (const fromDay of [3, 5, 7]) {
			const hold = await graphQL(
				app,
				PROPERTY_PAY,
				stayInput(property._id, fromDay),
				user.accessToken,
			);
			expect(hold.body.errors).toBeUndefined();
		}

		const fourth = await graphQL(app, PROPERTY_PAY, stayInput(property._id, 9), user.accessToken);
		expect(fourth.body.errors?.[0].message).toBe(Messages.BOOKING_HOLD_LIMIT);

		const oldest = await model(app, 'Booking').findOne({ memberId: user._id }).sort({ checkIn: 1 });
		await model(app, 'Booking')
			.updateOne({ _id: oldest._id }, { expiresAt: new Date(Date.now() - 1_000) })
			.exec();
		const retry = await graphQL(app, PROPERTY_PAY, stayInput(property._id, 9), user.accessToken);
		expect(retry.body.errors).toBeUndefined();
	});

	it('refunds and cancels a paid hold whose hotel left the catalog before the payment arrived', async () => {
		const user = await seedMember(app, 'gonelisting');
		const { property } = await catalogFixtures();
		const checkout = await graphQL(app, PROPERTY_PAY, stayInput(property._id, 3), user.accessToken);
		const { bookingId, providerPaymentId } = checkout.body.data.startPropertyPayment.payment;
		await model(app, 'Property')
			.updateOne({ _id: property._id }, { propertyStatus: 'INACTIVE' })
			.exec();

		expect((await succeededWebhook(providerPaymentId, 12000000)).status).toBe(201);

		const paymentService = app.get(PaymentService) as any;
		expect((await model(app, 'Booking').findById(bookingId).lean()).bookingStatus).toBe(
			BookingStatus.CANCELLED,
		);
		expect((await model(app, 'Payment').findOne({ providerPaymentId }).lean()).paymentStatus).toBe(
			PaymentStatus.REFUNDED,
		);
		expect(paymentService.stripe.refunds.create).toHaveBeenCalledTimes(1);
		expect((await model(app, 'Property').findById(property._id).lean()).propertyBookings).toBe(0);
		const told = await model(app, 'Notification')
			.find({ receiverId: user._id, notificationType: 'BOOKING' })
			.lean();
		expect(told.map((notification) => notification.notificationTitle)).toEqual([
			'Booking cancelled',
		]);
	});

	it('confirms an expired hold from Stripe when the guest paid in time, and keeps one still processing', async () => {
		const paidGuest = await seedMember(app, 'paidintime');
		const slowGuest = await seedMember(app, 'slowpayer');
		const { property } = await catalogFixtures();
		const paid = (
			await graphQL(app, PROPERTY_PAY, stayInput(property._id, 3), paidGuest.accessToken)
		).body.data.startPropertyPayment.payment;
		const slow = (
			await graphQL(app, PROPERTY_PAY, stayInput(property._id, 6), slowGuest.accessToken)
		).body.data.startPropertyPayment.payment;
		await model(app, 'Booking')
			.updateMany(
				{ _id: { $in: [paid.bookingId, slow.bookingId] } },
				{ expiresAt: new Date(Date.now() - 1_000) },
			)
			.exec();
		const paymentService = app.get(PaymentService) as any;
		const retrieve = paymentService.stripe.paymentIntents.retrieve;
		const defaultRetrieve = retrieve.getMockImplementation();
		retrieve.mockImplementation((id: string) =>
			Promise.resolve(
				id === paid.providerPaymentId
					? { id, status: 'succeeded', amount_received: 12000000, currency: 'usd' }
					: { id, status: 'processing' },
			),
		);

		try {
			await paymentService.expirePendingBookings();
		} finally {
			retrieve.mockImplementation(defaultRetrieve);
		}

		expect((await model(app, 'Booking').findById(paid.bookingId).lean()).bookingStatus).toBe(
			BookingStatus.CONFIRMED,
		);
		expect(
			(await model(app, 'Payment').findOne({ providerPaymentId: paid.providerPaymentId }).lean())
				.paymentStatus,
		).toBe(PaymentStatus.SUCCEEDED);
		expect((await model(app, 'Booking').findById(slow.bookingId).lean()).bookingStatus).toBe(
			BookingStatus.PENDING,
		);
		expect(paymentService.stripe.refunds.create).not.toHaveBeenCalled();
	});

	it('refunds a late payment when the expired hold lost its dates to another guest', async () => {
		const lateGuest = await seedMember(app, 'lateguest');
		const nextGuest = await seedMember(app, 'nextguest');
		const { property } = await catalogFixtures();
		const late = (
			await graphQL(app, PROPERTY_PAY, stayInput(property._id, 3), lateGuest.accessToken)
		).body.data.startPropertyPayment.payment;
		await model(app, 'Booking')
			.updateOne({ _id: late.bookingId }, { expiresAt: new Date(Date.now() - 1_000) })
			.exec();
		const paymentService = app.get(PaymentService) as any;
		const retrieve = paymentService.stripe.paymentIntents.retrieve;
		const defaultRetrieve = retrieve.getMockImplementation();
		// The late payment is still processing, so its hold survives the sweep but no longer keeps the dates
		retrieve.mockImplementation((id: string) =>
			id === late.providerPaymentId
				? Promise.resolve({ id, status: 'processing' })
				: defaultRetrieve(id),
		);
		let next: any;
		try {
			next = await graphQL(app, PROPERTY_PAY, stayInput(property._id, 3), nextGuest.accessToken);
		} finally {
			retrieve.mockImplementation(defaultRetrieve);
		}
		expect(next.body.errors).toBeUndefined();

		expect((await succeededWebhook(late.providerPaymentId, 12000000)).status).toBe(201);

		expect((await model(app, 'Booking').findById(late.bookingId).lean()).bookingStatus).toBe(
			BookingStatus.CANCELLED,
		);
		expect(
			(await model(app, 'Payment').findOne({ providerPaymentId: late.providerPaymentId }).lean())
				.paymentStatus,
		).toBe(PaymentStatus.REFUNDED);
		expect(
			(
				await model(app, 'Booking')
					.findById(next.body.data.startPropertyPayment.payment.bookingId)
					.lean()
			).bookingStatus,
		).toBe(BookingStatus.PENDING);
	});

	it('keeps the server up when a background sweep fails', async () => {
		const paymentService = app.get(PaymentService) as any;
		const travelHistoryService = app.get(TravelHistoryService) as any;
		const timers = [paymentService.expiryTimer, travelHistoryService.completionTimer];
		const ticks: Array<() => void> = [];
		const intervalSpy = jest.spyOn(global, 'setInterval').mockImplementation(((
			tick: () => void,
		) => {
			ticks.push(tick);
			return 0;
		}) as any);
		const sweepSpies = [
			jest
				.spyOn(paymentService, 'expirePendingBookings')
				.mockRejectedValue(new Error('database unreachable')),
			jest
				.spyOn(travelHistoryService, 'completeExpiredBookings')
				.mockRejectedValue(new Error('database unreachable')),
		];
		const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
		const unhandled = jest.fn();
		process.on('unhandledRejection', unhandled);

		try {
			paymentService.onModuleInit();
			travelHistoryService.onModuleInit();
			ticks.forEach((tick) => tick());
			await new Promise((resolve) => setImmediate(resolve));

			expect(ticks).toHaveLength(2);
			expect(unhandled).not.toHaveBeenCalled();
			expect(errorSpy).toHaveBeenCalledTimes(2);
		} finally {
			process.off('unhandledRejection', unhandled);
			[intervalSpy, errorSpy, ...sweepSpies].forEach((spy) => spy.mockRestore());
			[paymentService.expiryTimer, travelHistoryService.completionTimer] = timers;
		}
	});
});
