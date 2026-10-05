import { Field, InputType } from '@nestjs/graphql';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { AgentType } from '../../enums/agent.enum';

@InputType()
export class AgentInput {
	memberId?: string;

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
