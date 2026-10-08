import { Field, ObjectType } from '@nestjs/graphql';
import { AgentType } from '../../enums/agent.enum';
import { Member, TotalCounter } from '../member/member';

@ObjectType()
export class RankingAgent {
	@Field(() => String)
	_id: string;

	@Field(() => String)
	memberId: string;

	@Field(() => AgentType)
	agentType: AgentType;

	@Field(() => String)
	companyName: string;

	@Field(() => String, { nullable: true })
	companyDesc?: string;

	@Field(() => Member, { nullable: true })
	memberData?: Member;
}

@ObjectType()
export class RankingAgents {
	@Field(() => [RankingAgent])
	list: RankingAgent[];

	@Field(() => [TotalCounter], { nullable: true })
	metaCounter?: TotalCounter[];
}
