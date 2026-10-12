import { INestApplication } from '@nestjs/common';
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
});
