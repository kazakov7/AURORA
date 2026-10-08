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
		@InjectModel('ChatRead') private readonly chatReadModel: Model<any>,
		@InjectModel('Message') private readonly messageModel: Model<any>,
		@InjectModel('Member') private readonly memberModel: Model<any>,
	) { }

	public async getOrCreateDirectChat(memberOneId: Types.ObjectId, memberTwoId: Types.ObjectId): Promise<Chat> {
		await this.assertMemberCanChat(memberOneId);
		if (memberOneId.toString() === memberTwoId.toString()) {
			throw new BadRequestException(Messages.CANNOT_MESSAGE_YOURSELF);
		}

		const targetMember = await this.memberModel
			.findOne({ _id: memberTwoId, memberStatus: MemberStatus.ACTIVE, deletedAt: null })
			.exec();
		if (!targetMember) throw new InternalServerErrorException(Messages.MEMBER_NOT_FOUND);

		const [firstId, secondId] = [memberOneId.toString(), memberTwoId.toString()].sort();
		const directKey = `${firstId}:${secondId}`;

		let chat: any;
		try {
			chat = await this.chatModel
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

			chat = await this.chatModel.findOne({ chatType: ChatType.DIRECT, directKey }).exec();
			if (!chat) throw new BadRequestException(Messages.CREATE_FAILED);
		}
		return await this.withMemberData(chat);
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
		await this.assertMemberCanChat(memberId);
		await this.getGlobalChat();
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
		const epoch = new Date(0);
		const result = await this.chatModel
			.aggregate([
				{ $match: match },
				{
					$lookup: {
						from: 'chat_reads',
						let: { chatId: '$_id' },
						pipeline: [
							{
								$match: {
									$expr: {
										$and: [
											{ $eq: ['$chatId', '$$chatId'] },
											{ $eq: ['$memberId', memberId] },
										],
									},
								},
							},
							{ $project: { clearedAt: 1 } },
						],
						as: 'currentMemberChatState',
					},
				},
				{ $set: { currentMemberChatState: { $arrayElemAt: ['$currentMemberChatState', 0] } } },
				{
					$match: {
						$expr: {
							$or: [
								{ $eq: ['$chatType', ChatType.GLOBAL] },
								{ $eq: [{ $ifNull: ['$currentMemberChatState.clearedAt', null] }, null] },
								{ $gt: [{ $ifNull: ['$lastMessageAt', epoch] }, '$currentMemberChatState.clearedAt'] },
							],
						},
					},
				},
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

		const chats = result[0] ?? { list: [], metaCounter: [] };
		const chatIds = chats.list.map((chat: Chat) => chat._id);
		if (!chatIds.length) return chats;

		const unreadRows = await this.messageModel
			.aggregate([
				{ $match: { chatId: { $in: chatIds }, senderId: { $ne: memberId } } },
				{
					$lookup: {
						from: 'chat_reads',
						let: { chatId: '$chatId' },
						pipeline: [
							{
								$match: {
									$expr: {
										$and: [
											{ $eq: ['$chatId', '$$chatId'] },
											{ $eq: ['$memberId', memberId] },
										],
									},
								},
							},
						],
						as: 'readState',
					},
				},
				{ $addFields: { readState: { $arrayElemAt: ['$readState', 0] } } },
				{
					$match: {
					$expr: {
						$and: [
							{ $gt: ['$createdAt', { $ifNull: ['$readState.lastReadAt', epoch] }] },
							{ $gt: ['$createdAt', { $ifNull: ['$readState.clearedAt', epoch] }] },
						],
					},
					},
				},
				{ $group: { _id: '$chatId', unreadCount: { $sum: 1 } } },
			])
			.exec();
		const unreadMap = new Map(unreadRows.map((row: T) => [row._id.toString(), row.unreadCount]));
		chats.list = chats.list.map((chat: Chat) => ({
			...chat,
			unreadCount: unreadMap.get(chat._id.toString()) ?? 0,
		}));

		return chats;
	}

	public async assertChatAccess(memberId: Types.ObjectId, chatId: Types.ObjectId): Promise<Chat> {
		await this.assertMemberCanChat(memberId);
		const chat = await this.assertChatExists(chatId);
		if (chat.chatType === ChatType.GLOBAL) return chat;

		const isParticipant = [chat.memberOneId, chat.memberTwoId]
			.filter(Boolean)
			.some((participantId) => participantId!.toString() === memberId.toString());
		if (!isParticipant) throw new InternalServerErrorException(Messages.MESSAGE_NOT_ALLOWED);

		return chat;
	}

	public async deleteMyChat(memberId: Types.ObjectId, chatId: Types.ObjectId): Promise<boolean> {
		await this.assertMemberCanChat(memberId);
		const chat = await this.assertChatExists(chatId);
		if (chat.chatType !== ChatType.DIRECT) throw new BadRequestException(Messages.BAD_REQUEST);

		const isParticipant = [chat.memberOneId, chat.memberTwoId]
			.filter(Boolean)
			.some((participantId) => participantId!.toString() === memberId.toString());
		if (!isParticipant) throw new InternalServerErrorException(Messages.MESSAGE_NOT_ALLOWED);

		let currentState: any = await this.chatReadModel.findOne({ chatId, memberId }).lean().exec();
		const alreadyClearedAt = currentState?.clearedAt ? new Date(currentState.clearedAt) : undefined;
		const hasNewMessage = Boolean(
			chat.lastMessageAt && (!alreadyClearedAt || chat.lastMessageAt.getTime() > alreadyClearedAt.getTime()),
		);
		if (alreadyClearedAt && !hasNewMessage) return true;

		const clearedAt = new Date();
		if (!currentState) {
			try {
				await this.chatReadModel.create({ chatId, memberId, lastReadAt: clearedAt, clearedAt });
				return true;
			} catch (err: any) {
				if (err?.code !== 11000) throw new BadRequestException(Messages.UPDATE_FAILED);
				currentState = await this.chatReadModel.findOne({ chatId, memberId }).lean().exec();
				if (currentState?.clearedAt) return true;
			}
		}

		const clearStateFilter = currentState?.clearedAt
			? { clearedAt: currentState.clearedAt }
			: { clearedAt: { $exists: false } };
		const updateResult = await this.chatReadModel
			.updateOne(
				{ chatId, memberId, ...clearStateFilter },
				{ $set: { lastReadAt: clearedAt, clearedAt } },
			)
			.exec();
		if (!updateResult.matchedCount) {
			const latestState: any = await this.chatReadModel.findOne({ chatId, memberId }).lean().exec();
			if (latestState?.clearedAt) return true;
			await this.chatReadModel.updateOne({ chatId, memberId }, { $set: { lastReadAt: clearedAt, clearedAt } }).exec();
		}
		return true;
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

	public async markChatAsRead(memberId: Types.ObjectId, chatId: Types.ObjectId): Promise<Chat> {
		const chat = await this.assertChatAccess(memberId, chatId);
		await this.chatReadModel
			.findOneAndUpdate(
				{ chatId, memberId },
				{ $set: { lastReadAt: new Date() } },
				{ upsert: true, new: true, setDefaultsOnInsert: true },
			)
			.exec();
		return { ...(chat as any).toObject(), unreadCount: 0 } as Chat;
	}

	public async assertMemberCanChat(memberId: Types.ObjectId): Promise<void> {
		const member = await this.memberModel
			.findOne({ _id: memberId, memberStatus: MemberStatus.ACTIVE, deletedAt: null })
			.select('_id')
			.lean()
			.exec();
		if (!member) throw new BadRequestException(Messages.USER_BLOCKED_MESSAGE);
	}

	private async withMemberData(chat: any): Promise<Chat> {
		const result = typeof chat?.toObject === 'function' ? chat.toObject() : chat;
		if (!result || result.chatType !== ChatType.DIRECT) return result as Chat;

		const memberIds = [result.memberOneId, result.memberTwoId].filter(Boolean);
		const members = await this.memberModel.find({ _id: { $in: memberIds } }).lean().exec();
		const memberMap = new Map(members.map((member: any) => [member._id.toString(), member]));
		return {
			...result,
			memberOneData: memberMap.get(result.memberOneId.toString()),
			memberTwoData: memberMap.get(result.memberTwoId.toString()),
		} as Chat;
	}
}
