import { INestApplication } from '@nestjs/common';
import { MemberAuthType, MemberStatus, MemberType } from '../src/libs/enums/member.enum';
import { clearDatabase, createTestApp, graphQL, model, seedMember } from './helpers/e2e.helper';

describe('Member list (e2e)', () => {
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

	it('returns only active members with pagination and flexible sorting', async () => {
		await model(app, 'Member').create([
			{
				memberNick: 'charlie',
				memberStatus: MemberStatus.ACTIVE,
				memberType: MemberType.USER,
				memberFollowers: 4,
			},
			{
				memberNick: 'alpha',
				memberStatus: MemberStatus.ACTIVE,
				memberType: MemberType.AGENT,
				memberFollowers: 12,
			},
			{
				memberNick: 'bravo',
				memberStatus: MemberStatus.ACTIVE,
				memberType: MemberType.USER,
				memberFollowers: 8,
			},
			{
				memberNick: 'blocked',
				memberStatus: MemberStatus.BLOCKED,
				memberFollowers: 100,
			},
		]);

		const result = await graphQL(
			app,
			`query GetAllMembers($input: MembersInquiry!) {
				getAllMembers(input: $input) {
					list { memberNick memberStatus memberFollowers }
					metaCounter { total }
				}
			}`,
			{ input: { page: 1, limit: 2, sort: 'memberFollowers', direction: 'DESC' } },
		);

		expect(result.body.errors).toBeUndefined();
		expect(result.body.data.getAllMembers.list.map((member) => member.memberNick)).toEqual(['alpha', 'bravo']);
		expect(result.body.data.getAllMembers.list.every((member) => member.memberStatus === 'ACTIVE')).toBe(true);
		expect(result.body.data.getAllMembers.metaCounter).toEqual([{ total: 3 }]);
	});

	it('filters by type, auth type and escaped text across public profile fields', async () => {
		await model(app, 'Member').create([
			{
				memberNick: 'tourguide',
				memberFullName: 'Seoul Expert',
				memberStatus: MemberStatus.ACTIVE,
				memberType: MemberType.AGENT,
				memberAuthType: MemberAuthType.GOOGLE,
			},
			{
				memberNick: 'hotelagent',
				memberFullName: 'Busan Expert',
				memberStatus: MemberStatus.ACTIVE,
				memberType: MemberType.AGENT,
				memberAuthType: MemberAuthType.NICK,
			},
			{
				memberNick: 'traveler',
				memberFullName: 'Seoul Expert',
				memberStatus: MemberStatus.ACTIVE,
				memberType: MemberType.USER,
				memberAuthType: MemberAuthType.GOOGLE,
			},
		]);

		const result = await graphQL(
			app,
			`query GetAllMembers($input: MembersInquiry!) {
				getAllMembers(input: $input) { list { memberNick memberType memberAuthType } metaCounter { total } }
			}`,
			{
				input: {
					page: 1,
					limit: 10,
					sort: 'memberNick',
					direction: 'ASC',
					search: { memberType: 'AGENT', memberAuthType: 'GOOGLE', text: 'Seoul' },
				},
			},
		);

		expect(result.body.errors).toBeUndefined();
		expect(result.body.data.getAllMembers.list).toEqual([
			expect.objectContaining({ memberNick: 'tourguide', memberType: 'AGENT', memberAuthType: 'GOOGLE' }),
		]);
		expect(result.body.data.getAllMembers.metaCounter).toEqual([{ total: 1 }]);
	});

	it('includes meFollowed for an authenticated caller and rejects unsupported sort fields', async () => {
		const viewer = await seedMember(app, 'vieweruser');
		const target = await model(app, 'Member').create({
			memberNick: 'targetagent',
			memberStatus: MemberStatus.ACTIVE,
			memberType: MemberType.AGENT,
		});
		await model(app, 'Follow').create({ followerId: viewer._id, followingId: target._id });

		const followed = await graphQL(
			app,
			`query GetAllMembers($input: MembersInquiry!) {
				getAllMembers(input: $input) {
					list { memberNick meFollowed { followerId followingId myFollowing } }
				}
			}`,
			{ input: { page: 1, limit: 10, search: { memberType: 'AGENT' } } },
			viewer.accessToken,
		);

		expect(followed.body.errors).toBeUndefined();
		expect(followed.body.data.getAllMembers.list[0].meFollowed).toEqual([
			expect.objectContaining({ myFollowing: true }),
		]);

		const invalidSort = await graphQL(
			app,
			`query GetAllMembers($input: MembersInquiry!) { getAllMembers(input: $input) { list { _id } } }`,
			{ input: { page: 1, limit: 10, sort: 'memberPassword' } },
		);
		expect(invalidSort.body.errors).toBeDefined();
	});
});
