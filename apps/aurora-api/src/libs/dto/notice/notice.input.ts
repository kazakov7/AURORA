import { Field, InputType, Int } from '@nestjs/graphql';
import { IsEnum, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import { Direction } from '../../enums/common.enum';
import { NoticeCategory, NoticeStatus } from '../../enums/notice.enum';

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
	@Field(() => String)
	@IsNotEmpty()
	_id: string;

	@Field(() => NoticeCategory, { nullable: true })
	@IsOptional()
	@IsEnum(NoticeCategory)
	noticeCategory?: NoticeCategory;

	@Field(() => NoticeStatus, { nullable: true })
	@IsOptional()
	@IsEnum(NoticeStatus)
	noticeStatus?: NoticeStatus;

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

@InputType()
class NoticeSearch {
	@Field(() => NoticeCategory, { nullable: true })
	@IsOptional()
	@IsEnum(NoticeCategory)
	noticeCategory?: NoticeCategory;

	@Field(() => NoticeStatus, { nullable: true })
	@IsOptional()
	@IsEnum(NoticeStatus)
	noticeStatus?: NoticeStatus;

	@Field(() => String, { nullable: true })
	@IsOptional()
	@IsString()
	text?: string;
}

@InputType()
export class NoticesInquiry {
	@Field(() => Int)
	@IsInt()
	@Min(1)
	page: number;

	@Field(() => Int)
	@IsInt()
	@Min(1)
	@Max(100)
	limit: number;

	@Field(() => String, { nullable: true })
	@IsOptional()
	@IsIn(['createdAt', 'updatedAt', 'noticeCategory'])
	sort?: string;

	@Field(() => Direction, { nullable: true })
	@IsOptional()
	direction?: Direction;

	@Field(() => NoticeSearch, { nullable: true })
	@IsOptional()
	search?: NoticeSearch;
}
