import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { io, Socket } from 'socket.io-client';
import { MemberService } from '../src/components/member/member.service';
import { Messages } from '../src/libs/enums/common.enum';
import { MemberStatus, MemberType } from '../src/libs/enums/member.enum';
import { clearDatabase, createTestApp, getTestUrl, graphQL, model, seedMember } from './helpers/e2e.helper';

describe('Phase 1 authentication and CORS security (e2e)', () => {
	let app: INestApplication;
	const sockets: Socket[] = [];

	beforeAll(async () => {
		app = await createTestApp();
	});

	afterEach(async () => {
		for (const socket of sockets.splice(0)) socket.disconnect();
		await clearDatabase(app);
	});

	afterAll(async () => {
		await app.close();
	});

	it('accepts active members and rejects blocked, deleted, invalid and expired JWTs', async () => {
		const active = await seedMember(app, 'activeauth');
		const blocked = await seedMember(app, 'blockedauth');
		const deleted = await seedMember(app, 'deletedauth');
		const protectedMutation = `mutation { updateMember(input: { memberFullName: "Verified" }) { _id } }`;

		const activeResult = await graphQL(app, protectedMutation, {}, active.accessToken);
		expect(activeResult.body.errors).toBeUndefined();

		await model(app, 'Member').updateOne({ _id: blocked._id }, { memberStatus: MemberStatus.BLOCKED });
		const blockedResult = await graphQL(app, protectedMutation, {}, blocked.accessToken);
		expect(blockedResult.body.errors?.[0].message).toBe(Messages.NOT_AUTHENTICATED);

		await model(app, 'Member').updateOne(
			{ _id: deleted._id },
			{ memberStatus: MemberStatus.DELETED, deletedAt: new Date() },
		);
		const deletedResult = await graphQL(app, protectedMutation, {}, deleted.accessToken);
		expect(deletedResult.body.errors?.[0].message).toBe(Messages.NOT_AUTHENTICATED);

		const invalidResult = await graphQL(app, protectedMutation, {}, 'invalid.jwt.token');
		expect(invalidResult.body.errors?.[0].message).toBe(Messages.NOT_AUTHENTICATED);

		const expiredToken = await app.get(JwtService).signAsync({ _id: active._id }, { expiresIn: -1 });
		const expiredResult = await graphQL(app, protectedMutation, {}, expiredToken);
		expect(expiredResult.body.errors?.[0].message).toBe(Messages.TOKEN_EXPIRED);
	});

	it('authorizes USER, AGENT and ADMIN operations from the current database role', async () => {
		const member = await seedMember(app, 'currentrole');
		const agentQuery = `query {
			getAgentProperties(input: { page: 1, limit: 10, search: {} }) { metaCounter { total } }
		}`;
		const adminQuery = `query {
			getAllMembersByAdmin(input: { page: 1, limit: 10, search: {} }) { metaCounter { total } }
		}`;

		const userDeniedAgent = await graphQL(app, agentQuery, {}, member.accessToken);
		expect(userDeniedAgent.body.errors?.[0].message).toBe(Messages.ONLY_SPECIFIC_ROLES);

		await model(app, 'Member').updateOne({ _id: member._id }, { memberType: MemberType.AGENT });
		const currentAgent = await graphQL(app, agentQuery, {}, member.accessToken);
		expect(currentAgent.body.errors).toBeUndefined();
		const agentDeniedAdmin = await graphQL(app, adminQuery, {}, member.accessToken);
		expect(agentDeniedAdmin.body.errors?.[0].message).toBe(Messages.ONLY_SPECIFIC_ROLES);

		await model(app, 'Member').updateOne({ _id: member._id }, { memberType: MemberType.ADMIN });
		const currentAdmin = await graphQL(app, adminQuery, {}, member.accessToken);
		expect(currentAdmin.body.errors).toBeUndefined();

		await model(app, 'Member').updateOne({ _id: member._id }, { memberType: MemberType.USER });
		const demotedAdmin = await graphQL(app, adminQuery, {}, member.accessToken);
		expect(demotedAdmin.body.errors?.[0].message).toBe(Messages.ONLY_SPECIFIC_ROLES);
	});

	it('keeps optional and public GraphQL operations available when an optional token is revoked', async () => {
		const caller = await seedMember(app, 'optionalcaller');
		const target = await seedMember(app, 'optionaltarget');
		await model(app, 'Member').updateOne({ _id: caller._id }, { memberStatus: MemberStatus.BLOCKED });

		const optionalResult = await graphQL(
			app,
			`query Member($input: String!) { getMember(input: $input) { _id memberNick } }`,
			{ input: target._id },
			caller.accessToken,
		);
		expect(optionalResult.body.errors).toBeUndefined();
		expect(optionalResult.body.data.getMember._id).toBe(target._id);

		const publicResult = await graphQL(app, `query { getHello }`, {}, caller.accessToken);
		expect(publicResult.body.errors).toBeUndefined();
		expect(publicResult.body.data.getHello).toBe('Hello');
	});

	it('revalidates the current member status for Socket.IO actions', async () => {
		const member = await seedMember(app, 'socketstatus');
		const socket = io(`${getTestUrl(app)}/chat`, {
			auth: { token: member.accessToken },
			transports: ['websocket'],
			forceNew: true,
		});
		sockets.push(socket);
		await new Promise<void>((resolve, reject) => {
			socket.once('connect', () => resolve());
			socket.once('connect_error', reject);
		});

		await model(app, 'Member').updateOne({ _id: member._id }, { memberStatus: MemberStatus.BLOCKED });
		const response = await new Promise<{ ok: boolean; message: string }>((resolve, reject) => {
			socket.timeout(5000).emit('chat:join', { chatId: member._id }, (error: Error | null, result: any) => {
				if (error) reject(error);
				else resolve(result);
			});
		});
		expect(response).toEqual({ ok: false, message: Messages.NOT_AUTHENTICATED });

		const disconnected = new Promise<void>((resolve) => socket.once('disconnect', () => resolve()));
		await app.get(MemberService).updateMemberByAdmin({
			_id: member._id,
			memberStatus: MemberStatus.BLOCKED,
		});
		await disconnected;
	});

	it('returns the same Unauthorized login response for unknown, wrong-password, blocked and deleted accounts', async () => {
		const memberService = app.get(MemberService);
		await seedMember(app, 'activelogin');
		const blocked = await seedMember(app, 'blockedlogin');
		const deleted = await seedMember(app, 'deletedlogin');
		await model(app, 'Member').updateOne({ _id: blocked._id }, { memberStatus: MemberStatus.BLOCKED });
		await model(app, 'Member').updateOne(
			{ _id: deleted._id },
			{ memberStatus: MemberStatus.DELETED, deletedAt: new Date() },
		);

		for (const credentials of [
			{ memberNick: 'missinglogin', memberPassword: 'pass1234' },
			{ memberNick: 'activelogin', memberPassword: 'wrongpass' },
			{ memberNick: 'blockedlogin', memberPassword: 'pass1234' },
			{ memberNick: 'deletedlogin', memberPassword: 'pass1234' },
			{ memberNick: 'blockedlogin', memberPassword: 'wrongpass' },
		]) {
			await expect(memberService.login(credentials)).rejects.toMatchObject({
				status: 401,
				message: Messages.NOT_AUTHENTICATED,
			});
		}
	});

	it('rejects an identifier that matches one member nickname and another member email', async () => {
		const memberService = app.get(MemberService);
		await memberService.signup({
			memberNick: 'a@b.co',
			memberPassword: 'pass1234',
			memberEmail: 'nickname-owner@example.com',
		});
		await memberService.signup({
			memberNick: 'emailowner',
			memberPassword: 'pass1234',
			memberEmail: 'a@b.co',
		});

		await expect(memberService.login({ memberNick: 'a@b.co', memberPassword: 'pass1234' })).rejects.toMatchObject({
			status: 401,
			message: Messages.NOT_AUTHENTICATED,
		});
	});

	it('returns CORS headers only for allowed development origins', async () => {
		const allowed = await request(app.getHttpServer())
			.options('/graphql')
			.set('Origin', 'http://localhost:3000')
			.set('Access-Control-Request-Method', 'POST');
		expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:3000');
		expect(allowed.headers['access-control-allow-credentials']).toBe('true');

		const disallowed = await request(app.getHttpServer())
			.options('/graphql')
			.set('Origin', 'https://evil.example')
			.set('Access-Control-Request-Method', 'POST');
		expect(disallowed.headers['access-control-allow-origin']).toBeUndefined();
	});
});
