import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import MessageSchema from '../../schemas/Message.model';

@Module({
	imports: [MongooseModule.forFeature([{ name: 'Message', schema: MessageSchema }])],
})
export class MessageModule {}
