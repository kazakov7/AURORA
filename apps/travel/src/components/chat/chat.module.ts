import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import ChatSchema from '../../schemas/Chat.model';

@Module({
	imports: [MongooseModule.forFeature([{ name: 'Chat', schema: ChatSchema }])],
})
export class ChatModule {}
