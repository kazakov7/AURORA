import { Args, Mutation, Parent, Resolver, ResolveField, Query } from '@nestjs/graphql';
import { MemberService } from './member.service';
import { Member, Members } from '../../libs/dto/member/member';
import {
	GoogleAuthInput,
	ChangePasswordInput,
	KakaoAuthInput,
	LoginInput,
	MemberInput,
	MembersInquiry,
	TelegramAuthInput,
} from '../../libs/dto/member/member.input';
import { UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/guards/auth.guard';
import { MemberUpdate } from '../../libs/dto/member/member.update';
import { AdminUpdateMemberInput } from '../../libs/dto/member/admin.update.member';
import { AuthMember } from '../auth/decorators/authMember.decorator';
import { Types } from 'mongoose';
import { WithoutGuard } from '../auth/guards/without.guard';
import { shapeIntoMongoObjectId } from '../../libs/config';
import { MemberType } from '../../libs/enums/member.enum';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';

@Resolver(() => Member)
export class MemberResolver {
	constructor(private readonly memberService: MemberService) {}

	@Mutation(() => Member)
	public async signup(@Args('input') input: MemberInput): Promise<Member> {
		console.log('Query: signup');
		return await this.memberService.signup(input);
	}

	@Mutation(() => Member)
	public async login(@Args('input') input: LoginInput): Promise<Member> {
		console.log('Query: login');
		return await this.memberService.login(input);
	}

	@UseGuards(AuthGuard)
	@Mutation(() => Boolean)
	public async changePassword(
		@Args('input') input: ChangePasswordInput,
		@AuthMember('_id') memberId: Types.ObjectId,
	): Promise<boolean> {
		console.log('Mutation: changePassword');
		return await this.memberService.changePassword(memberId, input);
	}

	@Mutation(() => Member)
	public async googleAuth(@Args('input') input: GoogleAuthInput): Promise<Member> {
		console.log('Mutation: googleAuth');
		return await this.memberService.googleAuth(input);
	}

	@Mutation(() => Member)
	public async kakaoAuth(@Args('input') input: KakaoAuthInput): Promise<Member> {
		console.log('Query: kakaoAuth');
		return await this.memberService.kakaoAuth(input);
	}

	@Mutation(() => Member)
	public async telegramAuth(@Args('input') input: TelegramAuthInput): Promise<Member> {
		console.log('Query: telegramAuth');
		return await this.memberService.telegramAuth(input);
	}

	@UseGuards(AuthGuard)
	@Mutation(() => Member)
	public async updateMember(
		@Args('input') input: MemberUpdate,
		@AuthMember('_id') memberId: Types.ObjectId,
	): Promise<Member> {
		console.log('Mutation: updateMember');
		return this.memberService.updateMember(memberId, input);
	}

	@UseGuards(WithoutGuard)
	@Query(() => Member)
	public async getMember(
		@Args('input') input: string,
		@AuthMember('_id') memberId: Types.ObjectId,
	): Promise<Member> {
		console.log('Query: getMember');

		const targetId = shapeIntoMongoObjectId(input);
		const shouldRecordView = memberId ? !memberId.equals(targetId) : false;
		return this.memberService.getMember(memberId, targetId);
	}

	@UseGuards(WithoutGuard)
	@Query(() => Members)
	public async getAllMembers(
		@Args('input') input: MembersInquiry,
		@AuthMember('_id') memberId: Types.ObjectId | null,
	): Promise<Members> {
		console.log('Mutation: getAllMembers');
		return await this.memberService.getAllMembers(memberId, input);
	}

	// ADMIN
	@Roles(MemberType.ADMIN)
	@UseGuards(RolesGuard)
	@Query(() => Members)
	public async getAllMembersByAdmin(@Args('input') input: MembersInquiry): Promise<Members> {
		console.log('Mutation: getAllMembersByAdmin');

		return await this.memberService.getAllMembersByAdmin(input);
	}

	@Roles(MemberType.ADMIN)
	@UseGuards(RolesGuard)
	@Mutation(() => Member)
	public async updateMemberByAdmin(
		@Args('input') input: AdminUpdateMemberInput,
		@AuthMember('_id') adminId: Types.ObjectId,
	): Promise<Member> {
		console.log('Mutation: updateMemberByAdmin');

		return await this.memberService.updateMemberByAdmin(input, adminId);
	}

	/**
	 * Contact details are private wherever a Member appears: lists, details, chats, rankings.
	 * They reach the member, the admins, the member's own auth response, and a host reading
	 * the guests of their own bookings (marked contactShared by the booking query).
	 */
	@ResolveField(() => String, { nullable: true })
	public memberEmail(
		@Parent() member: Member & { contactShared?: boolean },
		@AuthMember() viewer: Member | null,
	): string | null {
		return this.canSeeContact(member, viewer) ? (member.memberEmail ?? null) : null;
	}

	@ResolveField(() => String, { nullable: true })
	public memberPhone(
		@Parent() member: Member & { contactShared?: boolean },
		@AuthMember() viewer: Member | null,
	): string | null {
		return this.canSeeContact(member, viewer) ? (member.memberPhone ?? null) : null;
	}

	private canSeeContact(
		member: Member & { contactShared?: boolean },
		viewer: Member | null,
	): boolean {
		if (member.contactShared || member.accessToken) return true;
		if (!viewer) return false;
		return viewer.memberType === MemberType.ADMIN || String(viewer._id) === String(member._id);
	}
}
