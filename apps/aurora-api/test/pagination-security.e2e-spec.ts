import { INestApplication } from '@nestjs/common';
import { Types } from 'mongoose';
import { MemberStatus, MemberType } from '../src/libs/enums/member.enum';
import { clearDatabase, createTestApp, graphQL, model, seedMember } from './helpers/e2e.helper';

describe('Pagination security (e2e)', () => {
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

	const membersQuery = `query Members($input: MembersInquiry!) {
		getAllMembers(input: $input) { list { _id } metaCounter { total } }
	}`;

	it.each([1, 20, 100])(
		'accepts the standard limit boundary %i and preserves metadata',
		async (limit) => {
			await model(app, 'Member').create([
				{ memberNick: 'pageone', memberStatus: MemberStatus.ACTIVE, memberType: MemberType.USER },
				{ memberNick: 'pagetwo', memberStatus: MemberStatus.ACTIVE, memberType: MemberType.USER },
				{ memberNick: 'pagethree', memberStatus: MemberStatus.ACTIVE, memberType: MemberType.USER },
			]);

			const result = await graphQL(app, membersQuery, { input: { page: 1, limit } });

			expect(result.body.errors).toBeUndefined();
			expect(result.body.data.getAllMembers.list).toHaveLength(Math.min(limit, 3));
			expect(result.body.data.getAllMembers.metaCounter).toEqual([{ total: 3 }]);
		},
	);

	it.each([0, -1, 101, 500000])('rejects an unsafe standard limit %i', async (limit) => {
		const result = await graphQL(app, membersQuery, { input: { page: 1, limit } });

		expect(result.body.errors).toBeDefined();
		expect(result.body.data).toBeNull();
	});

	it.each([0, -1])(
		'rejects an invalid page %i before calculating a negative skip',
		async (page) => {
			const result = await graphQL(app, membersQuery, { input: { page, limit: 20 } });

			expect(result.body.errors).toBeDefined();
			expect(result.body.data).toBeNull();
		},
	);

	it('rejects a non-integer GraphQL page value', async () => {
		const result = await graphQL(app, membersQuery, { input: { page: 1.5, limit: 20 } });

		expect(result.body.errors).toBeDefined();
		expect(result.body.data).toBeUndefined();
	});

	it('enforces the maximum at the Property and Tour public query boundaries', async () => {
		const propertyResult = await graphQL(
			app,
			`query Properties($input: PropertiesInquiry!) {
				getProperties(input: $input) { list { _id } metaCounter { total } }
			}`,
			{ input: { page: 1, limit: 101, search: {} } },
		);
		const tourResult = await graphQL(
			app,
			`query Tours($input: ToursInquiry!) {
				getTours(input: $input) { list { _id } metaCounter { total } }
			}`,
			{ input: { page: 1, limit: 101, search: {} } },
		);

		expect(propertyResult.body.errors).toBeDefined();
		expect(tourResult.body.errors).toBeDefined();
	});

	it('enforces the maximum at Like, Chat and Booking authenticated query boundaries', async () => {
		const member = await seedMember(app, 'pageviewer');
		const cases = [
			{
				query: `query Favorites($input: OrdinaryInquery!) {
					getFavorites(input: $input) { list { _id } metaCounter { total } }
				}`,
				input: { page: 1, limit: 101 },
			},
			{
				query: `query Chats($input: ChatsInquiry!) {
					getMyChats(input: $input) { list { _id } metaCounter { total } }
				}`,
				input: { page: 1, limit: 101 },
			},
			{
				query: `query Bookings($input: BookingsInquiry!) {
					getMyBookings(input: $input) { list { _id } metaCounter { total } }
				}`,
				input: { page: 1, limit: 101 },
			},
		];

		for (const testCase of cases) {
			const result = await graphQL(
				app,
				testCase.query,
				{ input: testCase.input },
				member.accessToken,
			);
			expect(result.body.errors).toBeDefined();
			expect(result.body.errors[0].extensions.code).toBe('BAD_REQUEST');
		}
	});

	it('answers client mistakes with a client error, not a server error', async () => {
		const member = await seedMember(app, 'mistaken');
		const peerOne = await seedMember(app, 'peerone');
		const peerTwo = await seedMember(app, 'peertwo');
		const MESSAGES = `query M($input: MessagesCursorInquiry!) { getMessages(input: $input) { list { _id } } }`;
		const codeOf = async (query: string, variables: object) =>
			(await graphQL(app, query, variables, member.accessToken)).body.errors?.[0].extensions.code;
		const direct = await graphQL(
			app,
			`mutation D($id: String!) { getOrCreateDirectChat(memberTwoId: $id) { _id } }`,
			{ id: peerTwo._id },
			peerOne.accessToken,
		);

		expect(
			await codeOf(
				`query Top($input: RankingInquiry) { getTopProperties(input: $input) { list { _id } } }`,
				{ input: { destinationId: 'not-an-id' } },
			),
		).toBe('BAD_REQUEST');
		expect(await codeOf(MESSAGES, { input: { chatId: 'not-an-id', limit: 10 } })).toBe(
			'BAD_REQUEST',
		);
		expect(
			await codeOf(`mutation F($id: String!) { subscribe(input: $id) { _id } }`, {
				id: member._id,
			}),
		).toBe('BAD_REQUEST');
		expect(
			await codeOf(MESSAGES, {
				input: { chatId: direct.body.data.getOrCreateDirectChat._id, limit: 10 },
			}),
		).toBe('FORBIDDEN');
	});

	it('answers an id that does not exist with a client error, not a server error', async () => {
		const member = await seedMember(app, 'missingids');
		const admin = await seedMember(app, 'missingadmin', MemberType.ADMIN);
		const id = new Types.ObjectId().toString();
		const calls: [string, object, string][] = [
			['mutation { getOrCreateDirectChat(memberTwoId: "ID") { _id } }', {}, member.accessToken],
			['mutation { markChatAsRead(chatId: "ID") { _id } }', {}, member.accessToken],
			['mutation { deleteMyChat(chatId: "ID") }', {}, member.accessToken],
			[
				'mutation { markNotificationAsRead(input: { notificationId: "ID" }) { _id } }',
				{},
				member.accessToken,
			],
			[
				'mutation { updateComment(input: { _id: "ID", commentContent: "x" }) { _id } }',
				{},
				member.accessToken,
			],
			['mutation { updateBoardArticle(input: { _id: "ID" }) { _id } }', {}, member.accessToken],
			[
				'mutation { updateDestinationReview(input: { _id: "ID", reviewRating: 3 }) { _id } }',
				{},
				member.accessToken,
			],
			['mutation { removeDestinationReview(reviewId: "ID") { _id } }', {}, member.accessToken],
			[
				'mutation { removeDestinationReviewByAdmin(reviewId: "ID") { _id } }',
				{},
				admin.accessToken,
			],
			['mutation { removeCommentByAdmin(commentId: "ID") { _id } }', {}, admin.accessToken],
			[
				'mutation { updateBoardArticleByAdmin(input: { _id: "ID" }) { _id } }',
				{},
				admin.accessToken,
			],
			['mutation { removeBoardArticleByAdmin(articleId: "ID") { _id } }', {}, admin.accessToken],
			['mutation { removeDestinationByAdmin(destinationId: "ID") }', {}, admin.accessToken],
			['mutation { removePropertyByAdmin(propertyId: "ID") { _id } }', {}, admin.accessToken],
			['mutation { removeTourByAdmin(tourId: "ID") { _id } }', {}, admin.accessToken],
			[
				'mutation { updateNoticeByAdmin(input: { _id: "ID", noticeTitle: "x" }) { _id } }',
				{},
				admin.accessToken,
			],
			['mutation { removeNoticeByAdmin(noticeId: "ID") }', {}, admin.accessToken],
			[
				'mutation { updateSupportTicketByAdmin(input: { _id: "ID", ticketReply: "x" }) { _id } }',
				{},
				admin.accessToken,
			],
		];

		for (const [query, variables, token] of calls) {
			const result = await graphQL(app, query.replace('ID', id), variables, token);
			expect([query, result.body.errors?.[0].extensions.code]).toEqual([
				query,
				expect.stringMatching(/^(NOT_FOUND|BAD_REQUEST)$/),
			]);
		}
	});
});
