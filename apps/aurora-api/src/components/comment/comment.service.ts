import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, type ObjectId, Types } from 'mongoose';

import { PropertyService } from '../property/property.service';
import { Comment, Comments } from '../../libs/dto/comment/comment';
import { CommentInput, CommentsInquiry } from '../../libs/dto/comment/comment.input';
import { CommentGroup, CommentStatus } from '../../libs/enums/comment.enum';

import { MemberService } from '../member/member.service';
import { CommentUpdate } from '../../libs/dto/comment/comment.update';
import { lookupMember } from '../../libs/config';
import { T } from '../../libs/types/common';
import { BoardArticleService } from '../article/board-article.service';
import { Direction, Messages } from '../../libs/enums/common.enum';
import { TourService } from '../tour/tour.service';
import { DestinationService } from '../destination/destination.service';
import { NotificationService } from '../notification/notification.service';
import { NotificationGroup, NotificationType } from '../../libs/enums/notification.enum';

@Injectable()
export class CommentService {
	constructor(
		@InjectModel('Comment')
		private readonly commentModel: Model<Comment>,
		private memberService: MemberService,
		private boardArticleService: BoardArticleService,
		private propertyService: PropertyService,
		private tourService: TourService,
		private destinationService: DestinationService,
		@InjectModel('Property') private readonly propertyModel: Model<any>,
		@InjectModel('Tour') private readonly tourModel: Model<any>,
		@InjectModel('BoardArticle') private readonly articleModel: Model<any>,
		private readonly notificationService: NotificationService,
	) {}

	public async createComment(memberId: Types.ObjectId, input: CommentInput): Promise<Comment> {
		input.memberId = memberId;

		let result: Comment | null;
		try {
			result = await this.commentModel.create(input);
		} catch (err) {
			if (err instanceof Error) {
				console.log('Error, Service.model:', err.message);
			}
			throw new BadRequestException(Messages.CREATE_FAILED);
		}

		switch (input.commentGroup) {
			case CommentGroup.PROPERTY:
				await this.propertyService.propertyStatsEditor({
					_id: input.commentRefId,
					targetKey: 'propertyComments',
					modifier: 1,
				});
				break;

			case CommentGroup.ARTICLE:
				await this.boardArticleService.boardArticleStatsEditor({
					_id: input.commentRefId,
					targetKey: 'articleComments',
					modifier: 1,
				});
				break;

			case CommentGroup.TOUR:
				await this.tourService.tourStatsEditor({
					_id: input.commentRefId,
					targetKey: 'tourComments',
					modifier: 1,
				});
				break;

			case CommentGroup.DESTINATION:
				await this.destinationService.destinationStatsEditor({
					_id: input.commentRefId,
					targetKey: 'destinationComments',
					modifier: 1,
				});
				break;
		}

		if (!result) throw new InternalServerErrorException(Messages.CREATE_FAILED);
		await this.notifyContentOwner(memberId, result as Comment);

		return result as unknown as Comment;
	}

	private async notifyContentOwner(authorId: Types.ObjectId, comment: Comment): Promise<void> {
		const targets: Record<string, { model: Model<any>; group: NotificationGroup }> = {
			[CommentGroup.PROPERTY]: { model: this.propertyModel, group: NotificationGroup.PROPERTY },
			[CommentGroup.TOUR]: { model: this.tourModel, group: NotificationGroup.TOUR },
			[CommentGroup.ARTICLE]: { model: this.articleModel, group: NotificationGroup.ARTICLE },
		};
		const target = targets[comment.commentGroup];
		if (!target) return;
		const content = (await target.model
			.findById(comment.commentRefId)
			.select('memberId')
			.lean()
			.exec()) as any;
		if (!content?.memberId) return;
		await this.notificationService.createNotification({
			receiverId: content.memberId as Types.ObjectId,
			authorId,
			notificationType: NotificationType.COMMENT,
			notificationGroup: target.group,
			notificationRefId: comment.commentRefId as unknown as Types.ObjectId,
			notificationTitle: 'New comment on your content',
			notificationDesc: 'Someone left a comment on your content.',
			notificationEventKey: `comment:${comment._id}`,
		});
	}

	public async updateComment(memberId: Types.ObjectId, input: CommentUpdate): Promise<Comment> {
		const { _id } = input;

		const result = await this.commentModel
			.findOneAndUpdate(
				{
					_id: _id,
					memberId: memberId,
					commentStatus: CommentStatus.ACTIVE,
				},
				input,
				{
					new: true,
				},
			)
			.exec();

		if (!result) throw new InternalServerErrorException(Messages.UPDATE_FAILED);

		return result;
	}

	public async getComments(memberId: Types.ObjectId, input: CommentsInquiry): Promise<Comments> {
		const { commentRefId, commentGroup } = input.search;

		const match: T = {
			commentRefId: commentRefId,
			commentStatus: CommentStatus.ACTIVE,
		};
		if (commentGroup) match.commentGroup = commentGroup;

		const sort: T = {
			[input?.sort ?? 'createdAt']: input?.direction ?? Direction.DESC,
		};

		const result: Comments[] = await this.commentModel
			.aggregate([
				{ $match: match },
				{ $sort: sort },
				{
					$facet: {
						list: [
							{ $skip: (input.page - 1) * input.limit },
							{ $limit: input.limit },
							// mLiked
							lookupMember,
							{ $unwind: '$memberData' },
						],
						metaCounter: [{ $count: 'total' }],
					},
				},
			])
			.exec();

		if (!result.length) {
			throw new InternalServerErrorException(Messages.NO_DATA_FOUND);
		}

		return result[0];
	}

	public async removeCommentByAdmin(input: ObjectId): Promise<Comment> {
		const result = await this.commentModel.findByIdAndDelete(input).exec();

		if (!result) {
			throw new InternalServerErrorException(Messages.REMOVE_FAILED);
		}

		await this.decrementTargetCommentCounter(
			result.commentGroup,
			result.commentRefId as unknown as Types.ObjectId,
		);

		return result;
	}

	private async decrementTargetCommentCounter(
		commentGroup: CommentGroup,
		commentRefId: Types.ObjectId,
	): Promise<void> {
		switch (commentGroup) {
			case CommentGroup.PROPERTY:
				await this.propertyService.propertyStatsEditor({
					_id: commentRefId,
					targetKey: 'propertyComments',
					modifier: -1,
				});
				break;
			case CommentGroup.TOUR:
				await this.tourService.tourStatsEditor({
					_id: commentRefId,
					targetKey: 'tourComments',
					modifier: -1,
				});
				break;
			case CommentGroup.DESTINATION:
				await this.destinationService.destinationStatsEditor({
					_id: commentRefId,
					targetKey: 'destinationComments',
					modifier: -1,
				});
				break;
			case CommentGroup.ARTICLE:
				await this.boardArticleService.boardArticleStatsEditor({
					_id: commentRefId,
					targetKey: 'articleComments',
					modifier: -1,
				});
				break;
		}
	}
}
