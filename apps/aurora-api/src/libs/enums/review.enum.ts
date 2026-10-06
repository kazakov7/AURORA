import { registerEnumType } from '@nestjs/graphql';

export enum ReviewGroup {
	PROPERTY = 'PROPERTY',
	TOUR = 'TOUR',
	DESTINATION = 'DESTINATION',
}

registerEnumType(ReviewGroup, {
	name: 'ReviewGroup',
});

export enum ReviewStatus {
	ACTIVE = 'ACTIVE',
	DELETED = 'DELETED',
}

registerEnumType(ReviewStatus, {
	name: 'ReviewStatus',
});
