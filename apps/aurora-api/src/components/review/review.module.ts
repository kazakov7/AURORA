import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import ReviewSchema from '../../schemas/Review.model';
import { AuthModule } from '../auth/auth.module';
import { DestinationModule } from '../destination/destination.module';
import { ReviewResolver } from './review.resolver';
import { ReviewService } from './review.service';
import PropertySchema from '../../schemas/Property.model';
import TourSchema from '../../schemas/Tour.model';
import BoardArticleSchema from '../../schemas/BoardArticle.model';
import { NotificationModule } from '../notification/notification.module';

@Module({
	imports: [
		MongooseModule.forFeature([
			{ name: 'Review', schema: ReviewSchema },
			{ name: 'Property', schema: PropertySchema },
			{ name: 'Tour', schema: TourSchema },
			{ name: 'BoardArticle', schema: BoardArticleSchema },
		]),
		AuthModule,
		DestinationModule,
		NotificationModule,
	],
	providers: [ReviewResolver, ReviewService],
	exports: [ReviewService],
})
export class ReviewModule {}
