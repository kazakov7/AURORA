import { NestFactory } from '@nestjs/core';
import { AuroraBatchModule } from './aurora-batch.module';

async function bootstrap() {
	const app = await NestFactory.create(AuroraBatchModule);
	await app.listen(process.env.BATCH_PORT ?? 3000);
}
bootstrap();
