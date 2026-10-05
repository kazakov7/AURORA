import { Schema } from 'mongoose';
import { DestinationStatus } from '../libs/enums/destination';

const DestinationSchema = new Schema(
	{
		destinationStatus: {
			type: String,
			enum: DestinationStatus,
			default: DestinationStatus.ACTIVE,
			index: true,
		},

		destinationName: {
			type: String,
			required: true,
			trim: true,
		},

		destinationSlug: {
			type: String,
			required: true,
			unique: true,
			lowercase: true,
			trim: true,
			index: true,
		},

		destinationCountry: {
			type: String,
			required: true,
			trim: true,
		},

		latitude: Number,

		longitude: Number,
		destinationImages: {
			type: [String],
			default: [],
		},

		destinationDesc: {
			type: String,
			maxlength: 2000,
			minLength: 5,
		},

		destinationViews: {
			type: Number,
			default: 0,
		},

		destinationProperties: {
			type: Number,
			default: 0,
		},

		destinationTours: {
			type: Number,
			default: 0,
		},
		deletedAt: {
			type: Date,
			default: null,
		},
	},
	{
		timestamps: true,
		collection: 'destinations',
	},
);

DestinationSchema.index({ destinationStatus: 1, createdAt: 1 }, { name: 'destination_status_created_idx' });

export default DestinationSchema;
