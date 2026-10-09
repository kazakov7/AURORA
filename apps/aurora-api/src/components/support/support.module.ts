import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import SupportTicketSchema from '../../schemas/SupportTicket.model';
import { AuthModule } from '../auth/auth.module';
import { NotificationModule } from '../notification/notification.module';
import { SupportResolver } from './support.resolver';
import { SupportService } from './support.service';

@Module({
	imports: [MongooseModule.forFeature([{ name: 'SupportTicket', schema: SupportTicketSchema }]), AuthModule, NotificationModule],
	providers: [SupportResolver, SupportService],
	exports: [SupportService],
})
export class SupportModule {}
