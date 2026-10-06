jest.mock('stripe', () => ({
	__esModule: true,
	default: jest.fn().mockImplementation(() => ({
		paymentIntents: {
			create: jest.fn().mockImplementation((_payload, options) =>
				Promise.resolve({ id: `pi_${options.idempotencyKey}`, client_secret: `secret_${options.idempotencyKey}` }),
			),
			retrieve: jest.fn().mockImplementation((id) => Promise.resolve({ id, client_secret: `secret_${id}`, latest_charge: null })),
			cancel: jest.fn().mockResolvedValue({}),
		},
		refunds: { create: jest.fn().mockResolvedValue({}) },
		webhooks: { constructEvent: jest.fn() },
	})),
}));

import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Types } from 'mongoose';
import { PaymentService } from '../src/components/payment/payment.service';
import { TravelHistoryService } from '../src/components/travel-history/travel-history.service';
import { BookingStatus } from '../src/libs/enums/booking.enum';
import { PaymentStatus } from '../src/libs/enums/payment.enum';
import { clearDatabase, createTestApp, graphQL, model, seedMember } from './helpers/e2e.helper';

describe('Booking, Payment and TravelHistory (integration/e2e)', () => {
	let app: INestApplication;

	beforeAll(async () => {
		app = await createTestApp();
	});

	afterEach(async () => {
		await clearDatabase(app);
	});

	afterAll(async () => {
		await app.close();
	});

	async function catalogFixtures() {
		const owner = await seedMember(app, 'commerceagent');
		const destination = await model(app, 'Destination').create({
			destinationName: 'Indonesia', destinationSlug: 'indonesia', destinationCountry: 'ID', destinationStatus: 'ACTIVE',
		});
		const property = await model(app, 'Property').create({
			memberId: owner._id,
			destinationId: destination._id,
			propertyType: 'HOTEL',
			propertyStatus: 'ACTIVE',
			propertyName: 'Bali Aura',
			propertyAddress: 'Bali',
			pricePerNight: 120000,
			currency: 'KRW',
			maxGuests: 3,
		});
		const tour = await model(app, 'Tour').create({
			memberId: owner._id,
			destinationId: destination._id,
			tourStatus: 'ACTIVE',
			tourName: 'Bali Tour',
			tourSlug: 'bali-tour',
			tourPrice: 70000,
			tourCurrency: 'KRW',
			tourStartDate: new Date(Date.now() + 86_400_000),
			tourEndDate: new Date(Date.now() + 172_800_000),
			tourCapacity: 2,
			tourReservedSeats: 0,
		});
		return { destination, property, tour };
	}

	it('creates a trusted property hold, rejects overlap and confirms exactly once', async () => {
		const userOne = await seedMember(app, 'bookuser1');
		const userTwo = await seedMember(app, 'bookuser2');
		const { property } = await catalogFixtures();
		const checkIn = new Date(Date.now() + 3 * 86_400_000);
		const checkOut = new Date(Date.now() + 5 * 86_400_000);
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
			{ input: { propertyId: property._id.toString(), checkIn, checkOut, bookingGuests: 2, idempotencyKey } },
			userOne.accessToken,
		);
		expect(first.body.errors).toBeUndefined();
		expect(first.body.data.startPropertyPayment.payment.paymentAmount).toBe(240000);
		const bookingId = first.body.data.startPropertyPayment.payment.bookingId;

		const retry = await graphQL(
			app,
			mutation,
			{ input: { propertyId: property._id.toString(), checkIn, checkOut, bookingGuests: 2, idempotencyKey } },
			userOne.accessToken,
		);
		expect(retry.body.data.startPropertyPayment.payment._id).toBe(first.body.data.startPropertyPayment.payment._id);

		const overlap = await graphQL(
			app,
			mutation,
			{ input: { propertyId: property._id.toString(), checkIn, checkOut, bookingGuests: 1, idempotencyKey: randomUUID() } },
			userTwo.accessToken,
		);
		expect(overlap.body.errors).toBeDefined();

		const paymentService = app.get(PaymentService) as any;
		const providerPaymentId = first.body.data.startPropertyPayment.payment.providerPaymentId;
		paymentService.stripe.webhooks.constructEvent.mockReturnValue({
			type: 'payment_intent.succeeded',
			data: { object: { id: providerPaymentId } },
		});
		await paymentService.handleStripeWebhook(Buffer.from('{}'), 'test-signature');
		await paymentService.handleStripeWebhook(Buffer.from('{}'), 'test-signature');
		const booking = await model(app, 'Booking').findById(bookingId).lean();
		const payment = await model(app, 'Payment').findOne({ providerPaymentId }).lean();
		expect(booking.bookingStatus).toBe(BookingStatus.CONFIRMED);
		expect(payment.paymentStatus).toBe(PaymentStatus.SUCCEEDED);
		expect((await model(app, 'Property').findById(property._id).lean()).propertyBookings).toBe(1);
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
					checkIn: new Date(Date.now() + 5 * 86_400_000),
					checkOut: new Date(Date.now() + 4 * 86_400_000),
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
					checkIn: new Date(Date.now() + 5 * 86_400_000),
					checkOut: new Date(Date.now() + 6 * 86_400_000),
					bookingGuests: 4,
					idempotencyKey: randomUUID(),
				},
			},
			user.accessToken,
		);
		expect(tooManyGuests.body.errors).toBeDefined();
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
			bookingCurrency: 'KRW',
			priceSnapshot: { pricePerNight: 120000 },
		});
		const travelHistoryService = app.get(TravelHistoryService);
		await travelHistoryService.completeExpiredBookings();
		await travelHistoryService.completeExpiredBookings();
		expect((await model(app, 'Booking').findById(booking._id).lean()).bookingStatus).toBe('COMPLETED');
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
		expect(histories.body.data.getMyTravelHistories.list[0].destinationId).toBe(destination._id.toString());
	});
});
