import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Booking, Bookings } from '../../libs/dto/booking/booking';
import { BookingsInquiry, CreatePropertyBookingInput, CreateTourBookingInput } from '../../libs/dto/booking/booking.input';
import { BookingCategory, BookingStatus } from '../../libs/enums/booking.enum';
import { Messages } from '../../libs/enums/common.enum';
import { PropertyStatus } from '../../libs/enums/property.enum';
import { TourStatus } from '../../libs/enums/tour.enum';
import { T } from '../../libs/types/common';
import { lookupMember } from '../../libs/config';

@Injectable()
export class BookingService {
	constructor(
		@InjectModel('Booking') private readonly bookingModel: Model<any>,
		@InjectModel('Property') private readonly propertyModel: Model<any>,
		@InjectModel('Tour') private readonly tourModel: Model<any>,
	) {}

	public async getUnavailablePropertyIds(checkIn: Date, checkOut: Date): Promise<Types.ObjectId[]> {
		const propertyIds = await this.bookingModel
			.distinct('bookingRefId', {
				bookingCategory: BookingCategory.PROPERTY,
				bookingStatus: { $in: [BookingStatus.PENDING, BookingStatus.CONFIRMED] },
				checkIn: { $lt: checkOut },
				checkOut: { $gt: checkIn },
			})
			.exec();

		return propertyIds as Types.ObjectId[];
	}

	public async createPropertyBooking(
		memberId: Types.ObjectId,
		input: CreatePropertyBookingInput,
	): Promise<Booking> {
		const propertyId = new Types.ObjectId(input.propertyId);
		this.validateBookingDates(input.checkIn, input.checkOut);

		const property = await this.propertyModel
			.findOne({ _id: propertyId, propertyStatus: PropertyStatus.ACTIVE, deletedAt: null })
			.lean()
			.exec();

		if (!property) throw new BadRequestException(Messages.PROPERTY_CANNOT_BE_BOOKED);
		if (input.bookingGuests > property.maxGuests) throw new BadRequestException(Messages.PROPERTY_NOT_AVAILABLE);

		const isAvailable = await this.isPropertyAvailable(propertyId, input.checkIn, input.checkOut);
		if (!isAvailable) throw new BadRequestException(Messages.BOOKING_NOT_AVAILABLE);

		const nights = this.getNights(input.checkIn, input.checkOut);
		const result = await this.bookingModel.create({
			memberId,
			bookingCategory: BookingCategory.PROPERTY,
			bookingStatus: BookingStatus.PENDING,
			bookingRefId: propertyId,
			checkIn: input.checkIn,
			checkOut: input.checkOut,
			bookingGuests: input.bookingGuests,
			bookingTotalPrice: property.pricePerNight * nights,
			bookingCurrency: property.currency,
			priceSnapshot: {
				propertyId,
				propertyName: property.propertyName,
				pricePerNight: property.pricePerNight,
				currency: property.currency,
				nights,
			},
			bookingNote: input.bookingNote,
		});

		return result as Booking;
	}

	public async cancelBooking(memberId: Types.ObjectId, bookingId: Types.ObjectId): Promise<Booking> {
		const result = await this.bookingModel
			.findOneAndUpdate(
				{
					_id: bookingId,
					memberId,
					bookingCategory: BookingCategory.PROPERTY,
					bookingStatus: BookingStatus.PENDING,
				},
				{ bookingStatus: BookingStatus.CANCELLED, cancelledAt: new Date() },
				{ new: true },
			)
			.exec();

		if (!result) throw new BadRequestException(Messages.BOOKING_CANNOT_CANCEL);
		return result as Booking;
	}

	public async createTourBooking(memberId: Types.ObjectId, input: CreateTourBookingInput): Promise<Booking> {
		const tourId = new Types.ObjectId(input.tourId);
		const today = new Date();
		today.setHours(0, 0, 0, 0);

		const tour = await this.tourModel
			.findOneAndUpdate(
				{
					_id: tourId,
					tourStatus: TourStatus.ACTIVE,
					deletedAt: null,
					tourStartDate: { $gte: today },
					$expr: { $lte: [{ $add: ['$tourReservedSeats', input.bookingGuests] }, '$tourCapacity'] },
				},
				{ $inc: { tourReservedSeats: input.bookingGuests } },
				{ new: true },
			)
			.lean()
			.exec();

		if (!tour) throw new BadRequestException(Messages.TOUR_FULL);

		try {
			const result = await this.bookingModel.create({
				memberId,
				bookingCategory: BookingCategory.TOUR,
				bookingStatus: BookingStatus.PENDING,
				bookingRefId: tourId,
				bookingGuests: input.bookingGuests,
				bookingTotalPrice: tour.tourPrice * input.bookingGuests,
				bookingCurrency: tour.tourCurrency,
				priceSnapshot: {
					tourId,
					tourName: tour.tourName,
					pricePerPerson: tour.tourPrice,
					currency: tour.tourCurrency,
					tourStartDate: tour.tourStartDate,
					tourEndDate: tour.tourEndDate,
					seats: input.bookingGuests,
				},
				bookingNote: input.bookingNote,
			});

			return result as Booking;
		} catch (error) {
			await this.tourModel.updateOne({ _id: tourId }, { $inc: { tourReservedSeats: -input.bookingGuests } }).exec();
			throw new BadRequestException(Messages.CREATE_FAILED);
		}
	}

	public async cancelTourBooking(memberId: Types.ObjectId, bookingId: Types.ObjectId): Promise<Booking> {
		const result = await this.bookingModel
			.findOneAndUpdate(
				{
					_id: bookingId,
					memberId,
					bookingCategory: BookingCategory.TOUR,
					bookingStatus: BookingStatus.PENDING,
				},
				{ bookingStatus: BookingStatus.CANCELLED, cancelledAt: new Date() },
				{ new: true },
			)
			.exec();

		if (!result) throw new BadRequestException(Messages.BOOKING_CANNOT_CANCEL);
		await this.tourModel.updateOne({ _id: result.bookingRefId }, { $inc: { tourReservedSeats: -result.bookingGuests } }).exec();
		return result as Booking;
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

	private async isPropertyAvailable(propertyId: Types.ObjectId, checkIn: Date, checkOut: Date): Promise<boolean> {
		const conflictingBooking = await this.bookingModel
			.exists({
				bookingCategory: BookingCategory.PROPERTY,
				bookingRefId: propertyId,
				bookingStatus: { $in: [BookingStatus.PENDING, BookingStatus.CONFIRMED] },
				checkIn: { $lt: checkOut },
				checkOut: { $gt: checkIn },
			})
			.exec();

		return !conflictingBooking;
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

	private validateBookingDates(checkIn: Date, checkOut: Date): void {
		if (!(checkIn instanceof Date) || !(checkOut instanceof Date) || checkOut <= checkIn) {
			throw new BadRequestException(Messages.INVALID_DATA);
		}

		const today = new Date();
		today.setHours(0, 0, 0, 0);
		if (checkIn < today) throw new BadRequestException(Messages.INVALID_DATA);
	}

	private getNights(checkIn: Date, checkOut: Date): number {
		return Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));
	}
}
