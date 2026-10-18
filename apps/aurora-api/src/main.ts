import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { LoggingInterceptor } from './interceptor/Logging.interceptor';
import { ValidationPipe } from '@nestjs/common';
import { join } from 'path';
import { createCorsOptions } from './libs/cors';
import { securityHeaders } from './libs/security-headers';
import graphqlUploadExpress from 'graphql-upload/graphqlUploadExpress.js';

async function bootstrap() {
	const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
	app.use(securityHeaders); //har bir HTTP javobiga xavfsizlik headerlarini qo‘shadi.
	app.useGlobalPipes(new ValidationPipe());
	app.useGlobalInterceptors(new LoggingInterceptor());
	app.use(graphqlUploadExpress({ maxFileSize: 10000000, maxFiles: 10 }));
	app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads/' });
	app.enableCors(createCorsOptions());
	await app.listen(process.env.AURORA_PORT ?? 3000);
}
bootstrap();
