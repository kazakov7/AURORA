import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import BookingSchema from '../../schemas/Booking.model';

@Module({
	imports: [MongooseModule.forFeature([{ name: 'Booking', schema: BookingSchema }])],
})
export class BookingModule {}
