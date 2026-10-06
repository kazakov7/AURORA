import { Schema } from 'mongoose';
import { ViewGroup } from '../libs/enums/view.enum';

const ViewSchema = new Schema(
	{
		viewGroup: {
			type: String,
			enum: ViewGroup,
			required: true,
		},

		viewRefId: {
			type: Schema.Types.ObjectId,
			required: true,
		},

		memberId: {
			type: Schema.Types.ObjectId,
			ref: 'Member',
		},
	},
	{ timestamps: { createdAt: true, updatedAt: false }, collection: 'views' },
);

ViewSchema.index({ viewGroup: 1, viewRefId: 1, createdAt: 1 }, { name: 'views_target_idx' });
ViewSchema.index({ memberId: 1, createdAt: 1 }, { name: 'views_member_idx' });

export default ViewSchema;
