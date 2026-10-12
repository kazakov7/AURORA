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
	/** Taken back from an approved agent, or from any live application of a deleted member **/
	REVOKED = 'REVOKED',
}

registerEnumType(AgentVerificationStatus, {
	name: 'AgentVerificationStatus',
});
