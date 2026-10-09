import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { SupportTicket, SupportTickets } from '../../libs/dto/support/support';
import { SupportTicketInput, SupportTicketsInquiry, SupportTicketUpdate } from '../../libs/dto/support/support.input';
import { Direction, Messages } from '../../libs/enums/common.enum';
import { NotificationGroup, NotificationType } from '../../libs/enums/notification.enum';
import { SupportStatus } from '../../libs/enums/support.enum';
import { T } from '../../libs/types/common';
import { NotificationService } from '../notification/notification.service';

@Injectable()
export class SupportService {
	constructor(
		@InjectModel('SupportTicket') private readonly supportTicketModel: Model<any>,
		private readonly notificationService: NotificationService,
	) { }

	public async createSupportTicket(memberId: Types.ObjectId, input: SupportTicketInput): Promise<SupportTicket> {
		let result: any;
		try {
			result = await this.supportTicketModel.create({ ...input, memberId, ticketStatus: SupportStatus.OPEN });
		} catch (err) {
			console.error('Support ticket creation failed:', err);
			throw new BadRequestException(Messages.CREATE_FAILED);
		}

		await this.notificationService.notifyActiveAdmins({
			authorId: memberId,
			notificationType: NotificationType.SYSTEM,
			notificationGroup: NotificationGroup.SYSTEM,
			notificationRefId: result._id,
			notificationTitle: 'New support request',
			notificationDesc: `[${input.ticketCategory}] ${input.ticketSubject}`,
			notificationEventKey: `support-ticket:${result._id}`,
		});
		return result;
	}

	public async getMySupportTickets(memberId: Types.ObjectId, input: SupportTicketsInquiry): Promise<SupportTickets> {
		return await this.findSupportTickets(input, { memberId });
	}

	public async getAllSupportTicketsByAdmin(input: SupportTicketsInquiry): Promise<SupportTickets> {
		return await this.findSupportTickets(input, {});
	}

	public async updateSupportTicketByAdmin(adminId: Types.ObjectId, input: SupportTicketUpdate): Promise<SupportTicket> {
		const { _id, ...update } = input;
		const set: T = { ...update };
		if (update.ticketReply) {
			set.repliedAt = new Date();
			if (!update.ticketStatus) set.ticketStatus = SupportStatus.RESOLVED;
		}

		const result = await this.supportTicketModel.findByIdAndUpdate(_id, set, { new: true }).exec();
		if (!result) throw new InternalServerErrorException(Messages.NO_DATA_FOUND);

		if (update.ticketReply) {
			await this.notificationService.createNotification({
				receiverId: result.memberId,
				authorId: adminId,
				notificationType: NotificationType.SYSTEM,
				notificationGroup: NotificationGroup.SYSTEM,
				notificationRefId: result._id,
				notificationTitle: 'Support replied to your request',
				notificationDesc: result.ticketSubject,
			});
		}
		return result;
	}

	private async findSupportTickets(input: SupportTicketsInquiry, baseMatch: T): Promise<SupportTickets> {
		const match: T = { ...baseMatch };
		const { search } = input;
		if (search?.ticketCategory) match.ticketCategory = search.ticketCategory;
		if (search?.ticketStatus) match.ticketStatus = search.ticketStatus;
		if (search?.text) {
			const regex = new RegExp(search.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
			match.$or = [{ ticketSubject: regex }, { ticketMessage: regex }, { ticketName: regex }, { ticketEmail: regex }];
		}

		const sort: T = { [input.sort ?? 'createdAt']: input.direction ?? Direction.DESC, _id: Direction.DESC };
		const result = await this.supportTicketModel
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
