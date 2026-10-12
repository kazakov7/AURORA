import { Field, InputType, Int } from '@nestjs/graphql';
import { Transform } from 'class-transformer';
import {
	IsEnum,
	IsIn,
	IsInt,
	IsNotEmpty,
	IsOptional,
	IsString,
	Matches,
	Max,
	MaxLength,
	Min,
} from 'class-validator';
import { availableAgentSorts, trimString } from '../../config';
import { Direction } from '../../enums/common.enum';
import { AgentType, AgentVerificationStatus } from '../../enums/agent.enum';

@InputType()
export class AgentInput {
	@Field(() => AgentType)
	@IsEnum(AgentType)
	agentType: AgentType;

	@Field(() => String)
	@Transform(trimString)
	@IsString()
	@IsNotEmpty()
	@MaxLength(200)
	companyName: string;

	// Needs at least one letter or digit, since separators are not part of the business key
	@Field(() => String)
	@Transform(trimString)
	@IsString()
	@MaxLength(50)
	@Matches(/[\p{L}\p{N}]/u)
	businessNumber: string;

	@Field(() => String)
	@Transform(trimString)
	@IsString()
	@IsNotEmpty()
	@MaxLength(300)
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
