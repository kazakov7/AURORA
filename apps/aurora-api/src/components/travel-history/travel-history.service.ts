import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { BookingCategory, BookingStatus } from '../../libs/enums/booking.enum';
import { TravelHistories, TravelHistory } from '../../libs/dto/travelHistory/travel.history';
import { TravelHistoriesInquiry } from '../../libs/dto/travelHistory/travel.history.input';

@Injectable()
export class TravelHistoryService implements OnModuleInit, OnModuleDestroy {
	private completionTimer?: NodeJS.Timeout;

	constructor(
		@InjectModel('TravelHistory') private readonly travelHistoryModel: Model<TravelHistory>,
		@InjectModel('Booking') private readonly bookingModel: Model<any>,
		@InjectModel('Property') private readonly propertyModel: Model<any>,
		@InjectModel('Tour') private readonly tourModel: Model<any>,
		@InjectConnection() private readonly connection: Connection,
	) {}

	public onModuleInit(): void {
		// A failed sweep is retried on the next tick; an unhandled rejection would stop the whole server
		this.completionTimer = setInterval(
			() =>
				void this.completeExpiredBookings().catch((error) =>
					console.error('Booking completion failed:', error),
				),
			60 * 1000,
		);
	}

	public onModuleDestroy(): void {
		if (this.completionTimer) clearInterval(this.completionTimer);
	}

	public async completeExpiredBookings(): Promise<void> {
		const now = new Date();
		const propertyBookings = await this.bookingModel
			.find({
				bookingCategory: BookingCategory.PROPERTY,
				bookingStatus: BookingStatus.CONFIRMED,
				checkOut: { $lte: now },
			})
			.select('_id')
			.lean()
			.exec();

		for (const booking of propertyBookings) {
			await this.completeBooking(booking._id as Types.ObjectId);
		}

		const tourBookings = await this.bookingModel
			.aggregate([
				{
					$match: { bookingCategory: BookingCategory.TOUR, bookingStatus: BookingStatus.CONFIRMED },
				},
				{
					$lookup: {
						from: 'tours',
						localField: 'bookingRefId',
						foreignField: '_id',
						as: 'tourData',
					},
				},
				{ $unwind: '$tourData' },
				{ $match: { 'tourData.tourEndDate': { $lte: now } } },
				{ $project: { _id: 1 } },
			])
			.exec();

		for (const booking of tourBookings) {
			await this.completeBooking(booking._id as Types.ObjectId);
		}
	}

	public async getMyTravelHistories(
		memberId: Types.ObjectId,
		input: TravelHistoriesInquiry,
	): Promise<TravelHistories> {
		const result = await this.travelHistoryModel
			.aggregate([
				{ $match: { memberId } },
				{ $sort: { visitedAt: -1, createdAt: -1 } },
				{
					$facet: {
						list: [
							{ $skip: (input.page - 1) * input.limit },
							{ $limit: input.limit },
							{
								$lookup: {
									from: 'bookings',
									localField: 'bookingId',
									foreignField: '_id',
									as: 'bookingData',
								},
							},
							{ $unwind: { path: '$bookingData', preserveNullAndEmptyArrays: true } },
							{
								$lookup: {
									from: 'destinations',
									localField: 'destinationId',
									foreignField: '_id',
									as: 'destinationData',
								},
							},
							{ $unwind: { path: '$destinationData', preserveNullAndEmptyArrays: true } },
							{
								$lookup: {
									from: 'properties',
									localField: 'bookingData.bookingRefId',
									foreignField: '_id',
									as: 'propertyData',
								},
							},
							{ $unwind: { path: '$propertyData', preserveNullAndEmptyArrays: true } },
							{
								$lookup: {
									from: 'tours',
									localField: 'bookingData.bookingRefId',
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

		return result[0] as TravelHistories;
	}

	private async completeBooking(bookingId: Types.ObjectId): Promise<void> {
		const session = await this.connection.startSession();
		try {
			await session.withTransaction(async () => {
				const booking = await this.bookingModel
					.findOne({ _id: bookingId, bookingStatus: BookingStatus.CONFIRMED })
					.session(session)
					.exec();
				if (!booking) return;

				const target =
					booking.bookingCategory === BookingCategory.PROPERTY
						? await this.propertyModel.findById(booking.bookingRefId).session(session).exec()
						: await this.tourModel.findById(booking.bookingRefId).session(session).exec();
				if (!target?.destinationId) return;

				const finishedAt =
					booking.bookingCategory === BookingCategory.PROPERTY
						? booking.checkOut
						: target.tourEndDate;
				if (!finishedAt || finishedAt > new Date()) return;

				const completedBooking = await this.bookingModel
					.findOneAndUpdate(
						{ _id: bookingId, bookingStatus: BookingStatus.CONFIRMED },
						{ bookingStatus: BookingStatus.COMPLETED },
						{ new: true, session },
					)
					.exec();
				if (!completedBooking) return;

				await this.travelHistoryModel.create(
					[
						{
							memberId: completedBooking.memberId,
							destinationId: target.destinationId,
							bookingId: completedBooking._id,
							visitedAt: finishedAt,
						},
					],
					{ session },
				);
			});
		} finally {
			await session.endSession();
		}
	}
}
