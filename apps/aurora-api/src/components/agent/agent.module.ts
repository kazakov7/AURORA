import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AgentResolver } from './agent.resolver';
import { AgentService } from './agent.service';
import AgentSchema from '../../schemas/Agent.model';
import MemberSchema from '../../schemas/Member.model';
import { AuthModule } from '../auth/auth.module';
import { NotificationModule } from '../notification/notification.module';
import { MemberModule } from '../member/member.module';

@Module({
	imports: [
		MongooseModule.forFeature([
			{ name: 'Agent', schema: AgentSchema },
			{ name: 'Member', schema: MemberSchema },
		]),
		AuthModule,
		NotificationModule,
		MemberModule,
	],
	providers: [AgentResolver, AgentService],
	exports: [AgentService],
})
export class AgentModule {}
