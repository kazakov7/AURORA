import { INestApplication } from '@nestjs/common';
import { Messages } from '../src/libs/enums/common.enum';
import { clearDatabase, createTestApp, graphQL, model, seedMember } from './helpers/e2e.helper';

describe('One-time ratings (e2e)', () => {
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

	/** Hotels and tours are rated only after a completed stay or tour **/
	async function completedStay(memberId: string, bookingCategory: string, bookingRefId: unknown) {
		await model(app, 'Booking').create({
			memberId,
			bookingCategory,
			bookingStatus: 'COMPLETED',
			bookingRefId,
			bookingGuests: 1,
			bookingTotalPrice: 100,
			bookingCurrency: 'USD',
			priceSnapshot: {},
		});
	}

	it('accepts one rating per user and target while comments remain unlimited', async () => {
		const user = await seedMember(app, 'ratinguser');
		const owner = await seedMember(app, 'ratingowner');
		const destination = await model(app, 'Destination').create({
			destinationName: 'Rating Country',
			destinationSlug: 'rating-country',
			destinationCountry: 'RC',
			destinationStatus: 'ACTIVE',
		});
		const property = await model(app, 'Property').create({
			memberId: owner._id,
			destinationId: destination._id,
			propertyType: 'HOTEL',
			propertyStatus: 'ACTIVE',
			propertyName: 'Rating Hotel',
			propertyAddress: 'Seoul',
			pricePerNight: 100000,
			currency: 'USD',
			maxGuests: 2,
		});

		const submitRating = `mutation SubmitRating($input: RatingInput!) {
			submitRating(input: $input) { _id reviewGroup reviewRefId reviewRating }
		}`;
		const variables = {
			input: { reviewGroup: 'PROPERTY', reviewRefId: property._id.toString(), reviewRating: 4 },
		};
		const withoutStay = await graphQL(app, submitRating, variables, user.accessToken);
		expect(withoutStay.body.errors?.[0].message).toBe(Messages.RATING_REQUIRES_STAY);

		await completedStay(user._id, 'PROPERTY', property._id);
		const first = await graphQL(app, submitRating, variables, user.accessToken);
		expect(first.body.errors).toBeUndefined();
		expect(first.body.data.submitRating.reviewRating).toBe(4);

		const duplicate = await graphQL(
			app,
			submitRating,
			{ input: { ...variables.input, reviewRating: 5 } },
			user.accessToken,
		);
		expect(duplicate.body.errors?.[0].message).toBe('You have already rated this item!');

		for (const commentContent of ['First review', 'Second review']) {
			const comment = await graphQL(
				app,
				`mutation Comment($input: CommentInput!) { createComment(input: $input) { _id } }`,
				{
					input: {
						commentGroup: 'PROPERTY',
						commentRefId: property._id.toString(),
						commentContent,
					},
				},
				user.accessToken,
			);
			expect(comment.body.errors).toBeUndefined();
		}

		const stored = await model(app, 'Property').findById(property._id).lean();
		expect(stored.propertyRating).toBe(4);
		expect(stored.propertyReviews).toBe(1);
		expect(stored.propertyComments).toBe(2);

		const mine = await graphQL(
			app,
			`query MyRating($reviewGroup: ReviewGroup!, $reviewRefId: String!) {
				getMyRating(reviewGroup: $reviewGroup, reviewRefId: $reviewRefId) { reviewRating }
			}`,
			{ reviewGroup: 'PROPERTY', reviewRefId: property._id.toString() },
			user.accessToken,
		);
		expect(mine.body.errors).toBeUndefined();
		expect(mine.body.data.getMyRating.reviewRating).toBe(4);
	});

	it.each([
		['TOUR', 'Tour', 'tourRating', 'tourReviews'],
		['ARTICLE', 'BoardArticle', 'articleRating', 'articleReviews'],
	] as const)(
		'stores one %s rating and refreshes its aggregate',
		async (group, modelName, ratingField, countField) => {
			const user = await seedMember(app, `rate${group.toLowerCase()}`.slice(0, 12));
			const owner = await seedMember(app, `owner${group.toLowerCase()}`.slice(0, 12));
			const destination = await model(app, 'Destination').create({
				destinationName: `${group} Country`,
				destinationSlug: `${group.toLowerCase()}-country`,
				destinationCountry: group.slice(0, 2),
				destinationStatus: 'ACTIVE',
			});
			const target =
				group === 'TOUR'
					? await model(app, modelName).create({
							memberId: owner._id,
							destinationId: destination._id,
							tourName: 'Rating Tour',
							tourStatus: 'ACTIVE',
							tourPrice: 50000,
							tourCurrency: 'USD',
							tourStartDate: new Date(Date.now() + 86_400_000),
							tourEndDate: new Date(Date.now() + 172_800_000),
							tourCapacity: 10,
						})
					: await model(app, modelName).create({
							memberId: owner._id,
							articleCategory: 'GUIDE',
							articleStatus: 'PUBLISHED',
							articleTitle: 'Rating Article',
							articleContent: 'A detailed travel article.',
						});

			if (group === 'TOUR') await completedStay(user._id, 'TOUR', target._id);
			const result = await graphQL(
				app,
				`mutation SubmitRating($input: RatingInput!) { submitRating(input: $input) { reviewRating } }`,
				{ input: { reviewGroup: group, reviewRefId: target._id.toString(), reviewRating: 5 } },
				user.accessToken,
			);
			expect(result.body.errors).toBeUndefined();
			const stored = await model(app, modelName).findById(target._id).lean();
			expect(stored[ratingField]).toBe(5);
			expect(stored[countField]).toBe(1);
		},
	);

	it('does not let a host rate their own hotel or tour, even with a completed stay', async () => {
		const owner = await seedMember(app, 'selfrater');
		const destination = await model(app, 'Destination').create({
			destinationName: 'Self Country',
			destinationSlug: 'self-country',
			destinationCountry: 'SC',
			destinationStatus: 'ACTIVE',
		});
		const property = await model(app, 'Property').create({
			memberId: owner._id,
			destinationId: destination._id,
			propertyType: 'HOTEL',
			propertyStatus: 'ACTIVE',
			propertyName: 'Own Hotel',
			propertyAddress: 'Seoul',
			pricePerNight: 100,
			currency: 'USD',
			maxGuests: 2,
		});
		const tour = await model(app, 'Tour').create({
			memberId: owner._id,
			destinationId: destination._id,
			tourName: 'Own Tour',
			tourStatus: 'ACTIVE',
			tourPrice: 100,
			tourCurrency: 'USD',
			tourStartDate: new Date(Date.now() + 86_400_000),
			tourEndDate: new Date(Date.now() + 172_800_000),
			tourCapacity: 10,
		});

		for (const [group, target] of [
			['PROPERTY', property],
			['TOUR', tour],
		] as const) {
			await completedStay(owner._id, group, target._id);
			const result = await graphQL(
				app,
				`mutation SubmitRating($input: RatingInput!) { submitRating(input: $input) { _id } }`,
				{ input: { reviewGroup: group, reviewRefId: target._id.toString(), reviewRating: 5 } },
				owner.accessToken,
			);
			expect(result.body.errors?.[0].message).toBe(Messages.REVIEW_NOT_ALLOWED);
		}
		expect(await model(app, 'Review').countDocuments({})).toBe(0);
	});

	it('shows the guest their own rating on the completed booking', async () => {
		const guest = await seedMember(app, 'ratedguest');
		const other = await seedMember(app, 'otherguest');
		const owner = await seedMember(app, 'ratedowner');
		const destination = await model(app, 'Destination').create({
			destinationName: 'Booking Rating Country',
			destinationSlug: 'booking-rating-country',
			destinationCountry: 'BR',
			destinationStatus: 'ACTIVE',
		});
		const property = await model(app, 'Property').create({
			memberId: owner._id,
			destinationId: destination._id,
			propertyType: 'HOTEL',
			propertyStatus: 'ACTIVE',
			propertyName: 'Rated Stay Hotel',
			propertyAddress: 'Jeju',
			pricePerNight: 100000,
			currency: 'USD',
			maxGuests: 2,
		});
		await completedStay(guest._id, 'PROPERTY', property._id);
		await completedStay(other._id, 'PROPERTY', property._id);
		const rate = async (token: string, reviewRating: number) => {
			const result = await graphQL(
				app,
				`mutation SubmitRating($input: RatingInput!) { submitRating(input: $input) { _id } }`,
				{ input: { reviewGroup: 'PROPERTY', reviewRefId: property._id.toString(), reviewRating } },
				token,
			);
			expect(result.body.errors).toBeUndefined();
		};
		const ratingsOnMyBookings = async () =>
			(
				await graphQL(
					app,
					`query Mine($input: BookingsInquiry!) {
						getMyBookings(input: $input) { list { ratingData { reviewRating } } }
					}`,
					{ input: { page: 1, limit: 10 } },
					guest.accessToken,
				)
			).body.data.getMyBookings.list.map((booking: any) => booking.ratingData);

		// Another guest's rating of the same hotel is not the guest's own
		await rate(other.accessToken, 2);
		expect(await ratingsOnMyBookings()).toEqual([null]);

		await rate(guest.accessToken, 5);
		expect(await ratingsOnMyBookings()).toEqual([{ reviewRating: 5 }]);
	});
});
