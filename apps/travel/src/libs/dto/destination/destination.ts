import { Field, Float, Int, ObjectType } from '@nestjs/graphql';
import { DestinationStatus } from '../../enums/destination';
import { MeLiked } from '../like/like';
import { TotalCounter } from '../member/member';
import { Types } from 'mongoose';

@ObjectType()
export class Destination {
	@Field(() => String)
	_id: Types.ObjectId;

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
	destinationLikes: number;

	@Field(() => Int)
	destinationComments: number;

	@Field(() => Int)
	destinationReviews: number;

	@Field(() => Float)
	destinationRating: number;

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

	@Field(() => [MeLiked], { nullable: true })
	meLiked?: MeLiked[];
}

@ObjectType()
export class Destinations {
	@Field(() => [Destination])
	list!: Destination[];

	@Field(() => [TotalCounter], { nullable: true })
	metaCounter?: TotalCounter[];
}
