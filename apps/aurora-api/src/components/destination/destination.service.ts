import {
	BadRequestException,
	Injectable,
	InternalServerErrorException,
	NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Destination, Destinations } from '../../libs/dto/destination/destination';
import {
	AdminDestinationsInquiry,
	DestinationInput,
	DestinationSearch,
	DestinationsInquiry,
} from '../../libs/dto/destination/destination.input';
import { DestinationUpdate } from '../../libs/dto/destination/destination.update';
import { lookUpAuthMemberLiked, escapeRegExp, shapeIntoSlug } from '../../libs/config';
import { Direction, Messages } from '../../libs/enums/common.enum';
import { LikeGroup } from '../../libs/enums/like.enum';
import { DestinationStatus } from '../../libs/enums/destination';
import { MemberType } from '../../libs/enums/member.enum';
import { ViewGroup } from '../../libs/enums/view.enum';
import { StatisticModifier, T } from '../../libs/types/common';
import { LikeService } from '../like/like.service';
import { ViewService } from '../view/view.service';
import { MemberService } from '../member/member.service';

@Injectable()
export class DestinationService {
	constructor(
		@InjectModel('Destination') private readonly destinationModel: Model<Destination>,
		@InjectModel('Property') private readonly propertyModel: Model<any>,
		@InjectModel('Tour') private readonly tourModel: Model<any>,
		private readonly likeService: LikeService,
		private readonly viewService: ViewService,
		private readonly memberService: MemberService,
	) {}

	public async createDestination(input: DestinationInput): Promise<Destination> {
		const destinationSlug = await this.shapeFreeSlug(input.destinationName);

		try {
			const result = await this.destinationModel.create({ ...input, destinationSlug });
			return result as unknown as Destination;
		} catch (error) {
			this.throwIfSlugTaken(error);
			console.error('Destination creation failed:', error);
			throw new BadRequestException(Messages.CREATE_FAILED);
		}
	}

	public async getDestination(
		memberId: Types.ObjectId,
		destinationId: Types.ObjectId,
		memberType?: MemberType,
	): Promise<Destination> {
		const destination = await this.destinationModel
			.findOne({ _id: destinationId, deletedAt: null })
			.lean<Destination>()
			.exec();

		const isActive = destination?.destinationStatus === DestinationStatus.ACTIVE;
		if (!destination || (!isActive && memberType !== MemberType.ADMIN)) {
			throw new NotFoundException(Messages.DESTINATION_NOT_FOUND);
		}
		// An admin preview of an inactive city is not a visit
		return isActive ? this.attachViewerData(destination, memberId) : destination;
	}

	public async getActiveDestination(destinationId: Types.ObjectId): Promise<Destination> {
		const destination = await this.destinationModel
			.findOne({ _id: destinationId, destinationStatus: DestinationStatus.ACTIVE, deletedAt: null })
			.lean<Destination>()
			.exec();

		if (!destination) throw new NotFoundException(Messages.DESTINATION_NOT_FOUND);
		return destination;
	}

	public async getDestinations(
		memberId: Types.ObjectId,
		input: DestinationsInquiry,
	): Promise<Destinations> {
		const match: T = { destinationStatus: DestinationStatus.ACTIVE, deletedAt: null };
		this.shapeMatchQuery(match, input.search);

		const result = await this.destinationModel
			.aggregate([
				{ $match: match },
				{ $sort: this.shapeSort(input) },
				{
					$facet: {
						list: [
							{ $skip: (input.page - 1) * input.limit },
							{ $limit: input.limit },
							lookUpAuthMemberLiked(memberId),
						],
						metaCounter: [{ $count: 'total' }],
					},
				},
			])
			.exec();

		return result[0] as Destinations;
	}

	public async getAllDestinationsByAdmin(input: AdminDestinationsInquiry): Promise<Destinations> {
		const match: T = { deletedAt: null };
		if (input.search.destinationStatus) match.destinationStatus = input.search.destinationStatus;
		this.shapeMatchQuery(match, input.search);

		const result = await this.destinationModel
			.aggregate([
				{ $match: match },
				{ $sort: this.shapeSort(input) },
				{
					$facet: {
						list: [{ $skip: (input.page - 1) * input.limit }, { $limit: input.limit }],
						metaCounter: [{ $count: 'total' }],
					},
				},
			])
			.exec();

		return result[0] as Destinations;
	}

	public async destinationStatsEditor(input: StatisticModifier): Promise<Destination> {
		const result = await this.destinationModel
			.findByIdAndUpdate(
				input._id,
				[
					{
						$set: {
							[input.targetKey]: {
								$max: [0, { $add: [{ $ifNull: [`$${input.targetKey}`, 0] }, input.modifier] }],
							},
						},
					},
				] as any,
				{ new: true },
			)
			.exec();

		return result as unknown as Destination;
	}

	public async setDestinationReviewStats(
		destinationId: Types.ObjectId,
		destinationReviews: number,
		destinationRating: number,
	): Promise<Destination> {
		const result = await this.destinationModel
			.findByIdAndUpdate(destinationId, { destinationReviews, destinationRating }, { new: true })
			.exec();

		if (!result) throw new InternalServerErrorException(Messages.UPDATE_FAILED);
		return result as unknown as Destination;
	}

	public async likeTargetDestination(
		memberId: Types.ObjectId,
		destinationId: Types.ObjectId,
	): Promise<Destination> {
		await this.getActiveDestination(destinationId);
		await this.likeService.toggleLike({
			memberId,
			likeRefId: destinationId,
			likeGroup: LikeGroup.DESTINATION,
		});
		const result = await this.destinationModel.findById(destinationId).exec();

		if (!result) throw new InternalServerErrorException(Messages.SOMETHING_WENT_WRONG);
		return result;
	}

	public async updateDestinationByAdmin(input: DestinationUpdate): Promise<Destination> {
		const { _id, ...update } = input;
		const search: T = { _id, deletedAt: null };
		const existingDestination = await this.destinationModel
			.findOne(search)
			.lean<Destination>()
			.exec();

		if (!existingDestination) throw new NotFoundException(Messages.DESTINATION_NOT_FOUND);

		const updateData: T = { ...update };
		if (input.destinationName) {
			updateData.destinationSlug = await this.shapeFreeSlug(
				input.destinationName,
				existingDestination._id,
			);
		}

		const result = await this.destinationModel
			.findOneAndUpdate(search, updateData, { new: true })
			.exec()
			.catch((error) => {
				this.throwIfSlugTaken(error);
				throw error;
			});

		if (!result) throw new InternalServerErrorException(Messages.UPDATE_FAILED);

		// An inactive city takes its hotels and tours out of the catalog with it
		const wasActive = existingDestination.destinationStatus === DestinationStatus.ACTIVE;
		if (wasActive && result.destinationStatus === DestinationStatus.INACTIVE) {
			await this.memberService.deactivateListings({ destinationId: result._id });
			return (await this.destinationModel.findById(result._id).exec()) ?? result;
		}
		return result as unknown as Destination;
	}

	public async removeDestinationByAdmin(destinationId: Types.ObjectId): Promise<String> {
		const search: T = {
			_id: destinationId,
			destinationStatus: DestinationStatus.INACTIVE,
			deletedAt: null,
		};
		const targetDestination = await this.destinationModel
			.findOne(search)
			.lean<Destination>()
			.exec();
		if (!targetDestination) throw new BadRequestException(Messages.REMOVE_FAILED);

		// Hotels and tours keep their city, so it is removed only once none of them is left.
		// An INACTIVE city takes no new listings, so nothing can be added before the update
		const listing: T = { destinationId, deletedAt: null };
		const [hasProperties, hasTours] = await Promise.all([
			this.propertyModel.exists(listing).exec(),
			this.tourModel.exists(listing).exec(),
		]);
		if (hasProperties || hasTours) throw new BadRequestException(Messages.DESTINATION_HAS_LISTINGS);

		// The slug is released, so a new city of the same name can be created later
		const result = await this.destinationModel
			.findOneAndUpdate(search, {
				deletedAt: new Date(),
				destinationSlug: `${targetDestination.destinationSlug}--${targetDestination._id}`,
			})
			.exec();

		if (!result) throw new BadRequestException(Messages.REMOVE_FAILED);
		return 'Destination successfully deleted';
	}

	private shapeMatchQuery(match: T, search: DestinationSearch): void {
		const { destinationCountry, destinationCountryList, text } = search;

		const countryFilters: T[] = [];

		if (destinationCountry) countryFilters.push({ destinationCountry });
		if (destinationCountryList?.length)
			countryFilters.push({ destinationCountry: { $in: destinationCountryList } });
		if (countryFilters.length) match.$and = countryFilters;

		const normalizedText = text?.trim();
		if (normalizedText) {
			const regex = new RegExp(escapeRegExp(normalizedText), 'i');
			match.$or = [
				{ destinationName: regex },
				{ destinationCountry: regex },
				{ destinationDesc: regex },
			];
		}
	}

	/** The _id tie-breaker keeps pages stable when many cities share the same sort value **/
	private shapeSort(input: Pick<DestinationsInquiry, 'sort' | 'direction'>): T {
		const direction = input.direction ?? Direction.DESC;
		return { [input.sort ?? 'createdAt']: direction, _id: direction };
	}

	/** The slug comes from the name and is unique, so a second city of the same name is refused up front **/
	private async shapeFreeSlug(name: string, ownId?: Types.ObjectId): Promise<string> {
		const destinationSlug = shapeIntoSlug(name);
		if (!destinationSlug) throw new BadRequestException(Messages.INVALID_DATA);

		const taken = await this.destinationModel
			.exists({ destinationSlug, ...(ownId && { _id: { $ne: ownId } }) })
			.exec();
		if (taken) throw new BadRequestException(Messages.DESTINATION_ALREADY_EXISTS);
		return destinationSlug;
	}

	/** Two admins saving the same name at once meet the unique index; the raw database error never reaches the client **/
	private throwIfSlugTaken(error: unknown): void {
		if ((error as { code?: number })?.code === 11000) {
			throw new BadRequestException(Messages.DESTINATION_ALREADY_EXISTS);
		}
	}

	private async attachViewerData(
		destination: Destination,
		memberId: Types.ObjectId,
	): Promise<Destination> {
		if (!memberId) return destination;

		const newView = await this.viewService.recordView({
			memberId,
			viewRefId: destination._id as unknown as Types.ObjectId,
			viewGroup: ViewGroup.DESTINATION,
		});
		if (newView) {
			await this.destinationStatsEditor({
				_id: destination._id as unknown as Types.ObjectId,
				targetKey: 'destinationViews',
				modifier: 1,
			});
			destination.destinationViews += 1;
		}

		destination.meLiked = await this.likeService.checkLikeExistence({
			memberId,
			likeRefId: destination._id as unknown as Types.ObjectId,
			likeGroup: LikeGroup.DESTINATION,
		});
		return destination;
	}
}
