import { registerEnumType } from '@nestjs/graphql';

export enum AgentType {
	HOTEL = 'HOTEL',
	TOUR = 'TOUR',
}

registerEnumType(AgentType, {
	name: 'AgentType',
});

export enum AgentVerificationStatus {
	PENDING = 'PENDING',
	APPROVED = 'APPROVED',
	REJECTED = 'REJECTED',
}

registerEnumType(AgentVerificationStatus, {
	name: 'AgentVerificationStatus',
});
