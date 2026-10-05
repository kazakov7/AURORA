import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import TourSchema from '../../schemas/Tour.model';

@Module({
	imports: [MongooseModule.forFeature([{ name: 'Tour', schema: TourSchema }])],
})
export class TourModule {}
