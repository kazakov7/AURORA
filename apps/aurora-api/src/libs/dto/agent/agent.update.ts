import { Field, InputType } from '@nestjs/graphql';
import { Transform } from 'class-transformer';
import { IsMongoId, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { trimString } from '../../config';

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
	@Transform(trimString)
	@IsString()
	@IsNotEmpty()
	@MaxLength(3000)
	rejectionReason!: string;
}

@InputType()
export class RevokeAgentInput {
	@Field(() => String)
	@IsMongoId()
	@IsNotEmpty()
	_id!: string;

	@Field()
	@Transform(trimString)
	@IsString()
	@IsNotEmpty()
	@MaxLength(3000)
	revokeReason!: string;
}
