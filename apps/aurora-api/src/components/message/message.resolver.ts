import { UseGuards } from '@nestjs/common';
import { Args, Query, Resolver } from '@nestjs/graphql';
import { Types } from 'mongoose';
import { shapeIntoMongoObjectId } from '../../libs/config';
import { Messages } from '../../libs/dto/message/message';
import { MessagesCursorInquiry } from '../../libs/dto/message/message.input';
import { AuthMember } from '../auth/decorators/authMember.decorator';
import { AuthGuard } from '../auth/guards/auth.guard';
import { MessageService } from './message.service';

@Resolver()
export class MessageResolver {
	constructor(private readonly messageService: MessageService) { }

	@UseGuards(AuthGuard)
	@Query(() => Messages)
	public async getMessages(
		@Args('input') input: MessagesCursorInquiry,
		@AuthMember('_id') memberId: Types.ObjectId,
	): Promise<Messages> {
		input.chatId = shapeIntoMongoObjectId(input.chatId) as any;
		return await this.messageService.getMessages(memberId, input);
	}
}
