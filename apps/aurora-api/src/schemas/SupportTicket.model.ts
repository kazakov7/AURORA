import { Schema } from 'mongoose';
import { SupportCategory, SupportStatus } from '../libs/enums/support.enum';

const SupportTicketSchema = new Schema(
	{
		ticketCategory: {
			type: String,
			enum: SupportCategory,
			required: true,
		},

		ticketStatus: {
			type: String,
			enum: SupportStatus,
			default: SupportStatus.OPEN,
		},

		ticketName: {
			type: String,
			required: true,
		},

		ticketEmail: {
			type: String,
			required: true,
		},

		ticketSubject: {
			type: String,
			required: true,
		},

		ticketMessage: {
			type: String,
			required: true,
		},

		ticketAttachment: {
			type: String,
		},

		ticketReply: {
			type: String,
		},

		repliedAt: {
			type: Date,
		},

		memberId: {
			type: Schema.Types.ObjectId,
			required: true,
			ref: 'Member',
		},
	},
	{ timestamps: true, collection: 'supportTickets' },
);

SupportTicketSchema.index({ ticketStatus: 1, ticketCategory: 1, createdAt: -1 }, { name: 'support_tickets_admin_idx' });
SupportTicketSchema.index({ memberId: 1, createdAt: -1 }, { name: 'support_tickets_member_idx' });

export default SupportTicketSchema;
