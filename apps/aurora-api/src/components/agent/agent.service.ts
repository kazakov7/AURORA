import {
	BadRequestException,
	ForbiddenException,
	Injectable,
	InternalServerErrorException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { Agents, Agent } from '../../libs/dto/agent/agent';
import { AgentApplicationsInquiry, AgentInput } from '../../libs/dto/agent/agent.input';
import { RejectAgentApplicationInput, RevokeAgentInput } from '../../libs/dto/agent/agent.update';
import { Direction, Messages } from '../../libs/enums/common.enum';
import { AgentType, AgentVerificationStatus } from '../../libs/enums/agent.enum';
import { MemberStatus, MemberType } from '../../libs/enums/member.enum';
import { T } from '../../libs/types/common';
import { lookupMember, shapeIntoBusinessKey, shapeIntoMongoObjectId } from '../../libs/config';
import { NotificationService } from '../notification/notification.service';
import { MemberService } from '../member/member.service';
import { NotificationGroup, NotificationType } from '../../libs/enums/notification.enum';

@Injectable()
export class AgentService {
	constructor(
		@InjectModel('Agent') private readonly agentModel: Model<any>,
		@InjectModel('Member') private readonly memberModel: Model<any>,
		@InjectConnection() private readonly connection: Connection,
		private readonly notificationService: NotificationService,
		private readonly memberService: MemberService,
	) {}

	public async submitAgentApplication(memberId: Types.ObjectId, input: AgentInput): Promise<Agent> {
		const member = await this.memberModel
			.findOne({ _id: memberId, memberType: MemberType.USER, memberStatus: MemberStatus.ACTIVE })
			.exec();
		if (!member) throw new ForbiddenException(Messages.AGENT_NOT_ALLOWED);

		const existingActiveApplication = await this.agentModel
			.exists({
				memberId,
				verificationStatus: {
					$in: [AgentVerificationStatus.PENDING, AgentVerificationStatus.APPROVED],
				},
			})
			.exec();
		if (existingActiveApplication) throw new BadRequestException(Messages.AGENT_APPLICATION_EXISTS);

		const businessNumberKey = shapeIntoBusinessKey(input.businessNumber);
		const businessTaken = await this.agentModel
			.exists({
				businessNumberKey,
				verificationStatus: {
					$in: [AgentVerificationStatus.PENDING, AgentVerificationStatus.APPROVED],
				},
			})
			.exec();
		if (businessTaken) throw new BadRequestException(Messages.AGENT_BUSINESS_EXISTS);

		let result: Agent;
		try {
			result = await this.agentModel.create({ ...input, businessNumberKey, memberId });
		} catch (error) {
			// Two submissions at once meet the unique indexes: tell which rule they broke
			const { code, keyPattern } = error as { code?: number; keyPattern?: T };
			if (code === 11000 && keyPattern?.businessNumberKey) {
				throw new BadRequestException(Messages.AGENT_BUSINESS_EXISTS);
			}
			if (code === 11000) throw new BadRequestException(Messages.AGENT_APPLICATION_EXISTS);
			throw new BadRequestException(Messages.CREATE_FAILED);
		}

		// The application is saved; a failed admin notification must not report it as failed
		await this.notificationService
			.notifyActiveAdmins({
				authorId: memberId,
				notificationType: NotificationType.SYSTEM,
				notificationGroup: NotificationGroup.SYSTEM,
				notificationRefId: result._id as unknown as Types.ObjectId,
				notificationTitle: 'New agent application',
				notificationDesc: 'A member submitted an agent verification application.',
				notificationEventKey: `agent-application:${result._id}`,
			})
			.catch((error) => console.error('Agent application notification failed:', error));
		return result;
	}

	public async getMemberAgent(memberId: string): Promise<Agent> {
		const result = await this.agentModel
			.findOne({
				memberId: shapeIntoMongoObjectId(memberId),
				verificationStatus: AgentVerificationStatus.APPROVED,
			})
			.exec();

		return result as unknown as Agent;
	}

	public async getMyAgentApplications(
		memberId: Types.ObjectId,
		input: AgentApplicationsInquiry,
	): Promise<Agents> {
		return this.getAgentList({ memberId }, input);
	}

	public async getAgentApplications(input: AgentApplicationsInquiry): Promise<Agents> {
		const match: T = {};
		if (input.search?.agentType) match.agentType = input.search.agentType;
		if (input.search?.verificationStatus)
			match.verificationStatus = input.search.verificationStatus;
		return this.getAgentList(match, input);
	}

	public async approveAgentApplication(
		agentId: Types.ObjectId,
		adminId?: Types.ObjectId,
	): Promise<Agent> {
		const session = await this.connection.startSession();
		try {
			let agent: Agent | null = null;
			await session.withTransaction(async () => {
				const result = await this.agentModel
					.findOneAndUpdate(
						{ _id: agentId, verificationStatus: AgentVerificationStatus.PENDING },
						{
							verificationStatus: AgentVerificationStatus.APPROVED,
							verifiedAt: new Date(),
							rejectionReason: null,
						},
						{ new: true, session },
					)
					.exec();
				if (!result) throw new BadRequestException(Messages.AGENT_APPLICATION_NOT_FOUND);

				const member = await this.memberModel
					.findOneAndUpdate(
						{
							_id: result.memberId,
							memberType: MemberType.USER,
							memberStatus: MemberStatus.ACTIVE,
						},
						{ memberType: MemberType.AGENT },
						{ new: true, session },
					)
					.exec();
				if (!member) throw new BadRequestException(Messages.AGENT_NOT_ALLOWED);
				agent = result as unknown as Agent;
			});

			if (!agent) throw new InternalServerErrorException(Messages.UPDATE_FAILED);
			const approvedAgent = agent as unknown as Agent;
			await this.notificationService.createNotification({
				receiverId: approvedAgent.memberId as unknown as Types.ObjectId,
				authorId: adminId,
				notificationType: NotificationType.SYSTEM,
				notificationGroup: NotificationGroup.SYSTEM,
				notificationRefId: approvedAgent._id as unknown as Types.ObjectId,
				notificationTitle: 'Agent application approved',
				notificationDesc: 'Your agent application has been approved.',
				notificationEventKey: `agent-approved:${approvedAgent._id}`,
			});
			return agent;
		} catch (error) {
			if ((error as { code?: number }).code === 11000) {
				throw new BadRequestException(Messages.AGENT_APPLICATION_EXISTS);
			}
			throw error;
		} finally {
			await session.endSession();
		}
	}

	public async rejectAgentApplication(
		input: RejectAgentApplicationInput,
		adminId?: Types.ObjectId,
	): Promise<Agent> {
		const result = await this.agentModel
			.findOneAndUpdate(
				{ _id: input._id, verificationStatus: AgentVerificationStatus.PENDING },
				{
					verificationStatus: AgentVerificationStatus.REJECTED,
					rejectionReason: input.rejectionReason,
				},
				{ new: true },
			)
			.exec();

		if (!result) throw new BadRequestException(Messages.AGENT_APPLICATION_NOT_FOUND);
		await this.notificationService.createNotification({
			receiverId: result.memberId as Types.ObjectId,
			authorId: adminId,
			notificationType: NotificationType.SYSTEM,
			notificationGroup: NotificationGroup.SYSTEM,
			notificationRefId: result._id as Types.ObjectId,
			notificationTitle: 'Agent application update',
			notificationDesc: 'Your agent application was not approved.',
			notificationEventKey: `agent-rejected:${result._id}`,
		});
		return result as unknown as Agent;
	}

	public async revokeAgentByAdmin(
		input: RevokeAgentInput,
		adminId?: Types.ObjectId,
	): Promise<Agent> {
		const targetAgent = await this.agentModel
			.findOne({ _id: input._id, verificationStatus: AgentVerificationStatus.APPROVED })
			.lean<Agent>()
			.exec();
		if (!targetAgent) throw new BadRequestException(Messages.AGENT_NOT_FOUND);

		const memberId = targetAgent.memberId as unknown as Types.ObjectId;
		await this.memberService.revokeAgentRole(memberId, input.revokeReason);
		await this.notificationService.createNotification({
			receiverId: memberId,
			authorId: adminId,
			notificationType: NotificationType.SYSTEM,
			notificationGroup: NotificationGroup.SYSTEM,
			notificationRefId: targetAgent._id as unknown as Types.ObjectId,
			notificationTitle: 'Agent status revoked',
			notificationDesc: 'Your agent status has been revoked.',
			notificationEventKey: `agent-revoked:${targetAgent._id}`,
		});

		const result = await this.agentModel.findById(input._id).exec();
		if (!result) throw new InternalServerErrorException(Messages.UPDATE_FAILED);
		return result as unknown as Agent;
	}

	public async assertApprovedAgent(memberId: Types.ObjectId, agentType: AgentType): Promise<void> {
		const agent = await this.agentModel
			.exists({ memberId, agentType, verificationStatus: AgentVerificationStatus.APPROVED })
			.exec();
		if (!agent) throw new ForbiddenException(Messages.AGENT_NOT_VERIFIED);
	}

	private async getAgentList(match: T, input: AgentApplicationsInquiry): Promise<Agents> {
		const sortField = input.sort ?? 'createdAt';
		const sortDirection = input.direction ?? Direction.DESC;
		const sort: T = {
			[sortField]: sortDirection,
			...(sortField === '_id' ? {} : { _id: sortDirection }),
		};
		const result = await this.agentModel
			.aggregate([
				{ $match: match },
				{ $sort: sort },
				{
					$facet: {
						list: [
							{ $skip: (input.page - 1) * input.limit },
							{ $limit: input.limit },
							lookupMember,
							{ $unwind: { path: '$memberData', preserveNullAndEmptyArrays: true } },
						],
						metaCounter: [{ $count: 'total' }],
					},
				},
			])
			.exec();
		return result[0] as Agents;
	}
}
