import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import BookingSchema from '../../schemas/Booking.model';
import DestinationSchema from '../../schemas/Destination.model';
import PropertySchema from '../../schemas/Property.model';
import TourSchema from '../../schemas/Tour.model';
import TravelHistorySchema from '../../schemas/TravelHistory.model';
import { AuthModule } from '../auth/auth.module';
import { TravelHistoryResolver } from './travel-history.resolver';
import { TravelHistoryService } from './travel-history.service';

@Module({
	imports: [
		MongooseModule.forFeature([
			{ name: 'TravelHistory', schema: TravelHistorySchema },
			{ name: 'Booking', schema: BookingSchema },
			{ name: 'Property', schema: PropertySchema },
			{ name: 'Tour', schema: TourSchema },
			{ name: 'Destination', schema: DestinationSchema },
		]),
		AuthModule,
	],
	providers: [TravelHistoryResolver, TravelHistoryService],
	exports: [TravelHistoryService],
})
export class TravelHistoryModule {}
