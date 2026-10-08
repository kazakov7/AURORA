import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import ChatSchema from '../../schemas/Chat.model';
import ChatReadSchema from '../../schemas/ChatRead.model';
import MessageSchema from '../../schemas/Message.model';
import MemberSchema from '../../schemas/Member.model';
import { AuthModule } from '../auth/auth.module';
import { MessageModule } from '../message/message.module';
import { ChatGateway } from './chat.gateway';
import { ChatResolver } from './chat.resolver';
import { ChatService } from './chat.service';

@Module({
	imports: [
		MongooseModule.forFeature([{ name: 'Chat', schema: ChatSchema }]),
		MongooseModule.forFeature([{ name: 'ChatRead', schema: ChatReadSchema }]),
		MongooseModule.forFeature([{ name: 'Message', schema: MessageSchema }]),
		MongooseModule.forFeature([{ name: 'Member', schema: MemberSchema }]),
		AuthModule,
		MessageModule,
	],
	providers: [ChatResolver, ChatService, ChatGateway],
	exports: [ChatService, ChatGateway],
})
export class ChatModule {}
