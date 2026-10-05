import { Schema } from 'mongoose';
import { AgentType, AgentVerificationStatus } from '../libs/enums/agent.enum';

const AgentSchema = new Schema(
	{
		memberId: { type: Schema.Types.ObjectId, ref: 'Member', required: true, unique: true },
		agentType: { type: String, enum: AgentType, required: true },
		companyName: { type: String, required: true, trim: true },
		businessNumber: { type: String, required: true, unique: true, trim: true },
		companyAddress: { type: String, required: true, trim: true },
		companyDesc: { type: String, trim: true },
		verificationStatus: {
			type: String,
			enum: AgentVerificationStatus,
			default: AgentVerificationStatus.PENDING,
		},
		rejectionReason: { type: String, trim: true },
		verifiedAt: Date,
	},
	{ timestamps: true, collection: 'agents' },
);

export default AgentSchema;
