import { Field, Float, Int, ObjectType } from '@nestjs/graphql';
import { TourStatus } from '../../enums/tour.enum';
import { Types } from 'mongoose';
import { Member, TotalCounter } from '../member/member';
import { MeLiked } from '../like/like';

@ObjectType()
export class Tour {
	@Field(() => String)
	_id: Types.ObjectId;

	@Field(() => String)
	memberId: Types.ObjectId;

	@Field(() => String)
	destinationId: Types.ObjectId;

	@Field(() => String)
	tourName: string;

	@Field({ nullable: true })
	tourDesc?: string;

	@Field(() => TourStatus)
	tourStatus: TourStatus;

	@Field(() => Float)
	tourPrice: number;

	@Field(() => String)
	tourCurrency: string;

	@Field(() => String)
	tourStartDate: Date;

	@Field(() => String)
	tourEndDate: Date;

	@Field(() => Int)
	tourCapacity: number;

	@Field(() => Int)
	tourReservedSeats: number;

	@Field({ nullable: true })
	tourDepartureCountry?: string;

	@Field({ nullable: true })
	tourDepartureCity?: string;

	@Field({ nullable: true })
	tourDeparturePlace?: string;

	@Field({ nullable: true })
	tourDestinationCity?: string;

	@Field(() => [String])
	tourImages: string[];

	@Field({ nullable: true })
	tourAdditionalInfo?: string;

	@Field(() => Int)
	tourViews: number;

	@Field(() => Int)
	tourLikes: number;

	@Field(() => Int)
	tourComments: number;

	@Field(() => Float)
	tourRating: number;

	@Field(() => Int)
	tourReviews: number;

	@Field({ nullable: true })
	deletedAt?: Date;

	@Field(() => String)
	createdAt: Date;

	@Field(() => String)
	updatedAt: Date;

	// Filled by the list and detail queries only, and empty when the owner account is gone
	@Field(() => Member, { nullable: true })
	memberData?: Member | null;

	@Field(() => [MeLiked], { nullable: true })
	meLiked?: MeLiked[];
}

@ObjectType()
export class Tours {
	@Field(() => [Tour])
	list!: Tour[];

	@Field(() => [TotalCounter], { nullable: true })
	metaCounter?: TotalCounter[];
}
