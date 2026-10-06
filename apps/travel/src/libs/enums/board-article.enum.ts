import { registerEnumType } from '@nestjs/graphql';

export enum BoardArticleCategory {
	DESTINATION = 'DESTINATION',
	HOTEL = 'HOTEL',
	TOUR = 'TOUR',
	GUIDE = 'GUIDE',
	NEWS = 'NEWS',
}

registerEnumType(BoardArticleCategory, {
	name: 'BoardArticleCategory',
	description: 'Category of a community travel article',
});

export enum BoardArticleStatus {
	PUBLISHED = 'PUBLISHED',
	DELETED = 'DELETED',
}
registerEnumType(BoardArticleStatus, {
	name: 'BoardArticleStatus',
});
