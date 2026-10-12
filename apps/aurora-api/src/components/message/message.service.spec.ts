import { Types } from 'mongoose';
import { MessageService } from './message.service';
import { ChatType } from '../../libs/enums/chat.enum';

const chain = (value: any) => ({
	select: jest.fn().mockReturnThis(),
	sort: jest.fn().mockReturnThis(),
	limit: jest.fn().mockReturnThis(),
	lean: jest.fn().mockReturnThis(),
	exec: jest.fn().mockResolvedValue(value),
});

describe('MessageService.getMessages', () => {
	it('excludes messages at or before the authenticated member clear timestamp', async () => {
		const memberId = new Types.ObjectId();
		const peerId = new Types.ObjectId();
		const chatId = new Types.ObjectId();
		const clearedAt = new Date('2026-01-02T00:00:00.000Z');
		const messageModel = { find: jest.fn(() => chain([])) };
		const chatModel = {
			findById: jest.fn(() =>
				chain({
					_id: chatId,
					chatType: ChatType.DIRECT,
					memberOneId: memberId,
					memberTwoId: peerId,
				}),
			),
		};
		const chatReadModel = { findOne: jest.fn(() => chain({ clearedAt })) };
		const memberModel = {
			findOne: jest.fn(() => chain({ _id: memberId })),
			find: jest.fn(() => chain([])),
		};
		const service = new MessageService(
			messageModel as any,
			chatModel as any,
			chatReadModel as any,
			memberModel as any,
		);

		await service.getMessages(memberId, {
			chatId,
			limit: 20,
			before: new Date('2026-01-03T00:00:00.000Z'),
		});

		expect(messageModel.find).toHaveBeenCalledWith({
			chatId,
			createdAt: { $gt: clearedAt, $lt: new Date('2026-01-03T00:00:00.000Z') },
		});
	});
});
