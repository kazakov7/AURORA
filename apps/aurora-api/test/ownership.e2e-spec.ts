import { INestApplication } from '@nestjs/common';
import { DestinationStatus } from '../src/libs/enums/destination';
import { MemberType } from '../src/libs/enums/member.enum';
import { clearDatabase, createTestApp, graphQL, model, seedMember } from './helpers/e2e.helper';

/** Another member's ids are known or guessable, so every write checks the owner on the server **/
describe('Ownership across members (e2e)', () => {
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

	it("never lets a member change or read another member's records", async () => {
		const owner = await seedMember(app, 'recordowner');
		const intruder = await seedMember(app, 'intruder');
		const friend = await seedMember(app, 'ownerfriend');
		const agent = await seedMember(app, 'ownershost', MemberType.AGENT);
		const city = await model(app, 'Destination').create({
			destinationName: 'Ownership City',
			destinationSlug: 'ownership-city',
			destinationCountry: 'OC',
			destinationStatus: DestinationStatus.ACTIVE,
		});
		const property = await model(app, 'Property').create({
			memberId: agent._id,
			destinationId: city._id,
			propertyType: 'HOTEL',
			propertyStatus: 'ACTIVE',
			propertyName: 'Ownership Hotel',
			propertyAddress: 'Main street',
			pricePerNight: 100,
			currency: 'USD',
			maxGuests: 2,
		});
		const booking = await model(app, 'Booking').create({
			memberId: owner._id,
			bookingCategory: 'PROPERTY',
			bookingStatus: 'CONFIRMED',
			bookingRefId: property._id,
			checkIn: new Date(Date.now() + 30 * 86_400_000),
			checkOut: new Date(Date.now() + 32 * 86_400_000),
			bookingGuests: 1,
			bookingTotalPrice: 200,
			bookingCurrency: 'USD',
			priceSnapshot: { nights: 2 },
		});
		const notification = await model(app, 'Notification').create({
			receiverId: owner._id,
			notificationType: 'SYSTEM',
			notificationGroup: 'SYSTEM',
			notificationTitle: 'For the owner only',
			notificationStatus: 'WAIT',
		});
		const as = async (token: string, query: string, variables: object = {}) =>
			(await graphQL(app, query, variables, token)).body;
		const comment = (
			await as(
				owner.accessToken,
				`mutation C($input: CommentInput!) { createComment(input: $input) { _id } }`,
				{
					input: {
						commentGroup: 'DESTINATION',
						commentRefId: String(city._id),
						commentContent: 'Mine',
					},
				},
			)
		).data.createComment._id;
		const review = (
			await as(
				owner.accessToken,
				`mutation R($input: DestinationReviewInput!) { createDestinationReview(input: $input) { _id } }`,
				{ input: { destinationId: String(city._id), reviewRating: 5, reviewContent: 'Mine' } },
			)
		).data.createDestinationReview._id;
		const article = (
			await as(
				owner.accessToken,
				`mutation A($input: BoardArticleInput!) { createBoardArticle(input: $input) { _id } }`,
				{ input: { articleCategory: 'NEWS', articleTitle: 'Mine', articleContent: 'Owner story' } },
			)
		).data.createBoardArticle._id;
		const chat = (
			await as(
				owner.accessToken,
				`mutation D($id: String!) { getOrCreateDirectChat(memberTwoId: $id) { _id } }`,
				{
					id: friend._id,
				},
			)
		).data.getOrCreateDirectChat._id;
		const ticket = (
			await as(
				owner.accessToken,
				`mutation T($input: SupportTicketInput!) { createSupportTicket(input: $input) { _id } }`,
				{
					input: {
						ticketCategory: 'BOOKING',
						ticketName: 'Record Owner',
						ticketEmail: 'owner@example.com',
						ticketSubject: 'Private',
						ticketMessage: 'Only the owner reads this.',
					},
				},
			)
		).data.createSupportTicket._id;

		const attempts: [string, object][] = [
			[`mutation { cancelBooking(bookingId: "${booking._id}") { _id } }`, {}],
			[
				`mutation { updateComment(input: { _id: "${comment}", commentContent: "Hijacked" }) { _id } }`,
				{},
			],
			[
				`mutation { updateDestinationReview(input: { _id: "${review}", reviewContent: "Hijacked" }) { _id } }`,
				{},
			],
			[`mutation { removeDestinationReview(reviewId: "${review}") { _id } }`, {}],
			[
				`mutation { updateBoardArticle(input: { _id: "${article}", articleTitle: "Hijacked" }) { _id } }`,
				{},
			],
			[`mutation { deleteMyChat(chatId: "${chat}") }`, {}],
			[`mutation { markChatAsRead(chatId: "${chat}") { _id } }`, {}],
			[`query { getMessages(input: { chatId: "${chat}", limit: 10 }) { list { _id } } }`, {}],
			[
				`mutation { markNotificationAsRead(input: { notificationId: "${notification._id}" }) { _id } }`,
				{},
			],
		];
		for (const [query, variables] of attempts) {
			const result = await as(intruder.accessToken, query, variables);
			expect([query, result.errors?.[0].extensions.code]).toEqual([
				query,
				expect.stringMatching(/^(BAD_REQUEST|FORBIDDEN|NOT_FOUND)$/),
			]);
		}
		const tickets = await as(
			intruder.accessToken,
			`query { getMySupportTickets(input: { page: 1, limit: 50 }) { list { _id } } }`,
		);
		expect(tickets.data.getMySupportTickets.list).toEqual([]);

		expect((await model(app, 'Booking').findById(booking._id).lean()).bookingStatus).toBe(
			'CONFIRMED',
		);
		expect((await model(app, 'Comment').findById(comment).lean()).commentContent).toBe('Mine');
		const storedReview = await model(app, 'Review').findById(review).lean();
		expect([storedReview.reviewContent, storedReview.reviewStatus]).toEqual(['Mine', 'ACTIVE']);
		expect((await model(app, 'BoardArticle').findById(article).lean()).articleTitle).toBe('Mine');
		expect(await model(app, 'Chat').exists({ _id: chat })).toBeTruthy();
		expect(
			(await model(app, 'Notification').findById(notification._id).lean()).notificationStatus,
		).toBe('WAIT');
		expect(await model(app, 'SupportTicket').exists({ _id: ticket })).toBeTruthy();
	});
});
