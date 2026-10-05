import { Schema } from 'mongoose';
import { PropertyStatus, PropertyType } from '../libs/enums/property.enum';

const PropertySchema = new Schema(
	{
		memberId: {
			type: Schema.Types.ObjectId,
			ref: 'Member',
			required: true,
			index: true,
		},
		destinationId: {
			type: Schema.Types.ObjectId,
			ref: 'Destination',
			required: true,
			index: true,
		},
		propertyType: {
			type: String,
			enum: PropertyType,
			required: true,
		},
		propertyStatus: {
			type: String,
			enum: PropertyStatus,
			default: PropertyStatus.PENDING,
			index: true,
		},

		propertyName: {
			type: String,
			required: true,
			trim: true,
			index: true,
		},

		propertyDesc: {
			type: String,
			maxlength: 3000,
			minLength: 5,
		},

		propertyCity: {
			type: String,
			trim: true,
		},

		propertyAddress: {
			type: String,
			required: true,
		},
		propertyImages: [
			{
				type: String,
			},
		],

		pricePerNight: {
			type: Number,
			required: true,
			min: 0,
		},

		currency: {
			type: String,
			required: true,
		},

		maxGuests: {
			type: Number,
			required: true,
			min: 1,
		},

		bedrooms: {
			type: Number,
			default: 1,
			min: 0,
		},

		beds: {
			type: Number,
			default: 1,
			min: 0,
		},

		bathrooms: {
			type: Number,
			default: 1,
			min: 0,
		},
		amenities: [
			{
				type: String,
			},
		],

		propertyViews: {
			type: Number,
			default: 0,
		},

		propertyLikes: {
			type: Number,
			default: 0,
		},
		propertyComments: {
			type: Number,
			default: 0,
		},

		propertyBookings: {
			type: Number,
			default: 0,
		},

		propertyRating: {
			type: Number,
			default: 0,
			min: 0,
			max: 5,
		},

		propertyReviews: {
			type: Number,
			default: 0,
		},

		// ─────────────────────────────
		// System
		// ─────────────────────────────

		deletedAt: {
			type: Date,
			default: null,
		},
	},
	{
		timestamps: true,
		collection: 'properties',
	},
);

PropertySchema.index({ destinationId: 1, propertyStatus: 1, pricePerNight: 1 }, { name: 'property_search_idx' });
PropertySchema.index({ memberId: 1, createdAt: 1 }, { name: 'property_owner_idx' });

export default PropertySchema;
