import { Field, InputType } from '@nestjs/graphql';
import { IsOptional, IsString, MaxLength } from 'class-validator';

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
