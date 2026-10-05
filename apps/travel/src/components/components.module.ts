import { Module } from '@nestjs/common';
import { MemberModule } from './member/member.module';
import { AuthModule } from './auth/auth.module';
import { PropertyModule } from './property/property.module';
import { TourModule } from './tour/tour.module';
import { LikeModule } from './like/like.module';
import { ViewModule } from './view/view.module';
import { CommentModule } from './comment/comment.module';
import { ArticleDataModule } from './article/article-data.module';
import { AgentModule } from './agent/agent.module';
import { DestinationModule } from './destination/destination.module';
import { BookingModule } from './booking/booking.module';
import { PaymentModule } from './payment/payment.module';
import { ReviewModule } from './review/review.module';
import { ChatModule } from './chat/chat.module';
import { MessageModule } from './message/message.module';
import { NotificationModule } from './notification/notification.module';
import { NoticeModule } from './notice/notice.module';
import { FollowModule } from './follow/follow.module';
import { TravelHistoryModule } from './travel-history/travel-history.module';

@Module({
	imports: [
		MemberModule,
		AuthModule,
		AgentModule,
		DestinationModule,
		PropertyModule,
		TourModule,
		BookingModule,
		PaymentModule,
		ReviewModule,
		LikeModule,
		ViewModule,
		CommentModule,
		FollowModule,
		ArticleDataModule,
		NotificationModule,
		NoticeModule,
		ChatModule,
		MessageModule,
		TravelHistoryModule,
	],
})
export class ComponentsModule {}
