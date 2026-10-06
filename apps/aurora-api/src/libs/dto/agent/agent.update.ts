import { Field, InputType } from '@nestjs/graphql';
import { IsMongoId, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

@InputType()
export class AgentUpdate {
	@Field({ nullable: true })
	@IsOptional()
	@IsString()
	companyName?: string;

	@Field({ nullable: true })
	@IsOptional()
	@IsString()
	companyAddress?: string;

	@Field({ nullable: true })
	@IsOptional()
	@IsString()
	@MaxLength(3000)
	companyDesc?: string;
}

@InputType()
export class RejectAgentApplicationInput {
	@Field(() => String)
	@IsMongoId()
	@IsNotEmpty()
	_id!: string;

	@Field()
	@IsString()
	@IsNotEmpty()
	@MaxLength(3000)
	rejectionReason!: string;
}
