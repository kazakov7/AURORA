import { BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { Types } from 'mongoose';
import { ChatService } from './chat.service';
import { ChatType } from '../../libs/enums/chat.enum';

const chain = (value: any) => ({
	select: jest.fn().mockReturnThis(),
	lean: jest.fn().mockReturnThis(),
	exec: jest.fn().mockResolvedValue(value),
});

describe('ChatService.deleteMyChat', () => {
	const memberId = new Types.ObjectId();
	const peerId = new Types.ObjectId();
	const chatId = new Types.ObjectId();
	let chatModel: any;
	let chatReadModel: any;
	let memberModel: any;
	let service: ChatService;

	beforeEach(() => {
		chatModel = { findById: jest.fn() };
		chatReadModel = { findOne: jest.fn(), create: jest.fn(), updateOne: jest.fn() };
		memberModel = { findOne: jest.fn(() => chain({ _id: memberId })) };
		service = new ChatService(chatModel, chatReadModel, {} as any, memberModel);
	});

	it('clears a direct chat only for the authenticated participant without deleting shared documents', async () => {
		chatModel.findById.mockReturnValue(chain({ _id: chatId, chatType: ChatType.DIRECT, memberOneId: memberId, memberTwoId: peerId }));
		chatReadModel.findOne.mockReturnValue(chain(null));
		chatReadModel.create.mockResolvedValue({});

		await expect(service.deleteMyChat(memberId, chatId)).resolves.toBe(true);
		expect(chatReadModel.create).toHaveBeenCalledWith(expect.objectContaining({ chatId, memberId, clearedAt: expect.any(Date) }));
		expect(chatModel.deleteOne).toBeUndefined();
	});

	it('rejects attempts to delete the global conversation', async () => {
		chatModel.findById.mockReturnValue(chain({ _id: chatId, chatType: ChatType.GLOBAL }));

		await expect(service.deleteMyChat(memberId, chatId)).rejects.toBeInstanceOf(BadRequestException);
		expect(chatReadModel.create).not.toHaveBeenCalled();
	});

	it('rejects a non-participant', async () => {
		chatModel.findById.mockReturnValue(chain({ _id: chatId, chatType: ChatType.DIRECT, memberOneId: peerId, memberTwoId: new Types.ObjectId() }));

		await expect(service.deleteMyChat(memberId, chatId)).rejects.toBeInstanceOf(InternalServerErrorException);
	});

	it('is idempotent when the current participant has no newer message', async () => {
		const clearedAt = new Date('2026-01-02T00:00:00.000Z');
		chatModel.findById.mockReturnValue(chain({
			_id: chatId,
			chatType: ChatType.DIRECT,
			memberOneId: memberId,
			memberTwoId: peerId,
			lastMessageAt: new Date('2026-01-01T00:00:00.000Z'),
		}));
		chatReadModel.findOne.mockReturnValue(chain({ clearedAt }));

		await expect(service.deleteMyChat(memberId, chatId)).resolves.toBe(true);
		expect(chatReadModel.create).not.toHaveBeenCalled();
		expect(chatReadModel.updateOne).not.toHaveBeenCalled();
	});
});
