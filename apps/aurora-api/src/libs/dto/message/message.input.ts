import { Field, Int, InputType } from '@nestjs/graphql';
import { ObjectId } from 'mongoose';
import {
	IsIn,
	IsInt,
	IsMongoId,
	IsNotEmpty,
	IsOptional,
	IsString,
	Length,
	Max,
	MaxLength,
	Min,
} from 'class-validator';
import { MessageType } from '../../enums/message.enum';
// import { availableMessageSorts } from '../../config';

@InputType()
export class MessageInput {
	@IsNotEmpty()
	@Field(() => String)
	chatId: ObjectId;

	@IsOptional()
	@Field(() => MessageType, { nullable: true, defaultValue: MessageType.TEXT })
	messageType?: MessageType;

	@IsNotEmpty()
	@Length(1, 1000)
	@Field(() => String)
	messageContent: string;

	@IsOptional()
	@IsString()
	@MaxLength(100)
	@Field(() => String, { nullable: true })
	clientMessageId?: string;
}

// @InputType()
// class MISearch {
// 	@IsOptional()
// 	@Field(() => String, { nullable: true })
// 	senderId?: ObjectId;

// 	@IsOptional()
// 	@Field(() => MessageType, { nullable: true })
// 	messageType?: MessageType;

// 	/** messageContent ichidan qidirish */
// 	@IsOptional()
// 	@Field(() => String, { nullable: true })
// 	text?: string;
// }

// @InputType()
// export class MessagesInquiry {
// 	@IsNotEmpty()
// 	@Field(() => String)
// 	chatId: ObjectId;

// 	@IsNotEmpty()
// 	@Min(1)
// 	@Field(() => Int)
// 	page: number;

// 	@IsNotEmpty()
// 	@Min(1)
// 	@Field(() => Int)
// 	limit: number;

// 	@IsOptional()
// 	@IsIn(availableMessageSorts)
// 	@Field(() => String, { nullable: true })
// 	sort?: string;

// 	@IsOptional()
// 	@Field(() => Direction, { nullable: true })
// 	direction?: Direction;

// 	@IsOptional()
// 	@Field(() => MISearch, { nullable: true })
// 	search?: MISearch;
// }

/**
 * Cursor-based variant: chat oynasida "yuqoriga scroll" uchun
 * page/limit dan ko'ra barqarorroq (yangi xabar kelsa sahifalar surilmaydi).
 */
@InputType()
export class MessagesCursorInquiry {
	@IsNotEmpty()
	@Field(() => String)
	chatId: ObjectId;

	@IsNotEmpty()
	@IsInt()
	@Min(1)
	@Max(100)
	@Field(() => Int)
	limit: number;

	@IsOptional()
	@Field(() => Date, { nullable: true })
	before?: Date;

	/** With `before`, the id of that message: messages sent in the same millisecond are not skipped **/
	@IsOptional()
	@IsMongoId()
	@Field(() => String, { nullable: true })
	beforeId?: string;
}
