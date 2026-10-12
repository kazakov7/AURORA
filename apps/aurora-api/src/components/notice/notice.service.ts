import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Notice, Notices } from '../../libs/dto/notice/notice';
import { NoticeInput, NoticesInquiry, NoticeUpdate } from '../../libs/dto/notice/notice.input';
import { Direction, Messages } from '../../libs/enums/common.enum';
import { NoticeStatus } from '../../libs/enums/notice.enum';
import { NotificationGroup, NotificationType } from '../../libs/enums/notification.enum';
import { T } from '../../libs/types/common';
import { escapeRegExp } from '../../libs/config';
import { NotificationService } from '../notification/notification.service';

@Injectable()
export class NoticeService {
	constructor(
		@InjectModel('Notice') private readonly noticeModel: Model<any>,
		private readonly notificationService: NotificationService,
	) {}

	public async createNotice(memberId: Types.ObjectId, input: NoticeInput): Promise<Notice> {
		try {
			const notice = await this.noticeModel.create({ ...input, memberId });
			await this.notificationService.notifyActiveMembers({
				notificationType: NotificationType.SYSTEM,
				notificationGroup: NotificationGroup.SYSTEM,
				notificationRefId: notice._id,
				notificationTitle: notice.noticeTitle,
				notificationDesc: notice.noticeContent,
				notificationEventKey: `notice-created:${notice._id}`,
			});
			return notice;
		} catch (err) {
			console.error('Notice creation failed:', err);
			throw new BadRequestException(Messages.CREATE_FAILED);
		}
	}

	public async getNotices(input: NoticesInquiry): Promise<Notices> {
		return await this.findNotices(input, { noticeStatus: NoticeStatus.ACTIVE });
	}

	public async getNoticesByAdmin(input: NoticesInquiry): Promise<Notices> {
		return await this.findNotices(input, {});
	}

	public async updateNoticeByAdmin(input: NoticeUpdate): Promise<Notice> {
		const { _id, ...update } = input;
		if (update.noticeStatus === NoticeStatus.DELETED)
			throw new BadRequestException(Messages.BAD_REQUEST);

		const result = await this.noticeModel.findByIdAndUpdate(_id, update, { new: true }).exec();
		if (!result) throw new InternalServerErrorException(Messages.NO_DATA_FOUND);
		return result;
	}

	public async removeNoticeByAdmin(noticeId: Types.ObjectId): Promise<string> {
		const result = await this.noticeModel
			.findOneAndUpdate(
				{ _id: noticeId, noticeStatus: { $ne: NoticeStatus.DELETED } },
				{ noticeStatus: NoticeStatus.DELETED },
				{ new: true },
			)
			.exec();
		if (!result) throw new InternalServerErrorException(Messages.REMOVE_FAILED);
		return 'Notice successfully deleted';
	}

	private async findNotices(input: NoticesInquiry, baseMatch: T): Promise<Notices> {
		const match: T = { ...baseMatch };
		const { search } = input;
		if (search?.noticeCategory) match.noticeCategory = search.noticeCategory;
		if (search?.noticeStatus && !baseMatch.noticeStatus) match.noticeStatus = search.noticeStatus;
		if (search?.text) {
			const regex = new RegExp(escapeRegExp(search.text), 'i');
			match.$or = [{ noticeTitle: regex }, { noticeContent: regex }];
		}

		const sort: T = {
			[input.sort ?? 'createdAt']: input.direction ?? Direction.DESC,
			_id: Direction.DESC,
		};
		const result = await this.noticeModel
			.aggregate([
				{ $match: match },
				{ $sort: sort },
				{
					$facet: {
						list: [{ $skip: (input.page - 1) * input.limit }, { $limit: input.limit }],
						metaCounter: [{ $count: 'total' }],
					},
				},
			])
			.exec();
		return result[0] ?? { list: [], metaCounter: [] };
	}
}
