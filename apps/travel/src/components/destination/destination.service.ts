import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Destination, Destinations } from '../../libs/dto/destination/destination';
import { DestinationInput, DestinationsInquiry } from '../../libs/dto/destination/destination.input';
import { DestinationUpdate, UpdateDestinationStatusInput } from '../../libs/dto/destination/destination.update';
import { lookUpAuthMemberLiked } from '../../libs/config';
import { Direction, Messages } from '../../libs/enums/common.enum';
import { LikeGroup } from '../../libs/enums/like.enum';
import { DestinationStatus } from '../../libs/enums/destination';
import { ViewGroup } from '../../libs/enums/view.enum';
import { StatisticModifier, T } from '../../libs/types/common';
import { LikeService } from '../like/like.service';
import { ViewService } from '../view/view.service';

@Injectable()
export class DestinationService {
	constructor(
		@InjectModel('Destination') private readonly destinationModel: Model<Destination>,
		private readonly likeService: LikeService,
		private readonly viewService: ViewService,
	) {}

	public async createDestination(input: DestinationInput): Promise<Destination> {
		try {
			const result = await this.destinationModel.create(input);
			return result as unknown as Destination;
		} catch (error) {
			console.error('Destination creation failed:', error);
			throw new BadRequestException(Messages.CREATE_FAILED);
		}
	}

	public async getDestination(memberId: Types.ObjectId, destinationId: Types.ObjectId): Promise<Destination> {
		const destination = await this.getActiveDestination(destinationId);
		return this.attachViewerData(destination, memberId);
	}

	public async getActiveDestination(destinationId: Types.ObjectId): Promise<Destination> {
		const destination = await this.destinationModel
			.findOne({ _id: destinationId, destinationStatus: DestinationStatus.ACTIVE, deletedAt: null })
			.lean<Destination>()
			.exec();

		if (!destination) throw new InternalServerErrorException(Messages.DESTINATION_NOT_FOUND);
		return destination;
	}

	public async getDestinations(memberId: Types.ObjectId, input: DestinationsInquiry): Promise<Destinations> {
		const match: T = { destinationStatus: DestinationStatus.ACTIVE, deletedAt: null };
		if (input.search.destinationCountry) match.destinationCountry = input.search.destinationCountry;
		if (input.search.text) {
			const regex = new RegExp(input.search.text, 'i');
			match.$or = [{ destinationName: regex }, { destinationCountry: regex }, { destinationDesc: regex }];
		}

		const sort: T = { [input.sort ?? 'createdAt']: input.direction ?? Direction.DESC };
		const result = await this.destinationModel
			.aggregate([
				{ $match: match },
				{ $sort: sort },
				{
					$facet: {
						list: [
							{ $skip: (input.page - 1) * input.limit },
							{ $limit: input.limit },
							lookUpAuthMemberLiked(memberId),
						],
						metaCounter: [{ $count: 'total' }],
					},
				},
			])
			.exec();

		return result[0] as Destinations;
	}

	public async destinationStatsEditor(input: StatisticModifier): Promise<Destination> {
		const result = await this.destinationModel
			.findByIdAndUpdate(input._id, { $inc: { [input.targetKey]: input.modifier } }, { new: true })
			.exec();

		return result as unknown as Destination;
	}

	public async setDestinationReviewStats(
		destinationId: Types.ObjectId,
		destinationReviews: number,
		destinationRating: number,
	): Promise<Destination> {
		const result = await this.destinationModel
			.findByIdAndUpdate(
				destinationId,
				{ destinationReviews, destinationRating },
				{ new: true },
			)
			.exec();

		if (!result) throw new InternalServerErrorException(Messages.UPDATE_FAILED);
		return result as unknown as Destination;
	}

	public async likeTargetDestination(memberId: Types.ObjectId, destinationId: Types.ObjectId): Promise<Destination> {
		await this.getActiveDestination(destinationId);
		const modifier = await this.likeService.toggleLike({
			memberId,
			likeRefId: destinationId,
			likeGroup: LikeGroup.DESTINATION,
		});
		const result = await this.destinationStatsEditor({
			_id: destinationId,
			targetKey: 'destinationLikes',
			modifier,
		});

		if (!result) throw new InternalServerErrorException(Messages.SOMETHING_WENT_WRONG);
		return result;
	}

	public async updateDestinationByAdmin(input: DestinationUpdate): Promise<Destination> {
		const { _id, ...update } = input;
		const result = await this.destinationModel
			.findOneAndUpdate({ _id: _id as unknown as Types.ObjectId, deletedAt: null }, update, { new: true })
			.exec();

		if (!result) throw new InternalServerErrorException(Messages.UPDATE_FAILED);
		return result as unknown as Destination;
	}

	public async updateDestinationStatusByAdmin(input: UpdateDestinationStatusInput): Promise<Destination> {
		const { _id, destinationStatus } = input;
		const result = await this.destinationModel
			.findOneAndUpdate(
				{ _id: _id as unknown as Types.ObjectId, deletedAt: null },
				{ destinationStatus },
				{ new: true },
			)
			.exec();

		if (!result) throw new InternalServerErrorException(Messages.UPDATE_FAILED);
		return result as unknown as Destination;
	}

	public async removeDestinationByAdmin(destinationId: Types.ObjectId): Promise<Destination> {
		const result = await this.destinationModel
			.findOneAndUpdate(
				{ _id: destinationId, destinationStatus: DestinationStatus.INACTIVE, deletedAt: null },
				{ deletedAt: new Date() },
				{ new: true },
			)
			.exec();

		if (!result) throw new InternalServerErrorException(Messages.REMOVE_FAILED);
		return result as unknown as Destination;
	}

	private async attachViewerData(destination: Destination, memberId: Types.ObjectId): Promise<Destination> {
		if (!memberId) return destination;

		const newView = await this.viewService.recordView({
			memberId,
			viewRefId: destination._id as unknown as Types.ObjectId,
			viewGroup: ViewGroup.DESTINATION,
		});
		if (newView) {
			await this.destinationStatsEditor({
				_id: destination._id as unknown as Types.ObjectId,
				targetKey: 'destinationViews',
				modifier: 1,
			});
			destination.destinationViews += 1;
		}

		destination.meLiked = await this.likeService.checkLikeExistence({
			memberId,
			likeRefId: destination._id as unknown as Types.ObjectId,
			likeGroup: LikeGroup.DESTINATION,
		});
		return destination;
	}
}
