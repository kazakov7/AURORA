import { registerEnumType } from '@nestjs/graphql';

export enum MemberType {
	USER = 'USER',
	AGENT = 'AGENT',
	ADMIN = 'ADMIN',
}

registerEnumType(MemberType, {
	name: 'MemberType',
});

export enum MemberStatus {
	ACTIVE = 'ACTIVE',
	BLOCKED = 'BLOCKED',
	DELETED = 'DELETED',
}

registerEnumType(MemberStatus, {
	name: 'MemberStatus',
});

export enum MemberAuthType {
	NICK = 'NICK',
	PHONE = 'PHONE',
	EMAIL = 'EMAIL',
	GOOGLE = 'GOOGLE',
	KAKAO = 'KAKAO',
	TELEGRAM = 'TELEGRAM',
}

registerEnumType(MemberAuthType, {
	name: 'MemberAuthType',
});
