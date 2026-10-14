jest.mock('stripe', () => ({
	__esModule: true,
	default: jest.fn().mockImplementation(() => ({
		paymentIntents: {
			create: jest.fn(),
			retrieve: jest
				.fn()
				.mockImplementation((id) => Promise.resolve({ id, latest_charge: 'ch_test' })),
			cancel: jest.fn().mockResolvedValue({}),
		},
		refunds: { create: jest.fn().mockResolvedValue({}) },
		webhooks: { constructEvent: jest.fn() },
	})),
}));

import { INestApplication } from '@nestjs/common';
import { Types } from 'mongoose';
import { PaymentService } from '../src/components/payment/payment.service';
import { BookingCategory, BookingStatus } from '../src/libs/enums/booking.enum';
import { Messages } from '../src/libs/enums/common.enum';
import { MemberStatus, MemberType } from '../src/libs/enums/member.enum';
import { PaymentStatus } from '../src/libs/enums/payment.enum';
import { clearDatabase, createTestApp, graphQL, model, seedMember } from './helpers/e2e.helper';

describe('Booking lifecycle (e2e)', () => {
	let app: INestApplication;
	let stripe: any;

	beforeAll(async () => {
		app = await createTestApp();
		stripe = (app.get(PaymentService) as any).stripe;
	});

	afterEach(async () => {
		jest.clearAllMocks();
		await clearDatabase(app);
	});

	afterAll(async () => {
		await app.close();
	});

	const HOUR = 3_600_000;
	const DAY = 24 * HOUR;
	const CANCEL = `mutation Cancel($id: String!) { cancelBooking(bookingId: $id) { _id bookingStatus } }`;
	const CANCEL_TOUR = `mutation Cancel($id: String!) { cancelTourBooking(bookingId: $id) { _id bookingStatus } }`;
	const ADMIN_CANCEL = `mutation AdminCancel($input: CancelBookingByAdminInput!) {
		cancelBookingByAdmin(input: $input) { _id bookingStatus cancelReason }
	}`;

	async function seedDestination() {
		return await model(app, 'Destination').create({
			destinationName: 'Seoul',
			destinationSlug: 'seoul',
			destinationCountry: 'South Korea',
			destinationStatus: 'ACTIVE',
		});
	}

	async function seedProperty(memberId: string, destinationId: unknown, extra: object = {}) {
		return await model(app, 'Property').create({
			memberId,
			destinationId,
			propertyType: 'HOTEL',
			propertyStatus: 'ACTIVE',
			propertyName: 'Aurora Hotel',
			propertyAddress: 'Gangnam',
			pricePerNight: 100,
			currency: 'USD',
			maxGuests: 2,
			...extra,
		});
	}

	async function seedTour(memberId: string, destinationId: unknown, extra: object = {}) {
		return await model(app, 'Tour').create({
			memberId,
			destinationId,
			tourStatus: 'ACTIVE',
			tourName: 'Aurora Tour',
			tourDesc: 'Palaces',
			tourPrice: 100,
			tourCurrency: 'USD',
			tourStartDate: new Date(Date.now() + 3 * DAY),
			tourEndDate: new Date(Date.now() + 5 * DAY),
			tourCapacity: 10,
			...extra,
		});
	}

	/** A paid booking the way the Stripe webhook leaves it: CONFIRMED with a SUCCEEDED payment **/
	async function paidBooking(
		guestId: string,
		listing: { _id: unknown },
		category: BookingCategory,
		start: number,
	) {
		const _id = new Types.ObjectId();
		const providerPaymentId = `pi_${_id}`;
		const payment = await model(app, 'Payment').create({
			bookingId: _id,
			memberId: guestId,
			paymentStatus: PaymentStatus.SUCCEEDED,
			paymentAmount: 200,
			paymentCurrency: 'USD',
			providerPaymentId,
			idempotencyKey: `key_${_id}`,
		});
		const dates =
			category === BookingCategory.PROPERTY
				? {
						checkIn: new Date(start),
						checkOut: new Date(start + 2 * DAY),
						priceSnapshot: { nights: 2 },
					}
				: {
						priceSnapshot: {
							tourStartDate: new Date(start),
							tourEndDate: new Date(start + 2 * DAY),
						},
					};
		const booking = await model(app, 'Booking').create({
			_id,
			memberId: guestId,
			bookingCategory: category,
			bookingStatus: BookingStatus.CONFIRMED,
			bookingRefId: listing._id,
			confirmedPaymentId: payment._id,
			bookingGuests: 2,
			bookingTotalPrice: 200,
			bookingCurrency: 'USD',
			...dates,
		});
		return { booking, providerPaymentId };
	}

	async function status(bookingId: unknown) {
		return (await model(app, 'Booking').findById(bookingId).lean()).bookingStatus;
	}

	it('lets the guest cancel a paid stay until 48 hours before check-in with a full refund', async () => {
		const host = await seedMember(app, 'staysHost', MemberType.AGENT);
		const guest = await seedMember(app, 'staysGuest');
		const stranger = await seedMember(app, 'staysOther');
		const destination = await seedDestination();
		const property = await seedProperty(host._id, destination._id, { propertyBookings: 2 });
		const early = await paidBooking(
			guest._id,
			property,
			BookingCategory.PROPERTY,
			Date.now() + 3 * DAY,
		);
		const late = await paidBooking(
			guest._id,
			property,
			BookingCategory.PROPERTY,
			Date.now() + 24 * HOUR,
		);
		const cancel = async (bookingId: unknown, token: string) =>
			await graphQL(app, CANCEL, { id: String(bookingId) }, token);

		expect((await cancel(late.booking._id, guest.accessToken)).body.errors?.[0].message).toBe(
			Messages.BOOKING_CANCEL_WINDOW_PASSED,
		);
		expect((await cancel(early.booking._id, stranger.accessToken)).body.errors?.[0].message).toBe(
			Messages.BOOKING_CANNOT_CANCEL,
		);
		expect(stripe.refunds.create).not.toHaveBeenCalled();

		const cancelled = await cancel(early.booking._id, guest.accessToken);
		expect(cancelled.body.errors).toBeUndefined();
		expect(cancelled.body.data.cancelBooking.bookingStatus).toBe('CANCELLED');
		expect(stripe.refunds.create).toHaveBeenCalledWith(
			{ payment_intent: early.providerPaymentId },
			{ idempotencyKey: `booking-refund:${early.providerPaymentId}` },
		);
		expect(
			(await model(app, 'Payment').findOne({ providerPaymentId: early.providerPaymentId }).lean())
				.paymentStatus,
		).toBe('REFUNDED');
		expect((await model(app, 'Property').findById(property._id).lean()).propertyBookings).toBe(1);
		expect(await status(late.booking._id)).toBe('CONFIRMED');
		expect(
			await model(app, 'Notification').countDocuments({
				receiverId: new Types.ObjectId(host._id),
				notificationTitle: 'Reservation cancelled',
			}),
		).toBe(1);

		expect((await cancel(early.booking._id, guest.accessToken)).body.errors?.[0].message).toBe(
			Messages.BOOKING_CANNOT_CANCEL,
		);
	});

	it('lets an admin cancel a booking at any time, refunding a paid tour and releasing its seats', async () => {
		const host = await seedMember(app, 'tourHost', MemberType.AGENT);
		const guest = await seedMember(app, 'tourGuest');
		const admin = await seedMember(app, 'tourAdmin', MemberType.ADMIN);
		const destination = await seedDestination();
		const tour = await seedTour(host._id, destination._id, { tourReservedSeats: 3 });
		const soon = await paidBooking(guest._id, tour, BookingCategory.TOUR, Date.now() + 12 * HOUR);
		const adminCancel = async (input: object, token = admin.accessToken) =>
			await graphQL(app, ADMIN_CANCEL, { input }, token);

		expect(
			(await graphQL(app, CANCEL_TOUR, { id: soon.booking._id.toString() }, guest.accessToken)).body
				.errors?.[0].message,
		).toBe(Messages.BOOKING_CANCEL_WINDOW_PASSED);
		expect(
			(
				await adminCancel(
					{ _id: soon.booking._id.toString(), cancelReason: 'Storm' },
					guest.accessToken,
				)
			).body.errors,
		).toBeDefined();
		expect(
			(await adminCancel({ _id: soon.booking._id.toString(), cancelReason: '   ' })).body
				.errors?.[0].extensions.code,
		).toBe('BAD_REQUEST');

		const cancelled = await adminCancel({
			_id: soon.booking._id.toString(),
			cancelReason: '  Storm warning  ',
		});
		expect(cancelled.body.errors).toBeUndefined();
		expect(cancelled.body.data.cancelBookingByAdmin).toMatchObject({
			bookingStatus: 'CANCELLED',
			cancelReason: 'Storm warning',
		});
		expect(stripe.refunds.create).toHaveBeenCalledTimes(1);
		expect((await model(app, 'Tour').findById(tour._id).lean()).tourReservedSeats).toBe(1);

		// A payment hold is cancelled without a refund, and keeps the reason too
		const hold = await model(app, 'Booking').create({
			memberId: guest._id,
			bookingCategory: BookingCategory.TOUR,
			bookingStatus: BookingStatus.PENDING,
			bookingRefId: tour._id,
			bookingGuests: 1,
			bookingTotalPrice: 100,
			bookingCurrency: 'USD',
			priceSnapshot: {},
			expiresAt: new Date(Date.now() + HOUR),
		});
		const heldCancel = await adminCancel({ _id: hold._id.toString(), cancelReason: 'Duplicate' });
		expect(heldCancel.body.data.cancelBookingByAdmin).toMatchObject({
			bookingStatus: 'CANCELLED',
			cancelReason: 'Duplicate',
		});
		expect(stripe.refunds.create).toHaveBeenCalledTimes(1);
		expect(
			(await adminCancel({ _id: hold._id.toString(), cancelReason: 'Again' })).body.errors?.[0]
				.message,
		).toBe(Messages.BOOKING_CANNOT_CANCEL);
	});

	it('tells the host when an admin cancels the booking of a guest who is no longer active', async () => {
		const host = await seedMember(app, 'blockHost', MemberType.AGENT);
		const guest = await seedMember(app, 'blockGuest');
		const admin = await seedMember(app, 'blockAdmin', MemberType.ADMIN);
		const destination = await seedDestination();
		const property = await seedProperty(host._id, destination._id);
		const paid = await paidBooking(
			guest._id,
			property,
			BookingCategory.PROPERTY,
			Date.now() + 5 * DAY,
		);
		await model(app, 'Member')
			.updateOne({ _id: guest._id }, { memberStatus: MemberStatus.BLOCKED })
			.exec();

		const cancelled = await graphQL(
			app,
			ADMIN_CANCEL,
			{ input: { _id: paid.booking._id.toString(), cancelReason: 'Fraud' } },
			admin.accessToken,
		);

		expect(cancelled.body.errors).toBeUndefined();
		const hostNotice = await model(app, 'Notification')
			.findOne({
				receiverId: new Types.ObjectId(host._id),
				notificationTitle: 'Reservation cancelled',
			})
			.lean();
		expect(hostNotice?.authorId.toString()).toBe(guest._id);
	});

	it('keeps a paid booking confirmed when the refund fails', async () => {
		const host = await seedMember(app, 'failHost', MemberType.AGENT);
		const guest = await seedMember(app, 'failGuest');
		const destination = await seedDestination();
		const property = await seedProperty(host._id, destination._id);
		const paid = await paidBooking(
			guest._id,
			property,
			BookingCategory.PROPERTY,
			Date.now() + 5 * DAY,
		);
		stripe.refunds.create.mockRejectedValueOnce(new Error('card network down'));

		const refused = await graphQL(
			app,
			CANCEL,
			{ id: paid.booking._id.toString() },
			guest.accessToken,
		);
		expect(refused.body.errors?.[0].message).toBe(Messages.PAYMENT_REFUND_FAILED);
		expect(await status(paid.booking._id)).toBe('CONFIRMED');
	});

	it('shows hosts only the bookings of their own listings, with the guest contact, even after a revoke', async () => {
		const host = await seedMember(app, 'listHost', MemberType.AGENT);
		const otherHost = await seedMember(app, 'listOther', MemberType.AGENT);
		const tourHost = await seedMember(app, 'listTours', MemberType.AGENT);
		const guest = await seedMember(app, 'listGuest');
		await model(app, 'Member').updateOne(
			{ _id: guest._id },
			{ memberEmail: 'guest@aurora.test', memberPhone: '01012345678' },
		);
		const destination = await seedDestination();
		const mine = await seedProperty(host._id, destination._id);
		const theirs = await seedProperty(otherHost._id, destination._id);
		const tour = await seedTour(tourHost._id, destination._id);
		const start = Date.now() + 4 * DAY;
		const myBooking = await paidBooking(guest._id, mine, BookingCategory.PROPERTY, start);
		await paidBooking(guest._id, theirs, BookingCategory.PROPERTY, start);
		await paidBooking(guest._id, tour, BookingCategory.TOUR, start);
		const LIST = (name: string) => `query L($input: BookingsInquiry!) {
			${name}(input: $input) {
				list { _id bookingStartDate bookingEndDate memberData { memberEmail memberPhone } }
				metaCounter { total }
			}
		}`;
		const read = async (name: string, token: string) =>
			(await graphQL(app, LIST(name), { input: { page: 1, limit: 10 } }, token)).body;

		const hostView = await read('getAgentPropertyBookings', host.accessToken);
		expect(hostView.errors).toBeUndefined();
		expect(hostView.data.getAgentPropertyBookings.list).toEqual([
			{
				_id: myBooking.booking._id.toString(),
				bookingStartDate: new Date(start).toISOString(),
				bookingEndDate: new Date(start + 2 * DAY).toISOString(),
				memberData: { memberEmail: 'guest@aurora.test', memberPhone: '01012345678' },
			},
		]);

		const tourView = await read('getAgentTourBookings', tourHost.accessToken);
		expect(tourView.data.getAgentTourBookings.list[0].bookingStartDate).toBe(
			new Date(start).toISOString(),
		);

		// A revoked agent is a USER again, but still hosts the guests already booked
		await model(app, 'Member').updateOne({ _id: host._id }, { memberType: MemberType.USER });
		expect(
			(await read('getAgentPropertyBookings', host.accessToken)).data.getAgentPropertyBookings
				.metaCounter,
		).toEqual([{ total: 1 }]);
		expect(
			(await read('getAgentPropertyBookings', guest.accessToken)).data.getAgentPropertyBookings
				.list,
		).toEqual([]);
	});

	it('tells guests with a booking ahead when the listing leaves the catalog', async () => {
		const host = await seedMember(app, 'goneHost', MemberType.AGENT);
		const tourHost = await seedMember(app, 'goneTours', MemberType.AGENT);
		const admin = await seedMember(app, 'goneAdmin', MemberType.ADMIN);
		const ahead = await seedMember(app, 'goneAhead');
		const past = await seedMember(app, 'gonePast');
		const destination = await seedDestination();
		const property = await seedProperty(host._id, destination._id);
		const tour = await seedTour(tourHost._id, destination._id);
		const upcoming = await paidBooking(
			ahead._id,
			property,
			BookingCategory.PROPERTY,
			Date.now() + 3 * DAY,
		);
		await paidBooking(past._id, property, BookingCategory.PROPERTY, Date.now() - 5 * DAY);
		await paidBooking(ahead._id, tour, BookingCategory.TOUR, Date.now() + 3 * DAY);
		const told = async (memberId: string) =>
			await model(app, 'Notification').countDocuments({
				receiverId: new Types.ObjectId(memberId),
				notificationTitle: 'Your booked listing is unavailable',
			});

		const updated = await graphQL(
			app,
			`mutation S($input: UpdatePropertyStatusInput!) { updatePropertyStatusByAdmin(input: $input) { _id } }`,
			{ input: { _id: property._id.toString(), propertyStatus: 'INACTIVE' } },
			admin.accessToken,
		);
		expect(updated.body.errors).toBeUndefined();
		expect([await told(ahead._id), await told(past._id)]).toEqual([1, 0]);
		expect(await status(upcoming.booking._id)).toBe('CONFIRMED');
		expect(
			await model(app, 'Notification').countDocuments({
				receiverId: new Types.ObjectId(admin._id),
				notificationTitle: 'Booked listing deactivated',
			}),
		).toBe(1);

		// Blocking the tour host takes the tour down, and its guest hears about it as well
		await graphQL(
			app,
			`mutation B($input: AdminUpdateMemberInput!) { updateMemberByAdmin(input: $input) { _id } }`,
			{ input: { _id: tourHost._id, memberStatus: 'BLOCKED' } },
			admin.accessToken,
		);
		expect(await told(ahead._id)).toBe(2);
	});

	it('keeps contact details private outside the member, the admins and the hosts', async () => {
		const owner = await seedMember(app, 'privOwner', MemberType.AGENT);
		const viewer = await seedMember(app, 'privViewer');
		const admin = await seedMember(app, 'privAdmin', MemberType.ADMIN);
		await model(app, 'Member').updateOne(
			{ _id: owner._id },
			{ memberEmail: 'owner@aurora.test', memberPhone: '01099998888' },
		);
		const destination = await seedDestination();
		const property = await seedProperty(owner._id, destination._id);
		const contact = '{ memberEmail memberPhone }';
		const MEMBER = `query M($id: String!) { getMember(input: $id) ${contact} }`;
		const hidden = { memberEmail: null, memberPhone: null };
		const shown = { memberEmail: 'owner@aurora.test', memberPhone: '01099998888' };

		const list = await graphQL(
			app,
			`query P($input: PropertiesInquiry!) {
			getProperties(input: $input) { list { memberData ${contact} } }
		}`,
			{ input: { page: 1, limit: 10, search: {} } },
			viewer.accessToken,
		);
		expect(list.body.data.getProperties.list).toEqual([{ memberData: hidden }]);
		const detail = await graphQL(
			app,
			`query D($id: String!) {
			getProperty(propertyId: $id) { memberData ${contact} }
		}`,
			{ id: property._id.toString() },
		);
		expect(detail.body.data.getProperty.memberData).toEqual(hidden);

		for (const [token, expected] of [
			[undefined, hidden],
			[viewer.accessToken, hidden],
			[owner.accessToken, shown],
			[admin.accessToken, shown],
		] as const) {
			const member = await graphQL(app, MEMBER, { id: owner._id }, token);
			expect(member.body.data.getMember).toEqual(expected);
		}
	});
});
