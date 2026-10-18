import { InputType, Field } from '@nestjs/graphql';
import { IsEnum, IsMongoId } from 'class-validator';
import { MemberStatus } from '../../enums/member.enum';

@InputType()
export class AdminUpdateMemberInput {
	@Field(() => String)
	@IsMongoId()
	_id: string;

	@Field(() => MemberStatus)
	@IsEnum(MemberStatus)
	memberStatus: MemberStatus;
}
