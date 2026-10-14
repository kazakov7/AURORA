import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './helpers/e2e.helper';

describe('API hardening (e2e)', () => {
	const introspection = { query: '{ __schema { queryType { name } } }' };

	it('sends the security headers and no framework banner', async () => {
		const app = await createTestApp();
		try {
			const response = await request(app.getHttpServer())
				.post('/graphql')
				.send({ query: '{ __typename }' });

			expect(response.headers['x-powered-by']).toBeUndefined();
			expect(response.headers['x-content-type-options']).toBe('nosniff');
			expect(response.headers['x-frame-options']).toBe('DENY');
			expect(response.headers['referrer-policy']).toBe('no-referrer');
		} finally {
			await app.close();
		}
	});

	it('hides the schema in production, read when the app starts', async () => {
		const saved = { NODE_ENV: process.env.NODE_ENV, MONGO_PROD: process.env.MONGO_PROD };
		let app: INestApplication | undefined;
		try {
			process.env.NODE_ENV = 'production';
			process.env.MONGO_PROD = process.env.MONGO_DEV;
			app = await createTestApp();
			const response = await request(app.getHttpServer()).post('/graphql').send(introspection);

			expect(response.body.data?.__schema).toBeUndefined();
			expect(response.body.errors?.[0].message).toMatch(/introspection/i);
		} finally {
			await app?.close();
			process.env.NODE_ENV = saved.NODE_ENV;
			process.env.MONGO_PROD = saved.MONGO_PROD;
		}
	});

	it('keeps the schema readable outside production', async () => {
		const app = await createTestApp();
		try {
			const response = await request(app.getHttpServer()).post('/graphql').send(introspection);
			expect(response.body.data.__schema.queryType.name).toBe('Query');
		} finally {
			await app.close();
		}
	});
});
