import { Field, InputType, Int } from '@nestjs/graphql';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { AgentType } from '../../enums/agent.enum';

@InputType()
export class RankingInquiry {
	@Field(() => String, { nullable: true })
	@IsOptional()
	@IsString()
	destinationId?: string;

	@Field(() => Int, { nullable: true })
	@IsOptional()
	@IsInt()
	@Min(1)
	@Max(20)
	limit?: number;
}

@InputType()
export class TopAgentsInquiry {
	@Field(() => AgentType)
	@IsEnum(AgentType)
	agentType: AgentType;

	@Field(() => Int, { nullable: true })
	@IsOptional()
	@IsInt()
	@Min(1)
	@Max(20)
	limit?: number;
}
