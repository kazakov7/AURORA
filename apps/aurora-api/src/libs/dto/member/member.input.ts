import { Field, InputType, Int } from '@nestjs/graphql';
import {
	IsEnum,
	IsIn,
	IsInt,
	IsNotEmpty,
	IsOptional,
	IsString,
	Length,
	Matches,
	Max,
	MaxLength,
	Min,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { availableMemberSorts, memberNickRegex, trimString } from '../../config';
import { Direction, Messages } from '../../enums/common.enum';
import { MemberAuthType, MemberStatus, MemberType } from '../../enums/member.enum';

@InputType()
export class MemberInput {
	@IsNotEmpty()
	@Length(3, 12)
	@Matches(memberNickRegex, { message: Messages.INVALID_NICKNAME })
	@IsString()
	@Transform(trimString)
	@Field(() => String)
	memberNick: string;

	@Field(() => String)
	@IsNotEmpty()
	@Length(5, 12)
	@Matches(/\S/)
	memberPassword: string;

	@Field({ nullable: true })
	@IsOptional()
	@IsString()
	@MaxLength(100)
	memberFullName?: string;
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
	@Matches(/\S/)
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
