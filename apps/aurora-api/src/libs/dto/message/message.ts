import { Field, ObjectType } from '@nestjs/graphql';
import { ObjectId } from 'mongoose';
import { MessageType } from '../../enums/message.enum';
import { Member, TotalCounter } from '../member/member';

@ObjectType()
export class Message {
	@Field(() => String)
	_id: ObjectId;

	@Field(() => String)
	chatId: ObjectId;

	@Field(() => String)
	senderId: ObjectId;

	@Field(() => MessageType)
	messageType: MessageType;

	@Field(() => String, { nullable: true })
	messageContent?: string;

	@Field(() => String, { nullable: true })
	clientMessageId?: string;

	@Field(() => Date)
	createdAt: Date;

	@Field(() => Date)
	updatedAt: Date;

	/** from aggregation ($lookup) */
	@Field(() => Member, { nullable: true })
	senderData?: Member;
}

@ObjectType()
export class Messages {
	@Field(() => [Message])
	list: Message[];

	@Field(() => [TotalCounter], { nullable: true })
	metaCounter: TotalCounter[];

	@Field(() => Date, { nullable: true })
	nextCursor?: Date;
}
