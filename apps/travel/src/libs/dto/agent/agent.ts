import { Field, Int, ObjectType } from '@nestjs/graphql';
import { AgentType, AgentVerificationStatus } from '../../enums/agent.enum';
import { TotalCounter } from '../member/member';
import { Member } from '../member/member';

@ObjectType()
export class Agent {
	@Field(() => String)
	_id: string;

	@Field(() => String)
	memberId: string;

	@Field(() => AgentType)
	agentType: AgentType;

	@Field(() => String)
	companyName: string;

	@Field(() => String)
	businessNumber: string;

	@Field(() => String)
	companyAddress: string;

	@Field({ nullable: true })
	companyDesc?: string;

	@Field(() => AgentVerificationStatus)
	verificationStatus: AgentVerificationStatus;

	@Field({ nullable: true })
	rejectionReason?: string;

	@Field(() => Date, { nullable: true })
	verifiedAt?: Date;

	@Field(() => Date)
	createdAt: Date;

	@Field(() => Date)
	updatedAt: Date;

	@Field(() => Member, { nullable: true })
	memberData?: Member;
}

@ObjectType()
export class Agents {
	@Field(() => [Agent])
	list!: Agent[];

	@Field(() => [TotalCounter], { nullable: true })
	metaCounter!: TotalCounter[];
}
