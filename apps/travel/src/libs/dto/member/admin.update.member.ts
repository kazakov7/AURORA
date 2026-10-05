import { InputType, Field } from '@nestjs/graphql';
import { IsOptional, IsString, IsNotEmpty, IsEmail, MaxLength } from 'class-validator';

@InputType()
export class AdminUpdateMemberInput {
	@IsNotEmpty()
	@Field(() => String)
	_id: string;

	@Field({ nullable: true })
	@IsOptional()
	@IsString()
	@IsNotEmpty()
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
