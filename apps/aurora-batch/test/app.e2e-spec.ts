import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import request from 'supertest';
import { AuroraBatchModule } from './../src/aurora-batch.module';

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
});
