import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import TravelHistorySchema from '../../schemas/TravelHistory.model';

@Module({
	imports: [MongooseModule.forFeature([{ name: 'TravelHistory', schema: TravelHistorySchema }])],
})
export class TravelHistoryModule {}
