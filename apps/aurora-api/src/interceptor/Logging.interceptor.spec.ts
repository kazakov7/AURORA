import { LoggingInterceptor } from './Logging.interceptor';

describe('LoggingInterceptor credential redaction', () => {
	it('redacts password and token values before truncating log output', () => {
		const interceptor = new LoggingInterceptor();
		const output = (interceptor as unknown as { stringify: (context: Record<string, string>) => string }).stringify({
			memberPassword: 'plain-text-password',
			currentPassword: 'current-password',
			newPassword: 'new-password',
			accessToken: 'jwt-token',
		});

		expect(output).toContain('[REDACTED]');
		expect(output).not.toContain('plain-text-password');
		expect(output).not.toContain('current-password');
		expect(output).not.toContain('new-password');
		expect(output).not.toContain('jwt-token');
	});
});
