import { BadRequestException, ConflictException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Member, Members } from '../../libs/dto/member/member';
import { Model, Types } from 'mongoose';
import { AuthService, GoogleIdentity, KakaoIdentity, TelegramIdentity } from '../auth/auth.service';
import {
	GoogleAuthInput,
	KakaoAuthInput,
	LoginInput,
	MemberInput,
	MembersInquiry,
	TelegramAuthInput,
} from '../../libs/dto/member/member.input';
import { Direction, Messages } from '../../libs/enums/common.enum';
import { Message } from '../../libs/dto/message/message';
import { MemberAuthType, MemberStatus, MemberType } from '../../libs/enums/member.enum';
import { StatisticModifier, T } from '../../libs/types/common';
import { ViewGroup } from '../../libs/enums/view.enum';
import { ViewService } from '../view/view.service';
import { LikeGroup } from '../../libs/enums/like.enum';
import { LikeService } from '../like/like.service';
import { MemberUpdate } from '../../libs/dto/member/member.update';
import { Follower, Following, MeFollowed } from '../../libs/dto/follow/follow';
import { randomBytes } from 'crypto';

type SocialIdentity = GoogleIdentity | KakaoIdentity | TelegramIdentity;
type SocialSubjectField = 'googleSubject' | 'kakaoSubject' | 'telegramSubject';

interface SocialAuthConfig {
	authType: MemberAuthType;
	subjectField: SocialSubjectField;
	emailConflictMessage?: Messages;
	nicknameFallback: string;
	nicknameCandidates?: string[];
	backfillFullName?: boolean;
}

@Injectable()
export class MemberService {
	constructor(
		@InjectModel('Member')
		private readonly memberModel: Model<Member>,
		@InjectModel('Follow') private readonly followModel: Model<Follower | Following>,
		private authService: AuthService,
		private viewService: ViewService,
		private likeService: LikeService,
	) { }

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
		if (!response.memberPassword) {
			throw new InternalServerErrorException(Messages.WRONG_PASSWORD);
		}

		const isMatch = await this.authService.comparePasswords(input.memberPassword, response.memberPassword!);
		if (!isMatch) throw new InternalServerErrorException(Messages.WRONG_PASSWORD);

		await this.memberModel.findByIdAndUpdate(response._id, {
			lastLoginAt: new Date(),
		});
		response.accessToken = await this.authService.createToken(response);

		return response;
	}

	public async googleAuth(input: GoogleAuthInput): Promise<Member> {
		const identity = await this.authService.verifyGoogleCredential(input.credential);
		return await this.authenticateSocialMember(identity, {
			authType: MemberAuthType.GOOGLE,
			subjectField: 'googleSubject',
			emailConflictMessage: Messages.GOOGLE_EMAIL_CONFLICT,
			nicknameFallback: 'googleuser',
		});
	}

	public async kakaoAuth(input: KakaoAuthInput): Promise<Member> {
		const identity = await this.authService.verifyKakaoAuthorizationCode(input.code, input.redirectUri);
		return await this.authenticateSocialMember(identity, {
			authType: MemberAuthType.KAKAO,
			subjectField: 'kakaoSubject',
			emailConflictMessage: Messages.KAKAO_EMAIL_CONFLICT,
			nicknameFallback: 'kakaouser',
		});
	}

	public async telegramAuth(input: TelegramAuthInput): Promise<Member> {
		const identity = await this.authService.verifyTelegramAuthorizationCode(
			input.code,
			input.redirectUri,
			input.codeVerifier,
		);
		return await this.authenticateSocialMember(identity, {
			authType: MemberAuthType.TELEGRAM,
			subjectField: 'telegramSubject',
			nicknameFallback: 'telegramuser',
			nicknameCandidates: [identity.preferredUsername ?? '', identity.name ?? ''],
			backfillFullName: true,
		});
	}

	private async authenticateSocialMember(identity: SocialIdentity, config: SocialAuthConfig): Promise<Member> {
		const existingSocialMember = await this.memberModel.findOne({ [config.subjectField]: identity.subject }).exec();
		if (existingSocialMember) return await this.completeSocialLogin(existingSocialMember, identity, config);

		const email = 'email' in identity ? identity.email : undefined;
		if (email) {
			const existingEmailMember = await this.memberModel.findOne({ memberEmail: email }).exec();
			if (existingEmailMember && config.emailConflictMessage) throw new ConflictException(config.emailConflictMessage);
		}

		return await this.createSocialMember(identity, config);
	}

	private async completeSocialLogin(
		member: Member,
		identity: SocialIdentity,
		config: SocialAuthConfig,
	): Promise<Member> {
		if (member.memberStatus === MemberStatus.DELETED) {
			throw new InternalServerErrorException(Messages.MEMBER_NOT_FOUND);
		}
		if (member.memberStatus === MemberStatus.BLOCKED) {
			throw new InternalServerErrorException(Messages.MEMBER_BLOCKED);
		}

		const update: T = { lastLoginAt: new Date() };
		if (!member.memberImage && identity.image) update.memberImage = identity.image;
		if (config.backfillFullName && !member.memberFullName && identity.name) update.memberFullName = identity.name;
		const updatedMember = await this.memberModel.findByIdAndUpdate(member._id, update, { new: true }).exec();
		if (!updatedMember) throw new InternalServerErrorException(Messages.UPDATE_FAILED);

		updatedMember.accessToken = await this.authService.createToken(updatedMember);
		return updatedMember;
	}

	private async createSocialMember(identity: SocialIdentity, config: SocialAuthConfig): Promise<Member> {
		const email = 'email' in identity ? identity.email : undefined;
		for (let attempt = 0; attempt < 10; attempt++) {
			const memberNick = this.createSocialMemberNick(identity, config, attempt);
			const existingNick = await this.memberModel.exists({ memberNick });
			if (existingNick) continue;
			try {
				const member = await this.memberModel.create({
					memberType: MemberType.USER,
					memberStatus: MemberStatus.ACTIVE,
					memberAuthType: config.authType,
					memberNick,
					memberEmail: email,
					memberFullName: identity.name,
					memberImage: identity.image,
					[config.subjectField]: identity.subject,
					lastLoginAt: new Date(),
				});
				member.accessToken = await this.authService.createToken(member);
				return member;
			} catch (error) {//@ts-ignore
				const duplicateField = Object.keys(error?.keyPattern ?? {})[0];
				if (duplicateField === 'memberNick') continue;
				if (duplicateField === config.subjectField) {
					const existingMember = await this.memberModel.findOne({ [config.subjectField]: identity.subject }).exec();
					if (existingMember) return await this.completeSocialLogin(existingMember, identity, config);
				}
				if (duplicateField === 'memberEmail' && config.emailConflictMessage) {
					throw new ConflictException(config.emailConflictMessage);
				}
				throw error;
			}
		}

		throw new BadRequestException(Messages.CREATE_FAILED);
	}

	private createSocialMemberNick(identity: SocialIdentity, config: SocialAuthConfig, attempt: number): string {
		if (config.nicknameCandidates) {
			const bases: string[] = [];
			for (const [index, candidate] of config.nicknameCandidates.entries()) {
				const normalized = this.normalizeSocialNickname(candidate);
				if (normalized.length < 3) continue;
				if (index === 0 && normalized.length > 12) continue;
				const base = normalized.slice(0, 12);
				if (!bases.includes(base)) bases.push(base);
			}
			if (!bases.includes(config.nicknameFallback)) bases.push(config.nicknameFallback);
			if (attempt < bases.length) return bases[attempt];

			const suffix = randomBytes(3).toString('hex');
			return `${config.nicknameFallback.slice(0, 12 - suffix.length)}${suffix}`;
		}

		const email = 'email' in identity ? identity.email : undefined;
		let base = this.normalizeSocialNickname(identity.name || email?.split('@')[0] || config.nicknameFallback);
		if (!base || base.length < 3) base = config.nicknameFallback;

		const suffix = attempt === 0 ? '' : randomBytes(3).toString('hex');
		return `${base.slice(0, 12 - suffix.length)}${suffix}`;
	}

	private normalizeSocialNickname(source: string): string {
		return source
			.normalize('NFD')
			.replace(/[\u0300-\u036f]/g, '')
			.toLowerCase()
			.replace(/[^a-z0-9]/g, '');
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
		const result = (await this.memberModel.findOne(search).lean().exec()) as unknown as Member;
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
			result.meFollowed = await this.checkSubscription(memberId, targetId);
		}

		return result;
	}

	private async checkSubscription(
		followerId: Types.ObjectId,
		followingId: Types.ObjectId,
	): Promise<MeFollowed[]> {
		const result = await this.followModel
			.findOne({ followingId: followingId, followerId: followerId })
			.exec();
		return result
			? [{ followerId: followerId, followingId: followingId, myFollowing: true }]
			: [];
	}

	public async memberStatusEditor(input: StatisticModifier): Promise<Member> {
		console.log('executed');
		const { _id, targetKey, modifier } = input;
		const result = await this.memberModel
			.findByIdAndUpdate(_id, { $inc: { [targetKey]: modifier } }, { new: true })
			.exec();
		if (!result) throw new InternalServerErrorException(Messages.UPDATE_FAILED);
		return result;
	}

	public async getAllMembersByAdmin(input: MembersInquiry): Promise<Members> {
		const { memberStatus, memberType, text } = input.search;

		const match: T = {};

		const sort: T = {
			[input?.sort ?? 'createdAt']: input?.direction ?? Direction.DESC,
		};

		if (memberStatus) {
			match.memberStatus = memberStatus;
		}

		if (memberType) {
			match.memberType = memberType;
		}

		if (text) {
			match.memberNick = {
				$regex: new RegExp(text, 'i'),
			};
		}

		console.log('match:', match);

		const result = await this.memberModel
			.aggregate([
				{ $match: match },
				{ $sort: sort },
				{
					$facet: {
						list: [
							{
								$skip: (input.page - 1) * input.limit,
							},
							{
								$limit: input.limit,
							},
						],
						metaCounter: [{ $count: 'total' }],
					},
				},
			])
			.exec();

		if (!result.length) {
			throw new InternalServerErrorException(Messages.NO_DATA_FOUND);
		}

		return result[0];
	}

	public async updateMemberByAdmin(input: MemberUpdate): Promise<Member> {
		const result = await this.memberModel
			.findOneAndUpdate({ _id: input._id }, input, { new: true })
			.exec();

		if (!result) {
			throw new InternalServerErrorException(Messages.UPDATE_FAILED);
		}

		return result;
	}
}
