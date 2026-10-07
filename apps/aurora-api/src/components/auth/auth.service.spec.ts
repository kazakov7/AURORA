import { UnauthorizedException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { JwtService } from '@nestjs/jwt';
import { OAuth2Client } from 'google-auth-library';
import * as jose from 'jose';
import { of, throwError } from 'rxjs';
import { AuthService } from './auth.service';
import { Messages } from '../../libs/enums/common.enum';

describe('AuthService social authentication', () => {
	const originalClientId = process.env.GOOGLE_WEB_CLIENT_ID;
	const originalKakaoRestApiKey = process.env.KAKAO_REST_API_KEY;
	const originalKakaoClientSecret = process.env.KAKAO_CLIENT_SECRET;
	const originalTelegramClientId = process.env.TELEGRAM_CLIENT_ID;
	const originalTelegramClientSecret = process.env.TELEGRAM_CLIENT_SECRET;

	afterEach(() => {
		jest.restoreAllMocks();
		if (originalClientId) process.env.GOOGLE_WEB_CLIENT_ID = originalClientId;
		else delete process.env.GOOGLE_WEB_CLIENT_ID;
		if (originalKakaoRestApiKey) process.env.KAKAO_REST_API_KEY = originalKakaoRestApiKey;
		else delete process.env.KAKAO_REST_API_KEY;
		if (originalKakaoClientSecret) process.env.KAKAO_CLIENT_SECRET = originalKakaoClientSecret;
		else delete process.env.KAKAO_CLIENT_SECRET;
		if (originalTelegramClientId) process.env.TELEGRAM_CLIENT_ID = originalTelegramClientId;
		else delete process.env.TELEGRAM_CLIENT_ID;
		if (originalTelegramClientSecret) process.env.TELEGRAM_CLIENT_SECRET = originalTelegramClientSecret;
		else delete process.env.TELEGRAM_CLIENT_SECRET;
	});

	it('requires Google configuration before credential verification', async () => {
		delete process.env.GOOGLE_WEB_CLIENT_ID;
		const service = new AuthService({} as JwtService, {} as HttpService);

		await expect(service.verifyGoogleCredential('credential')).rejects.toEqual(
			expect.objectContaining({ message: Messages.GOOGLE_AUTH_NOT_CONFIGURED }),
		);
	});

	it('accepts only a verified email from a token checked for the configured audience', async () => {
		process.env.GOOGLE_WEB_CLIENT_ID = 'aurora-google-client-id';
		const verifyIdToken = jest.spyOn(OAuth2Client.prototype, 'verifyIdToken').mockResolvedValue({
			getPayload: () => ({
				sub: 'google-subject',
				email: 'Traveler@Example.com',
				email_verified: true,
				name: 'Traveler',
			}),
		} as any);
		const service = new AuthService({} as JwtService, {} as HttpService);

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
		const service = new AuthService({} as JwtService, {} as HttpService);

		await expect(service.verifyGoogleCredential('credential')).rejects.toBeInstanceOf(UnauthorizedException);
	});

	it('requires Kakao configuration before exchanging an authorization code', async () => {
		delete process.env.KAKAO_REST_API_KEY;
		delete process.env.KAKAO_CLIENT_SECRET;
		const service = new AuthService({} as JwtService, {} as HttpService);

		await expect(service.verifyKakaoAuthorizationCode('code', 'https://app.aurora.test/auth/kakao')).rejects.toEqual(
			expect.objectContaining({ message: Messages.KAKAO_AUTH_NOT_CONFIGURED }),
		);
	});

	it('exchanges a Kakao authorization code with the registered redirect URI before verifying its ID token', async () => {
		process.env.KAKAO_REST_API_KEY = 'kakao-rest-api-key';
		process.env.KAKAO_CLIENT_SECRET = 'kakao-client-secret';
		const httpService = {
			post: jest.fn().mockReturnValue(of({ data: { id_token: 'kakao-id-token' } })),
		} as unknown as HttpService;
		const service = new AuthService({} as JwtService, httpService);
		jest.spyOn(service as any, 'verifyKakaoIdentityToken').mockResolvedValue({
			subject: 'kakao-subject',
			email: 'kakao@example.com',
			name: 'Kakao Traveler',
		});

		await expect(
			service.verifyKakaoAuthorizationCode('authorization-code', 'https://app.aurora.test/auth/kakao'),
		).resolves.toEqual({
			subject: 'kakao-subject',
			email: 'kakao@example.com',
			name: 'Kakao Traveler',
		});
		expect(httpService.post).toHaveBeenCalledWith(
			'https://kauth.kakao.com/oauth/token',
			expect.stringContaining('grant_type=authorization_code'),
			expect.objectContaining({ headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' } }),
		);
		expect((httpService.post as jest.Mock).mock.calls[0][1]).toContain(
			'redirect_uri=https%3A%2F%2Fapp.aurora.test%2Fauth%2Fkakao',
		);
	});

	it('retrieves the consented Kakao nickname and profile image only with the server-side access token', async () => {
		process.env.KAKAO_REST_API_KEY = 'kakao-rest-api-key';
		process.env.KAKAO_CLIENT_SECRET = 'kakao-client-secret';
		const httpService = {
			post: jest.fn().mockReturnValue(of({ data: { id_token: 'kakao-id-token', access_token: 'kakao-access-token' } })),
			get: jest.fn().mockReturnValue(
				of({
					data: {
						id: 'kakao-subject',
						kakao_account: {
							profile: {
								nickname: 'Kakao Profile',
								profile_image_url: 'https://k.kakaocdn.net/profile.jpg',
							},
						},
					},
				}),
			),
		} as unknown as HttpService;
		const service = new AuthService({} as JwtService, httpService);
		jest.spyOn(service as any, 'verifyKakaoIdentityToken').mockResolvedValue({ subject: 'kakao-subject' });

		await expect(
			service.verifyKakaoAuthorizationCode('authorization-code', 'https://app.aurora.test/auth/kakao'),
		).resolves.toEqual({
			subject: 'kakao-subject',
			name: 'Kakao Profile',
			image: 'https://k.kakaocdn.net/profile.jpg',
		});
		expect(httpService.get).toHaveBeenCalledWith(
			'https://kapi.kakao.com/v2/user/me',
			expect.objectContaining({ headers: { Authorization: 'Bearer kakao-access-token' } }),
		);
	});

	it('maps an invalid Kakao authorization code and missing ID token to focused errors', async () => {
		process.env.KAKAO_REST_API_KEY = 'kakao-rest-api-key';
		process.env.KAKAO_CLIENT_SECRET = 'kakao-client-secret';
		const invalidCodeHttp = {
			post: jest.fn().mockReturnValue(throwError(() => ({ response: { status: 400 } }))),
		} as unknown as HttpService;
		const invalidCodeService = new AuthService({} as JwtService, invalidCodeHttp);
		await expect(
			invalidCodeService.verifyKakaoAuthorizationCode('bad-code', 'https://app.aurora.test/auth/kakao'),
		).rejects.toEqual(expect.objectContaining({ message: Messages.INVALID_KAKAO_AUTHORIZATION_CODE }));

		const noIdTokenHttp = {
			post: jest.fn().mockReturnValue(of({ data: {} })),
		} as unknown as HttpService;
		const noIdTokenService = new AuthService({} as JwtService, noIdTokenHttp);
		await expect(
			noIdTokenService.verifyKakaoAuthorizationCode('code', 'https://app.aurora.test/auth/kakao'),
		).rejects.toEqual(expect.objectContaining({ message: Messages.INVALID_KAKAO_IDENTITY_TOKEN }));
	});

	it('rejects invalid or expired Kakao ID tokens after OIDC signature verification', async () => {
		const service = new AuthService({} as JwtService, {} as HttpService);
		jest.spyOn(jose, 'jwtVerify').mockRejectedValue(new Error('JWTExpired'));

		await expect((service as any).verifyKakaoIdentityToken('expired-id-token', 'kakao-rest-api-key')).rejects.toEqual(
			expect.objectContaining({ message: Messages.INVALID_KAKAO_IDENTITY_TOKEN }),
		);
	});

	it('requires Telegram configuration only when Telegram authentication is used', async () => {
		delete process.env.TELEGRAM_CLIENT_ID;
		delete process.env.TELEGRAM_CLIENT_SECRET;
		const service = new AuthService({} as JwtService, {} as HttpService);

		await expect(
			service.verifyTelegramAuthorizationCode('code', 'https://app.aurora.test/auth/telegram', 'a'.repeat(43)),
		).rejects.toEqual(expect.objectContaining({ message: Messages.TELEGRAM_AUTH_NOT_CONFIGURED }));
	});

	it('exchanges a Telegram authorization code with Basic auth and its PKCE verifier', async () => {
		process.env.TELEGRAM_CLIENT_ID = 'telegram-client-id';
		process.env.TELEGRAM_CLIENT_SECRET = 'telegram-client-secret';
		const httpService = {
			post: jest.fn().mockReturnValue(of({ data: { id_token: 'telegram-id-token' } })),
		} as unknown as HttpService;
		const service = new AuthService({} as JwtService, httpService);
		jest.spyOn(jose, 'jwtVerify').mockResolvedValue({
			payload: {
				sub: 'telegram-subject',
				preferred_username: 'kevin_dev',
				name: 'Kevin Traveler',
				picture: 'https://t.me/i/userpic/320/avatar.jpg',
			},
		} as any);

		await expect(
			service.verifyTelegramAuthorizationCode(
				'authorization-code',
				'https://app.aurora.test/auth/telegram',
				'a'.repeat(43),
			),
		).resolves.toEqual({
			subject: 'telegram-subject',
			preferredUsername: 'kevin_dev',
			name: 'Kevin Traveler',
			image: 'https://t.me/i/userpic/320/avatar.jpg',
		});

		const [url, body, options] = (httpService.post as jest.Mock).mock.calls[0];
		expect(url).toBe('https://oauth.telegram.org/token');
		expect(options.headers).toEqual({
			Authorization: `Basic ${Buffer.from('telegram-client-id:telegram-client-secret').toString('base64')}`,
			'Content-Type': 'application/x-www-form-urlencoded',
		});
		expect(new URLSearchParams(body)).toEqual(
			new URLSearchParams({
				grant_type: 'authorization_code',
				code: 'authorization-code',
				redirect_uri: 'https://app.aurora.test/auth/telegram',
				client_id: 'telegram-client-id',
				code_verifier: 'a'.repeat(43),
			}),
		);
		expect(jose.jwtVerify).toHaveBeenCalledWith('telegram-id-token', expect.any(Function), {
			issuer: 'https://oauth.telegram.org',
			audience: 'telegram-client-id',
			algorithms: ['RS256'],
		});
	});

	it('maps invalid Telegram code, PKCE, redirect and missing token failures to focused errors', async () => {
		process.env.TELEGRAM_CLIENT_ID = 'telegram-client-id';
		process.env.TELEGRAM_CLIENT_SECRET = 'telegram-client-secret';
		const invalidCodeService = new AuthService(
			{} as JwtService,
			{
				post: jest.fn().mockReturnValue(throwError(() => ({ response: { status: 400 } }))),
			} as unknown as HttpService,
		);
		await expect(
			invalidCodeService.verifyTelegramAuthorizationCode('bad-code', 'https://bad.redirect', 'b'.repeat(43)),
		).rejects.toEqual(expect.objectContaining({ message: Messages.INVALID_TELEGRAM_AUTHORIZATION_CODE }));

		const missingTokenService = new AuthService(
			{} as JwtService,
			{
				post: jest.fn().mockReturnValue(of({ data: {} })),
			} as unknown as HttpService,
		);
		await expect(
			missingTokenService.verifyTelegramAuthorizationCode(
				'code',
				'https://app.aurora.test/auth/telegram',
				'c'.repeat(43),
			),
		).rejects.toEqual(expect.objectContaining({ message: Messages.INVALID_TELEGRAM_IDENTITY_TOKEN }));

		const unavailableService = new AuthService(
			{} as JwtService,
			{
				post: jest.fn().mockReturnValue(throwError(() => ({ response: { status: 503 } }))),
			} as unknown as HttpService,
		);
		await expect(
			unavailableService.verifyTelegramAuthorizationCode(
				'code',
				'https://app.aurora.test/auth/telegram',
				'd'.repeat(43),
			),
		).rejects.toEqual(expect.objectContaining({ message: Messages.TELEGRAM_TOKEN_EXCHANGE_FAILED }));
	});

	it.each(['invalid signature', 'wrong issuer', 'wrong audience', 'expired token'])(
		'rejects a Telegram ID token with %s',
		async () => {
			const service = new AuthService({} as JwtService, {} as HttpService);
			jest.spyOn(jose, 'jwtVerify').mockRejectedValue(new Error('JWT verification failed'));

			await expect(
				(service as any).verifyTelegramIdentityToken('invalid-id-token', 'telegram-client-id'),
			).rejects.toEqual(expect.objectContaining({ message: Messages.INVALID_TELEGRAM_IDENTITY_TOKEN }));
		},
	);

	it('rejects a verified Telegram token without a subject', async () => {
		const service = new AuthService({} as JwtService, {} as HttpService);
		jest.spyOn(jose, 'jwtVerify').mockResolvedValue({ payload: { name: 'No Subject' } } as any);

		await expect((service as any).verifyTelegramIdentityToken('id-token', 'telegram-client-id')).rejects.toEqual(
			expect.objectContaining({ message: Messages.INVALID_TELEGRAM_IDENTITY_TOKEN }),
		);
	});
});
