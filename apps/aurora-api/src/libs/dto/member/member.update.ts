import { Field, InputType } from '@nestjs/graphql';
import { Transform } from 'class-transformer';
import {
	IsOptional,
	IsString,
	IsNotEmpty,
	Length,
	Matches,
	MaxLength,
	ValidateIf,
} from 'class-validator';
import { imageSourceRegex, memberNickRegex, memberPhoneRegex, trimString } from '../../config';
import { Messages } from '../../enums/common.enum';

@InputType()
export class MemberUpdate {
	@Field({ nullable: true })
	@IsOptional()
	_id?: string;

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
