import { ObjectType, Field, Int } from '@nestjs/graphql';
import { MemberType, MemberStatus, MemberAuthType, AgentType } from '../../enums/member.enum';
import { MeLiked } from '../like/like';

@ObjectType()
export class Member {
	@Field()
	_id: string;

	@Field(() => MemberType)
	memberType: MemberType;

	@Field(() => MemberStatus)
	memberStatus: MemberStatus;

	@Field(() => MemberAuthType)
	memberAuthType: MemberAuthType;

	@Field({ nullable: true })
	memberPhone?: string;

	@Field({ nullable: true })
	memberEmail?: string;

	@Field()
	memberNick: string;

	memberPassword?: string;

	@Field({ nullable: true })
	memberFullName?: string;

	@Field({ nullable: true })
	memberImage?: string;

	@Field({ nullable: true })
	memberDesc?: string;

	@Field({ nullable: true })
	memberAddress?: string;

	// Agent
	@Field(() => AgentType, { nullable: true })
	agentType?: AgentType;

	@Field({ nullable: true })
	agentCompanyName?: string;

	@Field({ nullable: true })
	agentBusinessNumber?: string;

	@Field()
	agentVerified: boolean;

	// Statistics
	@Field(() => Int)
	memberFollowers: number;

	@Field(() => Int)
	memberFollowings: number;

	@Field(() => Int)
	memberLikes: number;

	@Field(() => Int)
	memberViews: number;

	@Field(() => Int)
	memberComments: number;

	@Field(() => Int)
	memberProperties: number;

	@Field(() => Int)
	memberTours: number;

	@Field(() => Int)
	memberArticles: number;

	@Field(() => Int)
	memberPoints: number;

	@Field(() => Int)
	memberRank: number;

	// Moderation
	@Field(() => Int)
	memberWarnings: number;

	@Field(() => Int)
	memberBlocks: number;

	@Field({ nullable: true })
	lastLoginAt?: Date;

	@Field(() => String, { nullable: true })
	accessToken?: string;

	@Field({ nullable: true })
	deletedAt?: Date;

	@Field()
	createdAt: Date;

	@Field()
	updatedAt: Date;

	@Field(() => [MeLiked], { nullable: true })
	meLiked?: MeLiked[];
}
@ObjectType()
export class TotalCounter {
	@Field(() => Int, { nullable: true })
	total!: number;
}
