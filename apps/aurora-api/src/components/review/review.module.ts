import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import ReviewSchema from '../../schemas/Review.model';
import { AuthModule } from '../auth/auth.module';
import { DestinationModule } from '../destination/destination.module';
import { ReviewResolver } from './review.resolver';
import { ReviewService } from './review.service';

@Module({
	imports: [
		MongooseModule.forFeature([{ name: 'Review', schema: ReviewSchema }]),
		AuthModule,
		DestinationModule,
	],
	providers: [ReviewResolver, ReviewService],
	exports: [ReviewService],
})
export class ReviewModule {}
