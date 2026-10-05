jest.mock('@nestjs/mongoose', () => ({
	InjectConnection: () => () => undefined,
	InjectModel: () => () => undefined,
}));
jest.mock('stripe', () => ({
	__esModule: true,
	default: class Stripe {
		paymentIntents = {
			create: jest.fn(),
			retrieve: jest.fn(),
			cancel: jest.fn(),
		};
		refunds = { create: jest.fn() };
		webhooks = { constructEvent: jest.fn() };
	},
}));

import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import { BookingCategory, BookingStatus } from '../../libs/enums/booking.enum';
import { PaymentService } from './payment.service';

describe('PaymentService hold rules', () => {
	it('accepts only integer KRW amounts', () => {
		const service = new PaymentService({} as any, {} as any, {} as any, {} as any, {} as any);
		expect(() => (service as any).validateKrwAmount(10000, 'KRW')).not.toThrow();
		expect(() => (service as any).validateKrwAmount(10000.5, 'KRW')).toThrow(BadRequestException);
		expect(() => (service as any).validateKrwAmount(10000, 'USD')).toThrow(BadRequestException);
	});

	it('expires a pending tour hold once and returns its seats', async () => {
		const bookingId = new Types.ObjectId();
		const tourId = new Types.ObjectId();
		const find = jest.fn().mockReturnValue({
			select: jest.fn().mockReturnValue({ lean: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue([{ _id: bookingId }]) }) }),
		});
		const findOneAndUpdate = jest.fn().mockReturnValue({
			exec: jest.fn().mockResolvedValue({
				_id: bookingId,
				bookingCategory: BookingCategory.TOUR,
				bookingStatus: BookingStatus.CANCELLED,
				bookingRefId: tourId,
				bookingGuests: 2,
			}),
		});
		const updateOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({}) });
		const paymentModel = { find: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue([]) }) };
		const service = new PaymentService(paymentModel as any, { find, findOneAndUpdate } as any, {} as any, { updateOne } as any, {} as any);

		await service.expirePendingBookings();

		expect(updateOne).toHaveBeenCalledWith({ _id: tourId }, { $inc: { tourReservedSeats: -2 } });
		expect(findOneAndUpdate).toHaveBeenCalledTimes(1);
	});
});
