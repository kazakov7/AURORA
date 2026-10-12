import { Schema } from 'mongoose';
import { RankingScope, RankingType } from '../libs/enums/ranking.enum';

const RankingSnapshotSchema = new Schema(
	{
		publicationId: { type: Schema.Types.ObjectId, required: true, index: true },
		rankingType: { type: String, enum: RankingType, required: true },
		scope: { type: String, enum: RankingScope, required: true },
		destinationId: { type: Schema.Types.ObjectId, ref: 'Destination', default: null },
		periodDays: { type: Number, required: true },
		entries: [
			{
				entityId: { type: Schema.Types.ObjectId, required: true },
				score: { type: Number, required: true },
			},
		],
		calculatedAt: { type: Date, required: true },
	},
	{ timestamps: true, collection: 'ranking-snapshots' },
);

RankingSnapshotSchema.index(
	{ publicationId: 1, rankingType: 1, scope: 1, destinationId: 1 },
	{ unique: true, name: 'ranking_snapshot_publication_scope_uq' },
);

export default RankingSnapshotSchema;
