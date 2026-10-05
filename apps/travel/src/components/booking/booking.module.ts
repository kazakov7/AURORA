import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import BookingSchema from '../../schemas/Booking.model';
import PropertySchema from '../../schemas/Property.model';
import TourSchema from '../../schemas/Tour.model';
import { AuthModule } from '../auth/auth.module';
import { BookingResolver } from './booking.resolver';
import { BookingService } from './booking.service';
import { PaymentModule } from '../payment/payment.module';

@Module({
	imports: [
		MongooseModule.forFeature([
			{ name: 'Booking', schema: BookingSchema },
			{ name: 'Property', schema: PropertySchema },
			{ name: 'Tour', schema: TourSchema },
		]),
		AuthModule,
		PaymentModule,
	],
	providers: [BookingResolver, BookingService],
	exports: [BookingService],
})
export class BookingModule {}
