import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Types } from 'mongoose';
import { shapeIntoMongoObjectId } from '../../libs/config';
import { Agents, Agent } from '../../libs/dto/agent/agent';
import { AgentApplicationsInquiry, AgentInput } from '../../libs/dto/agent/agent.input';
import { RejectAgentApplicationInput } from '../../libs/dto/agent/agent.update';
import { MemberType } from '../../libs/enums/member.enum';
import { AuthMember } from '../auth/decorators/authMember.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AgentService } from './agent.service';

@Resolver()
export class AgentResolver {
	constructor(private readonly agentService: AgentService) {}

	@UseGuards(AuthGuard)
	@Mutation(() => Agent)
	public async submitAgentApplication(
		@Args('input') input: AgentInput,
		@AuthMember('_id') memberId: Types.ObjectId,
	): Promise<Agent> {
		return this.agentService.submitAgentApplication(memberId, input);
	}

	@UseGuards(AuthGuard)
	@Query(() => Agents)
	public async getMyAgentApplications(
		@Args('input') input: AgentApplicationsInquiry,
		@AuthMember('_id') memberId: Types.ObjectId,
	): Promise<Agents> {
		return this.agentService.getMyAgentApplications(memberId, input);
	}

	@Roles(MemberType.ADMIN)
	@UseGuards(RolesGuard)
	@Query(() => Agents)
	public async getAgentApplications(@Args('input') input: AgentApplicationsInquiry): Promise<Agents> {
		return this.agentService.getAgentApplications(input);
	}

	@Roles(MemberType.ADMIN)
	@UseGuards(RolesGuard)
	@Mutation(() => Agent)
	public async approveAgentApplication(@Args('agentId') agentId: string): Promise<Agent> {
		return this.agentService.approveAgentApplication(shapeIntoMongoObjectId(agentId));
	}

	@Roles(MemberType.ADMIN)
	@UseGuards(RolesGuard)
	@Mutation(() => Agent)
	public async rejectAgentApplication(@Args('input') input: RejectAgentApplicationInput): Promise<Agent> {
		input._id = shapeIntoMongoObjectId(input._id) as unknown as string;
		return this.agentService.rejectAgentApplication(input);
	}
}
