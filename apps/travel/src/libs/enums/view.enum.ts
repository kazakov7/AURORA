import { registerEnumType } from '@nestjs/graphql';

export enum ViewGroup {
	MEMBER = 'MEMBER',
	PROPERTY = 'PROPERTY',
	TOUR = 'TOUR',
	DESTINATION = 'DESTINATION',
	ARTICLE = 'ARTICLE',
}
registerEnumType(ViewGroup, {
	name: 'ViewGroup',
});
