import { INestApplication } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { io, Socket } from 'socket.io-client';
import { OAuth2Client } from 'google-auth-library';
import { of } from 'rxjs';
import { AuthService } from '../src/components/auth/auth.service';
import { MemberService } from '../src/components/member/member.service';
import { Messages } from '../src/libs/enums/common.enum';
import { MemberAuthType, MemberStatus, MemberType } from '../src/libs/enums/member.enum';
import {
	clearDatabase,
	createTestApp,
	getTestUrl,
	graphQL,
	model,
	seedMember,
} from './helpers/e2e.helper';

describe('Phase 1 authentication and CORS security (e2e)', () => {
	let app: INestApplication;
	const sockets: Socket[] = [];

	const googleMutation = (fields: string) =>
		`mutation GoogleAuth($input: GoogleAuthInput!) { googleAuth(input: $input) { ${fields} } }`;
	const kakaoMutation = (fields: string) =>
		`mutation KakaoAuth($input: KakaoAuthInput!) { kakaoAuth(input: $input) { ${fields} } }`;
	const googleInput = { input: { credential: 'google-id-token' } };
	const kakaoInput = {
		input: { code: 'kakao-code', redirectUri: 'http://localhost:3000/account/kakao' },
	};

	beforeAll(async () => {
		app = await createTestApp();
	});

	afterEach(async () => {
		jest.restoreAllMocks();
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

		await model(app, 'Member').updateOne(
			{ _id: blocked._id },
			{ memberStatus: MemberStatus.BLOCKED },
		);
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

		const expiredToken = await app
			.get(JwtService)
			.signAsync({ _id: active._id }, { expiresIn: -1 });
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
		await model(app, 'Member').updateOne(
			{ _id: caller._id },
			{ memberStatus: MemberStatus.BLOCKED },
		);

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

		await model(app, 'Member').updateOne(
			{ _id: member._id },
			{ memberStatus: MemberStatus.BLOCKED },
		);
		const response = await new Promise<{ ok: boolean; message: string }>((resolve, reject) => {
			socket
				.timeout(5000)
				.emit('chat:join', { chatId: member._id }, (error: Error | null, result: any) => {
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
		await model(app, 'Member').updateOne(
			{ _id: blocked._id },
			{ memberStatus: MemberStatus.BLOCKED },
		);
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

	it('logs in with nickname and password only and never treats an email as the identifier', async () => {
		const loginMutation = `mutation Login($input: LoginInput!) { login(input: $input) { _id accessToken } }`;
		const login = (memberNick: string, memberPassword: string) =>
			graphQL(app, loginMutation, { input: { memberNick, memberPassword } });
		const owner = await seedMember(app, 'nicklogin');
		await model(app, 'Member').updateOne({ _id: owner._id }, { memberEmail: 'a@b.co' });

		const nickLogin = await login('nicklogin', 'pass1234');
		expect(nickLogin.body.errors).toBeUndefined();
		expect(nickLogin.body.data.login._id).toBe(owner._id);
		const protectedResult = await graphQL(
			app,
			`mutation { updateMember(input: { memberFullName: "Nick Login" }) { _id } }`,
			{},
			nickLogin.body.data.login.accessToken,
		);
		expect(protectedResult.body.errors).toBeUndefined();

		for (const identifier of ['a@b.co', '  A@B.CO  ']) {
			const emailLogin = await login(identifier, 'pass1234');
			expect(emailLogin.body.errors?.[0].message).toBe(Messages.NOT_AUTHENTICATED);
			expect(emailLogin.body.data).toBeNull();
		}

		// A nickname that looks like that email belongs to its own member, never to the email owner
		const lookalike = await app
			.get(MemberService)
			.signup({ memberNick: 'a@b.co', memberPassword: 'lookalike1' });
		const ownerPassword = await login('a@b.co', 'pass1234');
		expect(ownerPassword.body.errors?.[0].message).toBe(Messages.NOT_AUTHENTICATED);
		const lookalikeLogin = await login('a@b.co', 'lookalike1');
		expect(lookalikeLogin.body.data.login._id).toBe(lookalike._id.toString());
	});

	it('keeps Google and Kakao members on their own provider identity and out of password login', async () => {
		const authService = app.get(AuthService);
		// The same id string issued by two providers is still two unrelated identities
		jest.spyOn(authService, 'verifyGoogleCredential').mockResolvedValue({
			subject: 'provider-subject-1',
			email: 'google-member@example.com',
			name: 'Google Member',
		});
		jest.spyOn(authService, 'verifyKakaoAuthorizationCode').mockResolvedValue({
			subject: 'provider-subject-1',
			email: 'kakao-member@example.com',
			name: 'Kakao Member',
		});
		const fields = `_id memberNick memberAuthType accessToken`;

		const google = await graphQL(app, googleMutation(fields), googleInput);
		const kakao = await graphQL(app, kakaoMutation(fields), kakaoInput);
		expect(google.body.errors).toBeUndefined();
		expect(kakao.body.errors).toBeUndefined();
		const googleMember = google.body.data.googleAuth;
		const kakaoMember = kakao.body.data.kakaoAuth;
		expect(googleMember.memberAuthType).toBe(MemberAuthType.GOOGLE);
		expect(kakaoMember.memberAuthType).toBe(MemberAuthType.KAKAO);
		expect(kakaoMember._id).not.toBe(googleMember._id);

		const googleAgain = await graphQL(app, googleMutation(fields), googleInput);
		const kakaoAgain = await graphQL(app, kakaoMutation(fields), kakaoInput);
		expect(googleAgain.body.data.googleAuth._id).toBe(googleMember._id);
		expect(kakaoAgain.body.data.kakaoAuth._id).toBe(kakaoMember._id);
		expect(await model(app, 'Member').countDocuments({})).toBe(2);

		const storedGoogle = await model(app, 'Member')
			.findById(googleMember._id)
			.select('+memberPassword')
			.lean();
		expect(storedGoogle.googleSubject).toBe('provider-subject-1');
		expect(storedGoogle.kakaoSubject).toBeUndefined();
		expect(storedGoogle.memberPassword).toBeUndefined();

		for (const member of [googleMember, kakaoMember]) {
			await expect(
				app.get(MemberService).login({ memberNick: member.memberNick, memberPassword: 'pass1234' }),
			).rejects.toMatchObject({ status: 401, message: Messages.NOT_AUTHENTICATED });

			const setPassword = await graphQL(
				app,
				`mutation { changePassword(input: {
					currentPassword: "pass1234", newPassword: "newpass99", confirmPassword: "newpass99"
				}) }`,
				{},
				member.accessToken,
			);
			expect(setPassword.body.errors?.[0].message).toBe(Messages.PASSWORD_CHANGE_UNAVAILABLE);
		}
	});

	it('refuses OAuth email collisions without linking, overwriting or exposing the existing account', async () => {
		const authService = app.get(AuthService);
		const owner = await seedMember(app, 'passowner');
		await model(app, 'Member').updateOne({ _id: owner._id }, { memberEmail: 'owner@example.com' });
		const verifyGoogle = jest.spyOn(authService, 'verifyGoogleCredential').mockResolvedValue({
			subject: 'google-subject-intruder',
			email: 'owner@example.com',
			name: 'Intruder',
		});
		const verifyKakao = jest.spyOn(authService, 'verifyKakaoAuthorizationCode').mockResolvedValue({
			subject: 'kakao-subject-intruder',
			email: 'owner@example.com',
			name: 'Intruder',
		});

		const collisions = [
			[await graphQL(app, googleMutation('_id accessToken'), googleInput), 'GOOGLE_EMAIL_CONFLICT'],
			[await graphQL(app, kakaoMutation('_id accessToken'), kakaoInput), 'KAKAO_EMAIL_CONFLICT'],
		] as const;
		for (const [collision, message] of collisions) {
			expect(collision.body.errors?.[0].message).toBe(Messages[message]);
			expect(collision.body.data).toBeNull();
			expect(JSON.stringify(collision.body)).not.toContain(owner._id);
			expect(JSON.stringify(collision.body)).not.toContain('passowner');
		}

		const stored = await model(app, 'Member').findById(owner._id).lean();
		expect(stored).toMatchObject({
			memberNick: 'passowner',
			memberAuthType: MemberAuthType.NICK,
			memberEmail: 'owner@example.com',
		});
		expect(stored.googleSubject).toBeUndefined();
		expect(stored.kakaoSubject).toBeUndefined();
		expect(await model(app, 'Member').countDocuments({})).toBe(1);
		const ownerLogin = await app
			.get(MemberService)
			.login({ memberNick: 'passowner', memberPassword: 'pass1234' });
		expect(ownerLogin._id.toString()).toBe(owner._id);

		// The same rule holds between the two providers
		verifyGoogle.mockResolvedValue({
			subject: 'google-subject-real',
			email: 'google-member@example.com',
			name: 'Google Member',
		});
		const googleMember = await graphQL(app, googleMutation('_id'), googleInput);
		expect(googleMember.body.errors).toBeUndefined();
		verifyKakao.mockResolvedValue({
			subject: 'kakao-subject-intruder',
			email: 'google-member@example.com',
		});
		const crossProvider = await graphQL(app, kakaoMutation('_id accessToken'), kakaoInput);
		expect(crossProvider.body.errors?.[0].message).toBe(Messages.KAKAO_EMAIL_CONFLICT);
		expect(crossProvider.body.data).toBeNull();
		const storedGoogle = await model(app, 'Member')
			.findById(googleMember.body.data.googleAuth._id)
			.lean();
		expect(storedGoogle.kakaoSubject).toBeUndefined();
		expect(await model(app, 'Member').countDocuments({})).toBe(2);
	});

	it('trusts a Google or Kakao identity only after the provider token is verified', async () => {
		const configured = {
			GOOGLE_WEB_CLIENT_ID: 'e2e-google-client',
			KAKAO_REST_API_KEY: 'e2e-kakao-key',
			KAKAO_CLIENT_SECRET: 'e2e-kakao-secret',
		};
		const previous = Object.keys(configured).map((key) => [key, process.env[key]] as const);
		Object.assign(process.env, configured);

		try {
			const verifyIdToken = jest
				.spyOn(OAuth2Client.prototype, 'verifyIdToken')
				.mockRejectedValue(new Error('Invalid token signature') as never);
			const forgedGoogle = await graphQL(app, googleMutation('_id'), googleInput);
			expect(forgedGoogle.body.errors?.[0].message).toBe(Messages.INVALID_GOOGLE_CREDENTIAL);

			verifyIdToken.mockResolvedValue({
				getPayload: () => ({
					sub: 'google-subject-unverified',
					email: 'unverified@example.com',
					email_verified: false,
				}),
			} as never);
			const unverifiedGoogle = await graphQL(app, googleMutation('_id'), googleInput);
			expect(unverifiedGoogle.body.errors?.[0].message).toBe(Messages.INVALID_GOOGLE_CREDENTIAL);

			const tokenExchange = jest.spyOn(app.get(HttpService), 'post');
			for (const data of [{ access_token: 'kakao-access-token' }, { id_token: 'not-a-jwt' }]) {
				tokenExchange.mockReturnValue(of({ data }) as never);
				const forgedKakao = await graphQL(app, kakaoMutation('_id'), kakaoInput);
				expect(forgedKakao.body.errors?.[0].message).toBe(Messages.INVALID_KAKAO_IDENTITY_TOKEN);
			}

			expect(await model(app, 'Member').countDocuments({})).toBe(0);
		} finally {
			for (const [key, value] of previous) {
				if (value === undefined) delete process.env[key];
				else process.env[key] = value;
			}
		}
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
