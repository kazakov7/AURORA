import { registerEnumType } from '@nestjs/graphql';

export enum TourStatus {
	ACTIVE = 'ACTIVE',
	INACTIVE = 'INACTIVE',
	PENDING = 'PENDING',
	REJECTED = 'REJECTED',
}
registerEnumType(TourStatus, {
	name: 'TourStatus',
});
