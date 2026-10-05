import { Schema, Types } from 'mongoose';
import { TourStatus } from '../libs/enums/tour.enum';

const TourSchema = new Schema(
	{
		memberId: {
			type: Types.ObjectId,
			ref: 'Member',
			required: true,
			index: true,
		},

		destinationId: {
			type: Types.ObjectId,
			ref: 'Destination',
			required: true,
			index: true,
		},

		tourName: {
			type: String,
			required: true,
			trim: true,
		},

		tourSlug: {
			type: String,
			required: true,
			unique: true,
			lowercase: true,
			trim: true,
			index: true,
		},

		tourDesc: {
			type: String,
			trim: true,
		},

		tourStatus: {
			type: String,
			enum: TourStatus,
			default: TourStatus.PENDING,
			index: true,
		},

		tourPrice: {
			type: Number,
			required: true,
			min: 0,
		},

		tourCurrency: {
			type: String,
			required: true,
		},

		tourStartDate: {
			type: Date,
			required: true,
		},

		tourEndDate: {
			type: Date,
			required: true,
		},

		tourCapacity: {
			type: Number,
			required: true,
			min: 1,
		},

		tourReservedSeats: {
			type: Number,
			default: 0,
			min: 0,
		},

		tourDepartureCountry: {
			type: String,
			trim: true,
		},
		tourDepartureCity: {
			type: String,
			trim: true,
		},
		tourDeparturePlace: {
			type: String,
			trim: true,
		},
		tourDestinationCity: {
			type: String,
			trim: true,
		},

		tourImages: {
			type: [String],
			default: [],
		},

		tourAdditionalInfo: {
			type: String,
			trim: true,
		},

		tourViews: {
			type: Number,
			default: 0,
			min: 0,
		},

		tourLikes: {
			type: Number,
			default: 0,
			min: 0,
		},

		tourComments: {
			type: Number,
			default: 0,
			min: 0,
		},
		tourRating: {
			type: Number,
			default: 0,
			min: 0,
			max: 5,
		},

		tourReviews: {
			type: Number,
			default: 0,
			min: 0,
		},

		deletedAt: {
			type: Date,
			default: null,
		},
	},
	{
		timestamps: true,
		collection: 'tours',
	},
);

TourSchema.index({ destinationId: 1, tourStatus: 1, tourStartDate: 1 }, { name: 'tour_search_idx' });
TourSchema.index({ memberId: 1, createdAt: 1 }, { name: 'tour_owner_idx' });

export default TourSchema;
