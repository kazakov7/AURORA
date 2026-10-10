import { Field, InputType, Int } from '@nestjs/graphql';
import { IsEmail, IsEnum, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Length, Matches, Max, Min, ValidateIf } from 'class-validator';
import { availableMemberSorts } from '../../config';
import { Direction } from '../../enums/common.enum';
import { MemberAuthType, MemberStatus, MemberType } from '../../enums/member.enum';

@InputType()
export class MemberInput {
	@IsNotEmpty()
	@Length(3, 12)
	@IsString()
	@Field(() => String, { nullable: true })
	memberNick: string;

	@Field({ nullable: true })
	@IsNotEmpty()
	@Length(5, 12)
	memberPassword: string;

	@Field({ nullable: true })
	@ValidateIf((_member, value) => typeof value === 'string' && value.trim().length > 0)
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

@InputType()
export class ChangePasswordInput {
	@IsNotEmpty()
	@IsString()
	@Length(5, 12)
	@Field(() => String)
	currentPassword!: string;

	@IsNotEmpty()
	@IsString()
	@Length(5, 12)
	@Field(() => String)
	newPassword!: string;

	@IsNotEmpty()
	@IsString()
	@Length(5, 12)
	@Field(() => String)
	confirmPassword!: string;
}

@InputType()
export class GoogleAuthInput {
	@IsNotEmpty()
	@IsString()
	@Field(() => String)
	credential!: string;
}

@InputType()
export class KakaoAuthInput {
	@IsNotEmpty()
	@IsString()
	@Field(() => String)
	code!: string;

	@IsNotEmpty()
	@IsString()
	@Field(() => String)
	redirectUri!: string;
}

@InputType()
export class TelegramAuthInput {
	@IsNotEmpty()
	@IsString()
	@Field(() => String)
	code!: string;

	@IsNotEmpty()
	@IsString()
	@Field(() => String)
	redirectUri!: string;

	@IsNotEmpty()
	@IsString()
	@Length(43, 128)
	@Matches(/^[A-Za-z0-9\-._~]+$/)
	@Field(() => String)
	codeVerifier!: string;
}

@InputType()
class MISearch {
	@IsOptional()
	@IsEnum(MemberStatus)
	@Field(() => MemberStatus, { nullable: true })
	memberStatus?: MemberStatus;

	@IsOptional()
	@IsEnum(MemberType)
	@Field(() => MemberType, { nullable: true })
	memberType?: MemberType;

	@IsOptional()
	@IsEnum(MemberAuthType)
	@Field(() => MemberAuthType, { nullable: true })
	memberAuthType?: MemberAuthType;

	@IsOptional()
	@IsString()
	@Field(() => String, { nullable: true })
	text?: string;
}

@InputType()
export class MembersInquiry {
	@IsNotEmpty()
	@IsInt()
	@Min(1)
	@Field(() => Int)
	page!: number;

	@IsNotEmpty()
	@IsInt()
	@Min(1)
	@Max(100)
	@Field(() => Int)
	limit!: number;

	@IsOptional()
	@IsIn(availableMemberSorts)
	@Field(() => String, { nullable: true })
	sort?: string;

	@IsOptional()
	@Field(() => Direction, { nullable: true })
	direction?: Direction;

	@IsOptional()
	@Field(() => MISearch, { nullable: true })
	search?: MISearch;
}
