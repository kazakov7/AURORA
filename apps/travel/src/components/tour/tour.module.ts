import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import TourSchema from '../../schemas/Tour.model';
import { AuthModule } from '../auth/auth.module';
import { LikeModule } from '../like/like.module';
import { MemberModule } from '../member/member.module';
import { ViewModule } from '../view/view.module';
import { TourResolver } from './tour.resolver';
import { TourService } from './tour.service';
import { AgentModule } from '../agent/agent.module';

@Module({
	imports: [
		MongooseModule.forFeature([{ name: 'Tour', schema: TourSchema }]),
		AuthModule,
		MemberModule,
		LikeModule,
		ViewModule,
		AgentModule,
	],
	providers: [TourResolver, TourService],
	exports: [TourService],
})
export class TourModule {}
