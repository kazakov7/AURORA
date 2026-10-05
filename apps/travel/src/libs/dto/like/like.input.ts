import { Field, InputType } from '@nestjs/graphql';
import { IsIn, IsNotEmpty } from 'class-validator';
import { Types } from 'mongoose';
import { LikeGroup } from '../../enums/like.enum';

@InputType()
export class LikeInput {
	@IsNotEmpty()
	memberId: Types.ObjectId;

	@IsNotEmpty()
	@Field(() => String)
	likeRefId: Types.ObjectId;

	@IsNotEmpty()
	@IsIn([LikeGroup.PROPERTY, LikeGroup.TOUR, LikeGroup.ARTICLE])
	@Field(() => LikeGroup)
	likeGroup: LikeGroup;
}
