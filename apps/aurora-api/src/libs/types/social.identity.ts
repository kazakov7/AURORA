import { Messages } from '../enums/common.enum';
import { MemberAuthType } from '../enums/member.enum';

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

export interface TelegramIdentity {
	subject: string;
	preferredUsername?: string;
	name?: string;
	image?: string;
}

export interface KakaoTokenResponse {
	access_token?: string;
	id_token?: string;
}

export interface KakaoProfileResponse {
	id?: string | number;
	kakao_account?: {
		profile?: {
			nickname?: string;
			profile_image_url?: string;
		};
	};
}

export interface TelegramTokenResponse {
	id_token?: string;
	/** Telegram answers OAuth errors with HTTP 200 and an `error` field (e.g. `invalid_grant`) */
	error?: string;
}

export type SocialIdentity = GoogleIdentity | KakaoIdentity | TelegramIdentity;
export type SocialSubjectField = 'googleSubject' | 'kakaoSubject' | 'telegramSubject';

export interface SocialAuthConfig {
	authType: MemberAuthType;
	subjectField: SocialSubjectField;
	emailConflictMessage?: Messages;
	nicknameFallback: string;
	nicknameCandidates?: string[];
	backfillFullName?: boolean;
}
