import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Types } from 'mongoose';
import { shapeIntoMongoObjectId } from '../../libs/config';
import { SupportTicket, SupportTickets } from '../../libs/dto/support/support';
import {
	SupportTicketInput,
	SupportTicketsInquiry,
	SupportTicketUpdate,
} from '../../libs/dto/support/support.input';
import { MemberType } from '../../libs/enums/member.enum';
import { AuthMember } from '../auth/decorators/authMember.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SupportService } from './support.service';

@Resolver()
export class SupportResolver {
	constructor(private readonly supportService: SupportService) {}

	@UseGuards(AuthGuard)
	@Mutation(() => SupportTicket)
	public async createSupportTicket(
		@Args('input') input: SupportTicketInput,
		@AuthMember('_id') memberId: Types.ObjectId,
	): Promise<SupportTicket> {
		return await this.supportService.createSupportTicket(memberId, input);
	}

	@UseGuards(AuthGuard)
	@Query(() => SupportTickets)
	public async getMySupportTickets(
		@Args('input') input: SupportTicketsInquiry,
		@AuthMember('_id') memberId: Types.ObjectId,
	): Promise<SupportTickets> {
		return await this.supportService.getMySupportTickets(memberId, input);
	}

	@Roles(MemberType.ADMIN)
	@UseGuards(RolesGuard)
	@Query(() => SupportTickets)
	public async getAllSupportTicketsByAdmin(
		@Args('input') input: SupportTicketsInquiry,
	): Promise<SupportTickets> {
		return await this.supportService.getAllSupportTicketsByAdmin(input);
	}

	@Roles(MemberType.ADMIN)
	@UseGuards(RolesGuard)
	@Mutation(() => SupportTicket)
	public async updateSupportTicketByAdmin(
		@Args('input') input: SupportTicketUpdate,
		@AuthMember('_id') adminId: Types.ObjectId,
	): Promise<SupportTicket> {
		input._id = shapeIntoMongoObjectId(input._id) as unknown as string;
		return await this.supportService.updateSupportTicketByAdmin(adminId, input);
	}
}
