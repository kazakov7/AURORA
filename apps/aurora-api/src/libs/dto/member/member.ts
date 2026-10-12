import { ObjectType, Field, Int } from '@nestjs/graphql';
import { MemberType, MemberStatus, MemberAuthType } from '../../enums/member.enum';
import { MeLiked } from '../like/like';
import { MeFollowed } from '../follow/follow';

@ObjectType()
export class Member {
	@Field(() => String)
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

	@Field(() => String)
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

	@Field({ nullable: true })
	lastLoginAt?: Date;

	@Field(() => String, { nullable: true })
	accessToken?: string;

	@Field(() => [MeFollowed], { nullable: true })
	meFollowed?: MeFollowed[];

	@Field({ nullable: true })
	deletedAt?: Date;

	@Field(() => String)
	createdAt: Date;

	@Field(() => String)
	updatedAt: Date;
}
@ObjectType()
export class TotalCounter {
	@Field(() => Int, { nullable: true })
	total!: number;
}

@ObjectType()
export class Members {
	@Field(() => [Member])
	list!: Member[];

	@Field(() => [TotalCounter], { nullable: true })
	metaCounter!: TotalCounter[];
}
