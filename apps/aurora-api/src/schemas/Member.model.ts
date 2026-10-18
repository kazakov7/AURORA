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
			unique: true,
		},

		memberEmail: {
			type: String,
			lowercase: true,
			trim: true,
			unique: true,
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
			unique: true,
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

MemberSchema.index(
	{ memberNick: 1 },
	{
		name: 'members_nick_case_insensitive_uq',
		unique: true,
		collation: { locale: 'en', strength: 2 },
		partialFilterExpression: { memberNick: { $type: 'string' } },
	},
);
MemberSchema.index(
	{ googleSubject: 1 },
	{ unique: true, partialFilterExpression: { googleSubject: { $type: 'string' } } },
);
MemberSchema.index(
	{ kakaoSubject: 1 },
	{ unique: true, partialFilterExpression: { kakaoSubject: { $type: 'string' } } },
);
MemberSchema.index(
	{ telegramSubject: 1 },
	{ unique: true, partialFilterExpression: { telegramSubject: { $type: 'string' } } },
);
MemberSchema.index({ memberStatus: 1, createdAt: 1 }, { name: 'members_status_created_idx' });

export default MemberSchema;
