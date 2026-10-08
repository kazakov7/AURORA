import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { lookupMember } from '../../libs/config';
import { Reviews, Review } from '../../libs/dto/review/review';
import { DestinationReviewInput, DestinationReviewsInquiry, RatingInput } from '../../libs/dto/review/review.input';
import { DestinationReviewUpdate } from '../../libs/dto/review/review.update';
import { Messages } from '../../libs/enums/common.enum';
import { ReviewGroup, ReviewStatus } from '../../libs/enums/review.enum';
import { T } from '../../libs/types/common';
import { DestinationService } from '../destination/destination.service';
import { Property } from '../../libs/dto/property/property';
import { Tour } from '../../libs/dto/tour/tour';
import { BoardArticle } from '../../libs/dto/board-article/board-article';
import { PropertyStatus } from '../../libs/enums/property.enum';
import { TourStatus } from '../../libs/enums/tour.enum';
import { BoardArticleStatus } from '../../libs/enums/board-article.enum';

@Injectable()
export class ReviewService {
	constructor(
		@InjectModel('Review') private readonly reviewModel: Model<Review>,
		@InjectModel('Property') private readonly propertyModel: Model<Property>,
		@InjectModel('Tour') private readonly tourModel: Model<Tour>,
		@InjectModel('BoardArticle') private readonly articleModel: Model<BoardArticle>,
		private readonly destinationService: DestinationService,
	) {}

	public async submitRating(memberId: Types.ObjectId, input: RatingInput): Promise<Review> {
		const reviewRefId = input.reviewRefId as unknown as Types.ObjectId;
		await this.assertRatingTarget(input.reviewGroup, reviewRefId);

		let result: Review;
		try {
			result = (await this.reviewModel.create({
				memberId,
				reviewGroup: input.reviewGroup,
				reviewRefId,
				reviewRating: input.reviewRating,
			})) as unknown as Review;
		} catch (error) {
			if ((error as { code?: number }).code === 11000) {
				throw new BadRequestException(Messages.RATING_ALREADY_EXISTS);
			}
			throw new BadRequestException(Messages.CREATE_FAILED);
		}

		await this.refreshRatingStats(input.reviewGroup, reviewRefId);
		return result;
	}

	public async getMyRating(
		memberId: Types.ObjectId,
		reviewGroup: ReviewGroup,
		reviewRefId: Types.ObjectId,
	): Promise<Review | null> {
		return await this.reviewModel
			.findOne({ memberId, reviewGroup, reviewRefId, reviewStatus: ReviewStatus.ACTIVE })
			.lean<Review>()
			.exec();
	}

	public async createDestinationReview(
		memberId: Types.ObjectId,
		input: DestinationReviewInput,
	): Promise<Review> {
		const destinationId = input.destinationId as unknown as Types.ObjectId;
		await this.destinationService.getActiveDestination(destinationId);

		try {
			const result = await this.reviewModel.create({
				memberId,
				reviewGroup: ReviewGroup.DESTINATION,
				reviewRefId: destinationId,
				reviewRating: input.reviewRating,
				reviewContent: input.reviewContent,
			});
			await this.refreshDestinationReviewStats(destinationId);
			return result as unknown as Review;
		} catch (error) {
			if ((error as { code?: number }).code === 11000) {
				throw new BadRequestException(Messages.REVIEW_ALREADY_EXISTS);
			}
			throw new BadRequestException(Messages.CREATE_FAILED);
		}
	}

	public async updateDestinationReview(
		memberId: Types.ObjectId,
		input: DestinationReviewUpdate,
	): Promise<Review> {
		const { _id, ...update } = input;
		const result = await this.reviewModel
			.findOneAndUpdate(
				{
					_id,
					memberId,
					reviewGroup: ReviewGroup.DESTINATION,
					reviewStatus: ReviewStatus.ACTIVE,
				},
				update,
				{ new: true },
			)
			.exec();

		if (!result) throw new InternalServerErrorException(Messages.REVIEW_CANNOT_UPDATE);
		await this.refreshDestinationReviewStats(result.reviewRefId as unknown as Types.ObjectId);
		return result as unknown as Review;
	}

	public async removeDestinationReview(memberId: Types.ObjectId, reviewId: Types.ObjectId): Promise<Review> {
		return this.softRemoveDestinationReview({ _id: reviewId, memberId });
	}

	public async removeDestinationReviewByAdmin(reviewId: Types.ObjectId): Promise<Review> {
		return this.softRemoveDestinationReview({ _id: reviewId });
	}

	public async getDestinationReviews(
		destinationId: Types.ObjectId,
		input: DestinationReviewsInquiry,
	): Promise<Reviews> {
		await this.destinationService.getActiveDestination(destinationId);
		const result = await this.reviewModel
			.aggregate([
				{
					$match: {
						reviewGroup: ReviewGroup.DESTINATION,
						reviewRefId: destinationId,
						reviewStatus: ReviewStatus.ACTIVE,
					},
				},
				{ $sort: { createdAt: -1 } },
				{
					$facet: {
						list: [
							{ $skip: (input.page - 1) * input.limit },
							{ $limit: input.limit },
							lookupMember,
							{ $unwind: { path: '$memberData', preserveNullAndEmptyArrays: true } },
						],
						metaCounter: [{ $count: 'total' }],
					},
				},
			])
			.exec();

		return result[0] as Reviews;
	}

	private async softRemoveDestinationReview(match: T): Promise<Review> {
		const result = await this.reviewModel
			.findOneAndUpdate(
				{
					...match,
					reviewGroup: ReviewGroup.DESTINATION,
					reviewStatus: ReviewStatus.ACTIVE,
				},
				{ reviewStatus: ReviewStatus.DELETED, deletedAt: new Date() },
				{ new: true },
			)
			.exec();

		if (!result) throw new InternalServerErrorException(Messages.REVIEW_NOT_FOUND);
		await this.refreshDestinationReviewStats(result.reviewRefId as unknown as Types.ObjectId);
		return result as unknown as Review;
	}

	private async refreshDestinationReviewStats(destinationId: Types.ObjectId): Promise<void> {
		const result = await this.reviewModel
			.aggregate<{ count: number; rating: number }>([
				{
					$match: {
						reviewGroup: ReviewGroup.DESTINATION,
						reviewRefId: destinationId,
						reviewStatus: ReviewStatus.ACTIVE,
					},
				},
				{ $group: { _id: null, count: { $sum: 1 }, rating: { $avg: '$reviewRating' } } },
			])
			.exec();

		const stats = result[0];
		await this.destinationService.setDestinationReviewStats(destinationId, stats?.count ?? 0, stats?.rating ?? 0);
	}

	private async assertRatingTarget(reviewGroup: ReviewGroup, reviewRefId: Types.ObjectId): Promise<void> {
		let exists = false;
		switch (reviewGroup) {
			case ReviewGroup.PROPERTY:
				exists = Boolean(
					await this.propertyModel.exists({
						_id: reviewRefId,
						propertyStatus: PropertyStatus.ACTIVE,
						deletedAt: null,
					}),
				);
				break;
			case ReviewGroup.TOUR:
				exists = Boolean(
					await this.tourModel.exists({ _id: reviewRefId, tourStatus: TourStatus.ACTIVE, deletedAt: null }),
				);
				break;
			case ReviewGroup.ARTICLE:
				exists = Boolean(
					await this.articleModel.exists({
						_id: reviewRefId,
						articleStatus: BoardArticleStatus.PUBLISHED,
						deletedAt: null,
					}),
				);
				break;
			case ReviewGroup.DESTINATION:
				await this.destinationService.getActiveDestination(reviewRefId);
				exists = true;
				break;
		}

		if (!exists) throw new BadRequestException(Messages.RATING_TARGET_NOT_FOUND);
	}

	private async refreshRatingStats(reviewGroup: ReviewGroup, reviewRefId: Types.ObjectId): Promise<void> {
		const [stats] = await this.reviewModel
			.aggregate<{ count: number; rating: number }>([
				{
					$match: {
						reviewGroup,
						reviewRefId,
						reviewStatus: ReviewStatus.ACTIVE,
					},
				},
				{ $group: { _id: null, count: { $sum: 1 }, rating: { $avg: '$reviewRating' } } },
			])
			.exec();
		const count = stats?.count ?? 0;
		const rating = stats?.rating ?? 0;

		switch (reviewGroup) {
			case ReviewGroup.PROPERTY:
				await this.propertyModel.updateOne(
					{ _id: reviewRefId },
					{ propertyReviews: count, propertyRating: rating },
				);
				break;
			case ReviewGroup.TOUR:
				await this.tourModel.updateOne({ _id: reviewRefId }, { tourReviews: count, tourRating: rating });
				break;
			case ReviewGroup.ARTICLE:
				await this.articleModel.updateOne(
					{ _id: reviewRefId },
					{ articleReviews: count, articleRating: rating },
				);
				break;
			case ReviewGroup.DESTINATION:
				await this.destinationService.setDestinationReviewStats(reviewRefId, count, rating);
				break;
		}
	}
}
