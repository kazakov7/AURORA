import { Schema } from 'mongoose';
import { NotificationType, NotificationStatus, NotificationGroup } from '../libs/enums/notification.enum';

const NotificationSchema = new Schema(
	{
		notificationType: {
			type: String,
			enum: NotificationType,
			required: true,
		},

		notificationStatus: {
			type: String,
			enum: NotificationStatus,
			default: NotificationStatus.WAIT,
		},

		notificationGroup: {
			type: String,
			enum: NotificationGroup,
			required: true,
		},

		notificationTitle: {
			type: String,
			required: true,
		},

		notificationDesc: {
			type: String,
		},

		authorId: {
			type: Schema.Types.ObjectId,
			ref: 'Member',
		},

		receiverId: {
			type: Schema.Types.ObjectId,
			required: true,
			ref: 'Member',
		},

		notificationRefId: Schema.Types.ObjectId,

		// A deterministic event key makes webhook retries and concurrent mutations
		// safe without changing the public GraphQL contract.
		notificationEventKey: {
			type: String,
		},
	},
	{ timestamps: { createdAt: true, updatedAt: false }, collection: 'notifications' },
);

NotificationSchema.index({ receiverId: 1, notificationStatus: 1, createdAt: 1 }, { name: 'notifications_inbox_idx' });
NotificationSchema.index({ notificationGroup: 1, notificationRefId: 1, createdAt: 1 }, { name: 'notifications_target_idx' });
NotificationSchema.index(
	{ receiverId: 1, notificationEventKey: 1 },
	{ unique: true, partialFilterExpression: { notificationEventKey: { $type: 'string' } }, name: 'notifications_receiver_event_uq' },
);

export default NotificationSchema;
