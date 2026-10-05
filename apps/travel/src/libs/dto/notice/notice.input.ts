import { Field, InputType } from '@nestjs/graphql';
import { IsNotEmpty, IsOptional, IsString, Length } from 'class-validator';
import { NoticeCategory } from '../../enums/notice.enum';

@InputType()
export class NoticeInput {
	memberId?: string;

	@Field(() => NoticeCategory)
	@IsNotEmpty()
	noticeCategory: NoticeCategory;

	@Field(() => String)
	@IsString()
	@Length(3, 200)
	noticeTitle: string;

	@Field(() => String)
	@IsString()
	@Length(3, 10000)
	noticeContent: string;
}

@InputType()
export class NoticeUpdate {
	@Field({ nullable: true })
	@IsOptional()
	@IsString()
	@Length(3, 200)
	noticeTitle?: string;

	@Field({ nullable: true })
	@IsOptional()
	@IsString()
	@Length(3, 10000)
	noticeContent?: string;
}
