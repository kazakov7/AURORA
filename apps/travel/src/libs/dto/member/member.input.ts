import { Field, InputType, Int } from '@nestjs/graphql';
import { IsEmail, IsIn, IsNotEmpty, IsOptional, IsString, Length, Min } from 'class-validator';
import { availableMemberSorts } from '../../config';
import { Direction } from '../../enums/common.enum';
import { MemberStatus, MemberType } from '../../enums/member.enum';

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
@InputType()
class MISearch {
	@IsOptional()
	@Field(() => MemberStatus, { nullable: true })
	memberStatus?: MemberStatus;

	@IsOptional()
	@Field(() => MemberType, { nullable: true })
	memberType?: MemberType;

	@IsOptional()
	@Field(() => String, { nullable: true })
	text?: string;
}

@InputType()
export class MembersInquiry {
	@IsNotEmpty()
	@Min(1)
	@Field(() => Int)
	page!: number;

	@IsNotEmpty()
	@Min(1)
	@Field(() => Int)
	limit!: number;

	@IsOptional()
	@IsIn(availableMemberSorts)
	@Field(() => String, { nullable: true })
	sort?: string;

	@IsOptional()
	@Field(() => Direction, { nullable: true })
	direction?: Direction;

	@IsNotEmpty()
	@Field(() => MISearch)
	search!: MISearch;
}
