import { INestApplication } from '@nestjs/common';
import { Types } from 'mongoose';
import { AgentType, AgentVerificationStatus } from '../src/libs/enums/agent.enum';
import { Messages } from '../src/libs/enums/common.enum';
import { DestinationStatus } from '../src/libs/enums/destination';
import { MemberType } from '../src/libs/enums/member.enum';
import { PropertyStatus } from '../src/libs/enums/property.enum';
import { TourStatus } from '../src/libs/enums/tour.enum';
import { clearDatabase, createTestApp, graphQL, model, seedMember } from './helpers/e2e.helper';

describe('Destination listing (e2e)', () => {
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

	const DAY = 86_400_000;

	const LIST = `query GetDestinations($input: DestinationsInquiry!) {
		getDestinations(input: $input) { list { _id destinationName } metaCounter { total } }
	}`;
	const ADMIN_LIST = `query AdminList($input: AdminDestinationsInquiry!) {
		getAllDestinationsByAdmin(input: $input) { list { destinationName destinationStatus } metaCounter { total } }
	}`;
	const DETAIL = `query Detail($id: String!) {
		getDestination(destinationId: $id) { _id destinationViews destinationStatus }
	}`;
	const CREATE = `mutation Create($input: DestinationInput!) {
		createDestination(input: $input) { _id destinationSlug }
	}`;
	const UPDATE = `mutation Update($input: DestinationUpdate!) {
		updateDestinationByAdmin(input: $input) {
			_id destinationName destinationSlug destinationStatus destinationDesc latitude
			destinationProperties destinationTours
		}
	}`;
	const REMOVE = `mutation Remove($id: String!) { removeDestinationByAdmin(destinationId: $id) }`;

	async function seedCity(name: string, extra: object = {}) {
		return await model(app, 'Destination').create({
			destinationName: name,
			destinationSlug: name.toLowerCase().replace(/\s+/g, '-'),
			destinationCountry: 'South Korea',
			destinationStatus: DestinationStatus.ACTIVE,
			...extra,
		});
	}

	async function approvedAgent(nick: string, agentType: AgentType) {
		const member = await seedMember(app, nick, MemberType.AGENT);
		await model(app, 'Agent').create({
			memberId: member._id,
			agentType,
			companyName: `${nick} company`,
			businessNumber: `${nick}-business`,
			companyAddress: 'Seoul',
			verificationStatus: AgentVerificationStatus.APPROVED,
			verifiedAt: new Date(),
		});
		return member;
	}

	async function seedProperty(memberId: string, destinationId: unknown, extra: object = {}) {
		return await model(app, 'Property').create({
			memberId,
			destinationId,
			propertyType: 'HOTEL',
			propertyStatus: PropertyStatus.PENDING,
			propertyName: 'Aurora Hotel',
			propertyAddress: 'Gangnam',
			pricePerNight: 100,
			currency: 'USD',
			maxGuests: 2,
			...extra,
		});
	}

	async function seedTour(memberId: string, destinationId: unknown, extra: object = {}) {
		return await model(app, 'Tour').create({
			memberId,
			destinationId,
			tourStatus: TourStatus.PENDING,
			tourName: 'Aurora Tour',
			tourDesc: 'Palaces and markets',
			tourPrice: 100,
			tourCurrency: 'USD',
			tourStartDate: new Date(Date.now() + DAY),
			tourEndDate: new Date(Date.now() + 3 * DAY),
			tourCapacity: 10,
			...extra,
		});
	}

	function update(input: object, token: string) {
		return graphQL(app, UPDATE, { input }, token);
	}

	it('lists inactive cities for the admin only and lets the admin preview them', async () => {
		const admin = await seedMember(app, 'listadmin', MemberType.ADMIN);
		const user = await seedMember(app, 'listuser');
		const seoul = await seedCity('Seoul');
		await seedCity('Tokyo', { destinationCountry: 'Japan' });
		const busan = await seedCity('Busan', { destinationStatus: DestinationStatus.INACTIVE });
		const removed = await seedCity('Daegu', { deletedAt: new Date() });
		const adminList = async (search: object, token = admin.accessToken) =>
			await graphQL(app, ADMIN_LIST, { input: { page: 1, limit: 10, search } }, token);

		const catalog = await graphQL(app, LIST, { input: { page: 1, limit: 10, search: {} } });
		expect(catalog.body.data.getDestinations.metaCounter).toEqual([{ total: 2 }]);

		const everything = await adminList({});
		expect(everything.body.errors).toBeUndefined();
		expect(everything.body.data.getAllDestinationsByAdmin.metaCounter).toEqual([{ total: 3 }]);
		const inactive = await adminList({ destinationStatus: 'INACTIVE' });
		expect(inactive.body.data.getAllDestinationsByAdmin.list).toEqual([
			{ destinationName: 'Busan', destinationStatus: 'INACTIVE' },
		]);
		expect((await adminList({}, user.accessToken)).body.errors).toBeDefined();

		for (const token of [undefined, user.accessToken]) {
			const hidden = await graphQL(app, DETAIL, { id: busan._id.toString() }, token);
			expect(hidden.body.errors?.[0]).toMatchObject({
				message: Messages.DESTINATION_NOT_FOUND,
				extensions: { code: 'NOT_FOUND' },
			});
		}
		const preview = await graphQL(app, DETAIL, { id: busan._id.toString() }, admin.accessToken);
		expect(preview.body.data.getDestination).toMatchObject({
			destinationStatus: 'INACTIVE',
			destinationViews: 0,
		});

		const live = await graphQL(app, DETAIL, { id: seoul._id.toString() }, user.accessToken);
		expect(live.body.data.getDestination.destinationViews).toBe(1);

		for (const id of [removed._id.toString(), new Types.ObjectId().toString()]) {
			const missing = await graphQL(app, DETAIL, { id }, admin.accessToken);
			expect(missing.body.errors?.[0].extensions.code).toBe('NOT_FOUND');
		}
		const liked = await graphQL(
			app,
			`mutation Like($id: String!) { likeTargetDestination(destinationId: $id) { _id } }`,
			{ id: busan._id.toString() },
			user.accessToken,
		);
		expect(liked.body.errors?.[0].extensions.code).toBe('NOT_FOUND');
	});

	it('rejects null and blank required fields on update and keeps the catalog readable', async () => {
		const admin = await seedMember(app, 'nulladmin', MemberType.ADMIN);
		const seoul = await seedCity('Seoul', { destinationDesc: 'Capital city', latitude: 37.5 });
		const _id = seoul._id.toString();

		for (const input of [
			{ destinationName: null },
			{ destinationName: '   ' },
			{ destinationCountry: null },
			{ destinationStatus: null },
			{ destinationImages: null },
			{ destinationImages: ['javascript:alert(1)'] },
			{ latitude: 91 },
			{ longitude: -181 },
		]) {
			const rejected = await update({ _id, ...input }, admin.accessToken);
			expect(rejected.body.errors?.[0].extensions.code).toBe('BAD_REQUEST');
		}
		// The slug follows the name and cannot be set on its own
		expect(
			(await update({ _id, destinationSlug: 'x' }, admin.accessToken)).body.errors,
		).toBeDefined();

		const cleared = await update({ _id, destinationDesc: null, latitude: null }, admin.accessToken);
		expect(cleared.body.errors).toBeUndefined();
		expect(cleared.body.data.updateDestinationByAdmin).toMatchObject({
			destinationName: 'Seoul',
			destinationSlug: 'seoul',
			destinationStatus: 'ACTIVE',
			destinationDesc: null,
			latitude: null,
		});

		const catalog = await graphQL(app, LIST, { input: { page: 1, limit: 10, search: {} } });
		expect(catalog.body.errors).toBeUndefined();
		expect(catalog.body.data.getDestinations.list).toHaveLength(1);
	});

	it('derives the slug from the name and refuses a second city of the same name', async () => {
		const admin = await seedMember(app, 'slugadmin', MemberType.ADMIN);
		const create = async (destinationName: string) =>
			await graphQL(
				app,
				CREATE,
				{ input: { destinationName, destinationCountry: 'Côte d’Ivoire' } },
				admin.accessToken,
			);

		const abidjan = await create("  Grand-Bassam d'Ivoire ");
		expect(abidjan.body.errors).toBeUndefined();
		expect(abidjan.body.data.createDestination.destinationSlug).toBe('grand-bassam-d-ivoire');

		for (const name of ['Grand Bassam D’Ivoire', 'GRAND BASSAM D IVOIRE']) {
			const duplicate = await create(name);
			expect(duplicate.body.errors?.[0]).toMatchObject({
				message: Messages.DESTINATION_ALREADY_EXISTS,
				extensions: { code: 'BAD_REQUEST' },
			});
		}
		expect((await create('!!!')).body.errors?.[0].message).toBe(Messages.INVALID_DATA);

		const yamoussoukro = await create('Yamoussoukro');
		const _id = yamoussoukro.body.data.createDestination._id;
		const renamed = await update(
			{ _id, destinationName: 'Grand Bassam d’Ivoire' },
			admin.accessToken,
		);
		expect(renamed.body.errors?.[0].message).toBe(Messages.DESTINATION_ALREADY_EXISTS);
		expect(JSON.stringify(renamed.body)).not.toContain('E11000');

		// Saving its own name again is not a duplicate
		const same = await update({ _id, destinationName: ' Yamoussoukro ' }, admin.accessToken);
		expect(same.body.data.updateDestinationByAdmin.destinationSlug).toBe('yamoussoukro');
	});

	it('takes the hotels and tours of an inactive city out of the catalog until an admin turns them back on', async () => {
		const admin = await seedMember(app, 'cityadmin', MemberType.ADMIN);
		const hotelAgent = await approvedAgent('cityhotel', AgentType.HOTEL);
		const tourAgent = await approvedAgent('citytour', AgentType.TOUR);
		const seoul = await seedCity('Seoul');
		const busan = await seedCity('Busan');
		const live = await seedProperty(hotelAgent._id, seoul._id);
		const pending = await seedProperty(hotelAgent._id, seoul._id);
		const elsewhere = await seedProperty(hotelAgent._id, busan._id);
		const tour = await seedTour(tourAgent._id, seoul._id);
		for (const property of [live, elsewhere]) {
			await graphQL(
				app,
				`mutation S($input: UpdatePropertyStatusInput!) { updatePropertyStatusByAdmin(input: $input) { _id } }`,
				{ input: { _id: property._id.toString(), propertyStatus: 'ACTIVE' } },
				admin.accessToken,
			);
		}
		await graphQL(
			app,
			`mutation S($input: UpdateTourStatusInput!) { updateTourStatusByAdmin(input: $input) { _id } }`,
			{ input: { _id: tour._id.toString(), tourStatus: 'ACTIVE' } },
			admin.accessToken,
		);
		const state = async () => ({
			properties: await Promise.all(
				[live, pending, elsewhere].map(
					async (property) =>
						(await model(app, 'Property').findById(property._id).lean()).propertyStatus,
				),
			),
			tour: (await model(app, 'Tour').findById(tour._id).lean()).tourStatus,
			memberProperties: (await model(app, 'Member').findById(hotelAgent._id).lean())
				.memberProperties,
			memberTours: (await model(app, 'Member').findById(tourAgent._id).lean()).memberTours,
			busanProperties: (await model(app, 'Destination').findById(busan._id).lean())
				.destinationProperties,
		});
		expect(await state()).toEqual({
			properties: ['ACTIVE', 'PENDING', 'ACTIVE'],
			tour: 'ACTIVE',
			memberProperties: 2,
			memberTours: 1,
			busanProperties: 1,
		});

		const turnedOff = await update(
			{ _id: seoul._id.toString(), destinationStatus: 'INACTIVE' },
			admin.accessToken,
		);
		expect(turnedOff.body.errors).toBeUndefined();
		expect(turnedOff.body.data.updateDestinationByAdmin).toMatchObject({
			destinationStatus: 'INACTIVE',
			destinationProperties: 0,
			destinationTours: 0,
		});
		expect(await state()).toEqual({
			properties: ['INACTIVE', 'PENDING', 'ACTIVE'],
			tour: 'INACTIVE',
			memberProperties: 1,
			memberTours: 0,
			busanProperties: 1,
		});

		const turnedOn = await update(
			{ _id: seoul._id.toString(), destinationStatus: 'ACTIVE' },
			admin.accessToken,
		);
		expect(turnedOn.body.errors).toBeUndefined();
		expect((await state()).properties).toEqual(['INACTIVE', 'PENDING', 'ACTIVE']);
	});

	it('removes a city softly and only once no hotel or tour is left', async () => {
		const admin = await seedMember(app, 'removeadmin', MemberType.ADMIN);
		const agent = await approvedAgent('removeagent', AgentType.HOTEL);
		const seoul = await seedCity('Seoul', { destinationStatus: DestinationStatus.INACTIVE });
		const tokyo = await seedCity('Tokyo');
		const property = await seedProperty(agent._id, seoul._id, {
			propertyStatus: PropertyStatus.INACTIVE,
		});
		const remove = async (city: { _id: unknown }) =>
			await graphQL(app, REMOVE, { id: String(city._id) }, admin.accessToken);

		expect((await remove(tokyo)).body.errors?.[0].message).toBe(Messages.REMOVE_FAILED);
		expect((await remove(seoul)).body.errors?.[0]).toMatchObject({
			message: Messages.DESTINATION_HAS_LISTINGS,
			extensions: { code: 'BAD_REQUEST' },
		});

		await model(app, 'Property').updateOne({ _id: property._id }, { deletedAt: new Date() });
		expect((await remove(seoul)).body.errors).toBeUndefined();
		const stored = await model(app, 'Destination').findById(seoul._id).lean();
		expect(stored.deletedAt).toBeInstanceOf(Date);
		expect((await remove(seoul)).body.errors?.[0].message).toBe(Messages.REMOVE_FAILED);

		const recreated = await graphQL(
			app,
			CREATE,
			{ input: { destinationName: 'Seoul', destinationCountry: 'South Korea' } },
			admin.accessToken,
		);
		expect(recreated.body.errors).toBeUndefined();
		expect(recreated.body.data.createDestination.destinationSlug).toBe('seoul');
	});

	it('filters by an exact country list and searches plain text', async () => {
		await seedCity('Seoul', { destinationDesc: 'Gateway to Asia' });
		await seedCity('Istanbul', {
			destinationCountry: 'Turkey',
			destinationDesc: 'Where Europe meets Asia',
		});
		await seedCity('Paris', { destinationCountry: 'France' });
		const search = async (value: object) =>
			await graphQL(app, LIST, {
				input: { page: 1, limit: 10, sort: 'createdAt', direction: 'ASC', search: value },
			});
		const names = async (value: object) =>
			(await search(value)).body.data.getDestinations.list.map((city) => city.destinationName);
		const europe = ['France', 'Turkey', 'Italy'];

		expect(await names({ destinationCountryList: ['South Korea', 'Japan'] })).toEqual(['Seoul']);
		expect(await names({ destinationCountryList: europe })).toEqual(['Istanbul', 'Paris']);
		expect(await names({ text: ' asia ' })).toEqual(['Seoul', 'Istanbul']);
		expect(await names({ text: 'asia', destinationCountryList: europe })).toEqual(['Istanbul']);
		expect(await names({ destinationCountry: 'France', destinationCountryList: europe })).toEqual([
			'Paris',
		]);
		expect(await names({ text: '   ' })).toHaveLength(3);

		for (const invalid of [
			{ text: 'a'.repeat(101) },
			{ destinationCountryList: Array.from({ length: 51 }, (_, i) => `Country ${i}`) },
		]) {
			expect((await search(invalid)).body.errors?.[0].extensions.code).toBe('BAD_REQUEST');
		}
	});

	it('pages through cities that share the same sort value without repeats', async () => {
		await model(app, 'Destination').insertMany(
			Array.from({ length: 25 }, (_, i) => ({
				destinationName: `City ${i}`,
				destinationSlug: `city-${i}`,
				destinationCountry: 'South Korea',
				destinationStatus: DestinationStatus.ACTIVE,
			})),
		);

		const ids: string[] = [];
		for (const page of [1, 2, 3]) {
			const result = await graphQL(app, LIST, {
				input: { page, limit: 10, sort: 'destinationViews', direction: 'DESC', search: {} },
			});
			expect(result.body.errors).toBeUndefined();
			ids.push(...result.body.data.getDestinations.list.map((city) => city._id));
		}

		expect(ids).toHaveLength(25);
		expect(new Set(ids).size).toBe(25);
	});

	it('counts a comment only on a live target', async () => {
		const user = await seedMember(app, 'commentuser');
		const agent = await approvedAgent('commentagent', AgentType.HOTEL);
		const seoul = await seedCity('Seoul');
		const busan = await seedCity('Busan', { destinationStatus: DestinationStatus.INACTIVE });
		const pending = await seedProperty(agent._id, seoul._id);
		const comment = async (commentGroup: string, commentRefId: string) =>
			await graphQL(
				app,
				`mutation Comment($input: CommentInput!) { createComment(input: $input) { _id } }`,
				{ input: { commentGroup, commentRefId, commentContent: 'Lovely city' } },
				user.accessToken,
			);

		for (const [group, id] of [
			['DESTINATION', busan._id.toString()],
			['DESTINATION', new Types.ObjectId().toString()],
			['PROPERTY', pending._id.toString()],
		]) {
			expect((await comment(group, id)).body.errors?.[0].extensions.code).toBe('NOT_FOUND');
		}
		expect((await comment('DESTINATION', 'not-an-id')).body.errors?.[0].extensions.code).toBe(
			'BAD_REQUEST',
		);
		expect(await model(app, 'Comment').countDocuments()).toBe(0);
		expect((await model(app, 'Destination').findById(busan._id).lean()).destinationComments).toBe(
			0,
		);

		expect((await comment('DESTINATION', seoul._id.toString())).body.errors).toBeUndefined();
		expect((await model(app, 'Destination').findById(seoul._id).lean()).destinationComments).toBe(
			1,
		);
	});
});
