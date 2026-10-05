import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import ReviewSchema from '../../schemas/Review.model';

@Module({
	imports: [MongooseModule.forFeature([{ name: 'Review', schema: ReviewSchema }])],
})
export class ReviewModule {}
