import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { LoggingInterceptor } from './interceptor/Logging.interceptor';
import { ValidationPipe } from '@nestjs/common';
import { join } from 'path';
import { AuthService } from './components/auth/auth.service';
import { graphqlUploadMiddleware } from './libs/upload-guard';

async function bootstrap() {
	const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
	app.use('/graphql', graphqlUploadMiddleware(app.get(AuthService)));
	app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads/' });
	app.useGlobalPipes(new ValidationPipe());
	app.useGlobalInterceptors(new LoggingInterceptor());
	app.enableCors({
		origin: [process.env.CORS_ALLOWED_ORIGIN as string, 'http://localhost:3000'],
		credentials: true,
	});
	await app.listen(process.env.AURORA_PORT ?? 3000);
}
bootstrap();
