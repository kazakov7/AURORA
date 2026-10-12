import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Booking, Bookings, PropertyAvailabilityRange } from '../../libs/dto/booking/booking';
import { BookingsInquiry, PropertyAvailabilityInquiry } from '../../libs/dto/booking/booking.input';
import { BookingCategory, BookingStatus } from '../../libs/enums/booking.enum';
import { Messages } from '../../libs/enums/common.enum';
import { T } from '../../libs/types/common';
import { lookupMember } from '../../libs/config';

@Injectable()
export class BookingService {
	constructor(@InjectModel('Booking') private readonly bookingModel: Model<any>) {}

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

	/**
	 * Calendar availability uses half-open intervals: [checkIn, checkOut).
	 * Therefore a guest can check in on the same date a previous guest checks out.
	 */
	public async getPropertyAvailability(
		input: PropertyAvailabilityInquiry,
	): Promise<PropertyAvailabilityRange[]> {
		if (
			!Types.ObjectId.isValid(input.propertyId) ||
			!(input.startDate instanceof Date) ||
			!(input.endDate instanceof Date) ||
			input.endDate <= input.startDate
		) {
			throw new BadRequestException(Messages.INVALID_DATA);
		}

		const now = new Date();
		const ranges = await this.bookingModel
			.find(
				{
					bookingCategory: BookingCategory.PROPERTY,
					bookingRefId: new Types.ObjectId(input.propertyId),
					checkIn: { $lt: input.endDate },
					checkOut: { $gt: input.startDate },
					$or: [
						{ bookingStatus: BookingStatus.CONFIRMED },
						{ bookingStatus: BookingStatus.PENDING, expiresAt: null },
						{ bookingStatus: BookingStatus.PENDING, expiresAt: { $gt: now } },
					],
				},
				{ checkIn: 1, checkOut: 1 },
			)
			.sort({ checkIn: 1 })
			.lean()
			.exec();

		const availabilityRanges = ranges as unknown as Array<{ checkIn: Date; checkOut: Date }>;
		return availabilityRanges.map((range) => ({
			checkIn: range.checkIn,
			checkOut: range.checkOut,
		}));
	}

	public async getMyBookings(memberId: Types.ObjectId, input: BookingsInquiry): Promise<Bookings> {
		const match: T = { memberId };
		if (input.search?.bookingStatusList?.length) {
			match.bookingStatus = { $in: input.search.bookingStatusList };
		}
		return this.getBookings(match, input);
	}

	public async getAgentPropertyBookings(
		memberId: Types.ObjectId,
		input: BookingsInquiry,
	): Promise<Bookings> {
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

	public async getMyTourBookings(
		memberId: Types.ObjectId,
		input: BookingsInquiry,
	): Promise<Bookings> {
		const match: T = { memberId, bookingCategory: BookingCategory.TOUR };
		if (input.search?.bookingStatusList?.length) {
			match.bookingStatus = { $in: input.search.bookingStatusList };
		}
		return this.getTourBookings(match, input);
	}

	public async getAgentTourBookings(
		memberId: Types.ObjectId,
		input: BookingsInquiry,
	): Promise<Bookings> {
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
							{
								$lookup: {
									from: 'properties',
									localField: 'bookingRefId',
									foreignField: '_id',
									as: 'propertyData',
								},
							},
							{ $unwind: { path: '$propertyData', preserveNullAndEmptyArrays: true } },
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
