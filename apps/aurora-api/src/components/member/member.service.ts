import {
	BadRequestException,
	ConflictException,
	HttpException,
	HttpStatus,
	Injectable,
	InternalServerErrorException,
	NotFoundException,
	UnauthorizedException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Member, Members } from '../../libs/dto/member/member';
import { Connection, Model, PipelineStage, Types } from 'mongoose';
import {
	GoogleAuthInput,
	ChangePasswordInput,
	KakaoAuthInput,
	LoginInput,
	MemberInput,
	MembersInquiry,
	TelegramAuthInput,
} from '../../libs/dto/member/member.input';
import { Direction, Messages } from '../../libs/enums/common.enum';
import { MemberAuthType, MemberStatus, MemberType } from '../../libs/enums/member.enum';
import { PropertyStatus } from '../../libs/enums/property.enum';
import { AgentVerificationStatus } from '../../libs/enums/agent.enum';
import { BookingCategory } from '../../libs/enums/booking.enum';
import { CommentStatus } from '../../libs/enums/comment.enum';
import { BookingService } from '../booking/booking.service';
import { StatisticModifier, T } from '../../libs/types/common';
import { ViewGroup } from '../../libs/enums/view.enum';
import { ViewService } from '../view/view.service';
import { AdminUpdateMemberInput } from '../../libs/dto/member/admin.update.member';
import { Follower, Following, MeFollowed } from '../../libs/dto/follow/follow';
import { randomBytes } from 'crypto';
import {
	LOGIN_ATTEMPT_LIMIT,
	LOGIN_ATTEMPT_WINDOW_MS,
	lookUpAuthMemberFollowData,
} from '../../libs/config';
import { ChatGateway } from '../chat/chat.gateway';
import { Message } from '../../libs/dto/message/message';
import { AuthService } from '../auth/auth.service';
import { SocialIdentity, SocialAuthConfig } from '../../libs/types/social.identity';

/** The nickname index is partial ($type: string), so an exact lookup names that condition to use it instead of scanning every member **/
const nickLookup = (memberNick: string) => ({ $eq: memberNick, $type: 'string' as const });

@Injectable()
export class MemberService {
	/** Wrong logins per lower-case nickname: how many, and when the window started **/
	private readonly failedLogins = new Map<string, { count: number; since: number }>();

	constructor(
		@InjectModel('Member')
		private readonly memberModel: Model<Member>,
		@InjectModel('Follow') private readonly followModel: Model<Follower | Following>,
		@InjectModel('Property') private readonly propertyModel: Model<any>,
		@InjectModel('Tour') private readonly tourModel: Model<any>,
		@InjectModel('Agent') private readonly agentModel: Model<any>,
		@InjectModel('Destination') private readonly destinationModel: Model<any>,
		@InjectModel('Comment') private readonly commentModel: Model<any>,
		@InjectConnection() private readonly connection: Connection,
		private authService: AuthService,
		private viewService: ViewService,
		private readonly chatGateway: ChatGateway,
		private readonly bookingService: BookingService,
	) {}

	public async signup(input: MemberInput): Promise<Member> {
		const memberFullName = input.memberFullName?.trim();
		const signupInput = {
			memberNick: input.memberNick.trim(),
			memberPassword: await this.authService.hashPassword(input.memberPassword!),
			...(memberFullName ? { memberFullName } : {}),
		};
		try {
			const result = await this.memberModel.create(signupInput);
			result.accessToken = await this.authService.createToken(result);
			return result;
		} catch (err) {
			console.log('Error, Service.model', err);
			throw new BadRequestException(Messages.DUPLICATE_DATA);
		}
	}
	public async login(input: LoginInput): Promise<Member> {
		const { memberPassword } = input;
		const attemptKey = input.memberNick.trim().toLowerCase();
		this.assertLoginAllowed(attemptKey);
		const response = await this.memberModel
			.findOne({ memberNick: nickLookup(input.memberNick) })
			.select('+memberPassword')
			.exec();
		// Unknown and passwordless (social) accounts get the same answer as a wrong password
		if (!response?.memberPassword) {
			this.recordFailedLogin(attemptKey);
			throw new UnauthorizedException(Messages.NOT_AUTHENTICATED);
		}

		const isMatch = await this.authService.comparePasswords(
			memberPassword,
			response?.memberPassword as string,
		);

		if (
			!response ||
			response.memberStatus !== MemberStatus.ACTIVE ||
			!response.memberPassword ||
			!isMatch
		) {
			this.recordFailedLogin(attemptKey);
			throw new UnauthorizedException(Messages.NOT_AUTHENTICATED);
		}
		this.failedLogins.delete(attemptKey);

		await this.memberModel.findByIdAndUpdate(response._id, {
			lastLoginAt: new Date(),
		});
		response.accessToken = await this.authService.createToken(response);

		return response;
	}

	/** A nickname with too many wrong logins waits until its window ends, so a password cannot be guessed **/
	private assertLoginAllowed(attemptKey: string): void {
		const attempts = this.failedLogins.get(attemptKey);
		if (!attempts) return;
		if (Date.now() - attempts.since >= LOGIN_ATTEMPT_WINDOW_MS) {
			this.failedLogins.delete(attemptKey);
			return;
		}
		if (attempts.count >= LOGIN_ATTEMPT_LIMIT) {
			// The same response shape as the built-in exceptions, so GraphQL keeps the 429 status
			const status = HttpStatus.TOO_MANY_REQUESTS;
			throw new HttpException(
				{
					statusCode: status,
					message: Messages.TOO_MANY_LOGIN_ATTEMPTS,
					error: 'Too Many Requests',
				},
				status,
			);
		}
	}

	private recordFailedLogin(attemptKey: string): void {
		const now = Date.now();
		const attempts = this.failedLogins.get(attemptKey);
		if (attempts && now - attempts.since < LOGIN_ATTEMPT_WINDOW_MS) attempts.count += 1;
		else this.failedLogins.set(attemptKey, { count: 1, since: now });

		// Ended windows are dropped, so guessing many nicknames cannot grow the map without end
		if (this.failedLogins.size > 10_000) {
			for (const [key, entry] of this.failedLogins) {
				if (now - entry.since >= LOGIN_ATTEMPT_WINDOW_MS) this.failedLogins.delete(key);
			}
		}
	}

	public async changePassword(
		memberId: Types.ObjectId,
		input: ChangePasswordInput,
	): Promise<boolean> {
		const { currentPassword, newPassword, confirmPassword } = input;
		if (newPassword !== confirmPassword) {
			throw new BadRequestException(Messages.PASSWORD_CONFIRMATION_MISMATCH);
		}

		const member = await this.memberModel
			.findOne({
				_id: memberId,
				memberStatus: MemberStatus.ACTIVE,
				deletedAt: null,
			})
			.select('+memberPassword')
			.exec();
		if (!member) throw new UnauthorizedException(Messages.NOT_AUTHENTICATED);
		if (!member.memberPassword) {
			throw new BadRequestException(Messages.PASSWORD_CHANGE_UNAVAILABLE);
		}

		const currentPasswordMatches = await this.authService.comparePasswords(
			currentPassword,
			member.memberPassword,
		);
		if (!currentPasswordMatches) throw new BadRequestException(Messages.WRONG_PASSWORD);

		const reusesCurrentPassword = await this.authService.comparePasswords(
			newPassword,
			member.memberPassword,
		);
		if (reusesCurrentPassword) throw new BadRequestException(Messages.NEW_PASSWORD_MUST_DIFFER);

		const hashedPassword = await this.authService.hashPassword(newPassword);
		const result = await this.memberModel
			.updateOne(
				{
					_id: memberId,
					memberPassword: member.memberPassword,
					memberStatus: MemberStatus.ACTIVE,
					deletedAt: null,
				},
				{ $set: { memberPassword: hashedPassword } },
			)
			.exec();
		if (result.modifiedCount !== 1) throw new BadRequestException(Messages.WRONG_PASSWORD);

		return true;
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
		const identity = await this.authService.verifyKakaoAuthorizationCode(
			input.code,
			input.redirectUri,
		);
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

	private async authenticateSocialMember(
		identity: SocialIdentity,
		config: SocialAuthConfig,
	): Promise<Member> {
		const existingSocialMember = await this.memberModel
			.findOne({ [config.subjectField]: identity.subject })
			.exec();
		if (existingSocialMember)
			return await this.completeSocialLogin(existingSocialMember, identity, config);

		const email = 'email' in identity ? identity.email : undefined;
		if (email) {
			// The same identity created by a concurrent first sign-in is not a conflict
			const existingEmailMember = await this.memberModel
				.findOne({ memberEmail: email, [config.subjectField]: { $ne: identity.subject } })
				.exec();
			if (existingEmailMember && config.emailConflictMessage)
				throw new ConflictException(config.emailConflictMessage);
		}

		return await this.createSocialMember(identity, config);
	}

	private async completeSocialLogin(
		member: Member,
		identity: SocialIdentity,
		config: SocialAuthConfig,
	): Promise<Member> {
		if (member.memberStatus !== MemberStatus.ACTIVE) {
			throw new UnauthorizedException(Messages.NOT_AUTHENTICATED);
		}

		const update: T = { lastLoginAt: new Date() };
		if (!member.memberImage && identity.image) update.memberImage = identity.image;
		if (config.backfillFullName && !member.memberFullName && identity.name)
			update.memberFullName = identity.name;

		const updatedMember = await this.memberModel
			.findByIdAndUpdate(member._id, update, { new: true })
			.exec();
		if (!updatedMember) throw new InternalServerErrorException(Messages.UPDATE_FAILED);

		updatedMember.accessToken = await this.authService.createToken(updatedMember);
		return updatedMember;
	}

	private async createSocialMember(
		identity: SocialIdentity,
		config: SocialAuthConfig,
	): Promise<Member> {
		const email = 'email' in identity ? identity.email : undefined;
		for (let attempt = 0; attempt < 10; attempt++) {
			const memberNick = this.createSocialMemberNick(identity, config, attempt);
			const existingNick = await this.memberModel.exists({ memberNick: nickLookup(memberNick) });
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
			} catch (error) {
				//@ts-ignore
				const duplicateField = Object.keys(error?.keyPattern ?? {})[0];
				if (duplicateField === 'memberNick') continue;
				if (duplicateField === config.subjectField || duplicateField === 'memberEmail') {
					const existingMember = await this.memberModel
						.findOne({ [config.subjectField]: identity.subject })
						.exec();
					if (existingMember)
						return await this.completeSocialLogin(existingMember, identity, config);
				}
				if (duplicateField === 'memberEmail' && config.emailConflictMessage) {
					throw new ConflictException(config.emailConflictMessage);
				}
				throw error;
			}
		}

		throw new BadRequestException(Messages.CREATE_FAILED);
	}

	private createSocialMemberNick(
		identity: SocialIdentity,
		config: SocialAuthConfig,
		attempt: number,
	): string {
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
		let base = this.normalizeSocialNickname(
			identity.name || email?.split('@')[0] || config.nicknameFallback,
		);
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
		// Email is set only by verified social sign-in, never by a profile update
		delete input.memberEmail;
		this.clearBlankFields(input);
		const result = await this.memberModel
			.findOneAndUpdate(
				{
					_id: memberId,
					memberStatus: MemberStatus.ACTIVE,
				},
				input,
				{ new: true },
			)
			.exec()
			.catch((err) => this.throwUpdateError(err));

		if (!result) throw new InternalServerErrorException(Messages.UPDATE_FAILED);

		result.accessToken = await this.authService.createToken(result);
		return result;
	}

	/** The unique phone index counts '' as a real value and a blank name is no name, so both are stored as empty **/
	private clearBlankFields(input: {
		memberPhone?: string | null;
		memberFullName?: string | null;
	}): void {
		for (const field of ['memberPhone', 'memberFullName'] as const) {
			if (typeof input[field] === 'string' && !input[field].trim()) input[field] = null;
		}
	}

	/** A taken nick, email or phone is a client error, not a leaked database failure **/
	private throwUpdateError(err: unknown): never {
		if ((err as { code?: number }).code === 11000) {
			throw new BadRequestException(Messages.DUPLICATE_DATA);
		}
		throw err;
	}

	public async getMember(
		memberId: Types.ObjectId | null,
		targetId: Types.ObjectId,
		recordView: boolean = true,
	): Promise<Member> {
		const search: T = {
			_id: targetId,
			memberStatus: {
				$in: [MemberStatus.ACTIVE, MemberStatus.BLOCKED],
			},
		};
		const result = (await this.memberModel.findOne(search).lean().exec()) as unknown as Member;
		if (!result) throw new NotFoundException(Messages.MEMBER_NOT_FOUND);

		if (memberId && recordView) {
			const viewInput = {
				memberId: memberId,
				viewRefId: targetId,
				viewGroup: ViewGroup.MEMBER,
			};

			const newView = await this.viewService.recordView(viewInput);

			if (newView) {
				await this.memberModel
					.findOneAndUpdate(search, { $inc: { memberViews: 1 } }, { new: true })
					.exec();
				result.memberViews++;
			}
		}
		// Own profile reads refresh the JWT so role changes (e.g. agent approval) apply without re-login.
		if (memberId?.equals(targetId) && result.memberStatus === MemberStatus.ACTIVE) {
			result.accessToken = await this.authService.createToken(result);
		}
		if (memberId) result.meFollowed = await this.checkSubscription(memberId, targetId);

		return result;
	}

	private async checkSubscription(
		followerId: Types.ObjectId,
		followingId: Types.ObjectId,
	): Promise<MeFollowed[]> {
		const result = await this.followModel
			.findOne({ followingId: followingId, followerId: followerId })
			.exec();
		return result ? [{ followerId: followerId, followingId: followingId, myFollowing: true }] : [];
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

	/**
	 * Like memberLikes, memberComments is counted again from the member's live comments, so no path can
	 * leave it wrong. The count and the write share a transaction: of two parallel recounts, one retries.
	 */
	public async syncMemberCommentCounter(memberId: Types.ObjectId): Promise<void> {
		const session = await this.connection.startSession();
		try {
			await session.withTransaction(async () => {
				const memberComments = await this.commentModel
					.countDocuments({ memberId, commentStatus: CommentStatus.ACTIVE })
					.session(session)
					.exec();
				await this.memberModel
					.updateOne({ _id: memberId }, { $set: { memberComments } }, { session })
					.exec();
			});
		} finally {
			await session.endSession();
		}
	}

	public async getAllMembers(
		memberId: Types.ObjectId | null,
		input: MembersInquiry,
	): Promise<Members> {
		const match: T = {
			memberStatus: MemberStatus.ACTIVE,
			deletedAt: null,
		};
		this.shapeMemberMatch(match, input, false);
		return await this.getMemberList(match, input, memberId);
	}

	public async getAllMembersByAdmin(input: MembersInquiry): Promise<Members> {
		const match: T = {};
		this.shapeMemberMatch(match, input, true);
		return await this.getMemberList(match, input);
	}

	private shapeMemberMatch(match: T, input: MembersInquiry, allowStatus: boolean): void {
		const { memberStatus, memberType, memberAuthType, text } = input.search ?? {};
		if (allowStatus && memberStatus) match.memberStatus = memberStatus;
		if (memberType) match.memberType = memberType;
		if (memberAuthType) match.memberAuthType = memberAuthType;

		const normalizedText = text?.trim();
		if (normalizedText) {
			const escapedText = normalizedText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
			const regex = new RegExp(escapedText, 'i');
			match.$or = [
				{ memberNick: regex },
				{ memberFullName: regex },
				{ memberAddress: regex },
				{ memberDesc: regex },
			];
		}
	}

	private async getMemberList(
		match: T,
		input: MembersInquiry,
		memberId?: Types.ObjectId | null,
	): Promise<Members> {
		const direction = input.direction ?? Direction.DESC;
		const sort: T = {
			[input.sort ?? 'createdAt']: direction,
			_id: direction,
		};
		const listPipeline: PipelineStage.FacetPipelineStage[] = [
			{ $skip: (input.page - 1) * input.limit },
			{ $limit: input.limit },
		];
		if (memberId) {
			listPipeline.push(lookUpAuthMemberFollowData({ followerId: memberId, followingId: '$_id' }));
		}

		const result = await this.memberModel
			.aggregate([
				{ $match: match },
				{ $sort: sort },
				{
					$facet: {
						list: listPipeline,
						metaCounter: [{ $count: 'total' }],
					},
				},
			])
			.exec();

		return result[0] as Members;
	}

	public async updateMemberByAdmin(
		input: AdminUpdateMemberInput,
		_adminId?: Types.ObjectId,
	): Promise<Member> {
		this.clearBlankFields(input);
		const update: T = { ...input };
		// deletedAt follows the status: stamped when a member is deleted, cleared when restored
		if (input.memberStatus) {
			update.deletedAt = input.memberStatus === MemberStatus.DELETED ? new Date() : null;
		}
		const result = await this.memberModel
			.findOneAndUpdate({ _id: input._id }, update, { new: true })
			.exec()
			.catch((err) => this.throwUpdateError(err));

		if (!result) throw new NotFoundException(Messages.MEMBER_NOT_FOUND);
		const memberId = result._id as unknown as Types.ObjectId;
		if (result.memberStatus === MemberStatus.DELETED) {
			this.chatGateway.disconnectMember(memberId);
			// A deleted account gives up its agent role, so its business number is free for a new account
			await this.revokeAgentRole(memberId, 'The account was deleted.');
			return (await this.memberModel.findById(memberId).exec()) ?? result;
		}
		if (result.memberStatus !== MemberStatus.ACTIVE || result.deletedAt) {
			this.chatGateway.disconnectMember(memberId);
			await this.deactivateListings({ memberId });
		}
		return result;
	}

	/** Takes the agent role away: the live application is revoked, the member is a USER again and the listings leave the catalog **/
	public async revokeAgentRole(memberId: Types.ObjectId, reason: string): Promise<void> {
		await this.agentModel
			.updateMany(
				{
					memberId,
					verificationStatus: {
						$in: [AgentVerificationStatus.PENDING, AgentVerificationStatus.APPROVED],
					},
				},
				{ verificationStatus: AgentVerificationStatus.REVOKED, rejectionReason: reason },
			)
			.exec();
		await this.memberModel
			.updateOne({ _id: memberId, memberType: MemberType.AGENT }, { memberType: MemberType.USER })
			.exec();
		await this.deactivateListings({ memberId });
	}

	/**
	 * Takes the ACTIVE hotels and tours of a blocked or deleted agent, or of an inactive city, out of the catalog.
	 * An admin turns each one back on once the agent or the city is active again.
	 */
	public async deactivateListings(
		scope: { memberId: Types.ObjectId } | { destinationId: Types.ObjectId },
	): Promise<void> {
		await this.deactivateListingsOf(scope, this.propertyModel, {
			bookingCategory: BookingCategory.PROPERTY,
			statusKey: 'propertyStatus',
			memberKey: 'memberProperties',
			destinationKey: 'destinationProperties',
		});
		await this.deactivateListingsOf(scope, this.tourModel, {
			bookingCategory: BookingCategory.TOUR,
			statusKey: 'tourStatus',
			memberKey: 'memberTours',
			destinationKey: 'destinationTours',
		});
	}

	private async deactivateListingsOf(
		scope: T,
		listingModel: Model<any>,
		keys: {
			bookingCategory: BookingCategory;
			statusKey: string;
			memberKey: string;
			destinationKey: string;
		},
	): Promise<void> {
		// PropertyStatus and TourStatus share the ACTIVE and INACTIVE values
		const activeListings: T = {
			...scope,
			[keys.statusKey]: PropertyStatus.ACTIVE,
			deletedAt: null,
		};
		const listingIds = await listingModel.distinct('_id', activeListings);
		if (!listingIds.length) return;
		const memberIds = await listingModel.distinct('memberId', activeListings);
		const destinationIds = await listingModel.distinct('destinationId', activeListings);

		await listingModel
			.updateMany(activeListings, { [keys.statusKey]: PropertyStatus.INACTIVE })
			.exec();
		await this.bookingService.notifyInactiveListingGuests(keys.bookingCategory, listingIds);

		// Both counters count ACTIVE listings only, so every owner and city that lost one is recounted
		const countActive = (filter: T) =>
			listingModel
				.countDocuments({ ...filter, [keys.statusKey]: PropertyStatus.ACTIVE, deletedAt: null })
				.exec();
		for (const memberId of memberIds) {
			const activeCount = await countActive({ memberId });
			await this.memberModel.updateOne({ _id: memberId }, { [keys.memberKey]: activeCount }).exec();
		}
		for (const destinationId of destinationIds) {
			const activeCount = await countActive({ destinationId });
			await this.destinationModel
				.updateOne({ _id: destinationId }, { [keys.destinationKey]: activeCount })
				.exec();
		}
	}
}
