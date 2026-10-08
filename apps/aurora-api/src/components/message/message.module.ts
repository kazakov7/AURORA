import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import MessageSchema from '../../schemas/Message.model';
import ChatReadSchema from '../../schemas/ChatRead.model';
import ChatSchema from '../../schemas/Chat.model';
import MemberSchema from '../../schemas/Member.model';
import { AuthModule } from '../auth/auth.module';
import { MessageResolver } from './message.resolver';
import { MessageService } from './message.service';

@Module({
	imports: [
		MongooseModule.forFeature([
			{ name: 'Message', schema: MessageSchema },
			{ name: 'ChatRead', schema: ChatReadSchema },
		]),
		MongooseModule.forFeature([{ name: 'Chat', schema: ChatSchema }]),
		MongooseModule.forFeature([{ name: 'Member', schema: MemberSchema }]),
		AuthModule,
	],
	providers: [MessageResolver, MessageService],
	exports: [MessageService],
})
export class MessageModule {}
