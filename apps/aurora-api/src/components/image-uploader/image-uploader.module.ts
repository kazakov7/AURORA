import { Module } from '@nestjs/common';
import { ImageUploaderResolver } from './image-uploader.resolver';
import { AuthModule } from '../auth/auth.module';

@Module({
	imports: [AuthModule],
	providers: [ImageUploaderResolver],
})
export class ImageUploaderModule {}
