import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Booking, Bookings } from '../../libs/dto/booking/booking';
import { BookingsInquiry } from '../../libs/dto/booking/booking.input';
import { BookingCategory, BookingStatus } from '../../libs/enums/booking.enum';
import { T } from '../../libs/types/common';
import { lookupMember } from '../../libs/config';

@Injectable()
export class BookingService {
	constructor(
		@InjectModel('Booking') private readonly bookingModel: Model<any>,
	) { }

	public async getUnavailablePropertyIds(checkIn: Date, checkOut: Date): Promise<Types.ObjectId[]> {
		const now = new Date();
		const propertyIds = await this.bookingModel
			.distinct('bookingRefId', {
				bookingCategory: BookingCategory.PROPERTY,
				$or: [
					{ bookingStatus: BookingStatus.CONFIRMED },
					{ bookingStatus: BookingStatus.PENDING, expiresAt: null },
					{ bookingStatus: BookingStatus.PENDING, expiresAt: { $gt: now } },
				],
				checkIn: { $lt: checkOut },
				checkOut: { $gt: checkIn },
			})
			.exec();

		return propertyIds as Types.ObjectId[];
	}

	public async getMyBookings(memberId: Types.ObjectId, input: BookingsInquiry): Promise<Bookings> {
		const match: T = { memberId, bookingCategory: BookingCategory.PROPERTY };
		if (input.search?.bookingStatusList?.length) {
			match.bookingStatus = { $in: input.search.bookingStatusList };
		}
		return this.getBookings(match, input);
	}

	public async getAgentPropertyBookings(memberId: Types.ObjectId, input: BookingsInquiry): Promise<Bookings> {
		const match: T = { bookingCategory: BookingCategory.PROPERTY };
		if (input.search?.bookingStatusList?.length) {
			match.bookingStatus = { $in: input.search.bookingStatusList };
		}

		const result = await this.bookingModel
			.aggregate([
				{ $match: match },
				{
					$lookup: {
						from: 'properties',
						localField: 'bookingRefId',
						foreignField: '_id',
						as: 'propertyData',
					},
				},
				{ $unwind: '$propertyData' },
				{ $match: { 'propertyData.memberId': memberId } },
				{ $sort: { createdAt: -1 } },
				{
					$facet: {
						list: [
							{ $skip: (input.page - 1) * input.limit },
							{ $limit: input.limit },
							lookupMember,
							{ $unwind: { path: '$memberData', preserveNullAndEmptyArrays: true } },
						],
						metaCounter: [{ $count: 'total' }],
					},
				},
			])
			.exec();

		return result[0] as Bookings;
	}

	public async getMyTourBookings(memberId: Types.ObjectId, input: BookingsInquiry): Promise<Bookings> {
		const match: T = { memberId, bookingCategory: BookingCategory.TOUR };
		if (input.search?.bookingStatusList?.length) {
			match.bookingStatus = { $in: input.search.bookingStatusList };
		}
		return this.getTourBookings(match, input);
	}

	public async getAgentTourBookings(memberId: Types.ObjectId, input: BookingsInquiry): Promise<Bookings> {
		const match: T = { bookingCategory: BookingCategory.TOUR };
		if (input.search?.bookingStatusList?.length) {
			match.bookingStatus = { $in: input.search.bookingStatusList };
		}

		const result = await this.bookingModel
			.aggregate([
				{ $match: match },
				{
					$lookup: {
						from: 'tours',
						localField: 'bookingRefId',
						foreignField: '_id',
						as: 'tourData',
					},
				},
				{ $unwind: '$tourData' },
				{ $match: { 'tourData.memberId': memberId } },
				{ $sort: { createdAt: -1 } },
				{
					$facet: {
						list: [
							{ $skip: (input.page - 1) * input.limit },
							{ $limit: input.limit },
							lookupMember,
							{ $unwind: { path: '$memberData', preserveNullAndEmptyArrays: true } },
						],
						metaCounter: [{ $count: 'total' }],
					},
				},
			])
			.exec();

		return result[0] as Bookings;
	}


	public async getAllBookingsByAdmin(input: BookingsInquiry): Promise<Bookings> {
		const match: T = {};
		if (input.search?.bookingStatusList?.length) {
			match.bookingStatus = { $in: input.search.bookingStatusList };
		}

		const result = await this.bookingModel
			.aggregate([
				{ $match: match },
				{ $sort: { createdAt: -1 } },
				{
					$facet: {
						list: [
							{ $skip: (input.page - 1) * input.limit },
							{ $limit: input.limit },
							lookupMember,
							{ $unwind: { path: '$memberData', preserveNullAndEmptyArrays: true } },
							{ $lookup: { from: 'properties', localField: 'bookingRefId', foreignField: '_id', as: 'propertyData' } },
							{ $unwind: { path: '$propertyData', preserveNullAndEmptyArrays: true } },
							{ $lookup: { from: 'tours', localField: 'bookingRefId', foreignField: '_id', as: 'tourData' } },
							{ $unwind: { path: '$tourData', preserveNullAndEmptyArrays: true } }
						],
						metaCounter: [{ $count: 'total' }],
					},
				},
			])
			.exec();

		return result[0] as Bookings;
	}

	private async getBookings(match: T, input: BookingsInquiry): Promise<Bookings> {
		const result = await this.bookingModel
			.aggregate([
				{ $match: match },
				{ $sort: { createdAt: -1 } },
				{
					$facet: {
						list: [
							{ $skip: (input.page - 1) * input.limit },
							{ $limit: input.limit },
							{
								$lookup: {
									from: 'properties',
									localField: 'bookingRefId',
									foreignField: '_id',
									as: 'propertyData',
								},
							},
							{ $unwind: { path: '$propertyData', preserveNullAndEmptyArrays: true } },
						],
						metaCounter: [{ $count: 'total' }],
					},
				},
			])
			.exec();

		return result[0] as Bookings;
	}

	private async getTourBookings(match: T, input: BookingsInquiry): Promise<Bookings> {
		const result = await this.bookingModel
			.aggregate([
				{ $match: match },
				{ $sort: { createdAt: -1 } },
				{
					$facet: {
						list: [
							{ $skip: (input.page - 1) * input.limit },
							{ $limit: input.limit },
							{
								$lookup: {
									from: 'tours',
									localField: 'bookingRefId',
									foreignField: '_id',
									as: 'tourData',
								},
							},
							{ $unwind: { path: '$tourData', preserveNullAndEmptyArrays: true } },
						],
						metaCounter: [{ $count: 'total' }],
					},
				},
			])
			.exec();

		return result[0] as Bookings;
	}

}
