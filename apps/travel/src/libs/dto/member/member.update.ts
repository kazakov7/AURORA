import { Field, InputType } from '@nestjs/graphql';
import { IsEmail, IsOptional, IsString, IsNotEmpty, MaxLength } from 'class-validator';

@InputType()
export class MemberUpdate {
	@Field({ nullable: true })
	@IsOptional()
	_id?: string;

	@Field({ nullable: true })
	@IsOptional()
	memberNick?: string;

	@Field({ nullable: true })
	@IsOptional()
	@IsString()
	memberFullName?: string;

	@Field({ nullable: true })
	@IsOptional()
	@IsEmail()
	memberEmail?: string;

	@Field({ nullable: true })
	@IsOptional()
	@IsString()
	memberPhone?: string;

	@Field({ nullable: true })
	@IsOptional()
	@IsString()
	@MaxLength(500)
	memberDesc?: string;

	@Field({ nullable: true })
	@IsOptional()
	@IsString()
	memberImage?: string;

	@Field({ nullable: true })
	@IsOptional()
	@IsString()
	memberAddress?: string;
}
