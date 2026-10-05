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


@Module({
	imports: [
		MongooseModule.forFeature([{ name: 'Comment', schema: CommentSchema }]),
		AuthModule,
		MemberModule,
		BoardArticleModule,
		PropertyModule,
	],
	providers: [CommentResolver, CommentService],
	exports: [CommentService],
})
export class CommentModule { }
