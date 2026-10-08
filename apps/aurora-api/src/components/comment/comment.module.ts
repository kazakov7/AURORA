import { Module } from '@nestjs/common';
import { CommentResolver } from './comment.resolver';
import { CommentService } from './comment.service';
import { MongooseModule } from '@nestjs/mongoose';
import MemberSchema from '../../schemas/Member.model';
import { AuthModule } from '../auth/auth.module';
import CommentSchema from '../../schemas/Comment.model';
import { MemberModule } from '../member/member.module';
import { BoardArticleModule } from '../article/board-article.module';
import { PropertyModule } from '../property/property.module';
import { TourModule } from '../tour/tour.module';
import { DestinationModule } from '../destination/destination.module';
import { NotificationModule } from '../notification/notification.module';
import PropertySchema from '../../schemas/Property.model';
import TourSchema from '../../schemas/Tour.model';
import BoardArticleSchema from '../../schemas/BoardArticle.model';


@Module({
	imports: [
		MongooseModule.forFeature([
			{ name: 'Comment', schema: CommentSchema }, { name: 'Property', schema: PropertySchema },
			{ name: 'Tour', schema: TourSchema }, { name: 'BoardArticle', schema: BoardArticleSchema },
		]),
		AuthModule,
		MemberModule,
		BoardArticleModule,
		PropertyModule,
		TourModule,
		DestinationModule,
		NotificationModule,
	],
	providers: [CommentResolver, CommentService],
	exports: [CommentService],
})
export class CommentModule { }
