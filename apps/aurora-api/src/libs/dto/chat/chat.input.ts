import { Field, Int, InputType } from '@nestjs/graphql';
import { ObjectId } from 'mongoose';
import { IsIn, IsInt, IsNotEmpty, IsOptional, Max, Min } from 'class-validator';
import { ChatType } from '../../enums/chat.enum';
import { Direction } from '../../enums/common.enum';
import { availableChatSorts } from '../../config';

/**
 * Chat ochish/olish uchun. memberOneId — @AuthMember dan,
 * clientdan faqat suhbatdosh (memberTwoId) keladi.
 */
@InputType()
export class ChatInput {
	memberOneId?: ObjectId;

	@IsOptional()
	@Field(() => String, { nullable: true })
	memberTwoId?: ObjectId;

	@IsOptional()
	chatType: ChatType = ChatType.DIRECT;
}

@InputType()
class ChatSearch {
	@IsOptional()
	@Field(() => ChatType, { nullable: true })
	chatType?: ChatType;

	/** suhbatdosh bo'yicha filtrlash */
	@IsOptional()
	@Field(() => String, { nullable: true })
	memberId?: ObjectId;

	/** lastMessage ichidan qidirish */
	@IsOptional()
	@Field(() => String, { nullable: true })
	text?: string;
}

@InputType()
export class ChatsInquiry {
	@IsNotEmpty()
	@IsInt()
	@Min(1)
	@Field(() => Int)
	page: number;

	@IsNotEmpty()
	@IsInt()
	@Min(1)
	@Max(100)
	@Field(() => Int)
	limit: number;

	@IsOptional()
	@IsIn(availableChatSorts)
	@Field(() => String, { nullable: true })
	sort?: string;

	@IsOptional()
	@Field(() => Direction, { nullable: true })
	direction?: Direction;

	@IsOptional()
	@Field(() => ChatSearch, { nullable: true })
	search?: ChatSearch;
}
