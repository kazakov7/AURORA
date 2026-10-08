import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AgentType, AgentVerificationStatus } from '../../libs/enums/agent.enum';
import { MemberStatus, MemberType } from '../../libs/enums/member.enum';
import { PropertyStatus } from '../../libs/enums/property.enum';
import { RankingScope, RankingType } from '../../libs/enums/ranking.enum';
import { TourStatus } from '../../libs/enums/tour.enum';

@Injectable()
export class RankingService {
	constructor(
		@InjectModel('RankingSnapshot') private readonly snapshotModel: Model<any>,
		@InjectModel('RankingPublication') private readonly publicationModel: Model<any>,
		@InjectModel('Destination') private readonly destinationModel: Model<any>,
		@InjectModel('Property') private readonly propertyModel: Model<any>,
		@InjectModel('Tour') private readonly tourModel: Model<any>,
		@InjectModel('Member') private readonly memberModel: Model<any>,
		@InjectModel('Agent') private readonly agentModel: Model<any>,
	) {}

	public async getDestinations(type: RankingType, limit: number): Promise<any> {
		const entries = await this.getEntries(type, RankingScope.GLOBAL);
		const list = await this.findInSnapshotOrder(this.destinationModel, entries, { destinationStatus: 'ACTIVE', deletedAt: null }, limit);
		return this.withMeta(list);
	}

	public async getProperties(destinationId: string | undefined, limit: number): Promise<any> {
		const scope = destinationId ? RankingScope.DESTINATION : RankingScope.GLOBAL;
		const entries = await this.getEntries(RankingType.TOP_PROPERTIES, scope, destinationId);
		const filter: any = { propertyStatus: PropertyStatus.ACTIVE, deletedAt: null };
		if (destinationId) filter.destinationId = new Types.ObjectId(destinationId);
		const list = await this.findInSnapshotOrder(this.propertyModel, entries, filter, limit);
		return this.withMeta(list);
	}

	public async getTours(destinationId: string | undefined, limit: number): Promise<any> {
		const scope = destinationId ? RankingScope.DESTINATION : RankingScope.GLOBAL;
		const entries = await this.getEntries(RankingType.TOP_TOURS, scope, destinationId);
		const filter: any = { tourStatus: TourStatus.ACTIVE, deletedAt: null };
		if (destinationId) filter.destinationId = new Types.ObjectId(destinationId);
		const list = await this.findInSnapshotOrder(this.tourModel, entries, filter, limit);
		return this.withMeta(list);
	}

	public async getTravelers(destinationId: string | undefined, limit: number): Promise<any> {
		const scope = destinationId ? RankingScope.DESTINATION : RankingScope.GLOBAL;
		const entries = await this.getEntries(RankingType.TOP_TRAVELERS, scope, destinationId);
		const list = await this.findInSnapshotOrder(this.memberModel, entries, { memberStatus: MemberStatus.ACTIVE, memberType: { $ne: MemberType.ADMIN }, deletedAt: null }, limit);
		return this.withMeta(list);
	}

	public async getAgents(agentType: AgentType, limit: number): Promise<any> {
		const type = agentType === AgentType.HOTEL ? RankingType.TOP_HOTEL_AGENTS : RankingType.TOP_TOUR_AGENTS;
		const entries = await this.getEntries(type, RankingScope.GLOBAL);
		const ids = entries.slice(0, limit).map((entry: any) => entry.entityId);
		if (!ids.length) return this.withMeta([]);
		const agents = await this.agentModel.aggregate([
			{ $match: { _id: { $in: ids }, agentType, verificationStatus: AgentVerificationStatus.APPROVED } },
			{ $lookup: { from: 'members', localField: 'memberId', foreignField: '_id', as: 'memberData' } },
			{ $unwind: '$memberData' },
			{ $match: { 'memberData.memberStatus': MemberStatus.ACTIVE, 'memberData.deletedAt': null } },
			{ $addFields: { __rank: { $indexOfArray: [ids, '$_id'] } } },
			{ $sort: { __rank: 1, _id: 1 } },
			{ $project: { memberId: 1, agentType: 1, companyName: 1, companyDesc: 1, memberData: 1 } },
		]).exec();
		return this.withMeta(agents);
	}

	private async getEntries(type: RankingType, scope: RankingScope, destinationId?: string): Promise<any[]> {
		const publication: any = await this.publicationModel.findOne({ isActive: true }).sort({ publishedAt: -1 }).lean().exec();
		if (!publication) return [];
		const filter: any = { publicationId: publication._id, rankingType: type, scope };
		if (scope === RankingScope.DESTINATION) filter.destinationId = new Types.ObjectId(destinationId);
		const snapshot = await this.snapshotModel.findOne(filter).select('entries').lean().exec();
		return snapshot?.entries ?? [];
	}

	private async findInSnapshotOrder(model: Model<any>, entries: any[], filter: any, limit: number): Promise<any[]> {
		const ids = entries.slice(0, limit).map((entry) => entry.entityId);
		if (!ids.length) return [];
		return await model.aggregate([
			{ $match: { ...filter, _id: { $in: ids } } },
			{ $addFields: { __rank: { $indexOfArray: [ids, '$_id'] } } },
			{ $sort: { __rank: 1, _id: 1 } },
		]).exec();
	}

	private withMeta(list: any[]): any {
		return { list, metaCounter: [{ total: list.length }] };
	}
}
