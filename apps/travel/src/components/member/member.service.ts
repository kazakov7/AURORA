import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Member } from '../../libs/dto/member/member';
import { Model, Types } from 'mongoose';
import { AuthService } from '../auth/auth.service';
import { LoginInput, MemberInput } from '../../libs/dto/member/member.input';
import { Messages } from '../../libs/enums/common.enum';
import { Message } from '../../libs/dto/message/message';
import { MemberStatus } from '../../libs/enums/member.enum';
import { T } from '../../libs/types/common';
import { ViewGroup } from '../../libs/enums/view.enum';
import { ViewService } from '../view/view.service';
import { LikeGroup } from '../../libs/enums/like.enum';
import { LikeService } from '../like/like.service';
@Injectable()
export class MemberService {
	constructor(
		@InjectModel('Member')
		private readonly memberModel: Model<Member>,
		private authService: AuthService,
		private viewService: ViewService,
		private likeService: LikeService,
	) {}

	public async signup(input: MemberInput): Promise<Member> {
		input.memberPassword = await this.authService.hashPassword(input.memberPassword!);
		try {
			const result = await this.memberModel.create(input);
			result.accessToken = await this.authService.createToken(result);
			return result;
		} catch (err) {
			// @ts-ignore
			console.log('Error, Service.model', err.message);
			throw new BadRequestException(Messages.DUPLICATE_DATA);
		}
	}
	public async login(input: LoginInput): Promise<Member> {
		const { memberNick, memberPassword } = input;
		const response = await this.memberModel.findOne({ memberNick: memberNick }).select('+memberPassword').exec();

		if (!response || response.memberStatus === MemberStatus.DELETED) {
			throw new InternalServerErrorException(Messages.MEMBER_NOT_FOUND);
		} else if (response.memberStatus === MemberStatus.BLOCKED) {
			throw new InternalServerErrorException(Messages.MEMBER_BLOCKED);
		}

		const isMatch = await this.authService.comparePasswords(input.memberPassword, response.memberPassword!);
		if (!isMatch) throw new InternalServerErrorException(Messages.WRONG_PASSWORD);

		await this.memberModel.findByIdAndUpdate(response._id, {
			lastLoginAt: new Date(),
		});
		response.accessToken = await this.authService.createToken(response);

		return response;
	}

	public async updateMember(memberId, input): Promise<Member> {
		const result = await this.memberModel
			.findOneAndUpdate(
				{
					_id: memberId,
					memberStatus: MemberStatus.ACTIVE,
				},
				input,
				{ new: true },
			)
			.exec();

		if (!result) throw new InternalServerErrorException(Messages.UPDATE_FAILED);

		result.accessToken = await this.authService.createToken(result);
		return result;
	}

	public async getMember(memberId: Types.ObjectId | null, targetId: Types.ObjectId): Promise<Member> {
		const search: T = {
			_id: targetId,
			memberStatus: {
				$in: [MemberStatus.ACTIVE, MemberStatus.BLOCKED],
			},
		};
		const result = await this.memberModel.findOne(search).lean().exec();
		if (!result) throw new InternalServerErrorException(Messages.NO_DATA_FOUND);

		if (memberId) {
			const viewInput = {
				memberId: memberId,
				viewRefId: targetId,
				viewGroup: ViewGroup.MEMBER,
			};

			const newView = await this.viewService.recordView(viewInput);

			if (newView) {
				await this.memberModel.findOneAndUpdate(search, { $inc: { memberViews: 1 } }, { new: true }).exec();

				result.memberViews++;
			}

			const likeInput = {
				memberId: memberId,
				likeRefId: targetId,
				likeGroup: LikeGroup.MEMBER,
			};
			result.meLiked = await this.likeService.checkLikeExistence(likeInput);
			// result.meFollowed = await this.checkSubscription(memberId, targetId);
		}

		return result;
	}
}
