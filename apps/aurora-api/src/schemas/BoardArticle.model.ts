import { Schema } from 'mongoose';
import { BoardArticleCategory, BoardArticleStatus } from '../libs/enums/board-article.enum';

const BoardArticleSchema = new Schema(
	{
		articleCategory: {
			type: String,
			enum: BoardArticleCategory,
			required: true,
		},

		articleStatus: {
			type: String,
			enum: BoardArticleStatus,
			default: BoardArticleStatus.PUBLISHED,
		},

		articleTitle: {
			type: String,
			required: true,
			trim: true,
		},

		articleContent: {
			type: String,
			required: true,
			trim: true,
		},

		articleImage: {
			type: String,
		},

		articleLikes: {
			type: Number,
			default: 0,
		},

		articleViews: {
			type: Number,
			default: 0,
		},

		articleComments: {
			type: Number,
			default: 0,
		},

		articleRating: {
			type: Number,
			default: 0,
			min: 0,
			max: 5,
		},

		articleReviews: {
			type: Number,
			default: 0,
		},

		memberId: {
			type: Schema.Types.ObjectId,
			required: true,
			ref: 'Member',
		},

		deletedAt: {
			type: Date,
			default: null,
		},
	},
	{
		timestamps: true,
		collection: 'articles',
	},
);

BoardArticleSchema.index(
	{
		articleStatus: 1,
		articleCategory: 1,
		createdAt: 1,
	},
	{ name: 'articles_feed_idx' },
);
BoardArticleSchema.index({ memberId: 1, createdAt: 1 }, { name: 'articles_author_idx' });

export default BoardArticleSchema;
