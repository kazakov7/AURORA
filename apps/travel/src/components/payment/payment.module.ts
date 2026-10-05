import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import BookingSchema from '../../schemas/Booking.model';
import PaymentSchema from '../../schemas/Payment.model';
import PropertySchema from '../../schemas/Property.model';
import TourSchema from '../../schemas/Tour.model';
import { AuthModule } from '../auth/auth.module';
import { PaymentController } from './payment.controller';
import { PaymentResolver } from './payment.resolver';
import { PaymentService } from './payment.service';

@Module({
	imports: [
		MongooseModule.forFeature([
			{ name: 'Payment', schema: PaymentSchema },
			{ name: 'Booking', schema: BookingSchema },
			{ name: 'Property', schema: PropertySchema },
			{ name: 'Tour', schema: TourSchema },
		]),
		AuthModule,
	],
	controllers: [PaymentController],
	providers: [PaymentResolver, PaymentService],
	exports: [PaymentService],
})
export class PaymentModule {}
