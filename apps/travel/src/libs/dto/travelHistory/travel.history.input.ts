import { Field, InputType, Int } from '@nestjs/graphql';
import { IsInt, IsMongoId, IsNotEmpty, Min } from 'class-validator';

export class TravelHistoryInput {
	@IsNotEmpty()
	@IsMongoId()
	bookingId: string;

	memberId?: string;

	destinationId?: string;

	visitedAt: Date;
}

@InputType()
export class TravelHistoriesInquiry {
	@Field(() => Int)
	@IsInt()
	@Min(1)
	page!: number;

	@Field(() => Int)
	@IsInt()
	@Min(1)
	limit!: number;
}
