import { registerEnumType } from '@nestjs/graphql';

export enum CommentStatus {
	ACTIVE = 'ACTIVE',
	DELETED = 'DELETED',
}
registerEnumType(CommentStatus, {
	name: 'CommentStatus',
});

export enum CommentGroup {
	PROPERTY = 'PROPERTY',
	TOUR = 'TOUR',
	DESTINATION = 'DESTINATION',
	ARTICLE = 'ARTICLE',
}
registerEnumType(CommentGroup, {
	name: 'CommentGroup',
});
