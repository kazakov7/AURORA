import { INestApplication } from '@nestjs/common';
import { getConnectionToken } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { AuthService } from '../src/components/auth/auth.service';
import { MemberService } from '../src/components/member/member.service';
import { Messages } from '../src/libs/enums/common.enum';
import { MemberAuthType, MemberStatus, MemberType } from '../src/libs/enums/member.enum';
import { clearDatabase, createTestApp, graphQL, model, seedMember } from './helpers/e2e.helper';

describe('Member account integrity (e2e)', () => {
	let app: INestApplication;

	const signup = `mutation Signup($input: MemberInput!) { signup(input: $input) { _id memberNick } }`;
	const login = `mutation Login($input: LoginInput!) { login(input: $input) { _id } }`;
	const updateMember = `mutation UpdateMember($input: MemberUpdate!) {
		updateMember(input: $input) { _id memberNick }
	}`;
	const updateMemberByAdmin = `mutation UpdateMemberByAdmin($input: AdminUpdateMemberInput!) {
		updateMemberByAdmin(input: $input) { _id memberStatus }
	}`;

	beforeAll(async () => {
		app = await createTestApp();
		await model(app, 'Member').init();
	});

	afterEach(async () => {
		jest.restoreAllMocks();
		await clearDatabase(app);
	});

	afterAll(async () => {
		await app.close();
	});

	it('applies the signup nickname length rule to the trimmed value', async () => {
		const padded = await graphQL(app, signup, {
			input: { memberNick: '  alice  ', memberPassword: 'pass1234' },
		});
		expect(padded.body.errors).toBeUndefined();
		expect(padded.body.data.signup.memberNick).toBe('alice');

		for (const memberNick of ['  a  ', '     ']) {
			const result = await graphQL(app, signup, {
				input: { memberNick, memberPassword: 'pass1234' },
			});
			expect(result.body.errors?.[0].extensions.code).toBe('BAD_REQUEST');
		}
		expect(await model(app, 'Member').countDocuments({})).toBe(1);
	});

	it('rejects null and out-of-range nicknames on update and keeps the member list readable', async () => {
		const member = await seedMember(app, 'nickowner');

		for (const memberNick of [null, '', 'ab', 'a'.repeat(13), '     ']) {
			const result = await graphQL(
				app,
				updateMember,
				{ input: { memberNick } },
				member.accessToken,
			);
			expect(result.body.errors?.[0].extensions.code).toBe('BAD_REQUEST');
		}
		const stored = await model(app, 'Member').findById(member._id).lean();
		expect(stored.memberNick).toBe('nickowner');

		const list = await graphQL(
			app,
			`query { getAllMembers(input: { page: 1, limit: 10 }) { list { memberNick } } }`,
		);
		expect(list.body.errors).toBeUndefined();

		const renamed = await graphQL(
			app,
			updateMember,
			{ input: { memberNick: ' newnick ' } },
			member.accessToken,
		);
		expect(renamed.body.data.updateMember.memberNick).toBe('newnick');
	});

	it('reports a taken nickname or phone as duplicate data without database details', async () => {
		const alice = await seedMember(app, 'alice');
		const bob = await seedMember(app, 'bob');
		await model(app, 'Member').updateOne({ _id: bob._id }, { memberPhone: '01011112222' });

		for (const input of [{ memberNick: 'bob' }, { memberPhone: '01011112222' }]) {
			const result = await graphQL(app, updateMember, { input }, alice.accessToken);
			expect(result.body.errors?.[0]).toMatchObject({
				message: Messages.DUPLICATE_DATA,
				extensions: { code: 'BAD_REQUEST' },
			});
		}
	});

	it('stores a blank phone as no phone so it never collides on the unique index', async () => {
		const admin = await seedMember(app, 'phoneadmin', MemberType.ADMIN);
		const first = await seedMember(app, 'blankphone1');
		const second = await seedMember(app, 'blankphone2');
		const third = await seedMember(app, 'blankphone3');
		const savePhone = `mutation UpdateMember($input: MemberUpdate!) {
			updateMember(input: $input) { _id memberPhone }
		}`;

		const withPhone = await graphQL(
			app,
			savePhone,
			{ input: { memberPhone: '01011112222' } },
			first.accessToken,
		);
		expect(withPhone.body.data.updateMember.memberPhone).toBe('01011112222');

		for (const [member, memberPhone] of [
			[first, ''],
			[second, '   '],
		] as const) {
			const result = await graphQL(app, savePhone, { input: { memberPhone } }, member.accessToken);
			expect(result.body.errors).toBeUndefined();
			expect(result.body.data.updateMember.memberPhone).toBeNull();
		}

		const byAdmin = await graphQL(
			app,
			`mutation UpdateMemberByAdmin($input: AdminUpdateMemberInput!) {
				updateMemberByAdmin(input: $input) { _id memberPhone }
			}`,
			{ input: { _id: third._id, memberPhone: '' } },
			admin.accessToken,
		);
		expect(byAdmin.body.errors).toBeUndefined();
		expect(byAdmin.body.data.updateMemberByAdmin.memberPhone).toBeNull();

		expect(await model(app, 'Member').countDocuments({ memberPhone: '' })).toBe(0);
	});

	it('never lets a member set or change an email through updateMember', async () => {
		const member = await seedMember(app, 'emailowner');
		await model(app, 'Member').updateOne({ _id: member._id }, { memberEmail: 'owner@example.com' });

		const rejected = await graphQL(
			app,
			updateMember,
			{ input: { memberEmail: 'victim@example.com' } },
			member.accessToken,
		);
		expect(rejected.body.errors?.[0].extensions.code).toBe('BAD_USER_INPUT');

		// A payload that bypasses the GraphQL input type must not reach the email either
		const updated = await app.get(MemberService).updateMember(member._id, {
			memberEmail: 'victim@example.com',
			memberFullName: 'Email Owner',
		});
		expect(updated.memberFullName).toBe('Email Owner');
		expect(updated.memberEmail).toBe('owner@example.com');
		const stored = await model(app, 'Member').findById(member._id).lean();
		expect(stored.memberEmail).toBe('owner@example.com');

		// So an unverified claim can no longer block the real owner's Google sign-in
		jest.spyOn(app.get(AuthService), 'verifyGoogleCredential').mockResolvedValue({
			subject: 'google-subject-owner',
			email: 'victim@example.com',
			name: 'Real Owner',
		});
		const google = await graphQL(
			app,
			`mutation GoogleAuth($input: GoogleAuthInput!) { googleAuth(input: $input) { memberEmail } }`,
			{ input: { credential: 'google-id-token' } },
		);
		expect(google.body.errors).toBeUndefined();
		expect(google.body.data.googleAuth.memberEmail).toBe('victim@example.com');
	});

	it('answers unknown and passwordless accounts like a wrong password on login', async () => {
		await seedMember(app, 'passworded');
		await model(app, 'Member').create({
			memberNick: 'socialonly',
			memberAuthType: MemberAuthType.GOOGLE,
			googleSubject: 'google-subject-login',
		});

		for (const input of [
			{ memberNick: 'passworded', memberPassword: 'wrongpass' },
			{ memberNick: 'missingnick', memberPassword: 'pass1234' },
			{ memberNick: 'socialonly', memberPassword: 'pass1234' },
		]) {
			const result = await graphQL(app, login, { input });
			expect(result.body.errors?.[0]).toMatchObject({
				message: Messages.NOT_AUTHENTICATED,
				extensions: { code: 'UNAUTHENTICATED' },
			});
		}
	});

	it('lets only an admin block and unblock a member and validates the target id', async () => {
		const admin = await seedMember(app, 'adminuser', MemberType.ADMIN);
		const target = await seedMember(app, 'targetuser');
		const profileUpdate = { input: { memberFullName: 'Target User' } };

		const denied = await graphQL(
			app,
			updateMemberByAdmin,
			{ input: { _id: admin._id, memberStatus: 'BLOCKED' } },
			target.accessToken,
		);
		expect(denied.body.errors?.[0].message).toBe(Messages.ONLY_SPECIFIC_ROLES);

		const blocked = await graphQL(
			app,
			updateMemberByAdmin,
			{ input: { _id: target._id, memberStatus: 'BLOCKED' } },
			admin.accessToken,
		);
		expect(blocked.body.errors).toBeUndefined();
		expect(blocked.body.data.updateMemberByAdmin.memberStatus).toBe('BLOCKED');
		const revoked = await graphQL(app, updateMember, profileUpdate, target.accessToken);
		expect(revoked.body.errors?.[0].message).toBe(Messages.NOT_AUTHENTICATED);

		const unblocked = await graphQL(
			app,
			updateMemberByAdmin,
			{ input: { _id: target._id, memberStatus: 'ACTIVE' } },
			admin.accessToken,
		);
		expect(unblocked.body.data.updateMemberByAdmin.memberStatus).toBe('ACTIVE');
		const restored = await graphQL(app, updateMember, profileUpdate, target.accessToken);
		expect(restored.body.errors).toBeUndefined();

		const malformed = await graphQL(
			app,
			updateMemberByAdmin,
			{ input: { _id: 'not-an-object-id', memberFullName: 'Nobody' } },
			admin.accessToken,
		);
		expect(malformed.body.errors?.[0].extensions.code).toBe('BAD_REQUEST');
	});

	it('completes both of two concurrent first Google sign-ins for the same identity', async () => {
		jest.spyOn(app.get(AuthService), 'verifyGoogleCredential').mockResolvedValue({
			subject: 'google-subject-race',
			email: 'race@example.com',
			name: 'Race Traveler',
		});
		const googleAuth = `mutation GoogleAuth($input: GoogleAuthInput!) { googleAuth(input: $input) { _id } }`;

		const results = await Promise.all([
			graphQL(app, googleAuth, { input: { credential: 'google-id-token' } }),
			graphQL(app, googleAuth, { input: { credential: 'google-id-token' } }),
		]);

		for (const result of results) expect(result.body.errors).toBeUndefined();
		expect(results[0].body.data.googleAuth._id).toBe(results[1].body.data.googleAuth._id);
		expect(await model(app, 'Member').countDocuments({})).toBe(1);
	});

	it('treats case variants of a nickname as one nickname', async () => {
		const admin = await seedMember(app, 'caseadmin', MemberType.ADMIN);
		const alice = await seedMember(app, 'alice');
		const bob = await seedMember(app, 'bob');

		const variant = await graphQL(app, signup, {
			input: { memberNick: 'Alice', memberPassword: 'pass1234' },
		});
		const renamed = await graphQL(
			app,
			updateMember,
			{ input: { memberNick: 'ALICE' } },
			bob.accessToken,
		);
		const renamedByAdmin = await graphQL(
			app,
			updateMemberByAdmin,
			{ input: { _id: bob._id, memberNick: 'aLiCe' } },
			admin.accessToken,
		);
		for (const result of [variant, renamed, renamedByAdmin]) {
			expect(result.body.errors?.[0]).toMatchObject({
				message: Messages.DUPLICATE_DATA,
				extensions: { code: 'BAD_REQUEST' },
			});
		}

		// The owner may still change the case of their own nickname
		const recased = await graphQL(
			app,
			updateMember,
			{ input: { memberNick: 'Alice' } },
			alice.accessToken,
		);
		expect(recased.body.data.updateMember.memberNick).toBe('Alice');

		// A social sign-in that would land on the same nickname gets one of its own
		jest.spyOn(app.get(AuthService), 'verifyGoogleCredential').mockResolvedValue({
			subject: 'google-subject-case',
			email: 'alice@example.com',
			name: 'ALICE',
		});
		const google = await graphQL(
			app,
			`mutation GoogleAuth($input: GoogleAuthInput!) { googleAuth(input: $input) { memberNick } }`,
			{ input: { credential: 'google-id-token' } },
		);
		expect(google.body.errors).toBeUndefined();
		expect(google.body.data.googleAuth.memberNick).toMatch(/^alice[0-9a-f]{6}$/);
	});

	it('accepts only letters, numbers, dots and underscores in a nickname', async () => {
		const member = await seedMember(app, 'handleowner');

		for (const memberNick of ['ali ce', '<b>x</b>', 'a@b.co', 'алиса', 'ali​ce']) {
			const created = await graphQL(app, signup, {
				input: { memberNick, memberPassword: 'pass1234' },
			});
			const renamed = await graphQL(
				app,
				updateMember,
				{ input: { memberNick } },
				member.accessToken,
			);
			for (const result of [created, renamed]) {
				expect(result.body.errors?.[0]).toMatchObject({
					message: Messages.INVALID_NICKNAME,
					extensions: { code: 'BAD_REQUEST' },
				});
			}
		}
		expect(await model(app, 'Member').countDocuments({})).toBe(1);

		const allowed = await graphQL(app, signup, {
			input: { memberNick: 'a.b_C1', memberPassword: 'pass1234' },
		});
		expect(allowed.body.data.signup.memberNick).toBe('a.b_C1');

		// A nickname stored before the rule keeps working as the login identifier
		await app.get(MemberService).signup({ memberNick: 'old nick', memberPassword: 'pass1234' });
		const legacy = await graphQL(app, login, {
			input: { memberNick: 'old nick', memberPassword: 'pass1234' },
		});
		expect(legacy.body.errors).toBeUndefined();
	});

	it('validates the phone, image and length of profile fields for members and admins', async () => {
		const admin = await seedMember(app, 'fieldadmin', MemberType.ADMIN);
		const member = await seedMember(app, 'fieldowner');
		const save = async (input: Record<string, unknown>) => [
			await graphQL(app, updateMember, { input }, member.accessToken),
			await graphQL(
				app,
				updateMemberByAdmin,
				{ input: { _id: member._id, ...input } },
				admin.accessToken,
			),
		];

		for (const input of [
			{ memberPhone: 'not-a-phone<script>' },
			{ memberPhone: '010-1111-2222' },
			{ memberPhone: '123456' },
			{ memberPhone: '1'.repeat(16) },
			{ memberImage: 'javascript:alert(1)' },
			{ memberImage: ' JaVaScRiPt:alert(1)' },
			{ memberImage: 'data:image/png;base64,AAAA' },
			{ memberImage: `https://cdn.example.com/${'x'.repeat(1000)}` },
			{ memberFullName: 'f'.repeat(101) },
			{ memberAddress: 'a'.repeat(201) },
		]) {
			for (const result of await save(input)) {
				expect(result.body.errors?.[0].extensions.code).toBe('BAD_REQUEST');
			}
		}
		const [invalidPhone] = await save({ memberPhone: '010-1111-2222' });
		expect(invalidPhone.body.errors?.[0].message).toBe(Messages.INVALID_PHONE);
		const untouched = await model(app, 'Member').findById(member._id).lean();
		expect(untouched.memberPhone).toBeUndefined();
		expect(untouched.memberImage).toBeUndefined();

		// Uploaded, legacy and default-avatar images are what the profile form sends back
		for (const input of [
			{ memberPhone: '+821011112222' },
			{ memberImage: 'https://res.cloudinary.com/aurora/image/upload/v1/aurora/member/a.png' },
			{ memberImage: 'uploads/member/a.jpg' },
			{ memberImage: '/img/profile/default-user.png' },
			{ memberImage: '' },
			{ memberFullName: 'f'.repeat(100), memberAddress: 'a'.repeat(200) },
		]) {
			for (const result of await save(input)) expect(result.body.errors).toBeUndefined();
		}
		const stored = await model(app, 'Member').findById(member._id).lean();
		expect(stored.memberPhone).toBe('+821011112222');
	});

	it('stores a blank full name as no full name, the same way signup does', async () => {
		const member = await seedMember(app, 'nameowner');
		const saveName = `mutation UpdateMember($input: MemberUpdate!) {
			updateMember(input: $input) { memberFullName }
		}`;

		const named = await graphQL(
			app,
			saveName,
			{ input: { memberFullName: 'Name Owner' } },
			member.accessToken,
		);
		expect(named.body.data.updateMember.memberFullName).toBe('Name Owner');

		const blank = await graphQL(
			app,
			saveName,
			{ input: { memberFullName: '   ' } },
			member.accessToken,
		);
		expect(blank.body.errors).toBeUndefined();
		expect(blank.body.data.updateMember.memberFullName).toBeNull();
		expect((await model(app, 'Member').findById(member._id).lean()).memberFullName).toBeNull();
	});

	it('rejects a password made only of spaces on signup and password change', async () => {
		const blankSignup = await graphQL(app, signup, {
			input: { memberNick: 'spacepass', memberPassword: '      ' },
		});
		expect(blankSignup.body.errors?.[0].extensions.code).toBe('BAD_REQUEST');
		expect(await model(app, 'Member').countDocuments({})).toBe(0);

		const member = await seedMember(app, 'passowner');
		const blankChange = await graphQL(
			app,
			`mutation ChangePassword($input: ChangePasswordInput!) { changePassword(input: $input) }`,
			{ input: { currentPassword: 'pass1234', newPassword: '      ', confirmPassword: '      ' } },
			member.accessToken,
		);
		expect(blankChange.body.errors?.[0].extensions.code).toBe('BAD_REQUEST');
		const unchanged = await graphQL(app, login, {
			input: { memberNick: 'passowner', memberPassword: 'pass1234' },
		});
		expect(unchanged.body.errors).toBeUndefined();

		// A space inside a real password stays allowed
		const spaced = await graphQL(app, signup, {
			input: { memberNick: 'spaced', memberPassword: 'pass 1234' },
		});
		expect(spaced.body.errors).toBeUndefined();
	});

	it('stamps deletedAt on an admin delete, clears it on restore and keeps the nickname reserved', async () => {
		const admin = await seedMember(app, 'deleteadmin', MemberType.ADMIN);
		const target = await seedMember(app, 'deleteduser');
		const update = (input: Record<string, unknown>) =>
			graphQL(
				app,
				`mutation UpdateMemberByAdmin($input: AdminUpdateMemberInput!) {
					updateMemberByAdmin(input: $input) { memberStatus deletedAt }
				}`,
				{ input: { _id: target._id, ...input } },
				admin.accessToken,
			);

		const deleted = await update({ memberStatus: 'DELETED' });
		expect(deleted.body.errors).toBeUndefined();
		expect(deleted.body.data.updateMemberByAdmin.memberStatus).toBe('DELETED');
		expect(deleted.body.data.updateMemberByAdmin.deletedAt).toBeTruthy();

		// The account can be restored, so nobody else may take its nickname meanwhile
		const taken = await graphQL(app, signup, {
			input: { memberNick: 'deleteduser', memberPassword: 'pass1234' },
		});
		expect(taken.body.errors?.[0].message).toBe(Messages.DUPLICATE_DATA);

		// An edit that carries no status leaves the deletion mark alone
		const edited = await update({ memberFullName: 'Deleted User' });
		expect(edited.body.data.updateMemberByAdmin.deletedAt).toBeTruthy();

		const restored = await update({ memberStatus: 'ACTIVE' });
		expect(restored.body.data.updateMemberByAdmin.memberStatus).toBe('ACTIVE');
		expect(restored.body.data.updateMemberByAdmin.deletedAt).toBeNull();
		const signedIn = await graphQL(app, login, {
			input: { memberNick: 'deleteduser', memberPassword: 'pass1234' },
		});
		expect(signedIn.body.errors).toBeUndefined();
	});

	it('reports a missing member as not found instead of a server error', async () => {
		const admin = await seedMember(app, 'missingadmin', MemberType.ADMIN);
		const deleted = await seedMember(app, 'missinguser');
		await model(app, 'Member').updateOne(
			{ _id: deleted._id },
			{ memberStatus: MemberStatus.DELETED },
		);
		const unknownId = '507f1f77bcf86cd799439011';
		const getMember = `query GetMember($input: String!) { getMember(input: $input) { _id } }`;

		for (const result of [
			await graphQL(app, getMember, { input: unknownId }),
			await graphQL(app, getMember, { input: deleted._id }),
			await graphQL(
				app,
				updateMemberByAdmin,
				{ input: { _id: unknownId, memberFullName: 'Nobody' } },
				admin.accessToken,
			),
		]) {
			expect(result.status).toBe(200);
			expect(result.body.errors?.[0]).toMatchObject({
				message: Messages.MEMBER_NOT_FOUND,
				extensions: { code: 'NOT_FOUND' },
			});
		}
	});

	it('finds a member by nickname through the nickname index, not a scan of every member', async () => {
		await seedMember(app, 'indexedlogin');
		const db = app.get<Connection>(getConnectionToken()).db!;
		await db.command({ profile: 2, slowms: 0 });
		try {
			const result = await graphQL(app, login, {
				input: { memberNick: 'indexedlogin', memberPassword: 'pass1234' },
			});
			expect(result.body.errors).toBeUndefined();
			const lookups = await db
				.collection('system.profile')
				.find({ ns: `${db.databaseName}.members`, 'command.filter.memberNick': { $exists: true } })
				.toArray();
			expect(lookups.length).toBeGreaterThan(0);
			expect(lookups.map((entry) => entry.planSummary)).not.toContainEqual(
				expect.stringMatching(/COLLSCAN/),
			);
		} finally {
			await db.command({ profile: 0 });
			await db
				.collection('system.profile')
				.drop()
				.catch(() => undefined);
		}
	});
});
