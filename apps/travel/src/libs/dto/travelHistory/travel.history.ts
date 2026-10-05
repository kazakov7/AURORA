import { Field, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class TravelHistory {
	@Field(() => String)
	_id: string;

	@Field(() => String)
	memberId: string;

	@Field(() => String)
	destinationId: string;

	@Field(() => String)
	bookingId: string;

	@Field(() => String)
	visitedAt: Date;

	@Field(() => String)
	createdAt: Date;
}
