import { Field, InputType, Int } from '@nestjs/graphql';
import { IsEmail, IsEnum, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import { Direction } from '../../enums/common.enum';
import { SupportCategory, SupportStatus } from '../../enums/support.enum';

@InputType()
export class SupportTicketInput {
	@Field(() => SupportCategory)
	@IsNotEmpty()
	@IsEnum(SupportCategory)
	ticketCategory: SupportCategory;

	@Field(() => String)
	@IsString()
	@Length(2, 100)
	ticketName: string;

	@Field(() => String)
	@IsEmail()
	ticketEmail: string;

	@Field(() => String)
	@IsString()
	@Length(3, 200)
	ticketSubject: string;

	@Field(() => String)
	@IsString()
	@Length(10, 5000)
	ticketMessage: string;

	@Field(() => String, { nullable: true })
	@IsOptional()
	@IsString()
	ticketAttachment?: string;
}

@InputType()
export class SupportTicketUpdate {
	@Field(() => String)
	@IsNotEmpty()
	_id: string;

	@Field(() => SupportStatus, { nullable: true })
	@IsOptional()
	@IsEnum(SupportStatus)
	ticketStatus?: SupportStatus;

	@Field(() => String, { nullable: true })
	@IsOptional()
	@IsString()
	@Length(1, 5000)
	ticketReply?: string;
}

@InputType()
class SupportTicketSearch {
	@Field(() => SupportCategory, { nullable: true })
	@IsOptional()
	@IsEnum(SupportCategory)
	ticketCategory?: SupportCategory;

	@Field(() => SupportStatus, { nullable: true })
	@IsOptional()
	@IsEnum(SupportStatus)
	ticketStatus?: SupportStatus;

	@Field(() => String, { nullable: true })
	@IsOptional()
	@IsString()
	text?: string;
}

@InputType()
export class SupportTicketsInquiry {
	@Field(() => Int)
	@IsInt()
	@Min(1)
	page: number;

	@Field(() => Int)
	@IsInt()
	@Min(1)
	@Max(100)
	limit: number;

	@Field(() => String, { nullable: true })
	@IsOptional()
	@IsIn(['createdAt', 'updatedAt', 'ticketStatus', 'ticketCategory'])
	sort?: string;

	@Field(() => Direction, { nullable: true })
	@IsOptional()
	direction?: Direction;

	@Field(() => SupportTicketSearch, { nullable: true })
	@IsOptional()
	search?: SupportTicketSearch;
}
