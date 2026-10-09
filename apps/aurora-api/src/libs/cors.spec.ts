import { isCorsOriginAllowed } from './cors';

describe('CORS allowlist', () => {
	it('allows requests without an Origin header and local development origins outside production', () => {
		expect(isCorsOriginAllowed(undefined, 'development', '')).toBe(true);
		expect(isCorsOriginAllowed('http://localhost:3000', 'development', '')).toBe(true);
		expect(isCorsOriginAllowed('http://127.0.0.1:3001', 'test', '')).toBe(true);
		expect(isCorsOriginAllowed('http://[::1]:3002', 'development', '')).toBe(true);
	});

	it('uses exact configured origins and rejects wildcard or unlisted production origins', () => {
		const allowlist = 'https://aurora.example, https://admin.aurora.example';
		expect(isCorsOriginAllowed('https://aurora.example', 'production', allowlist)).toBe(true);
		expect(isCorsOriginAllowed('https://admin.aurora.example', 'production', allowlist)).toBe(true);
		expect(isCorsOriginAllowed('http://localhost:3000', 'production', allowlist)).toBe(false);
		expect(isCorsOriginAllowed('https://evil.example', 'production', allowlist)).toBe(false);
		expect(isCorsOriginAllowed('https://aurora.example.evil.test', 'production', allowlist)).toBe(false);
		expect(isCorsOriginAllowed('https://anything.example', 'production', '*')).toBe(false);
	});
});
