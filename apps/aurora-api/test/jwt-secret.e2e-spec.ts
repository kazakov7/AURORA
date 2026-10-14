import { createHmac } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { clearDatabase } from './helpers/e2e.helper';

/**
 * In a real start the modules are imported first and ConfigModule reads .env afterwards,
 * so the secret has to be read when the app starts, not when the module file is imported.
 */
describe('JWT secret (e2e)', () => {
	let app: INestApplication;

	// The database is shared by every suite, so this member must not outlive the test
	afterEach(async () => {
		if (app) await clearDatabase(app);
	});

	afterAll(async () => {
		await app?.close();
	});

	it('signs tokens with SECRET_TOKEN even when it is set after the modules are imported', async () => {
		const secret = process.env.SECRET_TOKEN as string;
		delete process.env.SECRET_TOKEN;
		const { createTestApp, seedMember } = require('./helpers/e2e.helper');
		process.env.SECRET_TOKEN = secret;

		app = await createTestApp();
		const member = await seedMember(app, 'secretcheck');
		const [header, payload, signature] = member.accessToken.split('.');
		const signWith = (key: string) =>
			createHmac('sha256', key).update(`${header}.${payload}`).digest('base64url');

		expect(signature).toBe(signWith(secret));
		expect(signature).not.toBe(signWith('undefined'));
	});
});
