import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import request from 'supertest';
import { AuroraBatchModule } from './../src/aurora-batch.module';
import { AuroraBatchService } from './../src/aurora-batch.service';

// The shared e2e harness points MONGO_DEV at an in-memory replica set, so the batch never reaches Atlas
process.env.BATCH_MANUAL_TOKEN = 'aura-batch-token';

describe('AuroraBatchController (e2e)', () => {
	let app: INestApplication;

	beforeAll(async () => {
		const moduleFixture: TestingModule = await Test.createTestingModule({
			imports: [AuroraBatchModule],
		}).compile();

		app = moduleFixture.createNestApplication();
		await app.init();
	});

	afterAll(async () => {
		await app.close();
	});

	it('/ (GET)', () => {
		return request(app.getHttpServer())
			.get('/')
			.expect(200)
			.expect('AURORA batch server is running');
	});

	it('runs the rankings by hand only with the batch token', async () => {
		await request(app.getHttpServer()).post('/rankings/run').expect(403);
		await request(app.getHttpServer())
			.post('/rankings/run')
			.set('x-batch-token', 'wrong-token')
			.expect(403);

		const started = await request(app.getHttpServer())
			.post('/rankings/run')
			.set('x-batch-token', 'aura-batch-token')
			.expect(201);
		expect(started.body).toEqual({ started: true });

		const publications: Model<any> = app.get(getModelToken('RankingPublication'));
		expect(await publications.countDocuments({ isActive: true })).toBe(1);
	});

	describe('ranking signals', () => {
		const model = (name: string): Model<any> => app.get(getModelToken(name));
		let destination: any;

		beforeEach(async () => {
			for (const name of ['Destination', 'Property', 'Review', 'Booking', 'RankingSnapshot']) {
				await model(name).deleteMany({});
			}
			destination = await model('Destination').create({
				destinationName: 'Busan',
				destinationSlug: 'busan',
				destinationCountry: 'KR',
				destinationStatus: 'ACTIVE',
			});
		});

		async function hotel(propertyName: string) {
			return await model('Property').create({
				memberId: new Types.ObjectId(),
				destinationId: destination._id,
				propertyType: 'HOTEL',
				propertyStatus: 'ACTIVE',
				propertyName,
				propertyAddress: 'Busan',
				pricePerNight: 100,
				currency: 'USD',
				maxGuests: 2,
			});
		}

		async function topProperties(): Promise<string[]> {
			expect(await app.get(AuroraBatchService).runRankings('manual')).toBe(true);
			const publication = await model('RankingPublication').findOne({ isActive: true }).lean();
			const snapshot = await model('RankingSnapshot')
				.findOne({ publicationId: publication._id, rankingType: 'TOP_PROPERTIES', scope: 'GLOBAL' })
				.lean();
			return snapshot.entries.map((entry) => entry.entityId.toString());
		}

		it('ranks a hotel with a few top ratings above one with many poor ratings', async () => {
			const panned = await hotel('Panned Hotel');
			const loved = await hotel('Loved Hotel');
			const rating = (property: { _id: unknown }, reviewRating: number) => ({
				memberId: new Types.ObjectId(),
				reviewGroup: 'PROPERTY',
				reviewRefId: property._id,
				reviewRating,
			});
			// 12 one-star ratings add up to more stars than 2 five-star ones
			await model('Review').create([
				...Array.from({ length: 12 }, () => rating(panned, 1)),
				...Array.from({ length: 2 }, () => rating(loved, 5)),
			]);

			expect(await topProperties()).toEqual([loved._id.toString(), panned._id.toString()]);
		});

		it('counts a booking in the period it was made, not when it was last updated', async () => {
			const recent = await hotel('Recent Hotel');
			const old = await hotel('Old Hotel');
			const completed = (property: { _id: unknown }, createdAt: Date) => ({
				memberId: new Types.ObjectId(),
				bookingCategory: 'PROPERTY',
				bookingStatus: 'COMPLETED',
				bookingRefId: property._id,
				bookingGuests: 1,
				bookingTotalPrice: 100,
				bookingCurrency: 'USD',
				createdAt,
				updatedAt: new Date(),
			});
			await model('Booking').collection.insertMany([
				completed(recent, new Date()),
				completed(old, new Date(Date.now() - 60 * 86_400_000)),
			]);

			expect(await topProperties()).toEqual([recent._id.toString()]);
		});

		it('reports a failed run instead of rejecting, so the daily timer is armed again', async () => {
			const lock = jest.spyOn(model('BatchLock'), 'findOneAndUpdate').mockImplementationOnce(() => {
				throw new Error('database unreachable');
			});
			const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
			try {
				await expect(app.get(AuroraBatchService).runRankings('manual')).resolves.toBe(false);
			} finally {
				lock.mockRestore();
				errorSpy.mockRestore();
			}
		});
	});
});
