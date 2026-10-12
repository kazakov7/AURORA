import { Schema } from 'mongoose';

const RankingPublicationSchema = new Schema(
	{
		isActive: { type: Boolean, default: false, index: true },
		publishedAt: { type: Date, required: true },
		calculatedAt: { type: Date, required: true },
		snapshotCount: { type: Number, required: true },
	},
	{ timestamps: true, collection: 'ranking-publications' },
);

RankingPublicationSchema.index(
	{ isActive: 1, publishedAt: -1 },
	{ name: 'ranking_publication_active_idx' },
);

export default RankingPublicationSchema;
