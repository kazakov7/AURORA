import { Module } from '@nestjs/common';
import { AuroraBatchController } from './aurora-batch.controller';
import { AuroraBatchService } from './aurora-batch.service';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import AgentSchema from '../../aurora-api/src/schemas/Agent.model';
import BoardArticleSchema from '../../aurora-api/src/schemas/BoardArticle.model';
import BookingSchema from '../../aurora-api/src/schemas/Booking.model';
import CommentSchema from '../../aurora-api/src/schemas/Comment.model';
import DestinationSchema from '../../aurora-api/src/schemas/Destination.model';
import LikeSchema from '../../aurora-api/src/schemas/Like.model';
import MemberSchema from '../../aurora-api/src/schemas/Member.model';
import PropertySchema from '../../aurora-api/src/schemas/Property.model';
import RankingPublicationSchema from '../../aurora-api/src/schemas/RankingPublication.model';
import RankingSnapshotSchema from '../../aurora-api/src/schemas/RankingSnapshot.model';
import ReviewSchema from '../../aurora-api/src/schemas/Review.model';
import TourSchema from '../../aurora-api/src/schemas/Tour.model';
import TravelHistorySchema from '../../aurora-api/src/schemas/TravelHistory.model';
import ViewSchema from '../../aurora-api/src/schemas/View.model';
import BatchLockSchema from './schemas/batch-lock.schema';

@Module({
	imports: [
		ConfigModule.forRoot(),
		MongooseModule.forRootAsync({
			useFactory: () => {
				const uri =
					process.env.NODE_ENV === 'production'
						? process.env.MONGO_PROD
						: process.env.MONGO_DEV;

				if (!uri) {
					throw new Error('MongoDB URI is missing');
				}

				console.log('Batch DB:', new URL(uri).pathname.slice(1));

				return { uri };
			},
		}),
		MongooseModule.forFeature([
			{ name: 'Destination', schema: DestinationSchema }, { name: 'Property', schema: PropertySchema },
			{ name: 'Tour', schema: TourSchema }, { name: 'Booking', schema: BookingSchema },
			{ name: 'TravelHistory', schema: TravelHistorySchema }, { name: 'Member', schema: MemberSchema },
			{ name: 'Agent', schema: AgentSchema }, { name: 'Review', schema: ReviewSchema },
			{ name: 'Like', schema: LikeSchema }, { name: 'View', schema: ViewSchema },
			{ name: 'Comment', schema: CommentSchema }, { name: 'BoardArticle', schema: BoardArticleSchema },
			{ name: 'RankingSnapshot', schema: RankingSnapshotSchema },
			{ name: 'RankingPublication', schema: RankingPublicationSchema }, { name: 'BatchLock', schema: BatchLockSchema },
		]),
	],
	controllers: [AuroraBatchController],
	providers: [AuroraBatchService],
})
export class AuroraBatchModule { }
