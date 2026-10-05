import { Field, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class TravelHistory {
	@Field()
	_id: string;

	@Field()
	memberId: string;

	@Field()
	destinationId: string;

	@Field()
	bookingId: string;

	@Field()
	visitedAt: Date;

	@Field()
	createdAt: Date;
}
