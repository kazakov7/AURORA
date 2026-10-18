import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getConnectionToken } from '@nestjs/mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { Connection, Types } from 'mongoose';
import request from 'supertest';
import { AppModule } from './app.module';

type GraphQlResponse<T> = {
	body: {
		data?: T;
		errors?: Array<{ message: string }>;
	};
};

describe('AURORA core GraphQL APIs (e2e)', () => {
	jest.setTimeout(120_000);

	let app: INestApplication;
	let connection: Connection;
	let replSet: MongoMemoryReplSet;
	let userId: string;
	let userToken: string;
	let adminToken: string;
	let hotelAgentId: string;
	let hotelAgentToken: string;
	let tourAgentId: string;
	let tourAgentToken: string;
	let destinationId: string;
	let propertyId: string;
	let tourId: string;

	const graphql = async <T>(query: string, variables?: Record<string, unknown>, token?: string) => {
		const call = request(app.getHttpServer()).post('/graphql').send({ query, variables });
		if (token) call.set('Authorization', `Bearer ${token}`);
		const response = (await call.expect(200)) as GraphQlResponse<T>;
		if (response.body.errors?.length) {
			throw new Error(response.body.errors.map((error) => error.message).join('; '));
		}
		return response.body.data as T;
	};

	const signup = async (memberNick: string) => {
		const data = await graphql<{
			signup: { _id: string; memberNick: string; memberType: string; accessToken: string };
		}>(
			`
				mutation Signup($input: MemberInput!) {
					signup(input: $input) {
						_id
						memberNick
						memberType
						accessToken
					}
				}
			`,
			{ input: { memberNick, memberPassword: 'pass123' } },
		);
		return data.signup;
	};

	beforeAll(async () => {
		replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
		process.env.NODE_ENV = 'test';
		process.env.MONGO_DEV = replSet.getUri('aurora_test');
		process.env.SECRET_TOKEN = 'aurora-e2e-secret';
		process.env.STRIPE_SECRET_KEY = 'sk_test_placeholder';

		const testingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
		app = testingModule.createNestApplication();
		app.useGlobalPipes(new ValidationPipe());
		await app.init();
		connection = app.get<Connection>(getConnectionToken());
	});

	afterAll(async () => {
		await app?.close();
		await replSet?.stop();
	});

	it('auth va member API: signup, login va getMember ishlaydi', async () => {
		const user = await signup('aurorauser');
		userId = user._id;
		userToken = user.accessToken;
		expect(user.memberType).toBe('USER');

		const admin = await signup('auroraadmin');
		await connection
			.collection('members')
			.updateOne({ _id: new Types.ObjectId(admin._id) }, { $set: { memberType: 'ADMIN' } });
		adminToken = admin.accessToken;

		const hotelAgent = await signup('hotelagent');
		hotelAgentId = hotelAgent._id;
		hotelAgentToken = hotelAgent.accessToken;
		await connection
			.collection('members')
			.updateOne({ _id: new Types.ObjectId(hotelAgentId) }, { $set: { memberType: 'AGENT' } });
		await connection.collection('agents').insertOne({
			memberId: new Types.ObjectId(hotelAgentId),
			agentType: 'HOTEL',
			companyName: 'Aurora Hotels',
			businessNumber: 'HOTEL-001',
			businessNumberKey: 'hotel001',
			companyAddress: 'Seoul',
			verificationStatus: 'APPROVED',
			verifiedAt: new Date(),
			createdAt: new Date(),
			updatedAt: new Date(),
		});

		const tourAgent = await signup('touragent');
		tourAgentId = tourAgent._id;
		tourAgentToken = tourAgent.accessToken;
		await connection
			.collection('members')
			.updateOne({ _id: new Types.ObjectId(tourAgentId) }, { $set: { memberType: 'AGENT' } });
		await connection.collection('agents').insertOne({
			memberId: new Types.ObjectId(tourAgentId),
			agentType: 'TOUR',
			companyName: 'Aurora Tours',
			businessNumber: 'TOUR-001',
			businessNumberKey: 'tour001',
			companyAddress: 'Seoul',
			verificationStatus: 'APPROVED',
			verifiedAt: new Date(),
			createdAt: new Date(),
			updatedAt: new Date(),
		});

		const login = await graphql<{
			login: { _id: string; memberNick: string; accessToken: string };
		}>(
			`
				mutation Login($input: LoginInput!) {
					login(input: $input) {
						_id
						memberNick
						accessToken
					}
				}
			`,
			{ input: { memberNick: 'aurorauser', memberPassword: 'pass123' } },
		);
		expect(login.login._id).toBe(userId);
		expect(login.login.accessToken).toBeTruthy();
		userToken = login.login.accessToken;

		const member = await graphql<{
			getMember: { _id: string; memberNick: string; memberType: string; memberStatus: string };
		}>(
			`
				query GetMember($input: String!) {
					getMember(input: $input) {
						_id
						memberNick
						memberType
						memberStatus
					}
				}
			`,
			{ input: userId },
			userToken,
		);
		expect(member.getMember).toMatchObject({
			_id: userId,
			memberNick: 'aurorauser',
			memberType: 'USER',
			memberStatus: 'ACTIVE',
		});

		const disposable = await signup('deleteuser');
		const deleted = await graphql<{
			updateMemberByAdmin: { _id: string; memberStatus: string; deletedAt: string | null };
		}>(
			`
				mutation DeleteMember($input: AdminUpdateMemberInput!) {
					updateMemberByAdmin(input: $input) {
						_id
						memberStatus
						deletedAt
					}
				}
			`,
			{ input: { _id: disposable._id, memberStatus: 'DELETED' } },
			adminToken,
		);
		expect(deleted.updateMemberByAdmin).toMatchObject({
			_id: disposable._id,
			memberStatus: 'DELETED',
		});
		expect(deleted.updateMemberByAdmin.deletedAt).toBeTruthy();
	});

	it('destination API: admin yaratadi va public ro\u2018yxat qaytaradi', async () => {
		const created = await graphql<{
			createDestination: { _id: string; destinationName: string; destinationStatus: string };
		}>(
			`
				mutation CreateDestination($input: DestinationInput!) {
					createDestination(input: $input) {
						_id
						destinationName
						destinationStatus
					}
				}
			`,
			{
				input: {
					destinationName: 'Seoul',
					destinationCountry: 'South Korea',
					destinationImages: ['https://example.com/seoul.jpg'],
				},
			},
			adminToken,
		);
		destinationId = created.createDestination._id;
		expect(created.createDestination.destinationStatus).toBe('ACTIVE');

		const listed = await graphql<{
			getDestinations: { list: Array<{ _id: string; destinationName: string }> };
		}>(
			`
				query Destinations($input: DestinationsInquiry!) {
					getDestinations(input: $input) {
						list {
							_id
							destinationName
						}
					}
				}
			`,
			{ input: { page: 1, limit: 10, search: {} } },
		);
		expect(listed.getDestinations.list).toContainEqual({
			_id: destinationId,
			destinationName: 'Seoul',
		});
	});

	it('property API: HOTEL agent yaratadi, admin faollashtiradi va public ko\u2018radi', async () => {
		const created = await graphql<{
			createProperty: { _id: string; propertyName: string; propertyStatus: string };
		}>(
			`
				mutation CreateProperty($input: CreatePropertyInput!) {
					createProperty(input: $input) {
						_id
						propertyName
						propertyStatus
					}
				}
			`,
			{
				input: {
					destinationId,
					propertyType: 'HOTEL',
					propertyName: 'Aurora Hotel',
					propertyAddress: '1 Aurora Road',
					pricePerNight: 120,
					currency: 'USD',
					maxGuests: 3,
					propertyImages: ['https://example.com/hotel.jpg'],
				},
			},
			hotelAgentToken,
		);
		propertyId = created.createProperty._id;
		expect(created.createProperty.propertyStatus).toBe('PENDING');

		const activated = await graphql<{
			updatePropertyStatusByAdmin: { _id: string; propertyStatus: string };
		}>(
			`
				mutation ActivateProperty($input: UpdatePropertyStatusInput!) {
					updatePropertyStatusByAdmin(input: $input) {
						_id
						propertyStatus
					}
				}
			`,
			{ input: { _id: propertyId, propertyStatus: 'ACTIVE' } },
			adminToken,
		);
		expect(activated.updatePropertyStatusByAdmin.propertyStatus).toBe('ACTIVE');

		const listed = await graphql<{
			getProperties: { list: Array<{ _id: string; memberId: string; propertyName: string }> };
		}>(
			`
				query Properties($input: PropertiesInquiry!) {
					getProperties(input: $input) {
						list {
							_id
							memberId
							propertyName
						}
					}
				}
			`,
			{ input: { page: 1, limit: 10, search: { destinationId } } },
		);
		expect(listed.getProperties.list).toContainEqual({
			_id: propertyId,
			memberId: hotelAgentId,
			propertyName: 'Aurora Hotel',
		});
	});

	it('tour API: TOUR agent yaratadi, admin faollashtiradi va public ko\u2018radi', async () => {
		const tourStartDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
		const tourEndDate = new Date(Date.now() + 35 * 24 * 60 * 60 * 1000);
		const created = await graphql<{
			createTour: { _id: string; tourName: string; tourStatus: string };
		}>(
			`
				mutation CreateTour($input: TourInput!) {
					createTour(input: $input) {
						_id
						tourName
						tourStatus
					}
				}
			`,
			{
				input: {
					destinationId,
					tourName: 'Aurora Seoul Tour',
					tourDesc: 'Five day city experience',
					tourPrice: 450,
					tourCurrency: 'USD',
					tourStartDate: tourStartDate.toISOString(),
					tourEndDate: tourEndDate.toISOString(),
					tourCapacity: 12,
					tourDepartureCountry: 'South Korea',
					tourDepartureCity: 'Seoul',
					tourDeparturePlace: 'Seoul Station',
					tourDestinationCity: 'Seoul',
					tourImages: [
						'https://example.com/tour-1.jpg',
						'https://example.com/tour-2.jpg',
						'https://example.com/tour-3.jpg',
					],
				},
			},
			tourAgentToken,
		);
		tourId = created.createTour._id;
		expect(created.createTour.tourStatus).toBe('PENDING');

		const activated = await graphql<{
			updateTourStatusByAdmin: { _id: string; tourStatus: string };
		}>(
			`
				mutation ActivateTour($input: UpdateTourStatusInput!) {
					updateTourStatusByAdmin(input: $input) {
						_id
						tourStatus
					}
				}
			`,
			{ input: { _id: tourId, tourStatus: 'ACTIVE' } },
			adminToken,
		);
		expect(activated.updateTourStatusByAdmin.tourStatus).toBe('ACTIVE');

		const listed = await graphql<{
			getTours: { list: Array<{ _id: string; memberId: string; tourName: string }> };
		}>(
			`
				query Tours($input: ToursInquiry!) {
					getTours(input: $input) {
						list {
							_id
							memberId
							tourName
						}
					}
				}
			`,
			{ input: { page: 1, limit: 10, search: { destinationId } } },
		);
		expect(listed.getTours.list).toContainEqual({
			_id: tourId,
			memberId: tourAgentId,
			tourName: 'Aurora Seoul Tour',
		});
	});

	it('booking API: availability va member booking ro\u2018yxati ishlaydi', async () => {
		const checkIn = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
		const checkOut = new Date(Date.now() + 12 * 24 * 60 * 60 * 1000);
		const inserted = await connection.collection('bookings').insertOne({
			memberId: new Types.ObjectId(userId),
			bookingCategory: 'PROPERTY',
			bookingStatus: 'CONFIRMED',
			bookingRefId: new Types.ObjectId(propertyId),
			checkIn,
			checkOut,
			bookingGuests: 2,
			bookingTotalPrice: 240,
			bookingCurrency: 'USD',
			priceSnapshot: { propertyName: 'Aurora Hotel', pricePerNight: 120 },
			createdAt: new Date(),
			updatedAt: new Date(),
		});

		const availability = await graphql<{
			getPropertyAvailability: Array<{ checkIn: string; checkOut: string }>;
		}>(
			`
				query Availability($input: PropertyAvailabilityInquiry!) {
					getPropertyAvailability(input: $input) {
						checkIn
						checkOut
					}
				}
			`,
			{
				input: {
					propertyId,
					startDate: new Date(checkIn.getTime() - 24 * 60 * 60 * 1000).toISOString(),
					endDate: new Date(checkOut.getTime() + 24 * 60 * 60 * 1000).toISOString(),
				},
			},
		);
		expect(availability.getPropertyAvailability).toHaveLength(1);

		const bookings = await graphql<{
			getMyBookings: {
				list: Array<{ _id: string; bookingCategory: string; bookingStatus: string }>;
			};
		}>(
			`
				query MyBookings($input: BookingsInquiry!) {
					getMyBookings(input: $input) {
						list {
							_id
							bookingCategory
							bookingStatus
						}
					}
				}
			`,
			{ input: { page: 1, limit: 10, search: { bookingCategory: 'PROPERTY' } } },
			userToken,
		);
		expect(bookings.getMyBookings.list).toContainEqual({
			_id: inserted.insertedId.toString(),
			bookingCategory: 'PROPERTY',
			bookingStatus: 'CONFIRMED',
		});
	});
});
