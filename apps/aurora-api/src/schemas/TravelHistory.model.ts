import { Schema, Types } from 'mongoose';

const TravelHistorySchema = new Schema(
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

		bookingId: {
			type: Types.ObjectId,
			ref: 'Booking',
			required: true,
			index: true,
		},

		visitedAt: {
			type: Date,
			required: true,
		},
	},
	{
		timestamps: true,
		updatedAt: false,
		collection: 'travel-histories',
	},
);

TravelHistorySchema.index(
	{ memberId: 1, bookingId: 1 },
	{ unique: true, name: 'travel_member_booking_uq' },
);
TravelHistorySchema.index({ memberId: 1, visitedAt: 1 }, { name: 'travel_member_date_idx' });

export default TravelHistorySchema;
