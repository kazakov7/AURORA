import {
	BadRequestException,
	ForbiddenException,
	Injectable,
	InternalServerErrorException,
	NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Message, Messages } from '../../libs/dto/message/message';
import { MessageInput, MessagesCursorInquiry } from '../../libs/dto/message/message.input';
import { ChatType } from '../../libs/enums/chat.enum';
import { Messages as ErrorMessages } from '../../libs/enums/common.enum';
import { MessageType } from '../../libs/enums/message.enum';
import { T } from '../../libs/types/common';
import { shapeIntoMongoObjectId } from '../../libs/config';

@Injectable()
export class MessageService {
	constructor(
		@InjectModel('Message') private readonly messageModel: Model<any>,
		@InjectModel('Chat') private readonly chatModel: Model<any>,
		@InjectModel('ChatRead') private readonly chatReadModel: Model<any>,
		@InjectModel('Member') private readonly memberModel: Model<any>,
	) {}

	public async createMessage(memberId: Types.ObjectId, input: MessageInput): Promise<Message> {
		await this.assertMemberCanMessage(memberId);
		const chatId: Types.ObjectId = shapeIntoMongoObjectId(input?.chatId);
		const chat = await this.assertChatAccess(memberId, chatId);
		const messageContent = input.messageContent?.trim();
		if (!messageContent || messageContent.length > 1000)
			throw new BadRequestException(ErrorMessages.BAD_REQUEST);

		const messageType = input.messageType ?? MessageType.TEXT;
		if (!Object.values(MessageType).includes(messageType))
			throw new BadRequestException(ErrorMessages.BAD_REQUEST);

		const clientMessageId = input.clientMessageId?.trim();
		if (clientMessageId && clientMessageId.length > 100)
			throw new BadRequestException(ErrorMessages.BAD_REQUEST);

		if (clientMessageId) {
			const existingMessage = await this.messageModel
				.findOne({ chatId, senderId: memberId, clientMessageId })
				.exec();
			if (existingMessage) return await this.withSenderData(existingMessage);
		}

		try {
			const message = await this.messageModel.create({
				chatId,
				senderId: memberId,
				messageType,
				messageContent,
				...(clientMessageId ? { clientMessageId } : {}),
			});

			await this.chatModel
				.updateOne(
					{
						_id: chat._id,
						$or: [
							{ lastMessageAt: { $exists: false } },
							{ lastMessageAt: { $lte: message.createdAt } },
						],
					},
					{ $set: { lastMessage: messageContent, lastMessageAt: message.createdAt } },
				)
				.exec();
			return await this.withSenderData(message);
		} catch (err: any) {
			if (err?.code !== 11000 || !clientMessageId)
				throw new BadRequestException(ErrorMessages.CREATE_FAILED);

			const existingMessage = await this.messageModel
				.findOne({ chatId, senderId: memberId, clientMessageId })
				.exec();
			if (!existingMessage) throw new BadRequestException(ErrorMessages.CREATE_FAILED);
			return await this.withSenderData(existingMessage);
		}
	}

	public async getMessages(
		memberId: Types.ObjectId,
		input: MessagesCursorInquiry,
	): Promise<Messages> {
		await this.assertMemberCanMessage(memberId);
		const chatId: Types.ObjectId = shapeIntoMongoObjectId(input?.chatId);
		await this.assertChatAccess(memberId, chatId);

		const chatReadState: any = await this.chatReadModel.findOne({ chatId, memberId }).lean().exec();
		const createdAt: T = {};
		if (input.before && !input.beforeId) createdAt.$lt = input.before;
		if (chatReadState?.clearedAt) createdAt.$gt = chatReadState.clearedAt;

		const match: T = { chatId };
		if (Object.keys(createdAt).length) match.createdAt = createdAt;
		if (input.before && input.beforeId) {
			match.$or = [
				{ createdAt: { $lt: input.before } },
				{ createdAt: input.before, _id: { $lt: shapeIntoMongoObjectId(input.beforeId) } },
			];
		}

		const messages = await this.messageModel
			.find(match)
			.sort({ createdAt: -1, _id: -1 })
			.limit(input.limit)
			.lean()
			.exec();
		// reverse() turns the page oldest-first in place; the cursor is the oldest message, where the next page ends
		const list = messages.reverse();
		const oldest = messages.length === input.limit ? list[0] : undefined;
		const senderIds = [...new Set(list.map((message) => message.senderId.toString()))].map(
			(member) => new Types.ObjectId(member),
		);
		const members = await this.memberModel
			.find({ _id: { $in: senderIds } })
			.lean()
			.exec();
		const memberMap = new Map(members.map((member: any) => [member._id.toString(), member]));

		return {
			list: list.map((message) => ({
				...message,
				senderData: memberMap.get(message.senderId.toString()),
			})) as unknown as Message[],
			metaCounter: [],
			nextCursor: oldest?.createdAt,
			nextCursorId: oldest && String(oldest._id),
		};
	}

	public async getChatRecipients(chatId: Types.ObjectId): Promise<Types.ObjectId[]> {
		const chat = await this.chatModel.findById(chatId).exec();
		if (!chat) throw new InternalServerErrorException(ErrorMessages.CONVERSATION_NOT_FOUND);
		if (chat.chatType === ChatType.GLOBAL) return [];

		return [chat.memberOneId, chat.memberTwoId].filter(Boolean) as Types.ObjectId[];
	}

	private async withSenderData(message: T): Promise<Message> {
		const senderData = await this.memberModel
			.findById(message.senderId)
			.select('-memberEmail -memberPhone -googleSubject -kakaoSubject -telegramSubject')
			.lean()
			.exec();
		return { ...message.toObject(), senderData } as Message;
	}

	private async assertChatAccess(memberId: Types.ObjectId, chatId: Types.ObjectId): Promise<T> {
		const chat = await this.chatModel.findById(chatId).exec();

		if (!chat) {
			throw new NotFoundException(ErrorMessages.CONVERSATION_NOT_FOUND);
		}

		if (chat.chatType === ChatType.GLOBAL) {
			return chat;
		}

		const isParticipant = chat.memberOneId?.equals(memberId) || chat.memberTwoId?.equals(memberId);

		if (!isParticipant) {
			throw new ForbiddenException(ErrorMessages.MESSAGE_NOT_ALLOWED);
		}

		return chat;
	}

	private async assertMemberCanMessage(memberId: Types.ObjectId): Promise<void> {
		const member = await this.memberModel
			.findOne({ _id: memberId, memberStatus: 'ACTIVE', deletedAt: null })
			.select('_id')
			.lean()
			.exec();
		if (!member) throw new BadRequestException(ErrorMessages.USER_BLOCKED_MESSAGE);
	}
}
