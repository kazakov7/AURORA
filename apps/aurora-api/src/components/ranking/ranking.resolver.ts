import { Args, Query, Resolver } from '@nestjs/graphql';
import { AgentType } from '../../libs/enums/agent.enum';
import { Destinations } from '../../libs/dto/destination/destination';
import { Members } from '../../libs/dto/member/member';
import { Properties } from '../../libs/dto/property/property';
import { RankingAgents } from '../../libs/dto/ranking/ranking';
import { RankingInquiry, TopAgentsInquiry } from '../../libs/dto/ranking/ranking.input';
import { Tours } from '../../libs/dto/tour/tour';
import { RankingType } from '../../libs/enums/ranking.enum';
import { RankingService } from './ranking.service';

@Resolver()
export class RankingResolver {
	constructor(private readonly rankingService: RankingService) {}

	@Query(() => Destinations)
	public async getTrendingDestinations(@Args('input', { nullable: true }) input?: RankingInquiry): Promise<Destinations> {
		return this.rankingService.getDestinations(RankingType.TRENDING_DESTINATIONS, input?.limit ?? 5);
	}

	@Query(() => Properties)
	public async getTopProperties(@Args('input', { nullable: true }) input?: RankingInquiry): Promise<Properties> {
		return this.rankingService.getProperties(input?.destinationId, input?.limit ?? 4);
	}

	@Query(() => Tours)
	public async getTopTours(@Args('input', { nullable: true }) input?: RankingInquiry): Promise<Tours> {
		return this.rankingService.getTours(input?.destinationId, input?.limit ?? 4);
	}

	@Query(() => Members)
	public async getTopTravelers(@Args('input', { nullable: true }) input?: RankingInquiry): Promise<Members> {
		return this.rankingService.getTravelers(input?.destinationId, input?.limit ?? 4);
	}

	@Query(() => RankingAgents)
	public async getTopAgents(@Args('input') input: TopAgentsInquiry): Promise<RankingAgents> {
		return this.rankingService.getAgents(input.agentType as AgentType, input.limit ?? 4);
	}

	@Query(() => Destinations)
	public async getPopularDestinationsByBookings(@Args('input', { nullable: true }) input?: RankingInquiry): Promise<Destinations> {
		return this.rankingService.getDestinations(RankingType.POPULAR_DESTINATIONS_BY_BOOKINGS, input?.limit ?? 5);
	}
}
