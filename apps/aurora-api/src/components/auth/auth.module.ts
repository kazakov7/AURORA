import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { HttpModule } from '@nestjs/axios';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import MemberSchema from '../../schemas/Member.model';
@Module({
	imports: [
		HttpModule,
		MongooseModule.forFeature([{ name: 'Member', schema: MemberSchema }]),
		/** Read at startup: ConfigModule loads .env after this file is imported, so the secret would be "undefined" **/
		JwtModule.registerAsync({
			useFactory: () => {
				const secret = process.env.SECRET_TOKEN;
				if (!secret) throw new Error('SECRET_TOKEN is not set');
				return { secret, signOptions: { expiresIn: '30d' } };
			},
		}),
	],
	providers: [AuthService],
	exports: [AuthService],
})
export class AuthModule {}
