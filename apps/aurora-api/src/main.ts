import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { LoggingInterceptor } from './interceptor/Logging.interceptor';
import { ValidationPipe } from '@nestjs/common';
import { graphqlUploadExpress } from 'graphql-upload';
import { join } from 'path';
import { createCorsOptions } from './libs/cors';

async function bootstrap() {
	const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
	app.use(graphqlUploadExpress({ maxFileSize: 10_000_000, maxFiles: 10 }));
	app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads/' });
	app.useGlobalPipes(new ValidationPipe());
	app.useGlobalInterceptors(new LoggingInterceptor());
	app.enableCors(createCorsOptions());
	await app.listen(process.env.AURORA_PORT ?? process.env.TRAVEL_PORT ?? 3000);
}
bootstrap();
