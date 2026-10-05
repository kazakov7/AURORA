import { registerEnumType } from '@nestjs/graphql';

export enum LikeGroup {
	PROPERTY = 'PROPERTY',
	TOUR = 'TOUR',
	ARTICLE = 'ARTICLE',
	/** @deprecated Kept temporarily while MemberService still reads member-like state. */
	MEMBER = 'MEMBER',
}
registerEnumType(LikeGroup, {
	name: 'LikeGroup',
});
