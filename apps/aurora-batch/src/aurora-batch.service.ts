import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { AgentType, AgentVerificationStatus } from '../../aurora-api/src/libs/enums/agent.enum';
import { BookingCategory, BookingStatus } from '../../aurora-api/src/libs/enums/booking.enum';
import { CommentGroup, CommentStatus } from '../../aurora-api/src/libs/enums/comment.enum';
import { LikeGroup } from '../../aurora-api/src/libs/enums/like.enum';
import { MemberStatus, MemberType } from '../../aurora-api/src/libs/enums/member.enum';
import { RankingScope, RankingType } from '../../aurora-api/src/libs/enums/ranking.enum';
import { ReviewGroup, ReviewStatus } from '../../aurora-api/src/libs/enums/review.enum';
import { ViewGroup } from '../../aurora-api/src/libs/enums/view.enum';

type Entry = { entityId: Types.ObjectId; score: number };
type Signal = { weight: number; values: Map<string, number> };

@Injectable()
export class AuroraBatchService implements OnModuleInit, OnModuleDestroy {
	private timer?: NodeJS.Timeout;
	constructor(
		@InjectModel('Destination') private readonly destinationModel: Model<any>, @InjectModel('Property') private readonly propertyModel: Model<any>,
		@InjectModel('Tour') private readonly tourModel: Model<any>, @InjectModel('Booking') private readonly bookingModel: Model<any>,
		@InjectModel('TravelHistory') private readonly historyModel: Model<any>, @InjectModel('Member') private readonly memberModel: Model<any>,
		@InjectModel('Agent') private readonly agentModel: Model<any>, @InjectModel('Review') private readonly reviewModel: Model<any>,
		@InjectModel('Like') private readonly likeModel: Model<any>, @InjectModel('View') private readonly viewModel: Model<any>,
		@InjectModel('Comment') private readonly commentModel: Model<any>, @InjectModel('BoardArticle') private readonly articleModel: Model<any>,
		@InjectModel('RankingSnapshot') private readonly snapshotModel: Model<any>, @InjectModel('RankingPublication') private readonly publicationModel: Model<any>,
		@InjectModel('BatchLock') private readonly lockModel: Model<any>, @InjectConnection() private readonly connection: Connection,
	) { }

	public onModuleInit(): void { this.schedule(); }
	public onModuleDestroy(): void { if (this.timer) clearTimeout(this.timer); }

	public async runRankings(source: 'daily' | 'manual' = 'daily'): Promise<boolean> {
		const owner = new Types.ObjectId().toHexString();
		if (!(await this.lock(owner))) return false;
		try {
			const calculatedAt = new Date(), publicationId = new Types.ObjectId();
			const snapshots = await this.calculate(publicationId, calculatedAt);
			const session = await this.connection.startSession();
			try {
				await session.withTransaction(async () => {
					await this.snapshotModel.insertMany(snapshots, { session });
					await this.publicationModel.updateMany({ isActive: true }, { $set: { isActive: false } }, { session });
					await this.publicationModel.create([{ _id: publicationId, isActive: true, publishedAt: new Date(), calculatedAt, snapshotCount: snapshots.length }], { session });
				});
			} finally { await session.endSession(); }
			console.log(`[ranking] published ${snapshots.length} snapshots (${source})`);
			return true;
		} catch (error) { console.error('[ranking] failed; previous publication remains active', error); return false; }
		finally { await this.lockModel.deleteOne({ _id: 'daily-ranking', owner }).exec(); }
	}

	private schedule(): void {
		const now = new Date(), offset = 9 * 3600000, seoul = new Date(now.getTime() + offset);
		const target = new Date(Date.UTC(seoul.getUTCFullYear(), seoul.getUTCMonth(), seoul.getUTCDate(), 2));
		if (target <= seoul) target.setUTCDate(target.getUTCDate() + 1);
		const delay = Math.max(1000, target.getTime() - offset - now.getTime());
		this.timer = setTimeout(async () => { await this.runRankings(); this.schedule(); }, delay);
		console.log(`[ranking] next run in ${Math.round(delay / 60000)} minutes (02:00 Asia/Seoul)`);
	}

	private async lock(owner: string): Promise<boolean> {
		try {
			const now = new Date();
			const doc: any = await this.lockModel.findOneAndUpdate({ _id: 'daily-ranking', $or: [{ lockUntil: { $lte: now } }, { lockUntil: { $exists: false } }] }, { $set: { owner, lockUntil: new Date(now.getTime() + 21600000) } }, { new: true, upsert: true }).lean();
			return doc?.owner === owner;
		} catch (error: any) { if (error?.code === 11000) return false; throw error; }
	}

	private async calculate(publicationId: Types.ObjectId, calculatedAt: Date): Promise<any[]> {
		const d30 = this.since(30), d7 = this.since(7), global = RankingScope.GLOBAL;
		const result = [
			this.snap(publicationId, RankingType.TRENDING_DESTINATIONS, global, 30, await this.destinations(d30), calculatedAt),
			this.snap(publicationId, RankingType.TOP_PROPERTIES, global, 30, await this.listings('property', d30), calculatedAt),
			this.snap(publicationId, RankingType.TOP_TOURS, global, 7, await this.listings('tour', d7), calculatedAt),
			this.snap(publicationId, RankingType.TOP_TRAVELERS, global, 30, await this.travelers(d30), calculatedAt),
			this.snap(publicationId, RankingType.TOP_HOTEL_AGENTS, global, 30, await this.agents(AgentType.HOTEL, d30), calculatedAt),
			this.snap(publicationId, RankingType.TOP_TOUR_AGENTS, global, 30, await this.agents(AgentType.TOUR, d30), calculatedAt),
			this.snap(publicationId, RankingType.POPULAR_DESTINATIONS_BY_BOOKINGS, global, 30, await this.destinations(d30, true), calculatedAt),
		];
		const destinations = await this.destinationModel.find({ destinationStatus: 'ACTIVE', deletedAt: null }).select('_id').lean();
		for (const row of destinations as any[]) {
			const destinationId = row._id as Types.ObjectId;
			result.push(this.snap(publicationId, RankingType.TOP_PROPERTIES, RankingScope.DESTINATION, 30, await this.listings('property', d30, destinationId), calculatedAt, destinationId));
			result.push(this.snap(publicationId, RankingType.TOP_TOURS, RankingScope.DESTINATION, 7, await this.listings('tour', d7, destinationId), calculatedAt, destinationId));
			result.push(this.snap(publicationId, RankingType.TOP_TRAVELERS, RankingScope.DESTINATION, 30, await this.travelers(d30, destinationId), calculatedAt, destinationId));
		}
		return result;
	}

	private snap(publicationId: Types.ObjectId, rankingType: RankingType, scope: RankingScope, periodDays: number, entries: Entry[], calculatedAt: Date, destinationId?: Types.ObjectId): any { return { publicationId, rankingType, scope, destinationId: destinationId ?? null, periodDays, entries, calculatedAt }; }

	private async destinations(since: Date, bookingsOnly = false): Promise<Entry[]> {
		const ids = (await this.destinationModel.find({ destinationStatus: 'ACTIVE', deletedAt: null }).select('_id').lean()).map((v: any) => v._id);
		const bookings = await this.bookingDestinations(since);
		if (bookingsOnly) return this.rank(ids, [{ weight: 1, values: bookings }]);
		const [views, likes, comments] = await Promise.all([
			this.map(this.viewModel, { viewGroup: ViewGroup.DESTINATION, createdAt: { $gte: since } }, '$viewRefId'), this.map(this.likeModel, { likeGroup: LikeGroup.DESTINATION, createdAt: { $gte: since } }, '$likeRefId'), this.map(this.commentModel, { commentGroup: CommentGroup.DESTINATION, commentStatus: CommentStatus.ACTIVE, createdAt: { $gte: since } }, '$commentRefId'),
		]);
		return this.rank(ids, [{ weight: .5, values: bookings }, { weight: .2, values: views }, { weight: .15, values: likes }, { weight: .15, values: comments }]);
	}

	private async listings(kind: 'property' | 'tour', since: Date, destinationId?: Types.ObjectId): Promise<Entry[]> {
		const model = kind === 'property' ? this.propertyModel : this.tourModel, statusKey = kind === 'property' ? 'propertyStatus' : 'tourStatus';
		const filter: any = { [statusKey]: 'ACTIVE', deletedAt: null }; if (destinationId) filter.destinationId = destinationId;
		const ids = (await model.find(filter).select('_id').lean()).map((v: any) => v._id); if (!ids.length) return [];
		const group = kind === 'property' ? { booking: BookingCategory.PROPERTY, review: ReviewGroup.PROPERTY, like: LikeGroup.PROPERTY, view: ViewGroup.PROPERTY } : { booking: BookingCategory.TOUR, review: ReviewGroup.TOUR, like: LikeGroup.TOUR, view: ViewGroup.TOUR };
		const [bookings, reviews, likes, views] = await Promise.all([
			this.map(this.bookingModel, { bookingCategory: group.booking, bookingStatus: { $in: [BookingStatus.CONFIRMED, BookingStatus.COMPLETED] }, updatedAt: { $gte: since }, bookingRefId: { $in: ids } }, '$bookingRefId'), this.map(this.reviewModel, { reviewGroup: group.review, reviewStatus: ReviewStatus.ACTIVE, createdAt: { $gte: since }, reviewRefId: { $in: ids } }, '$reviewRefId', '$reviewRating'), this.map(this.likeModel, { likeGroup: group.like, createdAt: { $gte: since }, likeRefId: { $in: ids } }, '$likeRefId'), this.map(this.viewModel, { viewGroup: group.view, createdAt: { $gte: since }, viewRefId: { $in: ids } }, '$viewRefId'),
		]);
		return this.rank(ids, [{ weight: .5, values: bookings }, { weight: .25, values: reviews }, { weight: .15, values: likes }, { weight: .1, values: views }]);
	}

	private async travelers(since: Date, destinationId?: Types.ObjectId): Promise<Entry[]> {
		const ids = (await this.memberModel.find({ memberStatus: MemberStatus.ACTIVE, memberType: { $ne: MemberType.ADMIN }, deletedAt: null }).select('_id').lean()).map((v: any) => v._id); if (!ids.length) return [];
		const match: any = { visitedAt: { $gte: since } }; if (destinationId) match.destinationId = destinationId;
		const history = await this.map(this.historyModel, match, '$memberId'); if (destinationId) return this.rank(ids, [{ weight: 1, values: history }]);
		const [comments, articles] = await Promise.all([this.map(this.commentModel, { commentStatus: CommentStatus.ACTIVE, createdAt: { $gte: since } }, '$memberId'), this.map(this.articleModel, { articleStatus: 'PUBLISHED', deletedAt: null, createdAt: { $gte: since } }, '$memberId')]);
		const likes = await this.map(this.likeModel, { likeGroup: LikeGroup.MEMBER, createdAt: { $gte: since } }, '$likeRefId');
		return this.rank(ids, [{ weight: .5, values: history }, { weight: .2, values: comments }, { weight: .15, values: likes }, { weight: .15, values: articles }]);
	}

	private async agents(type: AgentType, since: Date): Promise<Entry[]> {
		const agents = await this.agentModel.aggregate([{ $match: { agentType: type, verificationStatus: AgentVerificationStatus.APPROVED } }, { $lookup: { from: 'members', localField: 'memberId', foreignField: '_id', as: 'member' } }, { $unwind: '$member' }, { $match: { 'member.memberStatus': MemberStatus.ACTIVE, 'member.deletedAt': null } }, { $project: { memberId: 1 } }]);
		const ids = agents.map((a: any) => a._id); if (!ids.length) return [];
		const model = type === AgentType.HOTEL ? this.propertyModel : this.tourModel, key = type === AgentType.HOTEL ? 'propertyStatus' : 'tourStatus';
		const listings = await model.find({ [key]: 'ACTIVE', deletedAt: null, memberId: { $in: agents.map((a: any) => a.memberId) } }).select('_id memberId').lean();
		const byMember = new Map<string, number>(); for (const listing of listings) byMember.set(listing.memberId.toString(), (byMember.get(listing.memberId.toString()) ?? 0) + 1);
		const listingIds = listings.map((listing: any) => listing._id);
		const category = type === AgentType.HOTEL ? BookingCategory.PROPERTY : BookingCategory.TOUR;
		const reviewGroup = type === AgentType.HOTEL ? ReviewGroup.PROPERTY : ReviewGroup.TOUR;
		const likeGroup = type === AgentType.HOTEL ? LikeGroup.PROPERTY : LikeGroup.TOUR;
		const viewGroup = type === AgentType.HOTEL ? ViewGroup.PROPERTY : ViewGroup.TOUR;
		const [bookings, reviews, likes, views] = await Promise.all([
			this.map(this.bookingModel, { bookingCategory: category, bookingStatus: { $in: [BookingStatus.CONFIRMED, BookingStatus.COMPLETED] }, updatedAt: { $gte: since }, bookingRefId: { $in: listingIds } }, '$bookingRefId'),
			this.map(this.reviewModel, { reviewGroup, reviewStatus: ReviewStatus.ACTIVE, createdAt: { $gte: since }, reviewRefId: { $in: listingIds } }, '$reviewRefId', '$reviewRating'),
			this.map(this.likeModel, { likeGroup, createdAt: { $gte: since }, likeRefId: { $in: listingIds } }, '$likeRefId'),
			this.map(this.viewModel, { viewGroup, createdAt: { $gte: since }, viewRefId: { $in: listingIds } }, '$viewRefId'),
		]);
		const ownerByListing = new Map(listings.map((listing: any) => [listing._id.toString(), listing.memberId.toString()]));
		const toAgent = (values: Map<string, number>): Map<string, number> => new Map(agents.map((agent: any) => [agent._id.toString(), Array.from(values).filter(([listingId]) => ownerByListing.get(listingId) === agent.memberId.toString()).reduce((sum, [, value]) => sum + value, 0)]));
		const listingScores = new Map(agents.map((agent: any) => [agent._id.toString(), byMember.get(agent.memberId.toString()) ?? 0]));
		const engagement = new Map(ids.map((id) => [id.toString(), (toAgent(likes).get(id.toString()) ?? 0) + (toAgent(views).get(id.toString()) ?? 0)]));
		return this.rank(ids, [{ weight: .3, values: listingScores }, { weight: .4, values: toAgent(bookings) }, { weight: .2, values: toAgent(reviews) }, { weight: .1, values: engagement }]);
	}

	private async bookingDestinations(since: Date): Promise<Map<string, number>> { const rows = await this.bookingModel.aggregate([{ $match: { bookingStatus: { $in: [BookingStatus.CONFIRMED, BookingStatus.COMPLETED] }, updatedAt: { $gte: since } } }, { $lookup: { from: 'properties', localField: 'bookingRefId', foreignField: '_id', as: 'property' } }, { $lookup: { from: 'tours', localField: 'bookingRefId', foreignField: '_id', as: 'tour' } }, { $project: { destinationId: { $ifNull: [{ $arrayElemAt: ['$property.destinationId', 0] }, { $arrayElemAt: ['$tour.destinationId', 0] }] } } }, { $match: { destinationId: { $ne: null } } }, { $group: { _id: '$destinationId', value: { $sum: 1 } } }]); return this.rows(rows); }
	private async map(model: Model<any>, match: any, path: string, value?: string): Promise<Map<string, number>> { return this.rows(await model.aggregate([{ $match: match }, { $group: { _id: path, value: value ? { $sum: value } : { $sum: 1 } } }])); }
	private rows(rows: any[]): Map<string, number> { return new Map(rows.filter((v) => v._id).map((v) => [v._id.toString(), v.value])); }
	private rank(ids: Types.ObjectId[], signals: Signal[]): Entry[] { const max = signals.map((s) => Math.max(0, ...s.values.values())); return ids.map((entityId) => ({ entityId, score: Number(signals.reduce((sum, s, i) => sum + (max[i] ? ((s.values.get(entityId.toString()) ?? 0) / max[i]) * s.weight : 0), 0).toFixed(6)) })).filter((v) => v.score > 0).sort((a, b) => b.score - a.score || a.entityId.toString().localeCompare(b.entityId.toString())); }
	private since(days: number): Date { return new Date(Date.now() - days * 86400000); }
}
