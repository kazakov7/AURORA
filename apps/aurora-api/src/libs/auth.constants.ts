import { createRemoteJWKSet } from 'jose';

export const KAKAO_TOKEN_ENDPOINT = 'https://kauth.kakao.com/oauth/token';
export const KAKAO_USER_INFO_ENDPOINT = 'https://kapi.kakao.com/v2/user/me';
export const KAKAO_ISSUER = 'https://kauth.kakao.com';
export const kakaoJwks = createRemoteJWKSet(
	new URL('https://kauth.kakao.com/.well-known/jwks.json'),
);
export const TELEGRAM_TOKEN_ENDPOINT = 'https://oauth.telegram.org/token';
export const TELEGRAM_ISSUER = 'https://oauth.telegram.org';
export const telegramJwks = createRemoteJWKSet(
	new URL('https://oauth.telegram.org/.well-known/jwks.json'),
);
