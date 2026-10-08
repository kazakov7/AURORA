import { registerEnumType } from '@nestjs/graphql';

export enum RankingType {
	TRENDING_DESTINATIONS = 'TRENDING_DESTINATIONS',
	TOP_PROPERTIES = 'TOP_PROPERTIES',
	TOP_TOURS = 'TOP_TOURS',
	TOP_TRAVELERS = 'TOP_TRAVELERS',
	TOP_HOTEL_AGENTS = 'TOP_HOTEL_AGENTS',
	TOP_TOUR_AGENTS = 'TOP_TOUR_AGENTS',
	POPULAR_DESTINATIONS_BY_BOOKINGS = 'POPULAR_DESTINATIONS_BY_BOOKINGS',
}
registerEnumType(RankingType, { name: 'RankingType' });

export enum RankingScope {
	GLOBAL = 'GLOBAL',
	DESTINATION = 'DESTINATION',
}
registerEnumType(RankingScope, { name: 'RankingScope' });
