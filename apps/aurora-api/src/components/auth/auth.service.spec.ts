import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { OAuth2Client } from 'google-auth-library';
import { AuthService } from './auth.service';
import { Messages } from '../../libs/enums/common.enum';

describe('AuthService Google credential verification', () => {
	const originalClientId = process.env.GOOGLE_WEB_CLIENT_ID;

	afterEach(() => {
		jest.restoreAllMocks();
		if (originalClientId) process.env.GOOGLE_WEB_CLIENT_ID = originalClientId;
		else delete process.env.GOOGLE_WEB_CLIENT_ID;
	});

	it('requires Google configuration before credential verification', async () => {
		delete process.env.GOOGLE_WEB_CLIENT_ID;
		const service = new AuthService({} as JwtService);

		await expect(service.verifyGoogleCredential('credential')).rejects.toEqual(
			expect.objectContaining({ message: Messages.GOOGLE_AUTH_NOT_CONFIGURED }),
		);
	});

	it('accepts only a verified email from a token checked for the configured audience', async () => {
		process.env.GOOGLE_WEB_CLIENT_ID = 'aurora-google-client-id';
		const verifyIdToken = jest.spyOn(OAuth2Client.prototype, 'verifyIdToken').mockResolvedValue({
			getPayload: () => ({ sub: 'google-subject', email: 'Traveler@Example.com', email_verified: true, name: 'Traveler' }),
		} as any);
		const service = new AuthService({} as JwtService);

		await expect(service.verifyGoogleCredential('credential')).resolves.toEqual({
			subject: 'google-subject',
			email: 'traveler@example.com',
			name: 'Traveler',
		});
		expect(verifyIdToken).toHaveBeenCalledWith({ idToken: 'credential', audience: 'aurora-google-client-id' });
	});

	it('rejects tokens without a verified email', async () => {
		process.env.GOOGLE_WEB_CLIENT_ID = 'aurora-google-client-id';
		jest.spyOn(OAuth2Client.prototype, 'verifyIdToken').mockResolvedValue({
			getPayload: () => ({ sub: 'google-subject', email: 'traveler@example.com', email_verified: false }),
		} as any);
		const service = new AuthService({} as JwtService);

		await expect(service.verifyGoogleCredential('credential')).rejects.toBeInstanceOf(UnauthorizedException);
	});
});
