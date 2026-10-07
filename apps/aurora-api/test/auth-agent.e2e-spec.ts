import { BadRequestException, INestApplication, UnauthorizedException } from '@nestjs/common';
import request from 'supertest';
import { AuthService } from '../src/components/auth/auth.service';
import { MemberService } from '../src/components/member/member.service';
import { MemberAuthType, MemberStatus, MemberType } from '../src/libs/enums/member.enum';
import { Messages } from '../src/libs/enums/common.enum';
import { clearDatabase, createTestApp, graphQL, model, seedMember } from './helpers/e2e.helper';

describe('Auth, Member and Agent (e2e)', () => {
	let app: INestApplication;

	beforeAll(async () => {
		app = await createTestApp();
	});

	afterEach(async () => {
		jest.restoreAllMocks();
		await clearDatabase(app);
	});

	afterAll(async () => {
		await app.close();
	});

	it('returns the AppService health response', async () => {
		await request(app.getHttpServer()).get('/').expect(200).expect('Hello World!');
	});

	it('signs up, logs in, issues JWT and protects authenticated operations', async () => {
		const signup = await graphQL(
			app,
			`mutation Signup($input: MemberInput!) {
				signup(input: $input) { _id memberNick memberType accessToken }
			}`,
			{ input: { memberNick: 'authuser', memberPassword: 'pass1234', memberEmail: 'auth@aura.test' } },
		);
		expect(signup.body.errors).toBeUndefined();
		expect(signup.body.data.signup.memberType).toBe('USER');
		expect(signup.body.data.signup.accessToken).toBeTruthy();

		const login = await graphQL(
			app,
			`mutation Login($input: LoginInput!) {
				login(input: $input) { _id memberNick accessToken }
			}`,
			{ input: { memberNick: 'authuser', memberPassword: 'pass1234' } },
		);
		expect(login.body.errors).toBeUndefined();
		const token = login.body.data.login.accessToken;

		const unauthorized = await graphQL(
			app,
			`mutation { updateMember(input: { memberFullName: "Blocked" }) { _id } }`,
		);
		expect(unauthorized.body.errors?.[0].message).toContain('Bearer token');

		const invalidToken = await graphQL(
			app,
			`mutation { updateMember(input: { memberFullName: "Blocked" }) { _id } }`,
			{},
			'invalid.jwt.token',
		);
		expect(invalidToken.body.errors).toBeDefined();

		const update = await graphQL(
			app,
			`mutation { updateMember(input: { memberFullName: "Aura User" }) { _id memberFullName } }`,
			{},
			token,
		);
		expect(update.body.errors).toBeUndefined();
		expect(update.body.data.updateMember.memberFullName).toBe('Aura User');
	});

	it('rejects invalid signup DTO and invalid ObjectId', async () => {
		const invalidDto = await graphQL(
			app,
			`mutation Signup($input: MemberInput!) { signup(input: $input) { _id } }`,
			{ input: { memberNick: 'x', memberPassword: '1' } },
		);
		expect(invalidDto.body.errors).toBeDefined();

		const invalidId = await graphQL(app, `query { getMember(input: "not-an-object-id") { _id } }`);
		expect(invalidId.body.errors?.[0].message).toBe('Invalid ID!');
	});

	it('verifies Google identities server-side, creates passwordless users and reuses the AURORA JWT flow', async () => {
		const authService = app.get(AuthService);
		jest.spyOn(authService, 'verifyGoogleCredential').mockResolvedValue({
			subject: 'google-subject-1',
			email: 'traveler@example.com',
			name: 'Google Traveler',
		});
		const googleMutation = `mutation GoogleAuth($input: GoogleAuthInput!) {
			googleAuth(input: $input) { _id memberNick memberType memberAuthType memberEmail accessToken }
		}`;

		const first = await graphQL(app, googleMutation, { input: { credential: 'google-id-token' } });
		expect(first.body.errors).toBeUndefined();
		expect(first.body.data.googleAuth.memberType).toBe('USER');
		expect(first.body.data.googleAuth.memberAuthType).toBe('GOOGLE');
		expect(first.body.data.googleAuth.accessToken).toBeTruthy();

		const stored = await model(app, 'Member').findById(first.body.data.googleAuth._id).lean();
		expect(stored.googleSubject).toBe('google-subject-1');
		expect(stored.memberPassword).toBeUndefined();

		const protectedUpdate = await graphQL(
			app,
			`mutation { updateMember(input: { memberFullName: "Google Traveler" }) { _id memberFullName } }`,
			{},
			first.body.data.googleAuth.accessToken,
		);
		expect(protectedUpdate.body.errors).toBeUndefined();

		const second = await graphQL(app, googleMutation, { input: { credential: 'google-id-token' } });
		expect(second.body.errors).toBeUndefined();
		expect(second.body.data.googleAuth._id).toBe(first.body.data.googleAuth._id);
	});

	it('rejects invalid Google credentials and prevents automatic account linking by email', async () => {
		const authService = app.get(AuthService);
		const googleMutation = `mutation GoogleAuth($input: GoogleAuthInput!) { googleAuth(input: $input) { _id } }`;
		jest
			.spyOn(authService, 'verifyGoogleCredential')
			.mockRejectedValue(new UnauthorizedException(Messages.INVALID_GOOGLE_CREDENTIAL));

		const invalid = await graphQL(app, googleMutation, { input: { credential: 'invalid-token' } });
		expect(invalid.body.errors?.[0].message).toBe(Messages.INVALID_GOOGLE_CREDENTIAL);

		jest.restoreAllMocks();
		jest.spyOn(authService, 'verifyGoogleCredential').mockResolvedValue({
			subject: 'google-subject-2',
			email: 'existing@example.com',
			name: 'Existing Google Traveler',
		});
		await app.get(MemberService).signup({
			memberNick: 'existing',
			memberPassword: 'pass1234',
			memberEmail: 'existing@example.com',
		});

		const collision = await graphQL(app, googleMutation, { input: { credential: 'google-id-token' } });
		expect(collision.body.errors?.[0].message).toBe(Messages.GOOGLE_EMAIL_CONFLICT);
	});

	it('retries generated Google nicknames and rejects blocked Google members', async () => {
		const memberService = app.get(MemberService);
		await memberService.signup({ memberNick: 'googletravel', memberPassword: 'pass1234' });
		const authService = app.get(AuthService);
		jest.spyOn(authService, 'verifyGoogleCredential').mockResolvedValue({
			subject: 'google-subject-3',
			email: 'another@example.com',
			name: 'Google Traveler',
		});
		const googleMutation = `mutation GoogleAuth($input: GoogleAuthInput!) {
			googleAuth(input: $input) { _id memberNick }
		}`;

		const created = await graphQL(app, googleMutation, { input: { credential: 'google-id-token' } });
		expect(created.body.errors).toBeUndefined();
		expect(created.body.data.googleAuth.memberNick).not.toBe('googletravel');
		expect(created.body.data.googleAuth.memberNick).toHaveLength(12);

		await model(app, 'Member').findByIdAndUpdate(created.body.data.googleAuth._id, { memberStatus: MemberStatus.BLOCKED });
		const blocked = await graphQL(app, googleMutation, { input: { credential: 'google-id-token' } });
		expect(blocked.body.errors?.[0].message).toBe(Messages.MEMBER_BLOCKED);
	});

	it('creates and reuses passwordless Kakao members with the normal AURORA access token', async () => {
		const authService = app.get(AuthService);
		jest.spyOn(authService, 'verifyKakaoAuthorizationCode').mockResolvedValue({
			subject: 'kakao-subject-1',
			email: 'kakao@example.com',
			name: 'KakaoNick',
			image: 'https://k.kakaocdn.net/kakao-profile.jpg',
		});
		const kakaoMutation = `mutation KakaoAuth($input: KakaoAuthInput!) {
			kakaoAuth(input: $input) { _id memberNick memberImage memberType memberAuthType memberEmail accessToken }
		}`;
		const variables = { input: { code: 'kakao-code', redirectUri: 'https://app.aurora.test/auth/kakao' } };

		const first = await graphQL(app, kakaoMutation, variables);
		expect(first.body.errors).toBeUndefined();
		expect(first.body.data.kakaoAuth.memberType).toBe('USER');
		expect(first.body.data.kakaoAuth.memberAuthType).toBe('KAKAO');
		expect(first.body.data.kakaoAuth.memberNick).toBe('kakaonick');
		expect(first.body.data.kakaoAuth.memberImage).toBe('https://k.kakaocdn.net/kakao-profile.jpg');
		expect(first.body.data.kakaoAuth.accessToken).toBeTruthy();

		const stored = await model(app, 'Member').findById(first.body.data.kakaoAuth._id).lean();
		expect(stored.kakaoSubject).toBe('kakao-subject-1');
		expect(stored.memberPassword).toBeUndefined();
		expect(stored.memberImage).toBe('https://k.kakaocdn.net/kakao-profile.jpg');
		const tokenPayload = JSON.parse(Buffer.from(first.body.data.kakaoAuth.accessToken.split('.')[1], 'base64url').toString());
		expect(tokenPayload.googleSubject).toBeUndefined();
		expect(tokenPayload.kakaoSubject).toBeUndefined();

		await model(app, 'Member').findByIdAndUpdate(first.body.data.kakaoAuth._id, {
			lastLoginAt: new Date('2000-01-01'),
			memberImage: null,
			memberNick: 'customnick',
		});
		const second = await graphQL(app, kakaoMutation, variables);
		expect(second.body.errors).toBeUndefined();
		expect(second.body.data.kakaoAuth._id).toBe(first.body.data.kakaoAuth._id);
		expect(second.body.data.kakaoAuth.memberNick).toBe('customnick');
		expect(second.body.data.kakaoAuth.memberImage).toBe('https://k.kakaocdn.net/kakao-profile.jpg');
		const afterLogin = await model(app, 'Member').findById(first.body.data.kakaoAuth._id).lean();
		expect(afterLogin.lastLoginAt.getTime()).toBeGreaterThan(new Date('2000-01-01').getTime());

		await model(app, 'Member').findByIdAndUpdate(first.body.data.kakaoAuth._id, {
			memberImage: 'https://aurora.example/custom-image.jpg',
		});
		const third = await graphQL(app, kakaoMutation, variables);
		expect(third.body.errors).toBeUndefined();
		expect(third.body.data.kakaoAuth.memberImage).toBe('https://aurora.example/custom-image.jpg');

		const passwordLogin = await graphQL(
			app,
			`mutation { login(input: { memberNick: "${second.body.data.kakaoAuth.memberNick}", memberPassword: "pass1234" }) { _id } }`,
		);
		expect(passwordLogin.body.errors?.[0].message).toBe(Messages.WRONG_PASSWORD);

		const providerField = await graphQL(app, `mutation KakaoAuth($input: KakaoAuthInput!) {
			kakaoAuth(input: $input) { kakaoSubject }
		}`, variables);
		expect(providerField.body.errors?.[0].message).toContain('Cannot query field "kakaoSubject"');
	});

	it('creates Kakao identities without email, retries nickname collisions, and enforces member status', async () => {
		const memberService = app.get(MemberService);
		await memberService.signup({ memberNick: 'kakaouser', memberPassword: 'pass1234' });
		const authService = app.get(AuthService);
		jest.spyOn(authService, 'verifyKakaoAuthorizationCode').mockResolvedValue({ subject: 'kakao-subject-2' });
		const kakaoMutation = `mutation KakaoAuth($input: KakaoAuthInput!) {
			kakaoAuth(input: $input) { _id memberNick memberEmail memberImage }
		}`;
		const variables = { input: { code: 'kakao-code', redirectUri: 'https://app.aurora.test/auth/kakao' } };

		const created = await graphQL(app, kakaoMutation, variables);
		expect(created.body.errors).toBeUndefined();
		expect(created.body.data.kakaoAuth.memberEmail).toBeNull();
		expect(created.body.data.kakaoAuth.memberImage).toBeNull();
		expect(created.body.data.kakaoAuth.memberNick).not.toBe('kakaouser');
		expect(created.body.data.kakaoAuth.memberNick).toHaveLength(12);

		await model(app, 'Member').findByIdAndUpdate(created.body.data.kakaoAuth._id, { memberStatus: MemberStatus.BLOCKED });
		const blocked = await graphQL(app, kakaoMutation, variables);
		expect(blocked.body.errors?.[0].message).toBe(Messages.MEMBER_BLOCKED);

		await model(app, 'Member').findByIdAndUpdate(created.body.data.kakaoAuth._id, { memberStatus: MemberStatus.DELETED });
		const deleted = await graphQL(app, kakaoMutation, variables);
		expect(deleted.body.errors?.[0].message).toBe(Messages.MEMBER_NOT_FOUND);
	});

	it('rejects invalid Kakao authorization codes and email collisions with password or Google accounts', async () => {
		const authService = app.get(AuthService);
		const kakaoMutation = `mutation KakaoAuth($input: KakaoAuthInput!) { kakaoAuth(input: $input) { _id } }`;
		const variables = { input: { code: 'kakao-code', redirectUri: 'https://app.aurora.test/auth/kakao' } };
		jest
			.spyOn(authService, 'verifyKakaoAuthorizationCode')
			.mockRejectedValue(new BadRequestException(Messages.INVALID_KAKAO_AUTHORIZATION_CODE));
		const invalid = await graphQL(app, kakaoMutation, variables);
		expect(invalid.body.errors?.[0].message).toBe(Messages.INVALID_KAKAO_AUTHORIZATION_CODE);

		jest.restoreAllMocks();
		const memberService = app.get(MemberService);
		await memberService.signup({ memberNick: 'passwordusr', memberPassword: 'pass1234', memberEmail: 'password@example.com' });
		jest.spyOn(authService, 'verifyKakaoAuthorizationCode').mockResolvedValue({
			subject: 'kakao-subject-3',
			email: 'password@example.com',
		});
		const passwordCollision = await graphQL(app, kakaoMutation, variables);
		expect(passwordCollision.body.errors?.[0].message).toBe(Messages.KAKAO_EMAIL_CONFLICT);

		await model(app, 'Member').create({
			memberNick: 'googleuser',
			memberAuthType: MemberAuthType.GOOGLE,
			googleSubject: 'google-subject-collision',
			memberEmail: 'google@example.com',
		});
		jest.spyOn(authService, 'verifyKakaoAuthorizationCode').mockResolvedValue({
			subject: 'kakao-subject-4',
			email: 'google@example.com',
		});
		const googleCollision = await graphQL(app, kakaoMutation, variables);
		expect(googleCollision.body.errors?.[0].message).toBe(Messages.KAKAO_EMAIL_CONFLICT);
	});

	it('handles application approve/reject, duplicate and role authorization', async () => {
		const hotelApplicant = await seedMember(app, 'hotelusr');
		const tourApplicant = await seedMember(app, 'touruser');
		const ordinaryUser = await seedMember(app, 'ordinary');
		const admin = await seedMember(app, 'adminusr', MemberType.ADMIN);

		const submitMutation = `mutation Submit($input: AgentInput!) {
			submitAgentApplication(input: $input) { _id agentType verificationStatus }
		}`;
		const hotelInput = {
			agentType: 'HOTEL',
			companyName: 'Aura Hotels',
			businessNumber: 'HOTEL-001',
			companyAddress: 'Seoul',
		};
		const submitted = await graphQL(app, submitMutation, { input: hotelInput }, hotelApplicant.accessToken);
		expect(submitted.body.errors).toBeUndefined();
		const hotelApplicationId = submitted.body.data.submitAgentApplication._id;

		const duplicate = await graphQL(app, submitMutation, { input: hotelInput }, hotelApplicant.accessToken);
		expect(duplicate.body.errors?.[0].message).toContain('application already exists');

		const forbiddenApprove = await graphQL(
			app,
			`mutation Approve($input: String!) { approveAgentApplication(input: $input) { _id } }`,
			{ input: hotelApplicationId },
			ordinaryUser.accessToken,
		);
		expect(forbiddenApprove.body.errors).toBeDefined();

		const approved = await graphQL(
			app,
			`mutation Approve($input: String!) {
				approveAgentApplication(input: $input) { _id verificationStatus verifiedAt }
			}`,
			{ input: hotelApplicationId },
			admin.accessToken,
		);
		expect(approved.body.errors).toBeUndefined();
		expect(approved.body.data.approveAgentApplication.verificationStatus).toBe('APPROVED');
		const approvedMember = await model(app, 'Member').findById(hotelApplicant._id).lean();
		expect(approvedMember.memberType).toBe('AGENT');

		const tourSubmitted = await graphQL(
			app,
			submitMutation,
			{
				input: {
					agentType: 'TOUR',
					companyName: 'Aura Tours',
					businessNumber: 'TOUR-001',
					companyAddress: 'Busan',
				},
			},
			tourApplicant.accessToken,
		);
		const rejected = await graphQL(
			app,
			`mutation Reject($input: RejectAgentApplicationInput!) {
				rejectAgentApplication(input: $input) { _id verificationStatus rejectionReason }
			}`,
			{ input: { _id: tourSubmitted.body.data.submitAgentApplication._id, rejectionReason: 'Incomplete documents' } },
			admin.accessToken,
		);
		expect(rejected.body.errors).toBeUndefined();
		expect(rejected.body.data.rejectAgentApplication.verificationStatus).toBe('REJECTED');
	});
});
