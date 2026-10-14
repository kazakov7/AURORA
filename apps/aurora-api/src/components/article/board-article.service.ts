import {
	BadRequestException,
	Injectable,
	InternalServerErrorException,
	NotFoundException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, ObjectId, Types } from 'mongoose';
import { MemberService } from '../member/member.service';
import { ViewService } from '../view/view.service';
import { BoardArticle, BoardArticles } from '../../libs/dto/board-article/board-article';
import {
	AllBoardArticlesInquiry,
	BoardArticleInput,
	BoardArticlesInquiry,
} from '../../libs/dto/board-article/board-article.input';

import { BoardArticleStatus } from '../../libs/enums/board-article.enum';
import { ViewGroup } from '../../libs/enums/view.enum';
import { StatisticModifier, T } from '../../libs/types/common';
import { BoardArticleUpdate } from '../../libs/dto/board-article/board-article.update';
import {
	shapeIntoMongoObjectId,
	lookupMember,
	lookUpAuthMemberLiked,
	escapeRegExp,
} from '../../libs/config';

import { LikeGroup } from '../../libs/enums/like.enum';
import { LikeModule } from '../like/like.module';
import { LikeService } from '../like/like.service';
import { Direction, Messages } from '../../libs/enums/common.enum';
import { NotificationService } from '../notification/notification.service';
import { NotificationGroup, NotificationType } from '../../libs/enums/notification.enum';
import { CommentGroup } from '../../libs/enums/comment.enum';

@Injectable()
export class BoardArticleService {
	constructor(
		@InjectModel('BoardArticle')
		private readonly boardArticleModel: Model<BoardArticle>,
		@InjectModel('Comment') private readonly commentModel: Model<any>,
		@InjectModel('Like') private readonly likeModel: Model<any>,
		@InjectModel('View') private readonly viewModel: Model<any>,
		@InjectModel('Notification') private readonly notificationModel: Model<any>,
		@InjectConnection() private readonly connection: Connection,
		private memberService: MemberService,
		private likeService: LikeService,
		private viewService: ViewService,
		private readonly notificationService: NotificationService,
	) {}

	public async createBoardArticle(
		memberId: ObjectId,
		input: BoardArticleInput,
	): Promise<BoardArticle> {
		input.memberId = memberId;
		let result: BoardArticle;
		try {
			result = (await this.boardArticleModel.create(input)) as unknown as BoardArticle;
		} catch (err) {
			console.log('Error, Service.model:', err);
			throw new BadRequestException(Messages.CREATE_FAILED);
		}

		// The article is saved; a failed counter update must not report it as failed and invite a duplicate
		await this.memberService
			.memberStatusEditor({
				//@ts-ignore
				_id: memberId,
				targetKey: 'memberArticles',
				modifier: 1,
			})
			.catch((err) => console.error('memberArticles update failed:', err));
		return result;
	}

	public async getBoardArticle(
		memberId: Types.ObjectId,
		articleId: Types.ObjectId,
	): Promise<BoardArticle> {
		const search: T = {
			_id: articleId,
			articleStatus: BoardArticleStatus.PUBLISHED,
		};

		const targetBoardArticle = (await this.boardArticleModel
			.findOne(search)
			.lean()
			.exec()) as BoardArticle | null;

		if (!targetBoardArticle) throw new NotFoundException(Messages.ARTICLE_NOT_FOUND);

		if (memberId) {
			const viewInput = {
				memberId: memberId,
				viewRefId: articleId,
				viewGroup: ViewGroup.ARTICLE,
			};

			const newView = await this.viewService.recordView(viewInput);

			if (newView) {
				await this.boardArticleStatsEditor({
					_id: articleId,
					targetKey: 'articleViews',
					modifier: 1,
				});

				targetBoardArticle.articleViews++;
			}

			const likeInput = {
				memberId: memberId,
				likeRefId: articleId,
				likeGroup: LikeGroup.ARTICLE,
			};
			targetBoardArticle.meLiked = await this.likeService.checkLikeExistence(likeInput);
		}

		// A deleted author must not break the story: it is returned without the author
		targetBoardArticle.memberData = await this.memberService
			.getMember(null, targetBoardArticle.memberId as unknown as Types.ObjectId)
			.catch((err) => {
				if (err instanceof NotFoundException) return undefined;
				throw err;
			});

		return targetBoardArticle;
	}

	public async boardArticleStatsEditor(input: StatisticModifier): Promise<BoardArticle> {
		const { _id, targetKey, modifier } = input;

		return (await this.boardArticleModel
			.findByIdAndUpdate(
				_id,
				[
					{
						$set: {
							[targetKey]: { $max: [0, { $add: [{ $ifNull: [`$${targetKey}`, 0] }, modifier] }] },
						},
					},
				] as any,
				{
					new: true,
				},
			)
			.exec()) as unknown as BoardArticle;
	}

	public async updateBoardArticle(
		memberId: Types.ObjectId,
		input: BoardArticleUpdate,
	): Promise<BoardArticle> {
		const { _id, articleStatus } = input;

		const result = await this.boardArticleModel
			.findOneAndUpdate(
				{
					//@ts-ignore
					_id: _id,
					memberId: memberId,
					articleStatus: BoardArticleStatus.PUBLISHED,
				},
				input as any,
				{
					new: true,
				},
			)
			.exec();

		if (!result) throw new BadRequestException(Messages.UPDATE_FAILED);

		if (articleStatus === BoardArticleStatus.DELETED) {
			await this.memberService.memberStatusEditor({
				_id: memberId,
				targetKey: 'memberArticles',
				modifier: -1,
			});
		}

		return result as unknown as BoardArticle;
	}
	public async likeTargetArticle(
		memberId: Types.ObjectId,
		likeRefId: Types.ObjectId,
	): Promise<BoardArticle> {
		const target = await this.boardArticleModel.findOne({
			//@ts-ignore
			_id: likeRefId,
			articleStatus: BoardArticleStatus.PUBLISHED,
		});
		if (!target) throw new NotFoundException(Messages.ARTICLE_NOT_FOUND);

		const input = {
			memberId: memberId,
			likeRefId: likeRefId,
			likeGroup: LikeGroup.ARTICLE,
		};

		// LIKE TOGGLE via Like modules
		const modifier = await this.likeService.toggleLike(input);
		if (modifier === 1)
			await this.notificationService.createNotification({
				receiverId: target.memberId as Types.ObjectId,
				authorId: memberId,
				notificationType: NotificationType.LIKE,
				notificationGroup: NotificationGroup.ARTICLE,
				notificationRefId: likeRefId,
				notificationTitle: 'New community like',
				notificationDesc: 'Someone liked your community story.',
				notificationEventKey: `article-like:${memberId}:${likeRefId}`,
			});
		const result = await this.boardArticleModel.findById(likeRefId).exec();

		if (!result) throw new InternalServerErrorException(Messages.SOMETHING_WENT_WRONG);
		return result;
	}

	public async getBoardArticles(
		memberId: Types.ObjectId,
		input: BoardArticlesInquiry,
	): Promise<BoardArticles> {
		const { articleCategory, text } = input.search;

		const match: T = {
			articleStatus: BoardArticleStatus.PUBLISHED,
		};

		if (articleCategory) match.articleCategory = articleCategory;

		const normalizedText = text?.trim();
		if (normalizedText)
			match.articleTitle = { $regex: new RegExp(escapeRegExp(normalizedText), 'i') };

		if (input.search?.memberId) {
			match.memberId = shapeIntoMongoObjectId(input.search.memberId);
		}

		const result = await this.boardArticleModel
			.aggregate([
				{ $match: match },
				{ $sort: this.shapeSort(input) },
				{
					$facet: {
						list: [
							{ $skip: (input.page - 1) * input.limit },
							{ $limit: input.limit },
							lookUpAuthMemberLiked(memberId),
							lookupMember,
							{ $unwind: { path: '$memberData', preserveNullAndEmptyArrays: true } },
						],
						metaCounter: [{ $count: 'total' }],
					},
				},
			])
			.exec();

		if (!result.length) throw new InternalServerErrorException(Messages.NO_DATA_FOUND);

		return result[0];
	}
	// ADMIN
	public async getAllBoardArticlesByAdmin(input: AllBoardArticlesInquiry): Promise<BoardArticles> {
		const { articleStatus, articleCategory } = input.search;
		const match: T = {};

		if (articleStatus) match.articleStatus = articleStatus;
		if (articleCategory) match.articleCategory = articleCategory;

		const result = await this.boardArticleModel
			.aggregate([
				{ $match: match },
				{ $sort: this.shapeSort(input) },
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

		if (!result) throw new InternalServerErrorException(Messages.NO_DATA_FOUND);

		return result[0];
	}

	public async updateBoardArticleByAdmin(input: BoardArticleUpdate): Promise<BoardArticle> {
		const { _id, articleStatus } = input;

		const result = await this.boardArticleModel
			.findOneAndUpdate({ _id: _id, articleStatus: BoardArticleStatus.PUBLISHED }, input, {
				new: true,
			})
			.exec();

		if (!result) throw new BadRequestException(Messages.UPDATE_FAILED);

		if (articleStatus === BoardArticleStatus.DELETED) {
			await this.memberService.memberStatusEditor({
				//@ts-ignore
				_id: result.memberId,
				targetKey: 'memberArticles',
				modifier: -1,
			});
		}

		return result as unknown as BoardArticle;
	}

	public async removeBoardArticleByAdmin(articleId: ObjectId): Promise<BoardArticle> {
		const search: T = {
			_id: articleId,
			articleStatus: BoardArticleStatus.DELETED,
		};

		// A purged article takes its comments, likes, views and notifications with it, all or nothing
		const session = await this.connection.startSession();
		try {
			let result: BoardArticle | null = null;
			let commenterIds: Types.ObjectId[] = [];
			await session.withTransaction(async () => {
				result = (await this.boardArticleModel
					.findOneAndDelete(search, { session })
					.exec()) as unknown as BoardArticle | null;
				if (!result) throw new BadRequestException(Messages.REMOVE_FAILED);

				const articleComments = { commentGroup: CommentGroup.ARTICLE, commentRefId: articleId };
				commenterIds = await this.commentModel
					.distinct('memberId', articleComments)
					.session(session)
					.exec();
				await this.commentModel.deleteMany(articleComments, { session }).exec();
				await this.likeModel
					.deleteMany({ likeGroup: LikeGroup.ARTICLE, likeRefId: articleId }, { session })
					.exec();
				await this.viewModel
					.deleteMany({ viewGroup: ViewGroup.ARTICLE, viewRefId: articleId }, { session })
					.exec();
				await this.notificationModel
					.deleteMany(
						{ notificationGroup: NotificationGroup.ARTICLE, notificationRefId: articleId },
						{ session },
					)
					.exec();
			});

			if (!result) throw new BadRequestException(Messages.REMOVE_FAILED);
			// The purged comments leave their writers' counts
			for (const commenterId of commenterIds) {
				await this.memberService.syncMemberCommentCounter(commenterId);
			}
			return result;
		} finally {
			await session.endSession();
		}
	}

	/** The _id tie-breaker keeps pages stable when many articles share the same sort value **/
	private shapeSort(input: Pick<BoardArticlesInquiry, 'sort' | 'direction'>): T {
		const direction = input.direction ?? Direction.DESC;
		return { [input.sort ?? 'createdAt']: direction, _id: direction };
	}
}
