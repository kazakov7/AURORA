import { Schema } from 'mongoose';
import { MemberType, MemberStatus, MemberAuthType } from '../libs/enums/member.enum';

const MemberSchema = new Schema(
	{
		memberType: {
			type: String,
			enum: MemberType,
			default: MemberType.USER,
			index: true,
		},

		memberStatus: {
			type: String,
			enum: MemberStatus,
			default: MemberStatus.ACTIVE,
			index: true,
		},

		memberAuthType: {
			type: String,
			enum: MemberAuthType,
			default: MemberAuthType.NICK,
		},

		memberPhone: {
			type: String,
		},

		memberEmail: {
			type: String,
			lowercase: true,
			trim: true,
		},

		googleSubject: {
			type: String,
			trim: true,
			immutable: true,
		},

		kakaoSubject: {
			type: String,
			trim: true,
			immutable: true,
		},

		telegramSubject: {
			type: String,
			trim: true,
			immutable: true,
		},

		memberPassword: {
			type: String,
			select: false,
		},

		lastLoginAt: {
			type: Date,
		},

		memberNick: {
			type: String,
			trim: true,
		},

		memberFullName: {
			type: String,
			trim: true,
		},

		memberImage: {
			type: String,
		},

		memberDesc: {
			type: String,
			maxlength: 500,
		},

		memberAddress: {
			type: String,
		},

		memberFollowers: {
			type: Number,
			default: 0,
		},

		memberFollowings: {
			type: Number,
			default: 0,
		},

		memberLikes: {
			type: Number,
			default: 0,
		},

		memberViews: {
			type: Number,
			default: 0,
		},

		memberComments: {
			type: Number,
			default: 0,
		},

		memberProperties: {
			type: Number,
			default: 0,
		},

		memberTours: {
			type: Number,
			default: 0,
		},

		memberArticles: {
			type: Number,
			default: 0,
		},

		memberPoints: {
			type: Number,
			default: 0,
		},

		memberRank: {
			type: Number,
			default: 0,
		},

		deletedAt: {
			type: Date,
			default: null,
		},
	},
	{
		timestamps: true,
		collection: 'members',
	},
);

MemberSchema.index({ memberPhone: 1 }, { unique: true, partialFilterExpression: { memberPhone: { $type: 'string' } } });
MemberSchema.index({ memberEmail: 1 }, { unique: true, partialFilterExpression: { memberEmail: { $type: 'string' } } });
MemberSchema.index({ memberNick: 1 }, { unique: true, partialFilterExpression: { memberNick: { $type: 'string' } } });
MemberSchema.index({ googleSubject: 1 }, { unique: true, partialFilterExpression: { googleSubject: { $type: 'string' } } });
MemberSchema.index({ kakaoSubject: 1 }, { unique: true, partialFilterExpression: { kakaoSubject: { $type: 'string' } } });
MemberSchema.index(
	{ telegramSubject: 1 },
	{ unique: true, partialFilterExpression: { telegramSubject: { $type: 'string' } } },
);
MemberSchema.index({ memberType: 1, memberStatus: 1, memberRank: 1 }, { name: 'members_ranking_idx' });
MemberSchema.index({ memberStatus: 1, createdAt: 1 }, { name: 'members_status_created_idx' });

export default MemberSchema;
