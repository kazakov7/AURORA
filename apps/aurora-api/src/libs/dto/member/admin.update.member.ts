import { InputType, Field } from '@nestjs/graphql';
import { Transform } from 'class-transformer';
import {
	IsOptional,
	IsString,
	IsNotEmpty,
	IsEmail,
	IsEnum,
	IsMongoId,
	Length,
	Matches,
	MaxLength,
	ValidateIf,
} from 'class-validator';
import { imageSourceRegex, memberNickRegex, memberPhoneRegex, trimString } from '../../config';
import { Messages } from '../../enums/common.enum';
import { MemberStatus } from '../../enums/member.enum';

@InputType()
export class AdminUpdateMemberInput {
	@IsNotEmpty()
	@IsMongoId()
	@Field(() => String)
	_id: string;

	@ValidateIf((_, value) => value !== undefined)
	@IsEnum(MemberStatus)
	@Field(() => MemberStatus, { nullable: true })
	memberStatus?: MemberStatus;

	// Optional, but never null: Member.memberNick is non-nullable in the schema
	@Field({ nullable: true })
	@ValidateIf((_, value) => value !== undefined)
	@Transform(trimString)
	@IsString()
	@Length(3, 12)
	@Matches(memberNickRegex, { message: Messages.INVALID_NICKNAME })
	memberNick?: string;

	@Field({ nullable: true })
	@IsOptional()
	@IsString()
	@MaxLength(100)
	memberFullName?: string;

	@Field({ nullable: true })
	@IsOptional()
	@IsEmail()
	memberEmail?: string;

	// A blank phone clears the number, so only a real value is checked
	@Field({ nullable: true })
	@ValidateIf((_, value) => typeof value === 'string' && value.trim() !== '')
	@Matches(memberPhoneRegex, { message: Messages.INVALID_PHONE })
	memberPhone?: string;

	@Field({ nullable: true })
	@IsOptional()
	@IsString()
	@MaxLength(500)
	memberDesc?: string;

	@Field({ nullable: true })
	@IsOptional()
	@IsString()
	@MaxLength(1000)
	@Matches(imageSourceRegex)
	memberImage?: string;

	@Field({ nullable: true })
	@IsOptional()
	@IsString()
	@MaxLength(200)
	memberAddress?: string;
}
