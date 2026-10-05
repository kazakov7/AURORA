jest.mock('@nestjs/mongoose', () => ({ InjectModel: () => () => undefined }));
jest.mock('../../libs/config', () => ({
	shapeIntoMongoObjectId: (value: unknown) => {
		const { Types } = require('mongoose');
		return typeof value === 'string' ? new Types.ObjectId(value) : value;
	},
	lookUpAuthMemberLiked: () => ({ $lookup: {} }),
	lookupMember: { $lookup: {} },
}));
jest.mock('../member/member.service', () => ({ MemberService: class MemberService {} }));
jest.mock('../like/like.service', () => ({ LikeService: class LikeService {} }));
jest.mock('../view/view.service', () => ({ ViewService: class ViewService {} }));

import { BadRequestException } from '@nestjs/common';
import { TourService } from './tour.service';
import { TourStatus } from '../../libs/enums/tour.enum';

describe('TourService catalog filters', () => {
	it('uses a single destination, departure window and remaining-seat expression', () => {
		const service = new TourService({} as any, {} as any, {} as any, {} as any);
		const match: Record<string, unknown> = {};
		(service as any).shapeMatchQuery(match, {
			search: {
				destinationId: '507f1f77bcf86cd799439011',
				tourDepartureCity: 'Seoul',
				tourDestinationCity: 'Jeju',
				tourStartDateRange: { start: new Date('2030-04-01'), end: new Date('2030-04-30') },
				tourPriceRange: { start: 100, end: 500 },
				minAvailableSeats: 3,
			},
		});

		expect(match.destinationId).toEqual(expect.anything());
		expect(match).toMatchObject({
			tourDepartureCity: 'Seoul',
			tourDestinationCity: 'Jeju',
			tourPrice: { $gte: 100, $lte: 500 },
			$expr: { $gte: [{ $subtract: ['$tourCapacity', '$tourReservedSeats'] }, 3] },
		});
	});

	it('rejects an inverted departure date range', () => {
		const service = new TourService({} as any, {} as any, {} as any, {} as any);
		expect(() =>
			(service as any).shapeMatchQuery({}, {
				search: { tourStartDateRange: { start: new Date('2030-04-30'), end: new Date('2030-04-01') } },
			}),
		).toThrow(BadRequestException);
	});

	it('keeps the public catalog active-only', async () => {
		const aggregate = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue([{ list: [], metaCounter: [] }]) });
		const service = new TourService({ aggregate } as any, {} as any, {} as any, {} as any);

		await service.getTours(null as any, { page: 1, limit: 10, search: {} });

		expect(aggregate.mock.calls[0][0][0]).toEqual({
			$match: { tourStatus: TourStatus.ACTIVE, deletedAt: null },
		});
	});
});
