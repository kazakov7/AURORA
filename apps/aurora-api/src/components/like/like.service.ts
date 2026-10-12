import { BadRequestException, Injectable } from '@nestjs/common';
import { Like, MeLiked } from '../../libs/dto/like/like';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { LikeInput } from '../../libs/dto/like/like.input';
import { InputType } from '@nestjs/graphql';
import { Messages } from '../../libs/enums/common.enum';
import { T } from '../../libs/types/common';
import { OrdinaryInquery } from '../../libs/dto/property/property.input';
import { Properties } from '../../libs/dto/property/property';
import { LikeGroup } from '../../libs/enums/like.enum';
import { lookupFavorite } from '../../libs/config';
import { lookupFavoriteTour } from '../../libs/config';
import { Tours } from '../../libs/dto/tour/tour';
import { OrdinaryTourInquiry } from '../../libs/dto/tour/tour.input';

@Injectable()
export class LikeService {
	constructor(
		@InjectModel('Like')
		private readonly likeModel: Model<Like>,
		@InjectModel('Property') private readonly propertyModel: Model<any>,
		@InjectModel('Tour') private readonly tourModel: Model<any>,
		@InjectModel('Destination') private readonly destinationModel: Model<any>,
		@InjectModel('BoardArticle') private readonly articleModel: Model<any>,
		@InjectModel('Member') private readonly memberModel: Model<any>,
		@InjectConnection() private readonly connection: Connection,
	) {}

	public async toggleLike(input: LikeInput): Promise<number> {
		const session = await this.connection.startSession();
		try {
			let modifier = 0;
			await session.withTransaction(async () => {
				modifier = await this.toggleLikeInTransaction(input, session);
				await this.syncTargetLikeCounter(
					input.likeGroup,
					input.likeRefId as Types.ObjectId,
					session,
				);
			});
			return modifier;
		} finally {
			await session.endSession();
		}
	}

	public async checkLikeExistence(input: LikeInput): Promise<MeLiked[]> {
		const { memberId, likeRefId, likeGroup } = input;
		const result = await this.likeModel.findOne({ memberId, likeRefId, likeGroup }).exec();
		console.log(result);
		return result ? [{ memberId: memberId, likeRefId: likeRefId, myFavorite: true }] : [];
	}

	private async toggleLikeInTransaction(input: LikeInput, session: any): Promise<number> {
		const search = {
			memberId: input.memberId,
			likeGroup: input.likeGroup,
			likeRefId: input.likeRefId,
		};
		const removed = await this.likeModel.findOneAndDelete(search, { session }).exec();
		if (removed) return -1;

		try {
			await this.likeModel.create([{ ...input }], { session });
			return 1;
		} catch (error) {
			if ((error as { code?: number }).code !== 11000)
				throw new BadRequestException(Messages.CREATE_FAILED);
			const concurrentLike = await this.likeModel.findOneAndDelete(search, { session }).exec();
			if (concurrentLike) return -1;
			throw new BadRequestException(Messages.CREATE_FAILED);
		}
	}

	private async syncTargetLikeCounter(
		likeGroup: LikeGroup,
		likeRefId: Types.ObjectId,
		session: any,
	): Promise<void> {
		const count = await this.likeModel
			.countDocuments({ likeGroup, likeRefId })
			.session(session)
			.exec();
		const target = this.getLikeTarget(likeGroup);
		if (!target) return;
		await target.model
			.updateOne({ _id: likeRefId }, { $set: { [target.field]: count } }, { session })
			.exec();
	}

	private getLikeTarget(likeGroup: LikeGroup): { model: Model<any>; field: string } | null {
		switch (likeGroup) {
			case LikeGroup.PROPERTY:
				return { model: this.propertyModel, field: 'propertyLikes' };
			case LikeGroup.TOUR:
				return { model: this.tourModel, field: 'tourLikes' };
			case LikeGroup.DESTINATION:
				return { model: this.destinationModel, field: 'destinationLikes' };
			case LikeGroup.ARTICLE:
				return { model: this.articleModel, field: 'articleLikes' };
			case LikeGroup.MEMBER:
				return { model: this.memberModel, field: 'memberLikes' };
			default:
				return null;
		}
	}

	public async getFavoriteProperties(
		memberId: Types.ObjectId,
		input: OrdinaryInquery,
	): Promise<Properties> {
		const { page, limit } = input;
		const match: T = { likeGroup: LikeGroup.PROPERTY, memberId: memberId };

		const data: T = await this.likeModel
			.aggregate([
				{ $match: match },
				{ $sort: { updatedAt: -1 } },
				{
					$lookup: {
						from: 'properties',
						localField: 'likeRefId',
						foreignField: '_id',
						as: 'favoriteProperty',
					},
				},
				{ $unwind: '$favoriteProperty' },
				{
					$facet: {
						list: [
							{ $skip: (page - 1) * limit },
							{ $limit: limit },
							lookupFavorite,
							{ $unwind: '$favoriteProperty.memberData' },
						],
						metaCounter: [{ $count: 'total' }],
					},
				},
			])
			.exec();

		const result: Properties = { list: [], metaCounter: data[0].metaCounter };
		result.list = data[0].list.map((ele) => ele.favoriteProperty);

		return result;
	}

	public async getFavoriteTours(
		memberId: Types.ObjectId,
		input: OrdinaryTourInquiry,
	): Promise<Tours> {
		const data: T = await this.likeModel
			.aggregate([
				{ $match: { likeGroup: LikeGroup.TOUR, memberId } },
				{ $sort: { createdAt: -1 } },
				{
					$lookup: {
						from: 'tours',
						localField: 'likeRefId',
						foreignField: '_id',
						as: 'favoriteTour',
					},
				},
				{ $unwind: '$favoriteTour' },
				{ $match: { 'favoriteTour.tourStatus': 'ACTIVE', 'favoriteTour.deletedAt': null } },
				{
					$facet: {
						list: [
							{ $skip: (input.page - 1) * input.limit },
							{ $limit: input.limit },
							lookupFavoriteTour,
							{ $unwind: '$favoriteTour.memberData' },
						],
						metaCounter: [{ $count: 'total' }],
					},
				},
			])
			.exec();

		const result: Tours = { list: [], metaCounter: data[0]?.metaCounter ?? [] };
		result.list = (data[0]?.list ?? []).map((item) => item.favoriteTour);
		return result;
	}
}
