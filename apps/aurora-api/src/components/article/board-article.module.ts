import { Module } from '@nestjs/common';
import { BoardArticleService } from './board-article.service';
import { BoardArticleResolver } from './board-article.resolver';
import { AuthModule } from '../auth/auth.module';
import { MemberModule } from '../member/member.module';
import { ViewModule } from '../view/view.module';
import BoardArticleSchema from '../../schemas/BoardArticle.model';
import CommentSchema from '../../schemas/Comment.model';
import LikeSchema from '../../schemas/Like.model';
import ViewSchema from '../../schemas/View.model';
import NotificationSchema from '../../schemas/Notification.model';
import { LikeModule } from '../like/like.module';
import { MongooseModule } from '@nestjs/mongoose';
import { NotificationModule } from '../notification/notification.module';

@Module({
	imports: [
		MongooseModule.forFeature([
			{ name: 'BoardArticle', schema: BoardArticleSchema },
			{ name: 'Comment', schema: CommentSchema },
			{ name: 'Like', schema: LikeSchema },
			{ name: 'View', schema: ViewSchema },
			{ name: 'Notification', schema: NotificationSchema },
		]),
		AuthModule,
		ViewModule,
		MemberModule,
		LikeModule,
		NotificationModule,
	],
	providers: [BoardArticleService, BoardArticleResolver],
	exports: [BoardArticleService],
})
export class BoardArticleModule {}
