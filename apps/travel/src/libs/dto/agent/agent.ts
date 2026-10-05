import { Field, ObjectType } from '@nestjs/graphql';
import { AgentType, AgentVerificationStatus } from '../../enums/agent.enum';

@ObjectType()
export class Agent {
	@Field(() => String)
	_id: string;

	@Field(() => String)
	memberId: string;

	@Field(() => AgentType)
	agentType: AgentType;

	@Field()
	companyName: string;

	@Field()
	businessNumber: string;

	@Field()
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
}
