import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import DestinationSchema from '../../schemas/Destination.model';
import PropertySchema from '../../schemas/Property.model';
import TourSchema from '../../schemas/Tour.model';
import { AuthModule } from '../auth/auth.module';
import { LikeModule } from '../like/like.module';
import { ViewModule } from '../view/view.module';
import { MemberModule } from '../member/member.module';
import { DestinationResolver } from './destination.resolver';
import { DestinationService } from './destination.service';

@Module({
	imports: [
		MongooseModule.forFeature([{ name: 'Destination', schema: DestinationSchema }]),
		MongooseModule.forFeature([{ name: 'Property', schema: PropertySchema }]),
		MongooseModule.forFeature([{ name: 'Tour', schema: TourSchema }]),
		AuthModule,
		LikeModule,
		ViewModule,
		MemberModule,
	],
	providers: [DestinationResolver, DestinationService],
	exports: [DestinationService],
})
export class DestinationModule {}
