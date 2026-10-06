import { UseGuards } from '@nestjs/common';
import { Args, Query, Resolver } from '@nestjs/graphql';
import { Types } from 'mongoose';
import { TravelHistories } from '../../libs/dto/travelHistory/travel.history';
import { TravelHistoriesInquiry } from '../../libs/dto/travelHistory/travel.history.input';
import { AuthMember } from '../auth/decorators/authMember.decorator';
import { AuthGuard } from '../auth/guards/auth.guard';
import { TravelHistoryService } from './travel-history.service';

@Resolver()
export class TravelHistoryResolver {
	constructor(private readonly travelHistoryService: TravelHistoryService) {}

	@UseGuards(AuthGuard)
	@Query(() => TravelHistories)
	public async getMyTravelHistories(
		@Args('input') input: TravelHistoriesInquiry,
		@AuthMember('_id') memberId: Types.ObjectId,
	): Promise<TravelHistories> {
		return this.travelHistoryService.getMyTravelHistories(memberId, input);
	}
}
