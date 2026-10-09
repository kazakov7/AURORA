const configuredOrigins = (value: string | undefined): Set<string> =>
	new Set(
		(value ?? '')
			.split(',')
			.map((origin) => origin.trim())
			.filter(Boolean),
	);

const isLocalDevelopmentOrigin = (origin: string): boolean => {
	try {
		const url = new URL(origin);
		return (
			(url.protocol === 'http:' || url.protocol === 'https:') &&
			['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
		);
	} catch (error) {
		return false;
	}
};

export const isCorsOriginAllowed = (
	origin: string | undefined,
	nodeEnv = process.env.NODE_ENV,
	allowlist = process.env.CORS_ALLOWED_ORIGINS,
): boolean => {
	if (!origin) return true;
	if (configuredOrigins(allowlist).has(origin)) return true;
	return nodeEnv !== 'production' && isLocalDevelopmentOrigin(origin);
};

export const createCorsOptions = () => ({
	origin: (origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void): void => {
		callback(null, isCorsOriginAllowed(origin));
	},
	credentials: true,
	methods: ['GET', 'POST', 'OPTIONS'],
	allowedHeaders: ['Authorization', 'Content-Type', 'Apollo-Require-Preflight'],
});
