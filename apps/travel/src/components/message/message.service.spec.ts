import { Types } from 'mongoose';
import { MessageService } from './message.service';
import { ChatType } from '../../libs/enums/chat.enum';

describe('MessageService', () => {
	it('returns an existing message for the same client retry key', async () => {
		const memberId = new Types.ObjectId();
		const chatId = new Types.ObjectId();
		const existingMessage = {
			_id: new Types.ObjectId(),
			chatId,
			senderId: memberId,
			messageContent: 'Hello',
			toObject: jest.fn().mockReturnValue({ _id: new Types.ObjectId(), chatId, senderId: memberId, messageContent: 'Hello' }),
		};
		const messageModel = {
			findOne: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(existingMessage) }),
		};
		const chatModel = {
			findById: jest.fn().mockReturnValue({
				exec: jest.fn().mockResolvedValue({ chatType: ChatType.DIRECT, memberOneId: memberId, memberTwoId: new Types.ObjectId() }),
			}),
		};
		const memberModel = {
			findById: jest.fn().mockReturnValue({ lean: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({ _id: memberId }) }) }),
		};
		const service = new MessageService(messageModel as any, chatModel as any, memberModel as any);

		const result = await service.createMessage(memberId, {
			chatId: chatId as any,
			messageContent: 'Hello',
			clientMessageId: 'retry-key',
		});

		expect(result.messageContent).toBe('Hello');
		expect(messageModel.findOne).toHaveBeenCalledWith(expect.objectContaining({ clientMessageId: 'retry-key' }));
	});
});
