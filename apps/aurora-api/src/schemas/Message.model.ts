import { Schema, Types } from 'mongoose';
import { MessageType } from '../libs/enums/message.enum';

const MessageSchema = new Schema(
	{
		chatId: {
			type: Types.ObjectId,
			ref: 'Chat',
			required: true,
			index: true,
		},

		senderId: {
			type: Types.ObjectId,
			ref: 'Member',
			required: true,
			index: true,
		},

		messageType: {
			type: String,
			enum: MessageType,
			default: MessageType.TEXT,
		},

		messageContent: {
			type: String,
			required: true,
			trim: true,
		},

		clientMessageId: {
			type: String,
			trim: true,
		},
	},
	{ timestamps: true, collection: 'messages' },
);

MessageSchema.index({ chatId: 1, createdAt: 1, _id: 1 }, { name: 'messages_chat_cursor_idx' });
MessageSchema.index(
	{ chatId: 1, senderId: 1, clientMessageId: 1 },
	{
		unique: true,
		partialFilterExpression: { clientMessageId: { $type: 'string' } },
		name: 'messages_client_retry_uq',
	},
);

export default MessageSchema;
