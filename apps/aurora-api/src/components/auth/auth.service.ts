import {
	BadRequestException,
	Injectable,
	InternalServerErrorException,
	ServiceUnavailableException,
	UnauthorizedException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { OAuth2Client } from 'google-auth-library';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { firstValueFrom } from 'rxjs';
import { Member } from '../../libs/dto/member/member';
import { T } from '../../libs/types/common';
import { shapeIntoMongoObjectId } from '../../libs/config';
import { Messages } from '../../libs/enums/common.enum';

export interface GoogleIdentity {
	subject: string;
	email: string;
	name?: string;
	image?: string;
}

export interface KakaoIdentity {
	subject: string;
	email?: string;
	name?: string;
	image?: string;
}

interface KakaoTokenResponse {
	access_token?: string;
	id_token?: string;
}

interface KakaoProfileResponse {
	id?: string | number;
	kakao_account?: {
		profile?: {
			nickname?: string;
			profile_image_url?: string;
		};
	};
}

const KAKAO_TOKEN_ENDPOINT = 'https://kauth.kakao.com/oauth/token';
const KAKAO_USER_INFO_ENDPOINT = 'https://kapi.kakao.com/v2/user/me';
const KAKAO_ISSUER = 'https://kauth.kakao.com';
const kakaoJwks = createRemoteJWKSet(new URL('https://kauth.kakao.com/.well-known/jwks.json'));

@Injectable()
export class AuthService {
	constructor(
		private jwtService: JwtService,
		private httpService: HttpService,
	) { }
	public async hashPassword(memberPassword: string): Promise<string> {
		const salt = await bcrypt.genSalt();
		return await bcrypt.hash(memberPassword, salt);
	}

	public async comparePasswords(password: string, hashedPassword: string): Promise<boolean> {
		return await bcrypt.compare(password, hashedPassword);
	}

	public async createToken(member: Member): Promise<string> {
		const payload: T = {};
		Object.keys(member['_doc'] ? member['_doc'] : member).map((ele) => {
			payload[`${ele}`] = member[`${ele}`];
		});
		delete payload.memberPassword;
		delete payload.googleSubject;
		delete payload.kakaoSubject;
		delete payload.accessToken;

		return await this.jwtService.signAsync(payload);
	}
	public async verifyToken(token: string): Promise<Member> {
		const member = await this.jwtService.verifyAsync(token);
		member._id = shapeIntoMongoObjectId(member._id);
		return member;
	}

	public async verifyGoogleCredential(credential: string): Promise<GoogleIdentity> {
		const clientId = process.env.GOOGLE_WEB_CLIENT_ID;
		if (!clientId) throw new ServiceUnavailableException(Messages.GOOGLE_AUTH_NOT_CONFIGURED);

		try {
			const client = new OAuth2Client(clientId);
			const ticket = await client.verifyIdToken({ idToken: credential, audience: clientId });
			const payload = ticket.getPayload();

			if (!payload?.sub || !payload.email || payload.email_verified !== true) {
				throw new UnauthorizedException(Messages.INVALID_GOOGLE_CREDENTIAL);
			}

			return {
				subject: payload.sub,
				email: payload.email.toLowerCase(),
				name: payload.name,
			};
		} catch (error) {
			if (error instanceof UnauthorizedException) throw error;
			throw new UnauthorizedException(Messages.INVALID_GOOGLE_CREDENTIAL);
		}
	}

	public async verifyKakaoAuthorizationCode(code: string, redirectUri: string): Promise<KakaoIdentity> {
		const clientId = process.env.KAKAO_REST_API_KEY;
		const clientSecret = process.env.KAKAO_CLIENT_SECRET;
		if (!clientId || !clientSecret) throw new ServiceUnavailableException(Messages.KAKAO_AUTH_NOT_CONFIGURED);

		const form = new URLSearchParams({
			grant_type: 'authorization_code',
			client_id: clientId,
			client_secret: clientSecret,
			redirect_uri: redirectUri,
			code,
		});

		let token: KakaoTokenResponse;
		try {
			const response = await firstValueFrom(
				this.httpService.post<KakaoTokenResponse>(KAKAO_TOKEN_ENDPOINT, form.toString(), {
					headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
				}),
			);
			token = response.data;
		} catch (error) { //@ts-ignore
			const status = error?.response?.status;
			if (status >= 400 && status < 500) {
				throw new BadRequestException(Messages.INVALID_KAKAO_AUTHORIZATION_CODE);
			}
			throw new InternalServerErrorException(Messages.KAKAO_TOKEN_EXCHANGE_FAILED);
		}

		if (!token?.id_token) throw new UnauthorizedException(Messages.INVALID_KAKAO_IDENTITY_TOKEN);
		const identity = await this.verifyKakaoIdentityToken(token.id_token, clientId);
		return await this.retrieveKakaoProfile(identity, token.access_token);
	}

	private async verifyKakaoIdentityToken(idToken: string, clientId: string): Promise<KakaoIdentity> {
		try {
			const { payload } = await jwtVerify(idToken, kakaoJwks, {
				issuer: KAKAO_ISSUER,
				audience: clientId,
				algorithms: ['RS256'],
			});
			if (typeof payload.sub !== 'string' || !payload.sub) {
				throw new UnauthorizedException(Messages.INVALID_KAKAO_IDENTITY_TOKEN);
			}

			return {
				subject: payload.sub,
				email: typeof payload.email === 'string' && payload.email ? payload.email.toLowerCase() : undefined,
				name: typeof payload.nickname === 'string' && payload.nickname ? payload.nickname : undefined,
				image: typeof payload.picture === 'string' && payload.picture ? payload.picture : undefined,
			};
		} catch (error) {
			if (error instanceof UnauthorizedException) throw error;
			throw new UnauthorizedException(Messages.INVALID_KAKAO_IDENTITY_TOKEN);
		}
	}

	private async retrieveKakaoProfile(identity: KakaoIdentity, accessToken?: string): Promise<KakaoIdentity> {
		if (!accessToken) return identity;

		try {
			const response = await firstValueFrom(
				this.httpService.get<KakaoProfileResponse>(KAKAO_USER_INFO_ENDPOINT, {
					headers: { Authorization: `Bearer ${accessToken}` },
					params: {
						secure_resource: true,
						property_keys: JSON.stringify(['kakao_account.profile']),
					},
				}),
			);
			const profile = response.data?.kakao_account?.profile;
			if (response.data?.id == null || String(response.data.id) !== identity.subject) {
				throw new UnauthorizedException(Messages.INVALID_KAKAO_IDENTITY_TOKEN);
			}

			return {
				...identity,
				name: typeof profile?.nickname === 'string' && profile.nickname ? profile.nickname : identity.name,
				image:
					typeof profile?.profile_image_url === 'string' && profile.profile_image_url
						? profile.profile_image_url
						: identity.image,
			};
		} catch (error) {
			if (error instanceof UnauthorizedException) throw error;
			return identity;
		}
	}
}
