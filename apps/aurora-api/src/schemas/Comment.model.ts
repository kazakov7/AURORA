import { Schema } from 'mongoose';
import { CommentGroup, CommentStatus } from '../libs/enums/comment.enum';

const CommentSchema = new Schema(
	{
		commentStatus: {
			type: String,
			enum: CommentStatus,
			default: CommentStatus.ACTIVE,
		},

		commentGroup: {
			type: String,
			enum: CommentGroup,
			required: true,
		},

		commentContent: {
			type: String,
			required: true,
		},

		commentRefId: {
			type: Schema.Types.ObjectId,
			required: true,
		},

		memberId: {
			type: Schema.Types.ObjectId,
			required: true,
		},

		deletedAt: {
			type: Date,
			default: null,
		},
	},
	{ timestamps: true, collection: 'comments' },
);

CommentSchema.index(
	{ commentGroup: 1, commentRefId: 1, createdAt: 1 },
	{ name: 'comments_target_idx' },
);
CommentSchema.index({ memberId: 1, createdAt: 1 }, { name: 'comments_author_idx' });

export default CommentSchema;
