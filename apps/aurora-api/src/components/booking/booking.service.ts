import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, PipelineStage, Types } from 'mongoose';
import { Bookings, PropertyAvailabilityRange } from '../../libs/dto/booking/booking';
import { BookingsInquiry, PropertyAvailabilityInquiry } from '../../libs/dto/booking/booking.input';
import { BookingCategory, BookingStatus } from '../../libs/enums/booking.enum';
import { Messages } from '../../libs/enums/common.enum';
import { NotificationGroup, NotificationType } from '../../libs/enums/notification.enum';
import { T } from '../../libs/types/common';
import {
	addBookingDates,
	lookupMember,
	lookupMemberWithContact,
	lookupPropertyData,
	lookupRatingData,
	lookupTourData,
} from '../../libs/config';
import { NotificationService } from '../notification/notification.service';

@Injectable()
export class BookingService {
	constructor(
		@InjectModel('Booking') private readonly bookingModel: Model<any>,
		@InjectModel('Property') private readonly propertyModel: Model<any>,
		@InjectModel('Tour') private readonly tourModel: Model<any>,
		private readonly notificationService: NotificationService,
	) {}

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

		return this.bookingModel
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
				{ _id: 0, checkIn: 1, checkOut: 1 },
			)
			.sort({ checkIn: 1 })
			.lean<PropertyAvailabilityRange[]>()
			.exec();
	}

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

	/** True while a confirmed stay or a live payment hold of the hotel has not checked out yet **/
	public async hasUpcomingPropertyBooking(propertyId: Types.ObjectId): Promise<boolean> {
		const now = new Date();
		const booking = await this.bookingModel
			.exists({
				bookingCategory: BookingCategory.PROPERTY,
				bookingRefId: propertyId,
				checkOut: { $gt: now },
				$or: [
					{ bookingStatus: BookingStatus.CONFIRMED },
					{ bookingStatus: BookingStatus.PENDING, expiresAt: null },
					{ bookingStatus: BookingStatus.PENDING, expiresAt: { $gt: now } },
				],
			})
			.exec();

		return Boolean(booking);
	}

	/**
	 * Guests keep a booking whose hotel or tour left the catalog: they are told so, and the admins
	 * learn which listings still have guests to look after.
	 */
	public async notifyInactiveListingGuests(
		bookingCategory: BookingCategory,
		listingIds: Types.ObjectId[],
	): Promise<void> {
		if (!listingIds.length) return;
		const now = new Date();
		const upcoming: T = {
			bookingCategory,
			bookingRefId: { $in: listingIds },
			bookingStatus: BookingStatus.CONFIRMED,
			...(bookingCategory === BookingCategory.PROPERTY
				? { checkOut: { $gt: now } }
				: { 'priceSnapshot.tourEndDate': { $gt: now } }),
		};
		const bookings = await this.bookingModel
			.find(upcoming)
			.select('_id memberId bookingRefId')
			.lean<{ _id: Types.ObjectId; memberId: Types.ObjectId; bookingRefId: Types.ObjectId }[]>()
			.exec();
		if (!bookings.length) return;

		const input = {
			notificationType: NotificationType.BOOKING,
			notificationGroup: NotificationGroup.BOOKING,
		};
		for (const booking of bookings) {
			await this.notificationService.createNotification({
				...input,
				receiverId: booking.memberId,
				notificationRefId: booking._id,
				notificationTitle: 'Your booked listing is unavailable',
				notificationDesc:
					'The hotel or tour you booked is no longer listed. Your booking stays valid; contact support if you need help.',
				notificationEventKey: `booking-listing-inactive:${booking._id}:${now.getTime()}`,
			});
		}
		for (const listingId of new Set(bookings.map((booking) => String(booking.bookingRefId)))) {
			await this.notificationService.notifyActiveAdmins({
				...input,
				notificationRefId: new Types.ObjectId(listingId),
				notificationTitle: 'Booked listing deactivated',
				notificationDesc: 'A listing with upcoming confirmed bookings left the catalog.',
				notificationEventKey: `booking-listing-inactive:${listingId}:${now.getTime()}`,
			});
		}
	}

	public async getMyBookings(memberId: Types.ObjectId, input: BookingsInquiry): Promise<Bookings> {
		const match: T = { memberId, ...this.shapeSearch(input) };
		return this.getBookingList(match, input, [
			lookupPropertyData,
			lookupTourData,
			lookupRatingData,
		]);
	}

	/** The host's own listings are read first, so the bookings of other hosts are never scanned **/
	public async getAgentPropertyBookings(
		memberId: Types.ObjectId,
		input: BookingsInquiry,
	): Promise<Bookings> {
		const propertyIds = await this.propertyModel.distinct('_id', { memberId }).exec();
		const match: T = {
			...this.shapeSearch(input),
			bookingCategory: BookingCategory.PROPERTY,
			bookingRefId: { $in: propertyIds },
		};
		return this.getBookingList(match, input, [lookupPropertyData, lookupMemberWithContact]);
	}

	public async getMyTourBookings(
		memberId: Types.ObjectId,
		input: BookingsInquiry,
	): Promise<Bookings> {
		const match: T = {
			memberId,
			...this.shapeSearch(input),
			bookingCategory: BookingCategory.TOUR,
		};
		return this.getBookingList(match, input, [lookupTourData]);
	}

	public async getAgentTourBookings(
		memberId: Types.ObjectId,
		input: BookingsInquiry,
	): Promise<Bookings> {
		const tourIds = await this.tourModel.distinct('_id', { memberId }).exec();
		const match: T = {
			...this.shapeSearch(input),
			bookingCategory: BookingCategory.TOUR,
			bookingRefId: { $in: tourIds },
		};
		return this.getBookingList(match, input, [lookupTourData, lookupMemberWithContact]);
	}

	public async getAllBookingsByAdmin(input: BookingsInquiry): Promise<Bookings> {
		return this.getBookingList(this.shapeSearch(input), input, [
			lookupMember,
			lookupPropertyData,
			lookupTourData,
		]);
	}

	private shapeSearch(input: BookingsInquiry): T {
		const match: T = {};
		if (input.search?.bookingStatusList?.length) {
			match.bookingStatus = { $in: input.search.bookingStatusList };
		}
		if (input.search?.bookingCategory) match.bookingCategory = input.search.bookingCategory;
		return match;
	}

	/** The _id tie-breaker keeps pages stable when many bookings share the same creation time **/
	private async getBookingList(
		match: T,
		input: BookingsInquiry,
		lookups: PipelineStage.FacetPipelineStage[],
	): Promise<Bookings> {
		const unwinds = lookups.map((lookup) => ({
			$unwind: { path: `$${(lookup as T).$lookup.as}`, preserveNullAndEmptyArrays: true },
		}));
		const result = await this.bookingModel
			.aggregate([
				{ $match: match },
				{ $sort: { createdAt: -1, _id: -1 } },
				{
					$facet: {
						list: [
							{ $skip: (input.page - 1) * input.limit },
							{ $limit: input.limit },
							addBookingDates,
							...lookups.flatMap((lookup, index) => [lookup, unwinds[index]]),
						],
						metaCounter: [{ $count: 'total' }],
					},
				},
			])
			.exec();

		return result[0] as Bookings;
	}
}
