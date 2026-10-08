import { Schema } from 'mongoose';

const BatchLockSchema = new Schema(
	{
		_id: { type: String, required: true },
		owner: { type: String, required: true },
		lockUntil: { type: Date, required: true },
	},
	{ timestamps: true, collection: 'batch-locks' },
);

export default BatchLockSchema;
