import { Schema } from 'mongoose';
import { LikeGroup } from '../libs/enums/like.enum';

const LikeSchema = new Schema(
	{
		likeGroup: {
			type: String,
			enum: LikeGroup,
			required: true,
		},

		likeRefId: {
			type: Schema.Types.ObjectId,
			required: true,
		},

		memberId: {
			type: Schema.Types.ObjectId,
			required: true,
			ref: 'Member',
		},
	},
	{ timestamps: { createdAt: true, updatedAt: false }, collection: 'likes' },
);

LikeSchema.index(
	{ memberId: 1, likeGroup: 1, likeRefId: 1 },
	{ unique: true, name: 'likes_unique_member_target' },
);
LikeSchema.index({ likeGroup: 1, likeRefId: 1 }, { name: 'likes_target_idx' });

export default LikeSchema;
