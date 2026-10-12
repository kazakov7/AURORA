import { INestApplication } from '@nestjs/common';
import { AgentType, AgentVerificationStatus } from '../src/libs/enums/agent.enum';
import { DestinationStatus } from '../src/libs/enums/destination';
import { MemberType } from '../src/libs/enums/member.enum';
import { PropertyStatus } from '../src/libs/enums/property.enum';
import { clearDatabase, createTestApp, graphQL, model, seedMember } from './helpers/e2e.helper';

describe('Catalog and social domains (e2e)', () => {
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

	async function approvedAgent(nick: string, agentType: AgentType) {
		const member = await seedMember(app, nick, MemberType.AGENT);
		await model(app, 'Agent').create({
			memberId: member._id,
			agentType,
			companyName: `${nick} company`,
			businessNumber: `${nick}-business`,
			companyAddress: 'Seoul',
			verificationStatus: AgentVerificationStatus.APPROVED,
			verifiedAt: new Date(),
		});
		return member;
	}

	it('runs destination admin CRUD and active catalog authorization', async () => {
		const admin = await seedMember(app, 'destadmin', MemberType.ADMIN);
		const user = await seedMember(app, 'destuser');
		const create = await graphQL(
			app,
			`mutation Create($input: DestinationInput!) {
				createDestination(input: $input) { _id destinationName destinationStatus }
			}`,
			{
				input: {
					destinationName: 'South Korea',
					destinationCountry: 'KR',
					destinationDesc: 'Travel Korea',
				},
			},
			admin.accessToken,
		);
		expect(create.body.errors).toBeUndefined();
		const destinationId = create.body.data.createDestination._id;

		const forbidden = await graphQL(
			app,
			`mutation Update($input: DestinationUpdate!) { updateDestinationByAdmin(input: $input) { _id } }`,
			{ input: { _id: destinationId, destinationStatus: 'ACTIVE' } },
			user.accessToken,
		);
		expect(forbidden.body.errors).toBeDefined();

		const activate = await graphQL(
			app,
			`mutation Update($input: DestinationUpdate!) {
				updateDestinationByAdmin(input: $input) { _id destinationStatus destinationName }
			}`,
			{ input: { _id: destinationId, destinationStatus: 'ACTIVE', destinationName: 'Korea' } },
			admin.accessToken,
		);
		expect(activate.body.errors).toBeUndefined();

		const catalog = await graphQL(
			app,
			`query List($input: DestinationsInquiry!) {
				getDestinations(input: $input) { list { _id destinationName destinationStatus } metaCounter { total } }
			}`,
			{ input: { page: 1, limit: 10, search: {} } },
		);
		expect(catalog.body.errors).toBeUndefined();
		expect(catalog.body.data.getDestinations.list).toHaveLength(1);

		await graphQL(
			app,
			`mutation Update($input: DestinationUpdate!) { updateDestinationByAdmin(input: $input) { _id } }`,
			{ input: { _id: destinationId, destinationStatus: 'INACTIVE' } },
			admin.accessToken,
		);
		const removed = await graphQL(
			app,
			`mutation Remove($id: String!) { removeDestinationByAdmin(destinationId: $id) }`,
			{ id: destinationId },
			admin.accessToken,
		);
		expect(removed.body.errors).toBeUndefined();
		expect(await model(app, 'Destination').findById(destinationId)).toBeNull();
	});

	it('enforces HOTEL agent type and property ownership', async () => {
		const hotelAgent = await approvedAgent('hotelone', AgentType.HOTEL);
		const otherHotel = await approvedAgent('hoteltwo', AgentType.HOTEL);
		const tourAgent = await approvedAgent('touronly', AgentType.TOUR);
		const destination = await model(app, 'Destination').create({
			destinationName: 'Japan',
			destinationSlug: 'japan',
			destinationCountry: 'JP',
			destinationStatus: DestinationStatus.ACTIVE,
		});
		const propertyInput = {
			destinationId: destination._id.toString(),
			propertyType: 'HOTEL',
			propertyName: 'Aura Hotel',
			propertyAddress: 'Tokyo',
			propertyCity: 'Tokyo',
			pricePerNight: 100000,
			currency: 'USD',
			maxGuests: 2,
		};
		const createMutation = `mutation Create($input: CreatePropertyInput!) {
			createProperty(input: $input) { _id propertyName propertyStatus memberId }
		}`;
		const wrongType = await graphQL(
			app,
			createMutation,
			{ input: propertyInput },
			tourAgent.accessToken,
		);
		expect(wrongType.body.errors?.[0].message).toContain('not verified');

		const created = await graphQL(
			app,
			createMutation,
			{ input: propertyInput },
			hotelAgent.accessToken,
		);
		expect(created.body.errors).toBeUndefined();
		expect(created.body.data.createProperty.propertyStatus).toBe('PENDING');
		expect(
			(await model(app, 'Destination').findById(destination._id).lean()).destinationProperties,
		).toBe(0);
		const propertyId = created.body.data.createProperty._id;

		const ownershipViolation = await graphQL(
			app,
			`mutation Update($input: UpdatePropertyInput!) { updateProperty(input: $input) { _id propertyName } }`,
			{ input: { _id: propertyId, propertyName: 'Stolen Hotel' } },
			otherHotel.accessToken,
		);
		expect(ownershipViolation.body.errors).toBeDefined();

		const updated = await graphQL(
			app,
			`mutation Update($input: UpdatePropertyInput!) { updateProperty(input: $input) { _id propertyName } }`,
			{ input: { _id: propertyId, propertyName: 'Aura Grand Hotel' } },
			hotelAgent.accessToken,
		);
		expect(updated.body.errors).toBeUndefined();
		expect(updated.body.data.updateProperty.propertyName).toBe('Aura Grand Hotel');
	});

	it('runs Tour GraphQL create/update with dates, type restriction and ownership', async () => {
		const tourAgent = await approvedAgent('toursvc1', AgentType.TOUR);
		const otherTour = await approvedAgent('toursvc2', AgentType.TOUR);
		const hotelAgent = await approvedAgent('hotelsvc', AgentType.HOTEL);
		const destination = await model(app, 'Destination').create({
			destinationName: 'Thailand',
			destinationSlug: 'thailand',
			destinationCountry: 'TH',
			destinationStatus: 'ACTIVE',
		});
		const input = {
			destinationId: destination._id.toString(),
			tourName: 'Bangkok Tour',
			tourPrice: 50000,
			tourCurrency: 'USD',
			tourStartDate: new Date(Date.now() + 86_400_000),
			tourEndDate: new Date(Date.now() + 172_800_000),
			tourCapacity: 10,
		};
		const createMutation = `mutation Create($input: TourInput!) {
			createTour(input: $input) { _id tourName tourStatus tourStartDate tourEndDate }
		}`;
		const wrongType = await graphQL(app, createMutation, { input }, hotelAgent.accessToken);
		expect(wrongType.body.errors?.[0].message).toContain('not verified');

		const created = await graphQL(app, createMutation, { input }, tourAgent.accessToken);
		expect(created.body.errors).toBeUndefined();
		expect(created.body.data.createTour.tourStatus).toBe('PENDING');
		const tourId = created.body.data.createTour._id;

		const ownershipViolation = await graphQL(
			app,
			`mutation Update($input: TourUpdateInput!) { updateTour(input: $input) { _id tourName } }`,
			{ input: { _id: tourId, tourName: 'Stolen Tour' } },
			otherTour.accessToken,
		);
		expect(ownershipViolation.body.errors).toBeDefined();

		const updated = await graphQL(
			app,
			`mutation Update($input: TourUpdateInput!) { updateTour(input: $input) { _id tourName } }`,
			{ input: { _id: tourId, tourName: 'Aura Bangkok' } },
			tourAgent.accessToken,
		);
		expect(updated.body.errors).toBeUndefined();
		expect(updated.body.data.updateTour.tourName).toBe('Aura Bangkok');
	});

	it('persists like, unique view, comment, follow and destination review', async () => {
		const user = await seedMember(app, 'socialone');
		const target = await seedMember(app, 'socialtwo');
		const destination = await model(app, 'Destination').create({
			destinationName: 'Vietnam',
			destinationSlug: 'vietnam',
			destinationCountry: 'VN',
			destinationStatus: 'ACTIVE',
		});

		const detailQuery = `query Detail($id: String!) { getDestination(destinationId: $id) { _id destinationViews } }`;
		await graphQL(app, detailQuery, { id: destination._id.toString() }, user.accessToken);
		await graphQL(app, detailQuery, { id: destination._id.toString() }, user.accessToken);
		expect(
			await model(app, 'View').countDocuments({ memberId: user._id, viewRefId: destination._id }),
		).toBe(1);

		const like = await graphQL(
			app,
			`mutation Like($id: String!) { likeTargetDestination(destinationId: $id) { _id destinationLikes } }`,
			{ id: destination._id.toString() },
			user.accessToken,
		);
		expect(like.body.errors).toBeUndefined();
		expect(
			await model(app, 'Like').countDocuments({ memberId: user._id, likeRefId: destination._id }),
		).toBe(1);

		const comment = await graphQL(
			app,
			`mutation Comment($input: CommentInput!) { createComment(input: $input) { _id commentContent } }`,
			{
				input: {
					commentGroup: 'DESTINATION',
					commentContent: 'Beautiful country',
					commentRefId: destination._id.toString(),
				},
			},
			user.accessToken,
		);
		expect(comment.body.errors).toBeUndefined();

		const follow = await graphQL(
			app,
			`mutation Follow($id: String!) { subscribe(input: $id) { _id followingId followerId } }`,
			{ id: target._id },
			user.accessToken,
		);
		expect(follow.body.errors).toBeUndefined();

		const review = await graphQL(
			app,
			`mutation Review($input: DestinationReviewInput!) {
				createDestinationReview(input: $input) { _id reviewRating reviewContent }
			}`,
			{
				input: {
					destinationId: destination._id.toString(),
					reviewRating: 5,
					reviewContent: 'Excellent',
				},
			},
			user.accessToken,
		);
		expect(review.body.errors).toBeUndefined();
		expect(await model(app, 'Review').countDocuments({ memberId: user._id })).toBe(1);
	});

	it('returns refreshed property-like and host-follow state from the hotel detail query', async () => {
		const viewer = await seedMember(app, 'hotelviewer');
		const host = await seedMember(app, 'hotelhost', MemberType.AGENT);
		const destination = await model(app, 'Destination').create({
			destinationName: 'Singapore',
			destinationSlug: 'singapore',
			destinationCountry: 'SG',
			destinationStatus: DestinationStatus.ACTIVE,
		});
		const property = await model(app, 'Property').create({
			memberId: host._id,
			destinationId: destination._id,
			propertyType: 'HOTEL',
			propertyStatus: PropertyStatus.ACTIVE,
			propertyName: 'Aurora Singapore Hotel',
			propertyAddress: 'Marina Bay',
			pricePerNight: 180000,
			currency: 'USD',
			maxGuests: 2,
		});
		const detailQuery = `query HotelDetail($id: String!) {
			getProperty(propertyId: $id) {
				_id propertyLikes meLiked { myFavorite }
				memberData { memberNick meFollowed { myFollowing } }
			}
		}`;

		const initial = await graphQL(
			app,
			detailQuery,
			{ id: property._id.toString() },
			viewer.accessToken,
		);
		expect(initial.body.errors).toBeUndefined();
		expect(initial.body.data.getProperty.meLiked).toEqual([]);
		expect(initial.body.data.getProperty.memberData.meFollowed).toEqual([]);

		const liked = await graphQL(
			app,
			`mutation LikeHotel($id: String!) { likeTargetProperty(propertyId: $id) { _id propertyLikes } }`,
			{ id: property._id.toString() },
			viewer.accessToken,
		);
		expect(liked.body.errors).toBeUndefined();

		const followed = await graphQL(
			app,
			`mutation FollowHost($id: String!) { subscribe(input: $id) { _id } }`,
			{ id: host._id },
			viewer.accessToken,
		);
		expect(followed.body.errors).toBeUndefined();

		const refreshed = await graphQL(
			app,
			detailQuery,
			{ id: property._id.toString() },
			viewer.accessToken,
		);
		expect(refreshed.body.errors).toBeUndefined();
		expect(refreshed.body.data.getProperty.propertyLikes).toBe(1);
		expect(refreshed.body.data.getProperty.meLiked).toEqual([
			expect.objectContaining({ myFavorite: true }),
		]);
		expect(refreshed.body.data.getProperty.memberData.meFollowed).toEqual([
			expect.objectContaining({ myFollowing: true }),
		]);
		expect((await model(app, 'Member').findById(host._id).lean()).memberViews).toBe(0);
	});

	it('returns persisted like/follow state for the viewer in home rankings', async () => {
		const owner = await seedMember(app, 'rankowner');
		const viewer = await seedMember(app, 'rankviewer');
		const destination = await model(app, 'Destination').create({
			destinationName: 'Japan',
			destinationSlug: 'japan',
			destinationCountry: 'JP',
			destinationStatus: DestinationStatus.ACTIVE,
		});
		const property = await model(app, 'Property').create({
			memberId: owner._id,
			destinationId: destination._id,
			propertyType: 'HOTEL',
			propertyStatus: PropertyStatus.ACTIVE,
			propertyName: 'Kyoto Aura',
			propertyAddress: 'Kyoto',
			pricePerNight: 150000,
			currency: 'USD',
			maxGuests: 2,
		});
		const publication = await model(app, 'RankingPublication').create({
			isActive: true,
			publishedAt: new Date(),
			calculatedAt: new Date(),
			snapshotCount: 2,
		});
		const snapshot = (rankingType: string, entityId: unknown) => ({
			publicationId: publication._id,
			rankingType,
			scope: 'GLOBAL',
			periodDays: 30,
			calculatedAt: new Date(),
			entries: [{ entityId, score: 1 }],
		});
		await model(app, 'RankingSnapshot').create([
			snapshot('TOP_PROPERTIES', property._id),
			snapshot('TOP_TRAVELERS', owner._id),
		]);

		const liked = await graphQL(
			app,
			`mutation Like($propertyId: String!) { likeTargetProperty(propertyId: $propertyId) { _id } }`,
			{ propertyId: property._id.toString() },
			viewer.accessToken,
		);
		expect(liked.body.errors).toBeUndefined();
		const followed = await graphQL(
			app,
			`mutation Follow($input: String!) { subscribe(input: $input) { _id } }`,
			{ input: owner._id },
			viewer.accessToken,
		);
		expect(followed.body.errors).toBeUndefined();

		const rankingQuery = `query Home($input: RankingInquiry) {
			getTopProperties(input: $input) { list { _id meLiked { myFavorite } } }
			getTopTravelers(input: $input) { list { _id meFollowed { myFollowing } } }
		}`;
		const authed = await graphQL(app, rankingQuery, { input: { limit: 4 } }, viewer.accessToken);
		expect(authed.body.errors).toBeUndefined();
		expect(authed.body.data.getTopProperties.list[0].meLiked).toEqual([{ myFavorite: true }]);
		expect(authed.body.data.getTopTravelers.list[0].meFollowed).toEqual([{ myFollowing: true }]);

		const guest = await graphQL(app, rankingQuery, { input: { limit: 4 } });
		expect(guest.body.errors).toBeUndefined();
		expect(guest.body.data.getTopProperties.list[0].meLiked).toBeNull();
	});

	it('returns destination hotels when a destination ranking snapshot has not been published yet', async () => {
		const owner = await seedMember(app, 'destinationrankowner');
		const destination = await model(app, 'Destination').create({
			destinationName: 'Fallback City',
			destinationSlug: 'fallback-city',
			destinationCountry: 'US',
			destinationStatus: DestinationStatus.ACTIVE,
		});
		const property = await model(app, 'Property').create({
			memberId: owner._id,
			destinationId: destination._id,
			propertyType: 'HOTEL',
			propertyStatus: PropertyStatus.ACTIVE,
			propertyName: 'Fallback Hotel',
			propertyAddress: 'Fallback City',
			pricePerNight: 150,
			currency: 'USD',
			maxGuests: 2,
			propertyRating: 4.8,
			propertyBookings: 12,
			propertyViews: 80,
		});

		const result = await graphQL(
			app,
			`query TopProperties($input: RankingInquiry) { getTopProperties(input: $input) { list { _id destinationId } metaCounter { total } } }`,
			{ input: { destinationId: destination._id.toString(), limit: 4 } },
		);

		expect(result.body.errors).toBeUndefined();
		expect(result.body.data.getTopProperties.list).toEqual([
			{ _id: property._id.toString(), destinationId: destination._id.toString() },
		]);
		expect(result.body.data.getTopProperties.metaCounter).toEqual([{ total: 1 }]);
	});
});
