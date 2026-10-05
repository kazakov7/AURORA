import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { View } from '../../libs/dto/view/view';
import { ViewInput } from '../../libs/dto/view/view.input';
import { T } from '../../libs/types/common';
import { Properties } from '../../libs/dto/property/property';
import { ViewGroup } from '../../libs/enums/view.enum';
import { OrdinaryInquery } from '../../libs/dto/property/property.input';
import { lookupVisited } from '../../libs/config';
import { lookupVisitedTour } from '../../libs/config';
import { Tours } from '../../libs/dto/tour/tour';
import { OrdinaryTourInquiry } from '../../libs/dto/tour/tour.input';

@Injectable()
export class ViewService {
	constructor(
		@InjectModel('View')
		private readonly viewModel: Model<View>,
	) { }

	public async recordView(input: ViewInput): Promise<View | null> {
		const viewExist = await this.checkViewExistence(input);

		if (!viewExist) {
			console.log('- New View Insert -');

			return await this.viewModel.create(input);
		} else return null;
	}

	private async checkViewExistence(input: ViewInput): Promise<View | null> {
		const { memberId, viewRefId } = input;

		const search: T = {
			memberId: memberId,
			viewRefId: viewRefId,
		};

		return await this.viewModel.findOne(search).exec();
	}

	public async getVisitedProperties(
		memberId: Types.ObjectId,
		input: OrdinaryInquery,
	): Promise<Properties> {
		const { page, limit } = input;
		const match: T = { viewGroup: ViewGroup.PROPERTY, memberId: memberId };

		const data: T = await this.viewModel
			.aggregate([
				{ $match: match },
				{ $sort: { updatedAt: -1 } },
				{
					$lookup: {
						from: 'properties',
						localField: 'viewRefId',
						foreignField: '_id',
						as: 'visitedProperty',
					},
				},
				{ $unwind: '$visitedProperty' },
				{
					$facet: {
						list: [
							{ $skip: (page - 1) * limit },
							{ $limit: limit },
							lookupVisited,
							{ $unwind: '$visitedProperty.memberData' },
						],
						metaCounter: [{ $count: 'total' }],
					},
				},
			])
			.exec();

		const result: Properties = { list: [], metaCounter: data[0].metaCounter };
		result.list = data[0].list.map((ele) => ele.visitedProperty);

		return result;
	}

	public async getVisitedTours(memberId: Types.ObjectId, input: OrdinaryTourInquiry): Promise<Tours> {
		const data: T = await this.viewModel
			.aggregate([
				{ $match: { viewGroup: ViewGroup.TOUR, memberId } },
				{ $sort: { createdAt: -1 } },
				{
					$lookup: {
						from: 'tours',
						localField: 'viewRefId',
						foreignField: '_id',
						as: 'visitedTour',
					},
				},
				{ $unwind: '$visitedTour' },
				{ $match: { 'visitedTour.tourStatus': 'ACTIVE', 'visitedTour.deletedAt': null } },
				{
					$facet: {
						list: [
							{ $skip: (input.page - 1) * input.limit },
							{ $limit: input.limit },
							lookupVisitedTour,
							{ $unwind: '$visitedTour.memberData' },
						],
						metaCounter: [{ $count: 'total' }],
					},
				},
			])
			.exec();

		const result: Tours = { list: [], metaCounter: data[0]?.metaCounter ?? [] };
		result.list = (data[0]?.list ?? []).map((item) => item.visitedTour);
		return result;
	}
}
