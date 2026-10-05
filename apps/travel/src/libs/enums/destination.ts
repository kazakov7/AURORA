import { registerEnumType } from '@nestjs/graphql';

export enum DestinationStatus {
	ACTIVE = 'ACTIVE',
	INACTIVE = 'INACTIVE',
}

registerEnumType(DestinationStatus, {
	name: 'DestinationStatus',
});
