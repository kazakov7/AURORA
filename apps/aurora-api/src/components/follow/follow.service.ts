import {
	BadRequestException,
	Injectable,
	InternalServerErrorException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Follower, Followers, Following, Followings } from '../../libs/dto/follow/follow';
import { AuthService } from '../auth/auth.service';
import { MemberService } from '../member/member.service';

import { error } from 'console';
import { FollowInquiry } from '../../libs/dto/follow/follow.input';
import { T } from '../../libs/types/common';

import {
	lookUpAuthMemberFollowData,
	lookUpAuthMemberLiked,
	lookupFollowerData,
	lookupFollowingData,
} from '../../libs/config';
import { Direction, Messages } from '../../libs/enums/common.enum';

@Injectable()
export class FollowService {
	constructor(
		@InjectModel('Follow')
		private readonly followModel: Model<Follower | Following>,
		private memberService: MemberService,
	) { }

	public async subscribe(
		followerId: Types.ObjectId,
		followingId: Types.ObjectId,
	): Promise<Follower> {
		if (followerId.toString() === followingId.toString()) {
			throw new InternalServerErrorException(Messages.SELF_SUBSCRIPTION_DENIED);
		}

		const targetMember = await this.memberService.getMember(null, followingId);
		if (!targetMember) throw new InternalServerErrorException(Messages.NO_DATA_FOUND);

		const existingSubscription = await this.followModel.findOne({ followerId, followingId }).exec();
		if (existingSubscription) return existingSubscription as Follower;

		let result: Follower;
		try {
			result = (await this.followModel.create({ followingId, followerId })) as Follower;
		} catch (err: any) {
			if (err?.code !== 11000) throw new BadRequestException(Messages.CREATE_FAILED);
			const concurrentSubscription = await this.followModel.findOne({ followerId, followingId }).exec();
			if (!concurrentSubscription) throw new BadRequestException(Messages.CREATE_FAILED);
			return concurrentSubscription as Follower;
		}

		await this.memberService.memberStatusEditor({
			_id: followerId,
			targetKey: 'memberFollowings',
			modifier: 1,
		});
		await this.memberService.memberStatusEditor({
			_id: followingId,
			targetKey: 'memberFollowers',
			modifier: 1,
		});
		return result;
	}

	public async unsubscribe(
		followerId: Types.ObjectId,
		followingId: Types.ObjectId,
	): Promise<Follower> {
		const targetMember = await this.memberService.getMember(null, followingId);
		if (!targetMember) throw new InternalServerErrorException(Messages.NO_DATA_FOUND);

		const result = await this.followModel
			.findOneAndDelete({
				followingId: followingId,
				followerId: followerId,
			})
			.exec();
		if (!result) throw new InternalServerErrorException(Messages.NO_DATA_FOUND);

		//error
		await this.memberService.memberStatusEditor({
			_id: followerId,
			targetKey: 'memberFollowings',
			modifier: -1,
		});
		await this.memberService.memberStatusEditor({
			_id: followingId,
			targetKey: 'memberFollowers',
			modifier: -1,
		});
		return result;
	}

	public async getMemberFollowings(
		memberId: Types.ObjectId,
		input: FollowInquiry,
	): Promise<Followings> {
		const { page, limit, search } = input;
		if (!search?.followerId) throw new InternalServerErrorException(Messages.BAD_REQUEST);
		const match: T = { followerId: search?.followerId };
		console.log('match:', match);

		const result = await this.followModel
			.aggregate([
				{ $match: match },
				{ $sort: { createdAt: Direction.DESC } },
				{
					$facet: {
						list: [
							{ $skip: (page - 1) * limit },
							{ $limit: limit },
							lookUpAuthMemberLiked(memberId, '$followingId'),
							lookUpAuthMemberFollowData({
								followerId: memberId,
								followingId: '$followingId',
							}),
							lookupFollowingData,
							{ $unwind: '$followingData' },
						],
						metaCounter: [{ $count: 'total' }],
					},
				},
			])
			.exec();
		if (!result.length) throw new InternalServerErrorException(Messages.NO_DATA_FOUND);

		return result[0];
	}

	public async getMemberFollowers(
		memberId: Types.ObjectId,
		input: FollowInquiry,
	): Promise<Followers> {
		const { page, limit, search } = input;
		if (!search?.followingId) throw new InternalServerErrorException(Messages.BAD_REQUEST);

		const match: T = { followingId: search?.followingId };
		console.log('match:', match);

		const result = await this.followModel
			.aggregate([
				{ $match: match },
				{ $sort: { createdAt: Direction.DESC } },
				{
					$facet: {
						list: [
							{ $skip: (page - 1) * limit },
							{ $limit: limit },
							lookUpAuthMemberLiked(memberId, '$followerId'),
							lookUpAuthMemberFollowData({
								followerId: memberId,
								followingId: '$followerId',
							}),
							lookupFollowerData,
							{ $unwind: '$followerData' },
						],
						metaCounter: [{ $count: 'total' }],
					},
				},
			])
			.exec();
		if (!result.length) throw new InternalServerErrorException(Messages.NO_DATA_FOUND);

		return result[0];
	}
}
