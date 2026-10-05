import { Field, ObjectType } from '@nestjs/graphql';
import { ObjectId } from 'mongoose';
import { ChatType } from '../../enums/chat.enum';
import { Member, TotalCounter } from '../member/member';

@ObjectType()
export class Chat {
	@Field(() => String)
	_id: ObjectId;

	@Field(() => ChatType)
	chatType: ChatType;

	@Field(() => String, { nullable: true })
	memberOneId?: ObjectId;

	@Field(() => String, { nullable: true })
	memberTwoId?: ObjectId;

	@Field(() => String, { nullable: true })
	directKey?: string;

	@Field(() => String, { nullable: true })
	lastMessage?: string;

	@Field(() => Date, { nullable: true })
	lastMessageAt?: Date;

	@Field(() => Date)
	createdAt: Date;

	@Field(() => Date)
	updatedAt: Date;

	/** from aggregation ($lookup) */
	@Field(() => Member, { nullable: true })
	memberOneData?: Member;

	@Field(() => Member, { nullable: true })
	memberTwoData?: Member;
}

@ObjectType()
export class Chats {
	@Field(() => [Chat])
	list: Chat[];

	@Field(() => [TotalCounter], { nullable: true })
	metaCounter: TotalCounter[];
}
