import { Schema } from 'mongoose';
import { AgentType, AgentVerificationStatus } from '../libs/enums/agent.enum';

const AgentSchema = new Schema(
	{
		memberId: {
			type: Schema.Types.ObjectId,
			ref: 'Member',
			required: true,
		},
		agentType: {
			type: String,
			enum: AgentType,
			required: true,
		},
		companyName: {
			type: String,
			required: true,
			trim: true,
		},
		businessNumber: {
			type: String,
			required: true,
			trim: true,
		},
		/** businessNumber without case and separators, so one business cannot apply twice in another spelling **/
		businessNumberKey: {
			type: String,
		},
		companyAddress: {
			type: String,
			required: true,
			trim: true,
		},
		companyDesc: {
			type: String,
			trim: true,
		},
		verificationStatus: {
			type: String,
			enum: AgentVerificationStatus,
			default: AgentVerificationStatus.PENDING,
		},
		rejectionReason: {
			type: String,
			trim: true,
		},
		verifiedAt: Date,
	},
	{
		timestamps: true,
		collection: 'agents',
	},
);

AgentSchema.index(
	{ memberId: 1 },
	{
		unique: true,
		partialFilterExpression: {
			verificationStatus: {
				$in: [AgentVerificationStatus.PENDING, AgentVerificationStatus.APPROVED],
			},
		},
		name: 'agents_member_active_uq',
	},
);
// Records written before businessNumberKey existed stay out until the backfill script fills them in
AgentSchema.index(
	{ businessNumberKey: 1 },
	{
		unique: true,
		partialFilterExpression: {
			verificationStatus: {
				$in: [AgentVerificationStatus.PENDING, AgentVerificationStatus.APPROVED],
			},
			businessNumberKey: { $exists: true },
		},
		name: 'agents_business_key_active_uq',
	},
);
AgentSchema.index(
	{
		verificationStatus: 1,
		createdAt: 1,
	},
	{
		name: 'agents_verification_created_idx',
	},
);

export default AgentSchema;
