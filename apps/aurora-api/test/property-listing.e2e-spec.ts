import { INestApplication } from '@nestjs/common';
import { Types } from 'mongoose';
import { AgentType, AgentVerificationStatus } from '../src/libs/enums/agent.enum';
import { BookingCategory, BookingStatus } from '../src/libs/enums/booking.enum';
import { Messages } from '../src/libs/enums/common.enum';
import { DestinationStatus } from '../src/libs/enums/destination';
import { MemberStatus, MemberType } from '../src/libs/enums/member.enum';
import { PropertyStatus } from '../src/libs/enums/property.enum';
import { clearDatabase, createTestApp, graphQL, model, seedMember } from './helpers/e2e.helper';

describe('Property listing (e2e)', () => {
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

	const LIST = `query GetProperties($input: PropertiesInquiry!) {
		getProperties(input: $input) { list { _id propertyName memberData { _id } } metaCounter { total } }
	}`;
	const CREATE = `mutation Create($input: CreatePropertyInput!) {
		createProperty(input: $input) { _id propertyDesc }
	}`;
	const UPDATE = `mutation Update($input: UpdatePropertyInput!) {
		updateProperty(input: $input) { _id propertyDesc propertyCity }
	}`;
	const UPDATE_STATUS = `mutation UpdateStatus($input: UpdatePropertyStatusInput!) {
		updatePropertyStatusByAdmin(input: $input) { _id propertyStatus }
	}`;

	async function hotelAgent(nick: string) {
		const member = await seedMember(app, nick, MemberType.AGENT);
		await model(app, 'Agent').create({
			memberId: member._id,
			agentType: AgentType.HOTEL,
			companyName: `${nick} company`,
			businessNumber: `${nick}-business`,
			companyAddress: 'Seoul',
			verificationStatus: AgentVerificationStatus.APPROVED,
			verifiedAt: new Date(),
		});
		return member;
	}

	async function activeDestination() {
		return await model(app, 'Destination').create({
			destinationName: 'Japan',
			destinationSlug: 'japan',
			destinationCountry: 'JP',
			destinationStatus: DestinationStatus.ACTIVE,
		});
	}

	async function seedProperty(memberId: string, destinationId: unknown, extra: object = {}) {
		return await model(app, 'Property').create({
			memberId,
			destinationId,
			propertyType: 'HOTEL',
			propertyStatus: PropertyStatus.ACTIVE,
			propertyName: 'Aurora Hotel',
			propertyAddress: 'Tokyo',
			pricePerNight: 100,
			currency: 'USD',
			maxGuests: 2,
			...extra,
		});
	}

	function propertyInput(destinationId: unknown, extra: object = {}) {
		return {
			destinationId: String(destinationId),
			propertyType: 'HOTEL',
			propertyName: 'Aurora Hotel',
			propertyAddress: 'Tokyo',
			pricePerNight: 100,
			currency: 'USD',
			maxGuests: 2,
			...extra,
		};
	}

	it('rejects null and blank required fields on update and keeps the catalog readable', async () => {
		const agent = await hotelAgent('nullagent');
		const destination = await activeDestination();
		const property = await seedProperty(agent._id, destination._id, { propertyCity: 'Tokyo' });
		const _id = property._id.toString();

		for (const input of [
			{ propertyName: null },
			{ propertyName: '   ' },
			{ propertyAddress: null },
			{ propertyType: null },
			{ pricePerNight: null },
			{ currency: null },
			{ maxGuests: null },
			{ bedrooms: null },
			{ amenities: null },
			{ propertyImages: null },
		]) {
			const rejected = await graphQL(app, UPDATE, { input: { _id, ...input } }, agent.accessToken);
			expect(rejected.body.errors?.[0].extensions.code).toBe('BAD_REQUEST');
		}

		const cleared = await graphQL(
			app,
			UPDATE,
			{ input: { _id, propertyDesc: null, propertyCity: null } },
			agent.accessToken,
		);
		expect(cleared.body.errors).toBeUndefined();
		expect(cleared.body.data.updateProperty).toMatchObject({
			propertyDesc: null,
			propertyCity: null,
		});

		const stored = await model(app, 'Property').findById(_id).lean();
		expect(stored).toMatchObject({
			propertyName: 'Aurora Hotel',
			pricePerNight: 100,
			maxGuests: 2,
		});

		const catalog = await graphQL(app, LIST, { input: { page: 1, limit: 10, search: {} } });
		expect(catalog.body.errors).toBeUndefined();
		expect(catalog.body.data.getProperties.list).toHaveLength(1);
	});

	it('accepts an empty description and rejects values that would break the listing', async () => {
		const agent = await hotelAgent('formagent');
		const destination = await activeDestination();

		for (const propertyDesc of ['', 'abc']) {
			const created = await graphQL(
				app,
				CREATE,
				{ input: propertyInput(destination._id, { propertyDesc }) },
				agent.accessToken,
			);
			expect(created.body.errors).toBeUndefined();
			expect(created.body.data.createProperty.propertyDesc).toBe(propertyDesc);
		}

		for (const extra of [
			{ propertyName: '   ' },
			{ propertyAddress: '   ' },
			{ pricePerNight: 10.999 },
			{ bedrooms: null },
			{ amenities: null },
			{ propertyImages: ['javascript:alert(1)'] },
			{ propertyImages: Array.from({ length: 11 }, (_, i) => `uploads/property/${i}.jpg`) },
		]) {
			const rejected = await graphQL(
				app,
				CREATE,
				{ input: propertyInput(destination._id, extra) },
				agent.accessToken,
			);
			expect(rejected.body.errors?.[0].extensions.code).toBe('BAD_REQUEST');
		}

		const withImages = await graphQL(
			app,
			CREATE,
			{
				input: propertyInput(destination._id, {
					pricePerNight: 99.99,
					propertyImages: ['uploads/property/hotel.jpg', 'https://cdn.example.com/hotel.png'],
				}),
			},
			agent.accessToken,
		);
		expect(withImages.body.errors).toBeUndefined();
		expect(await model(app, 'Property').countDocuments({})).toBe(3);
	});

	it('counts only active hotels in the owner and destination counters', async () => {
		const agent = await hotelAgent('cntagent');
		const admin = await seedMember(app, 'cntadmin', MemberType.ADMIN);
		const destination = await activeDestination();
		const created = await graphQL(
			app,
			CREATE,
			{ input: propertyInput(destination._id) },
			agent.accessToken,
		);
		const propertyId = created.body.data.createProperty._id;
		const counters = async () => [
			(await model(app, 'Member').findById(agent._id).lean()).memberProperties,
			(await model(app, 'Destination').findById(destination._id).lean()).destinationProperties,
		];
		const setStatus = async (propertyStatus: string) =>
			await graphQL(
				app,
				UPDATE_STATUS,
				{ input: { _id: propertyId, propertyStatus } },
				admin.accessToken,
			);
		expect(await counters()).toEqual([0, 0]);

		for (const [propertyStatus, expected] of [
			['ACTIVE', [1, 1]],
			['ACTIVE', [1, 1]],
			['INACTIVE', [0, 0]],
			['REJECTED', [0, 0]],
			['ACTIVE', [1, 1]],
			['INACTIVE', [0, 0]],
		] as const) {
			expect((await setStatus(propertyStatus)).body.errors).toBeUndefined();
			expect(await counters()).toEqual(expected);
		}

		const removed = await graphQL(
			app,
			`mutation Remove($id: String!) { removePropertyByAdmin(propertyId: $id) { _id deletedAt } }`,
			{ id: propertyId },
			admin.accessToken,
		);
		expect(removed.body.errors).toBeUndefined();
		expect(await counters()).toEqual([0, 0]);
	});

	it('keeps inactive and removed hotels out of the favorites and visited lists', async () => {
		const agent = await hotelAgent('favagent');
		const user = await seedMember(app, 'favuser');
		const destination = await activeDestination();
		const [kept, inactive, removed] = await Promise.all(
			['Kept Hotel', 'Inactive Hotel', 'Removed Hotel'].map((propertyName) =>
				seedProperty(agent._id, destination._id, { propertyName }),
			),
		);
		for (const property of [kept, inactive, removed]) {
			const variables = { id: property._id.toString() };
			await graphQL(
				app,
				`mutation Like($id: String!) { likeTargetProperty(propertyId: $id) { _id } }`,
				variables,
				user.accessToken,
			);
			await graphQL(
				app,
				`query Detail($id: String!) { getProperty(propertyId: $id) { _id } }`,
				variables,
				user.accessToken,
			);
		}
		await model(app, 'Property').updateOne(
			{ _id: inactive._id },
			{ propertyStatus: PropertyStatus.INACTIVE },
		);
		await model(app, 'Property').updateOne(
			{ _id: removed._id },
			{ propertyStatus: PropertyStatus.INACTIVE, deletedAt: new Date() },
		);

		const result = await graphQL(
			app,
			`query Saved($input: OrdinaryInquery!) {
				getFavorites(input: $input) { list { propertyName } metaCounter { total } }
				getVisited(input: $input) { list { propertyName } metaCounter { total } }
			}`,
			{ input: { page: 1, limit: 10 } },
			user.accessToken,
		);

		expect(result.body.errors).toBeUndefined();
		for (const saved of [result.body.data.getFavorites, result.body.data.getVisited]) {
			expect(saved.list).toEqual([{ propertyName: 'Kept Hotel' }]);
			expect(saved.metaCounter).toEqual([{ total: 1 }]);
		}
	});

	it('answers mutations without owner data and opens a hotel whose owner account is gone', async () => {
		const agent = await hotelAgent('owneragent');
		const user = await seedMember(app, 'owneruser');
		const destination = await activeDestination();
		const property = await seedProperty(agent._id, destination._id);
		const variables = { id: property._id.toString() };
		const DETAIL = `query Detail($id: String!) {
			getProperty(propertyId: $id) { _id memberData { _id memberStatus } }
		}`;

		const liked = await graphQL(
			app,
			`mutation Like($id: String!) {
				likeTargetProperty(propertyId: $id) { _id propertyLikes memberData { _id } }
			}`,
			variables,
			user.accessToken,
		);
		expect(liked.body.errors).toBeUndefined();
		expect(liked.body.data.likeTargetProperty).toMatchObject({
			propertyLikes: 1,
			memberData: null,
		});

		const withOwner = await graphQL(app, DETAIL, variables);
		expect(withOwner.body.data.getProperty.memberData).toEqual({
			_id: agent._id,
			memberStatus: 'ACTIVE',
		});

		await model(app, 'Member').updateOne(
			{ _id: agent._id },
			{ memberStatus: MemberStatus.DELETED, deletedAt: new Date() },
		);
		const ownerDeleted = await graphQL(app, DETAIL, variables);
		expect(ownerDeleted.body.errors).toBeUndefined();
		expect(ownerDeleted.body.data.getProperty).toEqual({ _id: variables.id, memberData: null });

		await model(app, 'Member').deleteOne({ _id: agent._id });
		const catalog = await graphQL(app, LIST, { input: { page: 1, limit: 10, search: {} } });
		expect(catalog.body.errors).toBeUndefined();
		expect(catalog.body.data.getProperties.list).toEqual([
			{ _id: variables.id, propertyName: 'Aurora Hotel', memberData: null },
		]);
		expect(catalog.body.data.getProperties.metaCounter).toEqual([{ total: 1 }]);

		const missing = await graphQL(app, DETAIL, { id: new Types.ObjectId().toString() });
		expect(missing.body.errors?.[0]).toMatchObject({
			message: Messages.PROPERTY_NOT_FOUND,
			extensions: { code: 'NOT_FOUND' },
		});
	});

	it('validates the nested search object and ignores blank filters', async () => {
		const agent = await hotelAgent('searchagent');
		const destination = await activeDestination();
		await seedProperty(agent._id, destination._id);
		const search = async (value: object) =>
			await graphQL(app, LIST, { input: { page: 1, limit: 10, search: value } });

		for (const invalid of [
			{ bedrooms: -3 },
			{ beds: -1 },
			{ minGuests: 0 },
			{ pricePerNightRange: { start: -10, end: 100 } },
			{ text: 'a'.repeat(101) },
		]) {
			const rejected = await search(invalid);
			expect(rejected.body.errors?.[0].extensions.code).toBe('BAD_REQUEST');
		}

		for (const valid of [
			{},
			{ text: '   ' },
			{ text: ' aurora ' },
			{ bedrooms: null, beds: null },
			{ bedrooms: 1, minGuests: 2, pricePerNightRange: { start: 0, end: 100 } },
		]) {
			const found = await search(valid);
			expect(found.body.errors).toBeUndefined();
			expect(found.body.data.getProperties.metaCounter).toEqual([{ total: 1 }]);
		}
	});

	it('notifies the owner about every status change, including a repeated status', async () => {
		const agent = await hotelAgent('statusagent');
		const admin = await seedMember(app, 'statusadmin', MemberType.ADMIN);
		const destination = await activeDestination();
		const property = await seedProperty(agent._id, destination._id, {
			propertyStatus: PropertyStatus.PENDING,
		});
		const steps = ['ACTIVE', 'INACTIVE', 'ACTIVE', 'INACTIVE'];

		for (const propertyStatus of steps) {
			const updated = await graphQL(
				app,
				UPDATE_STATUS,
				{ input: { _id: property._id.toString(), propertyStatus } },
				admin.accessToken,
			);
			expect(updated.body.errors).toBeUndefined();
		}

		const notifications = await model(app, 'Notification')
			.find({ receiverId: new Types.ObjectId(agent._id) })
			.sort({ createdAt: 1, _id: 1 })
			.lean();
		expect(notifications.map((notification) => notification.notificationDesc)).toEqual(
			steps.map((propertyStatus) => `Your hotel listing status is now ${propertyStatus}.`),
		);
	});

	it('pages through hotels that share the same sort value without repeats', async () => {
		const agent = await hotelAgent('pageagent');
		const destination = await activeDestination();
		await model(app, 'Property').insertMany(
			Array.from({ length: 25 }, (_, i) => ({
				memberId: agent._id,
				destinationId: destination._id,
				propertyType: 'HOTEL',
				propertyStatus: PropertyStatus.ACTIVE,
				propertyName: `Tied Hotel ${i}`,
				propertyAddress: 'Tokyo',
				pricePerNight: 100,
				currency: 'USD',
				maxGuests: 2,
			})),
		);

		const ids: string[] = [];
		for (const page of [1, 2, 3]) {
			const result = await graphQL(app, LIST, {
				input: { page, limit: 10, sort: 'propertyLikes', direction: 'DESC', search: {} },
			});
			expect(result.body.errors).toBeUndefined();
			ids.push(...result.body.data.getProperties.list.map((property) => property._id));
		}

		expect(ids).toHaveLength(25);
		expect(new Set(ids).size).toBe(25);
	});

	it('sends an edited rejected hotel back to the admin queue and keeps an active one live', async () => {
		const agent = await hotelAgent('editagent');
		const destination = await activeDestination();
		const rejected = await seedProperty(agent._id, destination._id, {
			propertyStatus: PropertyStatus.REJECTED,
		});
		const active = await seedProperty(agent._id, destination._id);
		const inactive = await seedProperty(agent._id, destination._id, {
			propertyStatus: PropertyStatus.INACTIVE,
		});
		const edit = async (property: { _id: unknown }) =>
			await graphQL(
				app,
				`mutation Update($input: UpdatePropertyInput!) {
					updateProperty(input: $input) { propertyStatus propertyCity }
				}`,
				{ input: { _id: String(property._id), propertyCity: 'Osaka' } },
				agent.accessToken,
			);

		expect((await edit(rejected)).body.data.updateProperty).toEqual({
			propertyStatus: 'PENDING',
			propertyCity: 'Osaka',
		});
		expect((await edit(active)).body.data.updateProperty).toEqual({
			propertyStatus: 'ACTIVE',
			propertyCity: 'Osaka',
		});
		const refused = (await edit(inactive)).body.errors?.[0];
		expect(refused.message).toBe(Messages.UPDATE_FAILED);
		expect(refused.extensions.code).toBe('BAD_REQUEST');
	});

	it('shows the owner every status and opens a hotel outside ACTIVE only for its owner and admins', async () => {
		const agent = await hotelAgent('prevagent');
		const admin = await seedMember(app, 'prevadmin', MemberType.ADMIN);
		const user = await seedMember(app, 'prevuser');
		const destination = await activeDestination();
		const statuses = ['PENDING', 'ACTIVE', 'INACTIVE', 'REJECTED'];
		const properties = await Promise.all(
			statuses.map((propertyStatus) =>
				seedProperty(agent._id, destination._id, { propertyStatus }),
			),
		);
		const AGENT_LIST = `query Mine($input: AgentPropertiesInquiry!) {
			getAgentProperties(input: $input) { list { propertyStatus } metaCounter { total } }
		}`;
		const DETAIL = `query Detail($id: String!) { getProperty(propertyId: $id) { _id propertyViews } }`;

		const everything = await graphQL(
			app,
			AGENT_LIST,
			{ input: { page: 1, limit: 10, search: {} } },
			agent.accessToken,
		);
		expect(everything.body.errors).toBeUndefined();
		expect(
			everything.body.data.getAgentProperties.list.map((item) => item.propertyStatus).sort(),
		).toEqual([...statuses].sort());

		const filtered = await graphQL(
			app,
			AGENT_LIST,
			{ input: { page: 1, limit: 10, search: { propertyStatus: 'INACTIVE' } } },
			agent.accessToken,
		);
		expect(filtered.body.data.getAgentProperties.list).toEqual([{ propertyStatus: 'INACTIVE' }]);

		for (const property of properties) {
			const id = property._id.toString();
			const isActive = property.propertyStatus === PropertyStatus.ACTIVE;

			for (const token of [undefined, user.accessToken]) {
				const result = await graphQL(app, DETAIL, { id }, token);
				if (isActive) expect(result.body.errors).toBeUndefined();
				else expect(result.body.errors?.[0].extensions.code).toBe('NOT_FOUND');
			}
			// The owner opens the hotel twice
			for (const token of [agent.accessToken, admin.accessToken, agent.accessToken]) {
				const result = await graphQL(app, DETAIL, { id }, token);
				expect(result.body.errors).toBeUndefined();
				expect(result.body.data.getProperty._id).toBe(id);
			}

			// The signed-in user, the owner and the admin each count once on the live hotel, never on a preview
			const stored = await model(app, 'Property').findById(id).lean();
			expect(stored.propertyViews).toBe(isActive ? 3 : 0);
		}
	});

	it('activates a hotel only in an active destination and under an active, approved owner', async () => {
		const agent = await hotelAgent('ruleagent');
		const admin = await seedMember(app, 'ruleadmin', MemberType.ADMIN);
		const destination = await activeDestination();
		const property = await seedProperty(agent._id, destination._id, {
			propertyStatus: PropertyStatus.PENDING,
		});
		const activate = async () =>
			await graphQL(
				app,
				UPDATE_STATUS,
				{ input: { _id: property._id.toString(), propertyStatus: 'ACTIVE' } },
				admin.accessToken,
			);

		await model(app, 'Destination').updateOne(
			{ _id: destination._id },
			{ destinationStatus: DestinationStatus.INACTIVE },
		);
		expect((await activate()).body.errors?.[0].message).toBe(Messages.DESTINATION_NOT_FOUND);
		await model(app, 'Destination').updateOne(
			{ _id: destination._id },
			{ destinationStatus: DestinationStatus.ACTIVE },
		);

		await model(app, 'Member').updateOne(
			{ _id: agent._id },
			{ memberStatus: MemberStatus.BLOCKED },
		);
		expect((await activate()).body.errors?.[0].message).toBe(Messages.MEMBER_BLOCKED);
		await model(app, 'Member').updateOne(
			{ _id: agent._id },
			{ memberStatus: MemberStatus.DELETED, deletedAt: new Date() },
		);
		expect((await activate()).body.errors?.[0].message).toBe(Messages.MEMBER_NOT_FOUND);
		expect((await model(app, 'Property').findById(property._id).lean()).propertyStatus).toBe(
			'PENDING',
		);

		await model(app, 'Member').updateOne(
			{ _id: agent._id },
			{ memberStatus: MemberStatus.ACTIVE, deletedAt: null },
		);
		// A revoked agent no longer runs hotels, so its hotel cannot go back into the catalog
		await model(app, 'Agent').updateOne(
			{ memberId: agent._id },
			{ verificationStatus: AgentVerificationStatus.REVOKED },
		);
		expect((await activate()).body.errors?.[0].message).toBe(Messages.AGENT_NOT_VERIFIED);
		expect((await model(app, 'Member').findById(agent._id).lean()).memberProperties).toBe(0);
		await model(app, 'Agent').updateOne(
			{ memberId: agent._id },
			{ verificationStatus: AgentVerificationStatus.APPROVED },
		);
		const activated = await activate();
		expect(activated.body.errors).toBeUndefined();
		expect(activated.body.data.updatePropertyStatusByAdmin.propertyStatus).toBe('ACTIVE');
	});

	it('keeps a hotel with an upcoming booking from being removed', async () => {
		const agent = await hotelAgent('bookagent');
		const admin = await seedMember(app, 'bookadmin', MemberType.ADMIN);
		const guest = await seedMember(app, 'bookguest');
		const destination = await activeDestination();
		const property = await seedProperty(agent._id, destination._id, {
			propertyStatus: PropertyStatus.INACTIVE,
		});
		const day = 86_400_000;
		const booking = await model(app, 'Booking').create({
			memberId: guest._id,
			bookingCategory: BookingCategory.PROPERTY,
			bookingStatus: BookingStatus.CONFIRMED,
			bookingRefId: property._id,
			checkIn: new Date(Date.now() + day),
			checkOut: new Date(Date.now() + 3 * day),
			bookingGuests: 2,
			bookingTotalPrice: 200,
			bookingCurrency: 'USD',
			priceSnapshot: { pricePerNight: 100, nights: 2 },
		});
		const remove = async () =>
			await graphQL(
				app,
				`mutation Remove($id: String!) { removePropertyByAdmin(propertyId: $id) { _id deletedAt } }`,
				{ id: property._id.toString() },
				admin.accessToken,
			);

		const refused = await remove();
		expect(refused.body.errors?.[0]).toMatchObject({
			message: Messages.PROPERTY_HAS_BOOKINGS,
			extensions: { code: 'BAD_REQUEST' },
		});
		expect((await model(app, 'Property').findById(property._id).lean()).deletedAt).toBeNull();

		await model(app, 'Booking').updateOne(
			{ _id: booking._id },
			{ bookingStatus: BookingStatus.CANCELLED },
		);
		const removed = await remove();
		expect(removed.body.errors).toBeUndefined();
		expect(removed.body.data.removePropertyByAdmin.deletedAt).toBeTruthy();
	});

	it('turns off the hotels of a blocked agent until an admin turns them back on', async () => {
		const agent = await hotelAgent('blockagent');
		const other = await hotelAgent('otheragent');
		const admin = await seedMember(app, 'blockadmin', MemberType.ADMIN);
		const destination = await activeDestination();
		const updateMember = async (memberStatus: string) =>
			await graphQL(
				app,
				`mutation UpdateMemberByAdmin($input: AdminUpdateMemberInput!) {
					updateMemberByAdmin(input: $input) { _id memberStatus }
				}`,
				{ input: { _id: agent._id, memberStatus } },
				admin.accessToken,
			);
		const setStatus = async (property: { _id: unknown }, propertyStatus: string) =>
			await graphQL(
				app,
				UPDATE_STATUS,
				{ input: { _id: String(property._id), propertyStatus } },
				admin.accessToken,
			);
		const state = async () => ({
			statuses: (
				await model(app, 'Property').find({ memberId: agent._id }).sort({ _id: 1 }).lean()
			).map((property) => property.propertyStatus),
			memberProperties: (await model(app, 'Member').findById(agent._id).lean()).memberProperties,
			destinationProperties: (await model(app, 'Destination').findById(destination._id).lean())
				.destinationProperties,
		});

		const first = await seedProperty(agent._id, destination._id, {
			propertyStatus: PropertyStatus.PENDING,
		});
		const second = await seedProperty(agent._id, destination._id, {
			propertyStatus: PropertyStatus.PENDING,
		});
		const pending = await seedProperty(agent._id, destination._id, {
			propertyStatus: PropertyStatus.PENDING,
		});
		const neighbour = await seedProperty(other._id, destination._id, {
			propertyStatus: PropertyStatus.PENDING,
		});
		for (const property of [first, second, neighbour]) await setStatus(property, 'ACTIVE');
		expect(pending.propertyStatus).toBe('PENDING');
		expect(await state()).toEqual({
			statuses: ['ACTIVE', 'ACTIVE', 'PENDING'],
			memberProperties: 2,
			destinationProperties: 3,
		});

		expect((await updateMember('BLOCKED')).body.errors).toBeUndefined();
		expect(await state()).toEqual({
			statuses: ['INACTIVE', 'INACTIVE', 'PENDING'],
			memberProperties: 0,
			destinationProperties: 1,
		});
		const catalog = await graphQL(app, LIST, { input: { page: 1, limit: 10, search: {} } });
		expect(catalog.body.data.getProperties.list.map((item) => item._id)).toEqual([
			neighbour._id.toString(),
		]);

		expect((await updateMember('ACTIVE')).body.errors).toBeUndefined();
		expect((await state()).statuses).toEqual(['INACTIVE', 'INACTIVE', 'PENDING']);

		expect((await setStatus(first, 'ACTIVE')).body.errors).toBeUndefined();
		expect(await state()).toEqual({
			statuses: ['ACTIVE', 'INACTIVE', 'PENDING'],
			memberProperties: 1,
			destinationProperties: 2,
		});
	});
});
