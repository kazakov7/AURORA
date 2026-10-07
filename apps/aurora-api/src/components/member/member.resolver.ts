import { Args, Mutation, Resolver, Query } from '@nestjs/graphql';
import { MemberService } from './member.service';
import { Member, Members } from '../../libs/dto/member/member';
import { GoogleAuthInput, KakaoAuthInput, LoginInput, MemberInput, MembersInquiry } from '../../libs/dto/member/member.input';
import { UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/guards/auth.guard';
import { MemberUpdate } from '../../libs/dto/member/member.update';
import { AuthMember } from '../auth/decorators/authMember.decorator';
import { Types } from 'mongoose';
import { WithoutGuard } from '../auth/guards/without.guard';
import { shapeIntoMongoObjectId } from '../../libs/config';
import { MemberType } from '../../libs/enums/member.enum';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
@Resolver()
export class MemberResolver {
	constructor(private readonly memberService: MemberService) { }

	@Mutation(() => Member)
	public async signup(@Args('input') input: MemberInput): Promise<Member> {
		console.log('input', input);
		return await this.memberService.signup(input);
	}

	@Mutation(() => Member)
	public async login(@Args('input') input: LoginInput): Promise<Member> {
		console.log('Mutation: login', input);
		return await this.memberService.login(input);
	}

	@Mutation(() => Member)
	public async googleAuth(@Args('input') input: GoogleAuthInput): Promise<Member> {
		return await this.memberService.googleAuth(input);
	}

	@Mutation(() => Member)
	public async kakaoAuth(@Args('input') input: KakaoAuthInput): Promise<Member> {
		return await this.memberService.kakaoAuth(input);
	}

	@UseGuards(AuthGuard)
	@Mutation(() => Member)
	public async updateMember(
		@Args('input') input: MemberUpdate,
		@AuthMember('_id') memberId: Types.ObjectId,
	): Promise<Member> {
		console.log('Mutation: updateMember');
		delete input._id;
		return this.memberService.updateMember(memberId, input);
	}

	@UseGuards(WithoutGuard)
	@Query(() => Member)
	public async getMember(@Args('input') input: string, @AuthMember('_id') memberId: Types.ObjectId): Promise<Member> {
		console.log('Query: getMember');

		const targetId = shapeIntoMongoObjectId(input);
		return this.memberService.getMember(memberId, targetId);
	}

	// ADMIN
	@Roles(MemberType.ADMIN)
	@UseGuards(RolesGuard)
	@Query(() => Members)
	public async getAllMembersByAdmin(
		@Args('input') input: MembersInquiry,
	): Promise<Members> {
		return await this.memberService.getAllMembersByAdmin(input);
	}

	@Roles(MemberType.ADMIN)
	@UseGuards(RolesGuard)
	@Mutation(() => Member)
	public async updateMemberByAdmin(@Args('input') input: MemberUpdate): Promise<Member> {
		console.log('Mutation: updateMemberByAdmin');

		return await this.memberService.updateMemberByAdmin(input);
	}
}
