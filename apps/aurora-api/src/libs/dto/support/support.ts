import { Field, ObjectType } from '@nestjs/graphql';
import { SupportCategory, SupportStatus } from '../../enums/support.enum';
import { TotalCounter } from '../member/member';

@ObjectType()
export class SupportTicket {
	@Field(() => String)
	_id: string;

	@Field(() => SupportCategory)
	ticketCategory: SupportCategory;

	@Field(() => SupportStatus)
	ticketStatus: SupportStatus;

	@Field(() => String)
	ticketName: string;

	@Field(() => String)
	ticketEmail: string;

	@Field(() => String)
	ticketSubject: string;

	@Field(() => String)
	ticketMessage: string;

	@Field(() => String, { nullable: true })
	ticketAttachment?: string;

	@Field(() => String, { nullable: true })
	ticketReply?: string;

	@Field(() => Date, { nullable: true })
	repliedAt?: Date;

	@Field(() => String)
	memberId: string;

	@Field(() => Date)
	createdAt: Date;

	@Field(() => Date)
	updatedAt: Date;
}

@ObjectType()
export class SupportTickets {
	@Field(() => [SupportTicket])
	list: SupportTicket[];

	@Field(() => [TotalCounter], { nullable: true })
	metaCounter?: TotalCounter[];
}
