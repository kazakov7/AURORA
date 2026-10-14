import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { LoggingInterceptor } from './interceptor/Logging.interceptor';
import { ValidationPipe } from '@nestjs/common';
import { join } from 'path';
import { AuthService } from './components/auth/auth.service';
import { createCorsOptions } from './libs/cors';
import { securityHeaders } from './libs/security-headers';
import { graphqlUploadMiddleware } from './libs/upload-guard';

async function bootstrap() {
	const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
	app.use(securityHeaders);
	app.use('/graphql', graphqlUploadMiddleware(app.get(AuthService)));
	app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads/' });
	app.useGlobalPipes(new ValidationPipe());
	app.useGlobalInterceptors(new LoggingInterceptor());
	// HTTP and the chat socket share one allowlist, so a production origin works for both
	app.enableCors(createCorsOptions());
	// PM2 stops with a signal: open requests, timers and the database connection close cleanly
	app.enableShutdownHooks();
	await app.listen(process.env.AURORA_PORT ?? 3000);
}
bootstrap();
