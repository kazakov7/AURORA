import { Field, Float, Int, ObjectType } from '@nestjs/graphql';

import { PropertyStatus, PropertyType } from '../../enums/property.enum';
import { Types } from 'mongoose';
import { TotalCounter } from '../member/member';
@ObjectType()
export class Property {
	@Field()
	_id: Types.ObjectId;

	@Field()
	memberId: Types.ObjectId;

	@Field(() => String)
	destinationId: Types.ObjectId;

	@Field(() => PropertyType)
	propertyType: PropertyType;

	@Field()
	propertyName: string;

	@Field({ nullable: true })
	propertyDesc?: string;

	@Field(() => PropertyStatus)
	propertyStatus: PropertyStatus;

	@Field({ nullable: true })
	propertyCity?: string;

	@Field({ nullable: true })
	propertyAddress?: string;

	@Field(() => Float)
	pricePerNight: number;

	@Field()
	currency: string;

	@Field(() => Int)
	maxGuests: number;

	@Field(() => Int)
	bedrooms: number;

	@Field(() => Int)
	beds: number;

	@Field(() => Int)
	bathrooms: number;

	@Field(() => [String])
	amenities: string[];

	@Field(() => [String])
	propertyImages: string[];

	// Statistics
	@Field(() => Int)
	propertyViews: number;

	@Field(() => Int)
	propertyLikes: number;

	@Field(() => Int)
	propertyBookings: number;

	@Field(() => Float)
	propertyRating: number;

	@Field(() => Int)
	propertyReviews: number;

	@Field(() => Int)
	propertyComments: number;

	@Field({ nullable: true })
	deletedAt?: Date;

	@Field()
	createdAt: Date;

	@Field()
	updatedAt: Date;
}
@ObjectType()
export class Properties {
	@Field(() => [Property])
	list!: Property[];

	@Field(() => [TotalCounter], { nullable: true })
	metaCounter?: TotalCounter[];
}
