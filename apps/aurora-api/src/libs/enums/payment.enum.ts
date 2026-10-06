import { registerEnumType } from '@nestjs/graphql';

export enum PaymentProvider {
	STRIPE = 'STRIPE',
}

registerEnumType(PaymentProvider, {
	name: 'PaymentProvider',
});

export enum PaymentStatus {
	PENDING = 'PENDING',
	SUCCEEDED = 'SUCCEEDED',
	FAILED = 'FAILED',
	REFUNDED = 'REFUNDED',
}

registerEnumType(PaymentStatus, {
	name: 'PaymentStatus',
});
