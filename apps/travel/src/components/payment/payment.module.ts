import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import PaymentSchema from '../../schemas/Payment.model';

@Module({
	imports: [MongooseModule.forFeature([{ name: 'Payment', schema: PaymentSchema }])],
})
export class PaymentModule {}
