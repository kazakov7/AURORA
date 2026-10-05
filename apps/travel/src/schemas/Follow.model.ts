import { Schema } from 'mongoose';

const FollowSchema = new Schema(
	{
		followingId: {
			type: Schema.Types.ObjectId,
			required: true,
		},

		followerId: {
			type: Schema.Types.ObjectId,
			required: true,
		},
	},
	{ timestamps: { createdAt: true, updatedAt: false }, collection: 'follows' },
);

FollowSchema.index({ followerId: 1, followingId: 1 }, { unique: true, name: 'follows_pair_uq' });
FollowSchema.index({ followingId: 1, createdAt: 1 }, { name: 'follows_followers_idx' });

export default FollowSchema;
