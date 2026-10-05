import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Types } from 'mongoose';
import { shapeIntoMongoObjectId } from '../../libs/config';
import { Reviews, Review } from '../../libs/dto/review/review';
import { DestinationReviewInput, DestinationReviewsInquiry } from '../../libs/dto/review/review.input';
import { DestinationReviewUpdate } from '../../libs/dto/review/review.update';
import { MemberType } from '../../libs/enums/member.enum';
import { AuthMember } from '../auth/decorators/authMember.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { WithoutGuard } from '../auth/guards/without.guard';
import { ReviewService } from './review.service';

@Resolver()
export class ReviewResolver {
	constructor(private readonly reviewService: ReviewService) {}

	@UseGuards(AuthGuard)
	@Mutation(() => Review)
	public async createDestinationReview(
		@Args('input') input: DestinationReviewInput,
		@AuthMember('_id') memberId: Types.ObjectId,
	): Promise<Review> {
		input.destinationId = shapeIntoMongoObjectId(input.destinationId) as unknown as string;
		return this.reviewService.createDestinationReview(memberId, input);
	}

	@UseGuards(AuthGuard)
	@Mutation(() => Review)
	public async updateDestinationReview(
		@Args('input') input: DestinationReviewUpdate,
		@AuthMember('_id') memberId: Types.ObjectId,
	): Promise<Review> {
		input._id = shapeIntoMongoObjectId(input._id) as unknown as string;
		return this.reviewService.updateDestinationReview(memberId, input);
	}

	@UseGuards(AuthGuard)
	@Mutation(() => Review)
	public async removeDestinationReview(
		@Args('reviewId') reviewId: string,
		@AuthMember('_id') memberId: Types.ObjectId,
	): Promise<Review> {
		return this.reviewService.removeDestinationReview(memberId, shapeIntoMongoObjectId(reviewId));
	}

	@UseGuards(WithoutGuard)
	@Query(() => Reviews)
	public async getDestinationReviews(
		@Args('destinationId') destinationId: string,
		@Args('input') input: DestinationReviewsInquiry,
	): Promise<Reviews> {
		return this.reviewService.getDestinationReviews(shapeIntoMongoObjectId(destinationId), input);
	}

	@Roles(MemberType.ADMIN)
	@UseGuards(RolesGuard)
	@Mutation(() => Review)
	public async removeDestinationReviewByAdmin(@Args('reviewId') reviewId: string): Promise<Review> {
		return this.reviewService.removeDestinationReviewByAdmin(shapeIntoMongoObjectId(reviewId));
	}
}
