import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { availableChatSorts } from '../../libs/config';
import { Chat, Chats } from '../../libs/dto/chat/chat';
import { ChatsInquiry } from '../../libs/dto/chat/chat.input';
import { ChatType } from '../../libs/enums/chat.enum';
import { Direction, Messages } from '../../libs/enums/common.enum';
import { MemberStatus } from '../../libs/enums/member.enum';
import { T } from '../../libs/types/common';

@Injectable()
export class ChatService {
	constructor(
		@InjectModel('Chat') private readonly chatModel: Model<any>,
		@InjectModel('Member') private readonly memberModel: Model<any>,
	) { }

	public async getOrCreateDirectChat(memberOneId: Types.ObjectId, memberTwoId: Types.ObjectId): Promise<Chat> {
		if (memberOneId.toString() === memberTwoId.toString()) {
			throw new BadRequestException(Messages.CANNOT_MESSAGE_YOURSELF);
		}

		const targetMember = await this.memberModel
			.findOne({ _id: memberTwoId, memberStatus: MemberStatus.ACTIVE, deletedAt: null })
			.exec();
		if (!targetMember) throw new InternalServerErrorException(Messages.MEMBER_NOT_FOUND);

		const [firstId, secondId] = [memberOneId.toString(), memberTwoId.toString()].sort();
		const directKey = `${firstId}:${secondId}`;

		try {
			return await this.chatModel
				.findOneAndUpdate(
					{ chatType: ChatType.DIRECT, directKey },
					{
						$setOnInsert: {
							chatType: ChatType.DIRECT,
							memberOneId: new Types.ObjectId(firstId),
							memberTwoId: new Types.ObjectId(secondId),
							directKey,
						},
					},
					{ new: true, upsert: true, setDefaultsOnInsert: true },
				)
				.exec();
		} catch (err: any) {
			if (err?.code !== 11000) throw new BadRequestException(Messages.CREATE_FAILED);

			const chat = await this.chatModel.findOne({ chatType: ChatType.DIRECT, directKey }).exec();
			if (!chat) throw new BadRequestException(Messages.CREATE_FAILED);
			return chat;
		}
	}

	public async getGlobalChat(): Promise<Chat> {
		try {
			return await this.chatModel
				.findOneAndUpdate(
					{ chatType: ChatType.GLOBAL },
					{ $setOnInsert: { chatType: ChatType.GLOBAL } },
					{ new: true, upsert: true, setDefaultsOnInsert: true },
				)
				.exec();
		} catch (err: any) {
			if (err?.code !== 11000) throw new BadRequestException(Messages.CREATE_FAILED);

			const chat = await this.chatModel.findOne({ chatType: ChatType.GLOBAL }).exec();
			if (!chat) throw new BadRequestException(Messages.CREATE_FAILED);
			return chat;
		}
	}

	public async getMyChats(memberId: Types.ObjectId, input: ChatsInquiry): Promise<Chats> {
		const { page, limit, search } = input;
		const match: T = {
			$or: [{ memberOneId: memberId }, { memberTwoId: memberId }, { chatType: ChatType.GLOBAL }],
		};

		if (search?.chatType) match.chatType = search.chatType;
		if (search?.memberId) {
			match.chatType = ChatType.DIRECT;
			match.$and = [{ $or: [{ memberOneId: memberId }, { memberTwoId: memberId }] }, { $or: [{ memberOneId: search.memberId }, { memberTwoId: search.memberId }] }];
		}
		if (search?.text) match.lastMessage = { $regex: search.text, $options: 'i' };

		const sort = input.sort && availableChatSorts.includes(input.sort) ? input.sort : 'lastMessageAt';
		const direction = input.direction ?? Direction.DESC;
		const result = await this.chatModel
			.aggregate([
				{ $match: match },
				{ $sort: { [sort]: direction, _id: direction } },
				{
					$facet: {
						list: [
							{ $skip: (page - 1) * limit },
							{ $limit: limit },
							{
								$lookup: {
									from: 'members',
									localField: 'memberOneId',
									foreignField: '_id',
									as: 'memberOneData',
								},
							},
							{ $unwind: { path: '$memberOneData', preserveNullAndEmptyArrays: true } },
							{
								$lookup: {
									from: 'members',
									localField: 'memberTwoId',
									foreignField: '_id',
									as: 'memberTwoData',
								},
							},
							{ $unwind: { path: '$memberTwoData', preserveNullAndEmptyArrays: true } },
						],
						metaCounter: [{ $count: 'total' }],
					},
				},
			])
			.exec();

		return result[0] ?? { list: [], metaCounter: [] };
	}

	public async assertChatAccess(memberId: Types.ObjectId, chatId: Types.ObjectId): Promise<Chat> {
		const chat = await this.assertChatExists(chatId);
		if (chat.chatType === ChatType.GLOBAL) return chat;

		const isParticipant = [chat.memberOneId, chat.memberTwoId]
			.filter(Boolean)
			.some((participantId) => participantId!.toString() === memberId.toString());
		if (!isParticipant) throw new InternalServerErrorException(Messages.MESSAGE_NOT_ALLOWED);

		return chat;
	}

	public async assertChatExists(chatId: Types.ObjectId): Promise<Chat> {
		const chat = await this.chatModel.findById(chatId).exec();
		if (!chat) throw new InternalServerErrorException(Messages.CONVERSATION_NOT_FOUND);
		return chat;
	}

	public async updateLastMessage(chatId: Types.ObjectId, lastMessage: string, lastMessageAt: Date): Promise<void> {
		await this.chatModel
			.updateOne(
				{ _id: chatId, $or: [{ lastMessageAt: { $exists: false } }, { lastMessageAt: { $lte: lastMessageAt } }] },
				{ $set: { lastMessage, lastMessageAt } },
			)
			.exec();
	}
}
