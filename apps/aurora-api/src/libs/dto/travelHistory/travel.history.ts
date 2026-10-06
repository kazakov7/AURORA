import { Field, Int, ObjectType } from '@nestjs/graphql';
import { Booking } from '../booking/booking';
import { Destination } from '../destination/destination';
import { Property } from '../property/property';
import { Tour } from '../tour/tour';

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

	@Field(() => Date)
	visitedAt: Date;

	@Field(() => Date)
	createdAt: Date;

	@Field(() => Booking, { nullable: true })
	bookingData?: Booking;

	@Field(() => Destination, { nullable: true })
	destinationData?: Destination;

	@Field(() => Property, { nullable: true })
	propertyData?: Property;

	@Field(() => Tour, { nullable: true })
	tourData?: Tour;
}

@ObjectType()
export class TravelHistoryCounter {
	@Field(() => Int, { nullable: true })
	total!: number;
}

@ObjectType()
export class TravelHistories {
	@Field(() => [TravelHistory])
	list!: TravelHistory[];

	@Field(() => [TravelHistoryCounter], { nullable: true })
	metaCounter!: TravelHistoryCounter[];
}
