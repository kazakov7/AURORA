import { Field, ObjectType } from '@nestjs/graphql';

import { ObjectId, Types } from 'mongoose';
import { LikeGroup } from '../../enums/like.enum';

@ObjectType()
export class MeLiked {
	@Field(() => String)
	memberId: Types.ObjectId;

	@Field(() => String)
	likeRefId: Types.ObjectId;

	@Field(() => Boolean)
	myFavorite: boolean;
}

@ObjectType()
export class Like {
	@Field(() => String)
	_id: Types.ObjectId;

	@Field(() => LikeGroup)
	likeGroup: LikeGroup;

	@Field(() => String)
	likeRefId: Types.ObjectId;

	@Field(() => String)
	memberId: Types.ObjectId;

	@Field(() => Date)
	createdAt: Date;
}
