import { Schema } from 'mongoose';
import { ReviewGroup, ReviewStatus } from '../libs/enums/review.enum';

const ReviewSchema = new Schema(
	{
		memberId: { type: Schema.Types.ObjectId, ref: 'Member', required: true },
		bookingId: { type: Schema.Types.ObjectId, ref: 'Booking', default: null },
		reviewGroup: { type: String, enum: ReviewGroup, required: true },
		reviewRefId: { type: Schema.Types.ObjectId, required: true },
		reviewRating: { type: Number, required: true, min: 1, max: 5 },
		reviewContent: { type: String, trim: true },
		reviewStatus: { type: String, enum: ReviewStatus, default: ReviewStatus.ACTIVE },
		deletedAt: { type: Date, default: null },
	},
	{ timestamps: true, collection: 'reviews' },
);

ReviewSchema.index(
	{ memberId: 1, bookingId: 1 },
	{
		unique: true,
		partialFilterExpression: { bookingId: { $type: 'objectId' } },
		name: 'reviews_member_booking_uq',
	},
);
ReviewSchema.index(
	{ memberId: 1, reviewGroup: 1, reviewRefId: 1 },
	{
		unique: true,
		partialFilterExpression: { reviewGroup: ReviewGroup.DESTINATION, reviewStatus: ReviewStatus.ACTIVE },
		name: 'reviews_destination_member_uq',
	},
);
ReviewSchema.index({ reviewGroup: 1, reviewRefId: 1, reviewStatus: 1, createdAt: 1 }, { name: 'reviews_target_idx' });

export default ReviewSchema;
