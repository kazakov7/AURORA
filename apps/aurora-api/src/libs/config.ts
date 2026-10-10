import { ObjectId } from 'bson';
import { BadRequestException } from '@nestjs/common';
import { Messages } from './enums/common.enum';


export const HOLD_DURATION_MS = 15 * 60 * 1000;
export const USD = 'USD';
export const availableAgentSorts = ['createdAt', 'updatedAt', 'agentType', 'verificationStatus'];
export const availableMemberSorts = [
	'createdAt',
	'updatedAt',
	'lastLoginAt',
	'memberNick',
	'memberRank',
	'memberPoints',
	'memberFollowers',
	'memberFollowings',
	'memberLikes',
	'memberViews',
	'memberProperties',
	'memberTours',
	'memberArticles',
];
export const availablePropertySorts = [
	'createdAt',
	'updatedAt',
	'propertyLikes',
	'propertyViews',
	'propertyRating',
	'pricePerNight',
];
export const availableTourSorts = [
	'createdAt',
	'updatedAt',
	'tourPrice',
	'tourStartDate',
	'tourLikes',
	'tourViews',
	'tourRating',
];
export const availableDestinationSorts = [
	'createdAt',
	'updatedAt',
	'destinationViews',
	'destinationLikes',
	'destinationRating',
	'destinationProperties',
	'destinationTours',
];
export const availableBoardArticleSorts = ['createdAt', 'updatedAt', 'articleLikes', 'articleViews'];
export const availableCommentSorts = ['createdAt', 'updatedAt'];
export const availableChatSorts = ['createdAt', 'updatedAt', 'lastMessageAt'];
// IMAGE CONFIGURATION ()
import { randomUUID } from 'crypto';
import { T } from './types/common';

export const validMimeTypes = ['image/png', 'image/jpg', 'image/jpeg'];
/** Upload sub-folders under ./uploads; the client-supplied target must be one of these (blocks path traversal) **/
export const validUploadTargets = ['member', 'article', 'board', 'property', 'tour', 'destination', 'support'];
export const isValidUploadTarget = (target: unknown): target is string =>
	typeof target === 'string' && validUploadTargets.includes(target);

/** Extension comes from the validated mimetype, never from the client filename (blocks .html/.js uploads) **/
const imageExtensions: Record<string, string> = { 'image/png': '.png', 'image/jpg': '.jpg', 'image/jpeg': '.jpg' };
export const getSerialForImage = (mimetype: string) => {
	return randomUUID() + (imageExtensions[mimetype] ?? '.jpg');
};
/** Escapes user search text before building a RegExp (prevents invalid-pattern 500s and ReDoS) **/
export const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const shapeIntoMongoObjectId = (target: any): any => {
	if (target instanceof ObjectId) return target;
	if (typeof target !== 'string' || !ObjectId.isValid(target)) {
		throw new BadRequestException(Messages.INVALID_ID);
	}
	return new ObjectId(target);
};

export const lookUpAuthMemberLiked = (memberId: T, targetRefid: string = '$_id') => {
	return {
		$lookup: {
			from: 'likes',
			let: {
				localLikeRefId: targetRefid,
				localMemberId: memberId,
				localMyFavorite: true,
			},
			pipeline: [
				{
					$match: {
						$expr: {
							$and: [{ $eq: ['$likeRefId', '$$localLikeRefId'] }, { $eq: ['$memberId', '$$localMemberId'] }],
						},
					},
				},
				{
					$project: {
						_id: 0,
						memberId: 1,
						likeRefId: 1,
						myFavorite: '$$localMyFavorite',
					},
				},
			],
			as: 'meLiked',
		},
	};
};
interface LookUpAuthMemberFollowData {
	followerId: T;
	followingId: string;
}
export const lookUpAuthMemberFollowData = (input: LookUpAuthMemberFollowData) => {
	const { followerId, followingId } = input;
	return {
		$lookup: {
			from: 'follows',
			let: {
				localfollowerId: followerId,
				localFollowingId: followingId,
				localMyFollowing: true,
			},
			pipeline: [
				{
					$match: {
						$expr: {
							$and: [{ $eq: ['$followerId', '$$localfollowerId'] }, { $eq: ['$followingId', '$$localFollowingId'] }],
						},
					},
				},
				{
					$project: {
						_id: 0,
						followerId: 1,
						followingId: 1,
						myFollowing: '$$localMyFollowing',
					},
				},
			],
			as: 'meFollowed',
		},
	};
};

export const lookupMember = {
	$lookup: {
		from: 'members',
		localField: 'memberId',
		foreignField: '_id',
		as: 'memberData',
	},
};
export const lookupFollowingData = {
	$lookup: {
		from: 'members',
		localField: 'followingId',
		foreignField: '_id',
		as: 'followingData',
	},
};
export const lookupFollowerData = {
	$lookup: {
		from: 'members',
		localField: 'followerId',
		foreignField: '_id',
		as: 'followerData',
	},
};
export const lookupFavorite = {
	$lookup: {
		from: 'members',
		localField: 'favoriteProperty.memberId',
		foreignField: '_id',
		as: 'favoriteProperty.memberData',
	},
};
export const lookupVisited = {
	$lookup: {
		from: 'members',
		localField: 'visitedProperty.memberId',
		foreignField: '_id',
		as: 'visitedProperty.memberData',
	},
};
export const lookupFavoriteTour = {
	$lookup: {
		from: 'members',
		localField: 'favoriteTour.memberId',
		foreignField: '_id',
		as: 'favoriteTour.memberData',
	},
};
export const lookupVisitedTour = {
	$lookup: {
		from: 'members',
		localField: 'visitedTour.memberId',
		foreignField: '_id',
		as: 'visitedTour.memberData',
	},
};
