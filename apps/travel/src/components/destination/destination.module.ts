import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import DestinationSchema from '../../schemas/Destination.model';

@Module({
	imports: [MongooseModule.forFeature([{ name: 'Destination', schema: DestinationSchema }])],
})
export class DestinationModule {}
