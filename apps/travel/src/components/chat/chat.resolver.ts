import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Types } from 'mongoose';
import { shapeIntoMongoObjectId } from '../../libs/config';
import { Chat, Chats } from '../../libs/dto/chat/chat';
import { ChatsInquiry } from '../../libs/dto/chat/chat.input';
import { AuthMember } from '../auth/decorators/authMember.decorator';
import { AuthGuard } from '../auth/guards/auth.guard';
import { ChatService } from './chat.service';

@Resolver()
export class ChatResolver {
	constructor(private readonly chatService: ChatService) { }

	@UseGuards(AuthGuard)
	@Mutation(() => Chat)
	public async getOrCreateDirectChat(
		@Args('memberTwoId') memberTwoId: string,
		@AuthMember('_id') memberOneId: Types.ObjectId,
	): Promise<Chat> {
		return await this.chatService.getOrCreateDirectChat(memberOneId, shapeIntoMongoObjectId(memberTwoId));
	}

	@UseGuards(AuthGuard)
	@Query(() => Chats)
	public async getMyChats(
		@Args('input') input: ChatsInquiry,
		@AuthMember('_id') memberId: Types.ObjectId,
	): Promise<Chats> {
		if (input.search?.memberId) input.search.memberId = shapeIntoMongoObjectId(input.search.memberId) as any;
		return await this.chatService.getMyChats(memberId, input);
	}

	@UseGuards(AuthGuard)
	@Query(() => Chat)
	public async getGlobalChat(): Promise<Chat> {
		return await this.chatService.getGlobalChat();
	}
}
