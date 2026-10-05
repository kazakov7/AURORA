import { Field, InputType, Int, ObjectType } from '@nestjs/graphql';
import { MemberType, MemberStatus, MemberAuthType, AgentType } from '../../enums/member.enum';
import { IsEmail, IsNotEmpty, IsOptional, IsString, Length } from 'class-validator';

@InputType()
export class MemberInput {
	@IsNotEmpty()
	@Length(3, 12)
	@IsString()
	@Field(() => String, { nullable: true })
	memberNick: string;

	@Field({ nullable: true })
	@IsNotEmpty()
	@Length(4, 12)
	memberPassword: string;

	@Field({ nullable: true })
	@IsOptional()
	@IsEmail()
	memberEmail?: string;

	@Field({ nullable: true })
	@IsOptional()
	@IsString()
	memberPhone?: string;
}
@InputType()
export class LoginInput {
	@IsNotEmpty()
	@Length(3, 12)
	@Field(() => String)
	memberNick!: string;

	@IsNotEmpty()
	@Length(5, 12)
	@Field(() => String)
	memberPassword!: string;
}
