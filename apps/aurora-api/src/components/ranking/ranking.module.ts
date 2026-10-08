import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import AgentSchema from '../../schemas/Agent.model';
import DestinationSchema from '../../schemas/Destination.model';
import MemberSchema from '../../schemas/Member.model';
import PropertySchema from '../../schemas/Property.model';
import RankingPublicationSchema from '../../schemas/RankingPublication.model';
import RankingSnapshotSchema from '../../schemas/RankingSnapshot.model';
import TourSchema from '../../schemas/Tour.model';
import { RankingResolver } from './ranking.resolver';
import { RankingService } from './ranking.service';

@Module({
	imports: [
		MongooseModule.forFeature([
			{ name: 'RankingSnapshot', schema: RankingSnapshotSchema },
			{ name: 'RankingPublication', schema: RankingPublicationSchema },
			{ name: 'Destination', schema: DestinationSchema },
			{ name: 'Property', schema: PropertySchema },
			{ name: 'Tour', schema: TourSchema },
			{ name: 'Member', schema: MemberSchema },
			{ name: 'Agent', schema: AgentSchema },
		]),
	],
	providers: [RankingResolver, RankingService],
	exports: [RankingService],
})
export class RankingModule {}
