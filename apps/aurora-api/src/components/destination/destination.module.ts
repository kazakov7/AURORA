import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import DestinationSchema from '../../schemas/Destination.model';
import { AuthModule } from '../auth/auth.module';
import { LikeModule } from '../like/like.module';
import { ViewModule } from '../view/view.module';
import { DestinationResolver } from './destination.resolver';
import { DestinationService } from './destination.service';

@Module({
	imports: [
		MongooseModule.forFeature([{ name: 'Destination', schema: DestinationSchema }]),
		AuthModule,
		LikeModule,
		ViewModule,
	],
	providers: [DestinationResolver, DestinationService],
	exports: [DestinationService],
})
export class DestinationModule {}
