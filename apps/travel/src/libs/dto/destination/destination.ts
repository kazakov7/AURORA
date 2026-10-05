import { Field, Float, Int, ObjectType } from '@nestjs/graphql';
import { DestinationStatus } from '../../enums/destination';

@ObjectType()
export class Destination {
	@Field(() => String)
	_id: string;

	@Field(() => DestinationStatus)
	destinationStatus: DestinationStatus;

	@Field(() => String)
	destinationName: string;

	@Field(() => String)
	destinationSlug: string;

	@Field(() => String)
	destinationCountry: string;

	@Field(() => Float, { nullable: true })
	latitude?: number;

	@Field(() => Float, { nullable: true })
	longitude?: number;

	@Field(() => [String])
	destinationImages: string[];

	@Field(() => String, { nullable: true })
	destinationDesc?: string;

	@Field(() => Int)
	destinationViews: number;

	@Field(() => Int)
	destinationProperties: number;

	@Field(() => Int)
	destinationTours: number;

	@Field(() => Date, { nullable: true })
	deletedAt?: Date;

	@Field(() => Date)
	createdAt: Date;

	@Field(() => Date)
	updatedAt: Date;
}
