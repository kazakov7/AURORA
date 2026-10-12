import { Schema, Types } from 'mongoose';
import { ChatType } from '../libs/enums/chat.enum';

const ChatSchema = new Schema(
	{
		chatType: {
			type: String,
			enum: ChatType,
			index: true,
		},

		memberOneId: {
			type: Types.ObjectId,
			ref: 'Member',
			required: function () {
				return this.chatType === ChatType.DIRECT;
			},
			index: true,
		},

		memberTwoId: {
			type: Types.ObjectId,
			ref: 'Member',
			required: function () {
				return this.chatType === ChatType.DIRECT;
			},
			index: true,
		},

		lastMessage: {
			type: String,
			trim: true,
		},

		lastMessageAt: {
			type: Date,
			index: true,
		},

		directKey: {
			type: String,
			trim: true,
		},
	},
	{
		timestamps: true,
		collection: 'chats',
	},
);

ChatSchema.index(
	{ directKey: 1 },
	{
		unique: true,
		partialFilterExpression: { chatType: ChatType.DIRECT },
		name: 'chats_direct_key_uq',
	},
);
ChatSchema.index(
	{ chatType: 1 },
	{
		unique: true,
		partialFilterExpression: { chatType: ChatType.GLOBAL },
		name: 'chats_global_singleton_uq',
	},
);
ChatSchema.index({ chatType: 1, lastMessageAt: 1 }, { name: 'chats_recent_idx' });

export default ChatSchema;
