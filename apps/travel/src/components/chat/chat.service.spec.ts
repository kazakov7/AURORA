import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import { ChatService } from './chat.service';
import { ChatType } from '../../libs/enums/chat.enum';

describe('ChatService', () => {
	const memberOneId = new Types.ObjectId('000000000000000000000001');
	const memberTwoId = new Types.ObjectId('000000000000000000000002');
	let chatModel: any;
	let memberModel: any;
	let service: ChatService;

	beforeEach(() => {
		chatModel = {
			findOneAndUpdate: jest.fn(),
		};
		memberModel = {
			findOne: jest.fn(),
		};
		service = new ChatService(chatModel as any, memberModel as any);
	});

	it('rejects a direct chat with yourself', async () => {
		await expect(service.getOrCreateDirectChat(memberOneId, memberOneId)).rejects.toBeInstanceOf(BadRequestException);
	});

	it('uses a stable sorted direct key for a direct chat', async () => {
		memberModel.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue({ _id: memberTwoId }) });
		chatModel.findOneAndUpdate.mockReturnValue({
			exec: jest.fn().mockResolvedValue({ _id: new Types.ObjectId(), chatType: ChatType.DIRECT }),
		});

		await service.getOrCreateDirectChat(memberTwoId, memberOneId);

		expect(chatModel.findOneAndUpdate).toHaveBeenCalledWith(
			{
				chatType: ChatType.DIRECT,
				directKey: `${memberOneId.toString()}:${memberTwoId.toString()}`,
			},
			expect.objectContaining({
				$setOnInsert: expect.objectContaining({
					memberOneId,
					memberTwoId,
				}),
			}),
			expect.objectContaining({ upsert: true }),
		);
	});
});
