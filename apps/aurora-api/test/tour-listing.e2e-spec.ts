import { INestApplication } from '@nestjs/common';
import { Types } from 'mongoose';
import { AgentType, AgentVerificationStatus } from '../src/libs/enums/agent.enum';
import { Messages } from '../src/libs/enums/common.enum';
import { DestinationStatus } from '../src/libs/enums/destination';
import { MemberStatus, MemberType } from '../src/libs/enums/member.enum';
import { TourStatus } from '../src/libs/enums/tour.enum';
import { clearDatabase, createTestApp, graphQL, model, seedMember } from './helpers/e2e.helper';

describe('Tour listing (e2e)', () => {
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
	const IMAGES = ['uploads/tour/1.jpg', 'uploads/tour/2.jpg', 'uploads/tour/3.jpg'];

	const LIST = `query GetTours($input: ToursInquiry!) {
		getTours(input: $input) { list { _id tourName memberData { _id } } metaCounter { total } }
	}`;
	const CREATE = `mutation Create($input: TourInput!) {
		createTour(input: $input) { _id tourStatus tourCurrency }
	}`;
	const UPDATE = `mutation Update($input: TourUpdateInput!) {
		updateTour(input: $input) { _id tourName tourStatus tourDestinationCity tourAdditionalInfo }
	}`;
	const UPDATE_STATUS = `mutation UpdateStatus($input: UpdateTourStatusInput!) {
		updateTourStatusByAdmin(input: $input) { _id tourStatus }
	}`;
	const REMOVE = `mutation Remove($id: String!) { removeTourByAdmin(tourId: $id) { _id deletedAt } }`;

	async function tourAgent(nick: string) {
		const member = await seedMember(app, nick, MemberType.AGENT);
		await model(app, 'Agent').create({
			memberId: member._id,
			agentType: AgentType.TOUR,
			companyName: `${nick} company`,
			businessNumber: `${nick}-business`,
			companyAddress: 'Seoul',
			verificationStatus: AgentVerificationStatus.APPROVED,
			verifiedAt: new Date(),
		});
		return member;
	}

	async function activeDestination(name = 'Japan', country = 'JP') {
		return await model(app, 'Destination').create({
			destinationName: name,
			destinationSlug: name.toLowerCase(),
			destinationCountry: country,
			destinationStatus: DestinationStatus.ACTIVE,
		});
	}

	function tourFields(extra: object = {}) {
		return {
			tourName: 'Aurora Tour',
			tourDesc: 'Temples and night markets',
			tourPrice: 100,
			tourCurrency: 'USD',
			tourStartDate: new Date(Date.now() + DAY),
			tourEndDate: new Date(Date.now() + 3 * DAY),
			tourCapacity: 10,
			tourDepartureCountry: 'Korea',
			tourDepartureCity: 'Seoul',
			tourDeparturePlace: 'Incheon Airport',
			tourImages: IMAGES,
			...extra,
		};
	}

	async function seedTour(memberId: string, destinationId: unknown, extra: object = {}) {
		return await model(app, 'Tour').create({
			memberId,
			destinationId,
			tourStatus: TourStatus.ACTIVE,
			...tourFields(extra),
		});
	}

	function setStatus(tour: { _id: unknown }, tourStatus: string, token: string) {
		return graphQL(app, UPDATE_STATUS, { input: { _id: String(tour._id), tourStatus } }, token);
	}

	async function counters(memberId: string, destinationId: unknown) {
		return [
			(await model(app, 'Member').findById(memberId).lean()).memberTours,
			(await model(app, 'Destination').findById(destinationId).lean()).destinationTours,
		];
	}

	it('creates a tour as PENDING with every required field and keeps it out of the counters', async () => {
		const agent = await tourAgent('createagent');
		const destination = await activeDestination();
		const create = async (extra: object) =>
			await graphQL(
				app,
				CREATE,
				{ input: { destinationId: String(destination._id), ...tourFields(extra) } },
				agent.accessToken,
			);

		for (const invalid of [
			{ tourName: '   ' },
			{ tourDesc: '   ' },
			{ tourDepartureCountry: '' },
			{ tourDepartureCity: '   ' },
			{ tourDeparturePlace: '' },
			{ tourImages: IMAGES.slice(0, 2) },
			{ tourImages: Array.from({ length: 11 }, (_, i) => `uploads/tour/${i}.jpg`) },
			{ tourImages: ['javascript:alert(1)', ...IMAGES] },
			{ tourCurrency: null },
			{ tourPrice: 10.555 },
			{ tourStartDate: new Date(Date.now() - 2 * DAY) },
		]) {
			const rejected = await create(invalid);
			expect(rejected.body.errors?.[0].extensions.code).toBe('BAD_REQUEST');
		}
		expect(await model(app, 'Tour').countDocuments()).toBe(0);

		const created = await create({ tourCurrency: undefined });
		expect(created.body.errors).toBeUndefined();
		expect(created.body.data.createTour).toMatchObject({
			tourStatus: 'PENDING',
			tourCurrency: 'USD',
		});
		expect(await counters(agent._id, destination._id)).toEqual([0, 0]);

		const catalog = await graphQL(app, LIST, { input: { page: 1, limit: 10, search: {} } });
		expect(catalog.body.data.getTours.list).toEqual([]);
	});

	it('rejects null and blank required fields on update and keeps the catalog readable', async () => {
		const agent = await tourAgent('nullagent');
		const destination = await activeDestination();
		const tour = await seedTour(agent._id, destination._id, {
			tourDestinationCity: 'Tokyo',
			tourAdditionalInfo: 'Bring a jacket',
		});
		const _id = tour._id.toString();

		for (const input of [
			{ tourName: null },
			{ tourName: '   ' },
			{ tourDesc: null },
			{ destinationId: null },
			{ tourPrice: null },
			{ tourCurrency: null },
			{ tourStartDate: null },
			{ tourEndDate: null },
			{ tourCapacity: null },
			{ tourDepartureCountry: null },
			{ tourDepartureCity: '  ' },
			{ tourDeparturePlace: null },
			{ tourImages: null },
			{ tourImages: IMAGES.slice(0, 1) },
		]) {
			const rejected = await graphQL(app, UPDATE, { input: { _id, ...input } }, agent.accessToken);
			expect(rejected.body.errors?.[0].extensions.code).toBe('BAD_REQUEST');
		}

		const cleared = await graphQL(
			app,
			UPDATE,
			{ input: { _id, tourDestinationCity: null, tourAdditionalInfo: null } },
			agent.accessToken,
		);
		expect(cleared.body.errors).toBeUndefined();
		expect(cleared.body.data.updateTour).toMatchObject({
			tourDestinationCity: null,
			tourAdditionalInfo: null,
		});

		const stored = await model(app, 'Tour').findById(_id).lean();
		expect(stored).toMatchObject({ tourName: 'Aurora Tour', tourPrice: 100, tourCapacity: 10 });
		expect(stored.tourStartDate).toBeInstanceOf(Date);

		const catalog = await graphQL(app, LIST, { input: { page: 1, limit: 10, search: {} } });
		expect(catalog.body.errors).toBeUndefined();
		expect(catalog.body.data.getTours.list).toHaveLength(1);
	});

	it('counts only active tours in the owner and destination counters', async () => {
		const agent = await tourAgent('cntagent');
		const admin = await seedMember(app, 'cntadmin', MemberType.ADMIN);
		const destination = await activeDestination();
		const created = await graphQL(
			app,
			CREATE,
			{ input: { destinationId: String(destination._id), ...tourFields() } },
			agent.accessToken,
		);
		const tour = { _id: created.body.data.createTour._id };
		expect(await counters(agent._id, destination._id)).toEqual([0, 0]);

		for (const [tourStatus, expected] of [
			['ACTIVE', [1, 1]],
			['ACTIVE', [1, 1]],
			['INACTIVE', [0, 0]],
			['REJECTED', [0, 0]],
			['ACTIVE', [1, 1]],
			['INACTIVE', [0, 0]],
		] as const) {
			expect((await setStatus(tour, tourStatus, admin.accessToken)).body.errors).toBeUndefined();
			expect(await counters(agent._id, destination._id)).toEqual(expected);
		}

		const removed = await graphQL(app, REMOVE, { id: tour._id }, admin.accessToken);
		expect(removed.body.errors).toBeUndefined();
		expect(await counters(agent._id, destination._id)).toEqual([0, 0]);
	});

	it('shows the owner every status and opens a tour outside ACTIVE only for its owner and admins', async () => {
		const agent = await tourAgent('prevagent');
		const admin = await seedMember(app, 'prevadmin', MemberType.ADMIN);
		const user = await seedMember(app, 'prevuser');
		const destination = await activeDestination();
		const statuses = ['PENDING', 'ACTIVE', 'INACTIVE', 'REJECTED'];
		const tours = await Promise.all(
			statuses.map((tourStatus) => seedTour(agent._id, destination._id, { tourStatus })),
		);
		const AGENT_LIST = `query Mine($input: AgentToursInquiry!) {
			getAgentTours(input: $input) { list { tourStatus } metaCounter { total } }
		}`;
		const DETAIL = `query Detail($id: String!) { getTour(tourId: $id) { _id tourViews } }`;

		const everything = await graphQL(
			app,
			AGENT_LIST,
			{ input: { page: 1, limit: 10, search: {} } },
			agent.accessToken,
		);
		expect(everything.body.errors).toBeUndefined();
		expect(everything.body.data.getAgentTours.list.map((item) => item.tourStatus).sort()).toEqual(
			[...statuses].sort(),
		);

		const filtered = await graphQL(
			app,
			AGENT_LIST,
			{ input: { page: 1, limit: 10, search: { tourStatus: 'INACTIVE' } } },
			agent.accessToken,
		);
		expect(filtered.body.data.getAgentTours.list).toEqual([{ tourStatus: 'INACTIVE' }]);

		for (const tour of tours) {
			const id = tour._id.toString();
			const isActive = tour.tourStatus === TourStatus.ACTIVE;

			for (const token of [undefined, user.accessToken]) {
				const result = await graphQL(app, DETAIL, { id }, token);
				if (isActive) expect(result.body.errors).toBeUndefined();
				else expect(result.body.errors?.[0].extensions.code).toBe('NOT_FOUND');
			}
			for (const token of [agent.accessToken, admin.accessToken]) {
				const result = await graphQL(app, DETAIL, { id }, token);
				expect(result.body.errors).toBeUndefined();
				expect(result.body.data.getTour._id).toBe(id);
			}

			// The signed-in user, the owner and the admin each count once on the live tour, never on a preview
			const stored = await model(app, 'Tour').findById(id).lean();
			expect(stored.tourViews).toBe(isActive ? 3 : 0);
		}
	});

	it('activates a tour only in an active destination and under an active owner', async () => {
		const agent = await tourAgent('ruleagent');
		const admin = await seedMember(app, 'ruleadmin', MemberType.ADMIN);
		const destination = await activeDestination();
		const tour = await seedTour(agent._id, destination._id, { tourStatus: TourStatus.PENDING });
		const activate = async () => await setStatus(tour, 'ACTIVE', admin.accessToken);

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
		expect((await model(app, 'Tour').findById(tour._id).lean()).tourStatus).toBe('PENDING');

		await model(app, 'Member').updateOne(
			{ _id: agent._id },
			{ memberStatus: MemberStatus.ACTIVE, deletedAt: null },
		);
		const activated = await activate();
		expect(activated.body.errors).toBeUndefined();
		expect(activated.body.data.updateTourStatusByAdmin.tourStatus).toBe('ACTIVE');
	});

	it('keeps the dates and the country of a tour with booked seats', async () => {
		const agent = await tourAgent('bookedagent');
		const admin = await seedMember(app, 'bookedadmin', MemberType.ADMIN);
		const destination = await activeDestination();
		const korea = await activeDestination('Korea', 'KR');
		const tour = await seedTour(agent._id, destination._id, {
			tourStatus: TourStatus.PENDING,
			tourReservedSeats: 2,
		});
		await setStatus(tour, 'ACTIVE', admin.accessToken);
		const _id = tour._id.toString();
		const update = async (input: object) =>
			await graphQL(app, UPDATE, { input: { _id, ...input } }, agent.accessToken);
		const newStart = new Date(Date.now() + 2 * DAY);

		for (const input of [
			{ tourStartDate: newStart },
			{ tourEndDate: new Date(Date.now() + 5 * DAY) },
			{ destinationId: String(korea._id) },
		]) {
			expect((await update(input)).body.errors?.[0]).toMatchObject({
				message: Messages.TOUR_HAS_BOOKINGS,
				extensions: { code: 'BAD_REQUEST' },
			});
		}

		// A form that sends the stored dates and country back is not a change
		const resent = await update({
			tourName: 'Aurora Grand Tour',
			tourStartDate: tour.tourStartDate,
			tourEndDate: tour.tourEndDate,
			destinationId: String(destination._id),
		});
		expect(resent.body.errors).toBeUndefined();
		expect(resent.body.data.updateTour.tourName).toBe('Aurora Grand Tour');

		await model(app, 'Tour').updateOne({ _id }, { tourReservedSeats: 0 });
		expect(
			(await update({ tourStartDate: new Date(Date.now() - 2 * DAY) })).body.errors?.[0].message,
		).toBe(Messages.INVALID_DATA);
		expect((await update({ tourStartDate: newStart })).body.errors).toBeUndefined();

		await model(app, 'Destination').updateOne(
			{ _id: korea._id },
			{ destinationStatus: DestinationStatus.INACTIVE },
		);
		expect((await update({ destinationId: String(korea._id) })).body.errors?.[0].message).toBe(
			Messages.DESTINATION_NOT_FOUND,
		);
		await model(app, 'Destination').updateOne(
			{ _id: korea._id },
			{ destinationStatus: DestinationStatus.ACTIVE },
		);

		// A live tour takes its place in the destination counters with it
		expect(await counters(agent._id, destination._id)).toEqual([1, 1]);
		expect((await update({ destinationId: String(korea._id) })).body.errors).toBeUndefined();
		expect(await counters(agent._id, destination._id)).toEqual([1, 0]);
		expect(await counters(agent._id, korea._id)).toEqual([1, 1]);
	});

	it('keeps a tour with booked seats ahead from being removed', async () => {
		const agent = await tourAgent('removeagent');
		const admin = await seedMember(app, 'removeadmin', MemberType.ADMIN);
		const destination = await activeDestination();
		const tour = await seedTour(agent._id, destination._id, {
			tourStatus: TourStatus.INACTIVE,
			tourReservedSeats: 2,
		});
		const remove = async () =>
			await graphQL(app, REMOVE, { id: tour._id.toString() }, admin.accessToken);

		expect((await remove()).body.errors?.[0]).toMatchObject({
			message: Messages.TOUR_HAS_BOOKINGS,
			extensions: { code: 'BAD_REQUEST' },
		});
		expect((await model(app, 'Tour').findById(tour._id).lean()).deletedAt).toBeNull();

		// Once the tour is over, its guests have nothing left to keep
		await model(app, 'Tour').updateOne(
			{ _id: tour._id },
			{ tourStartDate: new Date(Date.now() - 3 * DAY), tourEndDate: new Date(Date.now() - DAY) },
		);
		const removed = await remove();
		expect(removed.body.errors).toBeUndefined();
		expect(removed.body.data.removeTourByAdmin.deletedAt).toBeTruthy();
	});

	it('turns off the tours of a blocked agent until an admin turns them back on', async () => {
		const agent = await tourAgent('blockagent');
		const other = await tourAgent('otheragent');
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
		const state = async () => {
			const [memberTours, destinationTours] = await counters(agent._id, destination._id);
			const tours = await model(app, 'Tour').find({ memberId: agent._id }).sort({ _id: 1 }).lean();
			return { statuses: tours.map((tour) => tour.tourStatus), memberTours, destinationTours };
		};

		const pendingStatus = { tourStatus: TourStatus.PENDING };
		const first = await seedTour(agent._id, destination._id, pendingStatus);
		const second = await seedTour(agent._id, destination._id, pendingStatus);
		await seedTour(agent._id, destination._id, pendingStatus);
		const neighbour = await seedTour(other._id, destination._id, pendingStatus);
		for (const tour of [first, second, neighbour])
			await setStatus(tour, 'ACTIVE', admin.accessToken);
		expect(await state()).toEqual({
			statuses: ['ACTIVE', 'ACTIVE', 'PENDING'],
			memberTours: 2,
			destinationTours: 3,
		});

		expect((await updateMember('BLOCKED')).body.errors).toBeUndefined();
		expect(await state()).toEqual({
			statuses: ['INACTIVE', 'INACTIVE', 'PENDING'],
			memberTours: 0,
			destinationTours: 1,
		});
		const catalog = await graphQL(app, LIST, { input: { page: 1, limit: 10, search: {} } });
		expect(catalog.body.data.getTours.list.map((item) => item._id)).toEqual([
			neighbour._id.toString(),
		]);

		expect((await updateMember('ACTIVE')).body.errors).toBeUndefined();
		expect((await state()).statuses).toEqual(['INACTIVE', 'INACTIVE', 'PENDING']);

		expect((await setStatus(first, 'ACTIVE', admin.accessToken)).body.errors).toBeUndefined();
		expect(await state()).toEqual({
			statuses: ['ACTIVE', 'INACTIVE', 'PENDING'],
			memberTours: 1,
			destinationTours: 2,
		});
	});

	it('sends an edited rejected tour back to the admin queue and keeps an active one live', async () => {
		const agent = await tourAgent('editagent');
		const destination = await activeDestination();
		const rejected = await seedTour(agent._id, destination._id, {
			tourStatus: TourStatus.REJECTED,
		});
		const active = await seedTour(agent._id, destination._id);
		const inactive = await seedTour(agent._id, destination._id, {
			tourStatus: TourStatus.INACTIVE,
		});
		const edit = async (tour: { _id: unknown }) =>
			await graphQL(
				app,
				UPDATE,
				{ input: { _id: String(tour._id), tourName: 'Edited Tour' } },
				agent.accessToken,
			);

		expect((await edit(rejected)).body.data.updateTour.tourStatus).toBe('PENDING');
		expect((await edit(active)).body.data.updateTour.tourStatus).toBe('ACTIVE');
		expect((await edit(inactive)).body.errors?.[0].message).toBe(Messages.UPDATE_FAILED);
	});

	it('answers mutations without owner data and opens a tour whose owner account is gone', async () => {
		const agent = await tourAgent('owneragent');
		const user = await seedMember(app, 'owneruser');
		const destination = await activeDestination();
		const tour = await seedTour(agent._id, destination._id);
		const variables = { id: tour._id.toString() };
		const DETAIL = `query Detail($id: String!) {
			getTour(tourId: $id) { _id memberData { _id memberStatus } }
		}`;

		const liked = await graphQL(
			app,
			`mutation Like($id: String!) { likeTargetTour(tourId: $id) { _id tourLikes memberData { _id } } }`,
			variables,
			user.accessToken,
		);
		expect(liked.body.errors).toBeUndefined();
		expect(liked.body.data.likeTargetTour).toMatchObject({ tourLikes: 1, memberData: null });

		const withOwner = await graphQL(app, DETAIL, variables);
		expect(withOwner.body.data.getTour.memberData).toEqual({
			_id: agent._id,
			memberStatus: 'ACTIVE',
		});

		await model(app, 'Member').updateOne(
			{ _id: agent._id },
			{ memberStatus: MemberStatus.DELETED, deletedAt: new Date() },
		);
		const ownerDeleted = await graphQL(app, DETAIL, variables);
		expect(ownerDeleted.body.errors).toBeUndefined();
		expect(ownerDeleted.body.data.getTour).toEqual({ _id: variables.id, memberData: null });

		await model(app, 'Member').deleteOne({ _id: agent._id });
		const catalog = await graphQL(app, LIST, { input: { page: 1, limit: 10, search: {} } });
		expect(catalog.body.errors).toBeUndefined();
		expect(catalog.body.data.getTours.list).toEqual([
			{ _id: variables.id, tourName: 'Aurora Tour', memberData: null },
		]);

		const missing = await graphQL(app, DETAIL, { id: new Types.ObjectId().toString() });
		expect(missing.body.errors?.[0]).toMatchObject({
			message: Messages.TOUR_NOT_FOUND,
			extensions: { code: 'NOT_FOUND' },
		});
		const missingLike = await graphQL(
			app,
			`mutation Like($id: String!) { likeTargetTour(tourId: $id) { _id } }`,
			{ id: new Types.ObjectId().toString() },
			user.accessToken,
		);
		expect(missingLike.body.errors?.[0].extensions.code).toBe('NOT_FOUND');
	});

	it('validates the nested search object and ignores blank filters', async () => {
		const agent = await tourAgent('searchagent');
		const destination = await activeDestination();
		await seedTour(agent._id, destination._id);
		const search = async (value: object) =>
			await graphQL(app, LIST, { input: { page: 1, limit: 10, search: value } });

		for (const invalid of [
			{ minAvailableSeats: 0 },
			{ tourPriceRange: { start: -10, end: 100 } },
			{ text: 'a'.repeat(101) },
		]) {
			const rejected = await search(invalid);
			expect(rejected.body.errors?.[0].extensions.code).toBe('BAD_REQUEST');
		}

		for (const valid of [
			{},
			{ text: '   ' },
			{ text: ' aurora ' },
			{ minAvailableSeats: 1, tourPriceRange: { start: 0, end: 100 } },
		]) {
			const found = await search(valid);
			expect(found.body.errors).toBeUndefined();
			expect(found.body.data.getTours.metaCounter).toEqual([{ total: 1 }]);
		}
	});

	it('notifies the owner about every status change, including a repeated status', async () => {
		const agent = await tourAgent('statusagent');
		const admin = await seedMember(app, 'statusadmin', MemberType.ADMIN);
		const destination = await activeDestination();
		const tour = await seedTour(agent._id, destination._id, { tourStatus: TourStatus.PENDING });
		const steps = ['ACTIVE', 'INACTIVE', 'ACTIVE', 'INACTIVE'];

		for (const tourStatus of steps) {
			expect((await setStatus(tour, tourStatus, admin.accessToken)).body.errors).toBeUndefined();
		}

		const notifications = await model(app, 'Notification')
			.find({ receiverId: new Types.ObjectId(agent._id) })
			.sort({ createdAt: 1, _id: 1 })
			.lean();
		expect(notifications.map((notification) => notification.notificationDesc)).toEqual(
			steps.map((tourStatus) => `Your tour listing status is now ${tourStatus}.`),
		);
	});

	it('pages through tours that share the same start date without repeats', async () => {
		const agent = await tourAgent('pageagent');
		const destination = await activeDestination();
		const fields = tourFields();
		await model(app, 'Tour').insertMany(
			Array.from({ length: 25 }, (_, i) => ({
				...fields,
				memberId: agent._id,
				destinationId: destination._id,
				tourStatus: TourStatus.ACTIVE,
				tourName: `Tied Tour ${i}`,
			})),
		);

		const ids: string[] = [];
		for (const page of [1, 2, 3]) {
			const result = await graphQL(app, LIST, { input: { page, limit: 10, search: {} } });
			expect(result.body.errors).toBeUndefined();
			ids.push(...result.body.data.getTours.list.map((tour) => tour._id));
		}

		expect(ids).toHaveLength(25);
		expect(new Set(ids).size).toBe(25);
	});
});
