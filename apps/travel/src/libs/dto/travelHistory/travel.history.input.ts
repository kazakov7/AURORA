import { IsMongoId, IsNotEmpty } from 'class-validator';

export class TravelHistoryInput {
	@IsNotEmpty()
	@IsMongoId()
	bookingId: string;

	memberId?: string;

	destinationId?: string;

	visitedAt: Date;
}
