import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { LoggingInterceptor } from './interceptor/Logging.interceptor';
import { ValidationPipe } from '@nestjs/common';
import { graphqlUploadExpress } from 'graphql-upload';
import { join } from 'path';

async function bootstrap() {
	const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
	app.use(graphqlUploadExpress({ maxFileSize: 20 * 1024 * 1024, maxFiles: 10 }));
	app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads/' });
	app.useGlobalPipes(new ValidationPipe());
	app.useGlobalInterceptors(new LoggingInterceptor());
	app.enableCors({
		origin: process.env.CORS_ALLOWED_ORIGIN,
		credentials: true,
	});
	await app.listen(process.env.AURORA_PORT ?? 3000);
}
bootstrap();
