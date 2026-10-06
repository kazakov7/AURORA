jest.mock('@nestjs/mongoose', () => ({
	InjectConnection: () => () => undefined,
	InjectModel: () => () => undefined,
}));
jest.mock('../../libs/config', () => ({ lookupMember: { $lookup: {} } }));

import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Types } from 'mongoose';
import { AgentService } from './agent.service';
import { AgentType, AgentVerificationStatus } from '../../libs/enums/agent.enum';
import { MemberStatus, MemberType } from '../../libs/enums/member.enum';

describe('AgentService application flow', () => {
	it('creates a pending application only for an active user', async () => {
		const memberId = new Types.ObjectId();
		const memberModel = {
			findOne: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({ _id: memberId }) }),
		};
		const create = jest.fn().mockResolvedValue({ memberId, verificationStatus: AgentVerificationStatus.PENDING });
		const service = new AgentService({ create } as any, memberModel as any, {} as any);

		await service.submitAgentApplication(memberId, {
			agentType: AgentType.HOTEL,
			companyName: 'Aura Hotel',
			businessNumber: '123-45-67890',
			companyAddress: 'Seoul',
		});

		expect(memberModel.findOne).toHaveBeenCalledWith({
			_id: memberId,
			memberType: MemberType.USER,
			memberStatus: MemberStatus.ACTIVE,
		});
		expect(create).toHaveBeenCalledWith(expect.objectContaining({ memberId, agentType: AgentType.HOTEL }));
	});

	it('turns a duplicate active application into the existing application error', async () => {
		const memberId = new Types.ObjectId();
		const service = new AgentService(
			{ create: jest.fn().mockRejectedValue({ code: 11000 }) } as any,
			{ findOne: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({}) }) } as any,
			{} as any,
		);

		await expect(
			service.submitAgentApplication(memberId, {
				agentType: AgentType.TOUR,
				companyName: 'Aura Tour',
				businessNumber: '123-45-67890',
				companyAddress: 'Seoul',
			}),
		).rejects.toBeInstanceOf(BadRequestException);
	});

	it('requires the approved agent type for protected listing actions', async () => {
		const service = new AgentService(
			{ exists: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(null) }) } as any,
			{} as any,
			{} as any,
		);

		await expect(service.assertApprovedAgent(new Types.ObjectId(), AgentType.HOTEL)).rejects.toBeInstanceOf(ForbiddenException);
	});
});
