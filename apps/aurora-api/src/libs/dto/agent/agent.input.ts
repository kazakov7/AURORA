import { Field, InputType, Int } from '@nestjs/graphql';
import {
	IsEnum,
	IsIn,
	IsInt,
	IsNotEmpty,
	IsOptional,
	IsString,
	Max,
	MaxLength,
	Min,
} from 'class-validator';
import { availableAgentSorts } from '../../config';
import { Direction } from '../../enums/common.enum';
import { AgentType, AgentVerificationStatus } from '../../enums/agent.enum';

@InputType()
export class AgentInput {
	@Field(() => AgentType)
	@IsNotEmpty()
	agentType: AgentType;

	@Field(() => String)
	@IsString()
	@IsNotEmpty()
	companyName: string;

	@Field(() => String)
	@IsString()
	@IsNotEmpty()
	businessNumber: string;

	@Field(() => String)
	@IsString()
	@IsNotEmpty()
	companyAddress: string;

	@Field({ nullable: true })
	@IsOptional()
	@IsString()
	@MaxLength(3000)
	companyDesc?: string;
}

@InputType()
class AgentSearch {
	@Field(() => AgentType, { nullable: true })
	@IsOptional()
	@IsEnum(AgentType)
	agentType?: AgentType;

	@Field(() => AgentVerificationStatus, { nullable: true })
	@IsOptional()
	@IsEnum(AgentVerificationStatus)
	verificationStatus?: AgentVerificationStatus;
}

@InputType()
export class AgentApplicationsInquiry {
	@Field(() => Int)
	@IsInt()
	@Min(1)
	page!: number;

	@Field(() => Int)
	@IsInt()
	@Min(1)
	@Max(100)
	limit!: number;

	@Field(() => String, { nullable: true })
	@IsOptional()
	@IsIn(availableAgentSorts)
	sort?: string;

	@Field(() => Direction, { nullable: true })
	@IsOptional()
	direction?: Direction;

	@Field(() => AgentSearch, { nullable: true })
	@IsOptional()
	search?: AgentSearch;
}
