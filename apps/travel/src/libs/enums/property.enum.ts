import { registerEnumType } from '@nestjs/graphql';

export enum PropertyType {
	HOTEL = 'HOTEL',
	MOTEL = 'MOTEL',
	HOSTEL = 'HOSTEL',
	RESORT = 'RESORT',
	APARTMENT = 'APARTMENT',
	VILLA = 'VILLA',
	GUESTHOUSE = 'GUESTHOUSE',
	OTHER = 'OTHER',
}

registerEnumType(PropertyType, {
	name: 'PropertyType',
});
export enum PropertyStatus {
	ACTIVE = 'ACTIVE',
	INACTIVE = 'INACTIVE',
	PENDING = 'PENDING',
	REJECTED = 'REJECTED',
}
registerEnumType(PropertyStatus, {
	name: 'PropertyStatus',
});
