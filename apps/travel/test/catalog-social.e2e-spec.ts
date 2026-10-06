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
			{ input: { destinationName: 'South Korea', destinationCountry: 'KR', destinationDesc: 'Travel Korea' } },
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
			currency: 'KRW',
			maxGuests: 2,
		};
		const createMutation = `mutation Create($input: CreatePropertyInput!) {
			createProperty(input: $input) { _id propertyName propertyStatus memberId }
		}`;
		const wrongType = await graphQL(app, createMutation, { input: propertyInput }, tourAgent.accessToken);
		expect(wrongType.body.errors?.[0].message).toContain('not verified');

		const created = await graphQL(app, createMutation, { input: propertyInput }, hotelAgent.accessToken);
		expect(created.body.errors).toBeUndefined();
		expect(created.body.data.createProperty.propertyStatus).toBe('PENDING');
		expect((await model(app, 'Destination').findById(destination._id).lean()).destinationProperties).toBe(1);
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
			destinationName: 'Thailand', destinationSlug: 'thailand', destinationCountry: 'TH', destinationStatus: 'ACTIVE',
		});
		const input = {
			destinationId: destination._id.toString(),
			tourName: 'Bangkok Tour',
			tourSlug: 'bangkok-tour',
			tourPrice: 50000,
			tourCurrency: 'KRW',
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
			destinationName: 'Vietnam', destinationSlug: 'vietnam', destinationCountry: 'VN', destinationStatus: 'ACTIVE',
		});

		const detailQuery = `query Detail($id: String!) { getDestination(destinationId: $id) { _id destinationViews } }`;
		await graphQL(app, detailQuery, { id: destination._id.toString() }, user.accessToken);
		await graphQL(app, detailQuery, { id: destination._id.toString() }, user.accessToken);
		expect(await model(app, 'View').countDocuments({ memberId: user._id, viewRefId: destination._id })).toBe(1);

		const like = await graphQL(
			app,
			`mutation Like($id: String!) { likeTargetDestination(destinationId: $id) { _id destinationLikes } }`,
			{ id: destination._id.toString() },
			user.accessToken,
		);
		expect(like.body.errors).toBeUndefined();
		expect(await model(app, 'Like').countDocuments({ memberId: user._id, likeRefId: destination._id })).toBe(1);

		const comment = await graphQL(
			app,
			`mutation Comment($input: CommentInput!) { createComment(input: $input) { _id commentContent } }`,
			{ input: { commentGroup: 'DESTINATION', commentContent: 'Beautiful country', commentRefId: destination._id.toString() } },
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
			{ input: { destinationId: destination._id.toString(), reviewRating: 5, reviewContent: 'Excellent' } },
			user.accessToken,
		);
		expect(review.body.errors).toBeUndefined();
		expect(await model(app, 'Review').countDocuments({ memberId: user._id })).toBe(1);
	});
});
