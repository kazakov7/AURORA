import { Schema, Types } from 'mongoose';

const ChatReadSchema = new Schema(
	{
		chatId: {
			type: Types.ObjectId,
			ref: 'Chat',
			required: true,
			index: true,
		},
		memberId: {
			type: Types.ObjectId,
			ref: 'Member',
			required: true,
			index: true,
		},
		lastReadAt: {
			type: Date,
			required: true,
		},
		clearedAt: {
			type: Date,
		},
	},
	{ timestamps: true, collection: 'chat_reads' },
);

ChatReadSchema.index(
	{ chatId: 1, memberId: 1 },
	{ unique: true, name: 'chat_reads_member_chat_uq' },
);
ChatReadSchema.index({ memberId: 1, lastReadAt: -1 }, { name: 'chat_reads_member_recent_idx' });

export default ChatReadSchema;
