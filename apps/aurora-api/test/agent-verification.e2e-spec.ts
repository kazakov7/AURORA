import { INestApplication } from '@nestjs/common';
import { NotificationService } from '../src/components/notification/notification.service';
import { Messages } from '../src/libs/enums/common.enum';
import { DestinationStatus } from '../src/libs/enums/destination';
import { MemberType } from '../src/libs/enums/member.enum';
import { PropertyStatus } from '../src/libs/enums/property.enum';
import { clearDatabase, createTestApp, graphQL, model, seedMember } from './helpers/e2e.helper';

describe('Agent verification (e2e)', () => {
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

	const SUBMIT = `mutation Submit($input: AgentInput!) {
		submitAgentApplication(input: $input) { _id verificationStatus businessNumber }
	}`;
	const APPROVE = `mutation Approve($input: String!) {
		approveAgentApplication(input: $input) { _id verificationStatus }
	}`;
	const REJECT = `mutation Reject($input: RejectAgentApplicationInput!) {
		rejectAgentApplication(input: $input) { _id verificationStatus }
	}`;
	const REVOKE = `mutation Revoke($input: RevokeAgentInput!) {
		revokeAgentByAdmin(input: $input) { _id verificationStatus rejectionReason }
	}`;
	const UPDATE_MEMBER = `mutation UpdateMember($input: AdminUpdateMemberInput!) {
		updateMemberByAdmin(input: $input) { _id memberStatus memberType }
	}`;

	function application(businessNumber: string, extra: object = {}) {
		return {
			agentType: 'HOTEL',
			companyName: 'Aurora Stays',
			businessNumber,
			companyAddress: 'Seoul',
			...extra,
		};
	}

	function submit(token: string, businessNumber: string, extra: object = {}) {
		return graphQL(app, SUBMIT, { input: application(businessNumber, extra) }, token);
	}

	async function approvedAgent(nick: string, businessNumber: string, adminToken: string) {
		const member = await seedMember(app, nick);
		const submitted = await submit(member.accessToken, businessNumber);
		const agentId = submitted.body.data.submitAgentApplication._id;
		await graphQL(app, APPROVE, { input: agentId }, adminToken);
		return { member, agentId };
	}

	async function memberType(memberId: string) {
		return (await model(app, 'Member').findById(memberId).lean()).memberType;
	}

	it('refuses a second application for one business in another spelling', async () => {
		const admin = await seedMember(app, 'bizadmin', MemberType.ADMIN);
		const first = await seedMember(app, 'bizfirst');
		const second = await seedMember(app, 'bizsecond');

		const submitted = await submit(first.accessToken, ' 123-45-67890 ');
		expect(submitted.body.errors).toBeUndefined();
		expect(submitted.body.data.submitAgentApplication.businessNumber).toBe('123-45-67890');
		const stored = await model(app, 'Agent').findOne({ memberId: first._id }).lean();
		expect(stored.businessNumberKey).toBe('1234567890');

		for (const spelling of ['123 45 67890', '1234567890', '123.45.67890']) {
			expect((await submit(second.accessToken, spelling)).body.errors?.[0]).toMatchObject({
				message: Messages.AGENT_BUSINESS_EXISTS,
				extensions: { code: 'BAD_REQUEST' },
			});
		}
		expect((await submit(first.accessToken, '999-99-99999')).body.errors?.[0].message).toBe(
			Messages.AGENT_APPLICATION_EXISTS,
		);

		for (const invalid of [
			application('---'),
			application('123', { companyName: '   ' }),
			application('123', { companyName: 'a'.repeat(201) }),
			application('123', { companyAddress: '  ' }),
			application('1'.repeat(51)),
		]) {
			const rejected = await graphQL(app, SUBMIT, { input: invalid }, second.accessToken);
			expect(rejected.body.errors?.[0].extensions.code).toBe('BAD_REQUEST');
		}

		// A rejected application frees the business number
		await graphQL(
			app,
			REJECT,
			{ input: { _id: stored._id.toString(), rejectionReason: 'Wrong documents' } },
			admin.accessToken,
		);
		expect((await submit(second.accessToken, '123 45 67890')).body.errors).toBeUndefined();
	});

	it('keeps a saved application when the admin notification fails', async () => {
		const user = await seedMember(app, 'notifyuser');
		jest
			.spyOn(app.get(NotificationService), 'notifyActiveAdmins')
			.mockRejectedValue(new Error('notification store is down'));

		const submitted = await submit(user.accessToken, '555-55-55555');
		expect(submitted.body.errors).toBeUndefined();
		expect(submitted.body.data.submitAgentApplication.verificationStatus).toBe('PENDING');
		expect(await model(app, 'Agent').countDocuments({ memberId: user._id })).toBe(1);
	});

	it('revokes an approved agent and gives back the role, the listings and the business number', async () => {
		const admin = await seedMember(app, 'revokeadmin', MemberType.ADMIN);
		const user = await seedMember(app, 'revokeuser');
		const { member: agent, agentId } = await approvedAgent(
			'revokeagent',
			'777-77-77777',
			admin.accessToken,
		);
		expect(await memberType(agent._id)).toBe('AGENT');

		const destination = await model(app, 'Destination').create({
			destinationName: 'Seoul',
			destinationSlug: 'seoul',
			destinationCountry: 'South Korea',
			destinationStatus: DestinationStatus.ACTIVE,
		});
		const property = await model(app, 'Property').create({
			memberId: agent._id,
			destinationId: destination._id,
			propertyType: 'HOTEL',
			propertyStatus: PropertyStatus.PENDING,
			propertyName: 'Aurora Hotel',
			propertyAddress: 'Gangnam',
			pricePerNight: 100,
			currency: 'USD',
			maxGuests: 2,
		});
		await graphQL(
			app,
			`mutation S($input: UpdatePropertyStatusInput!) { updatePropertyStatusByAdmin(input: $input) { _id } }`,
			{ input: { _id: property._id.toString(), propertyStatus: 'ACTIVE' } },
			admin.accessToken,
		);

		const pending = await submit(user.accessToken, '888-88-88888');
		const pendingId = pending.body.data.submitAgentApplication._id;
		for (const _id of [pendingId, destination._id.toString()]) {
			const refused = await graphQL(
				app,
				REVOKE,
				{ input: { _id, revokeReason: 'Fraud' } },
				admin.accessToken,
			);
			expect(refused.body.errors?.[0].message).toBe(Messages.AGENT_NOT_FOUND);
		}
		const notAdmin = await graphQL(
			app,
			REVOKE,
			{ input: { _id: agentId, revokeReason: 'Fraud' } },
			user.accessToken,
		);
		expect(notAdmin.body.errors).toBeDefined();
		expect(
			(
				await graphQL(
					app,
					REVOKE,
					{ input: { _id: agentId, revokeReason: '  ' } },
					admin.accessToken,
				)
			).body.errors?.[0].extensions.code,
		).toBe('BAD_REQUEST');

		const revoked = await graphQL(
			app,
			REVOKE,
			{ input: { _id: agentId, revokeReason: ' Fake business ' } },
			admin.accessToken,
		);
		expect(revoked.body.errors).toBeUndefined();
		expect(revoked.body.data.revokeAgentByAdmin).toMatchObject({
			verificationStatus: 'REVOKED',
			rejectionReason: 'Fake business',
		});
		expect(await memberType(agent._id)).toBe('USER');
		expect((await model(app, 'Property').findById(property._id).lean()).propertyStatus).toBe(
			'INACTIVE',
		);
		expect((await model(app, 'Member').findById(agent._id).lean()).memberProperties).toBe(0);
		expect(
			(await model(app, 'Destination').findById(destination._id).lean()).destinationProperties,
		).toBe(0);
		expect(
			await model(app, 'Notification').countDocuments({
				receiverId: agent._id,
				notificationTitle: 'Agent status revoked',
			}),
		).toBe(1);

		// The former agent lost the role, and the business number is free again
		const created = await graphQL(
			app,
			`mutation C($input: CreatePropertyInput!) { createProperty(input: $input) { _id } }`,
			{
				input: {
					destinationId: destination._id.toString(),
					propertyType: 'HOTEL',
					propertyName: 'Second Hotel',
					propertyAddress: 'Mapo',
					pricePerNight: 100,
					currency: 'USD',
					maxGuests: 2,
				},
			},
			agent.accessToken,
		);
		expect(created.body.errors).toBeDefined();
		expect((await submit(agent.accessToken, '777 77 77777')).body.errors).toBeUndefined();
		expect(
			(
				await graphQL(
					app,
					REVOKE,
					{ input: { _id: agentId, revokeReason: 'Again' } },
					admin.accessToken,
				)
			).body.errors?.[0].message,
		).toBe(Messages.AGENT_NOT_FOUND);
	});

	it('gives up the agent role of a deleted member and keeps it for a blocked one', async () => {
		const admin = await seedMember(app, 'deladmin', MemberType.ADMIN);
		const newcomer = await seedMember(app, 'delnewcomer');
		const { member: agent, agentId } = await approvedAgent(
			'delagent',
			'333-33-33333',
			admin.accessToken,
		);
		const setStatus = async (memberStatus: string) =>
			await graphQL(
				app,
				UPDATE_MEMBER,
				{ input: { _id: agent._id, memberStatus } },
				admin.accessToken,
			);
		const agentStatus = async () =>
			(await model(app, 'Agent').findById(agentId).lean()).verificationStatus;

		expect((await setStatus('BLOCKED')).body.data.updateMemberByAdmin.memberType).toBe('AGENT');
		expect(await agentStatus()).toBe('APPROVED');
		expect((await submit(newcomer.accessToken, '33333 33333')).body.errors?.[0].message).toBe(
			Messages.AGENT_BUSINESS_EXISTS,
		);
		await setStatus('ACTIVE');

		const deleted = await setStatus('DELETED');
		expect(deleted.body.errors).toBeUndefined();
		expect(deleted.body.data.updateMemberByAdmin).toMatchObject({
			memberStatus: 'DELETED',
			memberType: 'USER',
		});
		expect(await agentStatus()).toBe('REVOKED');
		expect((await submit(newcomer.accessToken, '33333 33333')).body.errors).toBeUndefined();
	});
});
