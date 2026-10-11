
import { BadRequestException, UseGuards } from '@nestjs/common';
import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { v2 as cloudinary } from 'cloudinary';
import { GraphQLUpload, FileUpload } from 'graphql-upload';

import {
    validMimeTypes,
    isValidUploadTarget,
} from '../../libs/config';
import { Messages } from '../../libs/enums/common.enum';
import { AuthGuard } from '../auth/guards/auth.guard';

@Resolver()
export class ImageUploaderResolver {
    private async uploadToCloudinary(
        file: FileUpload,
        target: string,
    ): Promise<string> {
        const { filename, mimetype, createReadStream } = file;

        if (!filename) {
            throw new BadRequestException(Messages.UPLOAD_FAILED);
        }

        if (!validMimeTypes.includes(mimetype)) {
            throw new BadRequestException(Messages.PROVIDE_ALLOWED_FORMAT);
        }

        const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
        const apiKey = process.env.CLOUDINARY_API_KEY;
        const apiSecret = process.env.CLOUDINARY_API_SECRET;

        if (!cloudName || !apiKey || !apiSecret) {
            throw new Error('Cloudinary configuration is missing');
        }

        cloudinary.config({
            cloud_name: cloudName,
            api_key: apiKey,
            api_secret: apiSecret,
            secure: true,
        });

        return new Promise<string>((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
                {
                    folder: `aurora/${target}`,
                    resource_type: 'image',
                    unique_filename: true,
                    overwrite: false,
                },
                (error, result) => {
                    if (error) {
                        reject(error);
                        return;
                    }

                    if (!result?.secure_url) {
                        reject(new Error(Messages.UPLOAD_FAILED));
                        return;
                    }

                    resolve(result.secure_url);
                },
            );

            const sourceStream = createReadStream();

            sourceStream.on('error', reject);
            uploadStream.on('error', reject);

            sourceStream.pipe(uploadStream);
        });
    }

    @UseGuards(AuthGuard)
    @Mutation(() => String)
    public async imageUploader(
        @Args({ name: 'file', type: () => GraphQLUpload })
        file: FileUpload,
        @Args('target') target: string,
    ): Promise<string> {
        if (!isValidUploadTarget(target)) {
            throw new BadRequestException(Messages.BAD_REQUEST);
        }

        return this.uploadToCloudinary(file, target);
    }

    @UseGuards(AuthGuard)
    @Mutation(() => [String])
    public async imagesUploader(
        @Args('files', { type: () => [GraphQLUpload] })
        files: Promise<FileUpload>[],
        @Args('target') target: string,
    ): Promise<string[]> {
        if (!isValidUploadTarget(target)) {
            throw new BadRequestException(Messages.BAD_REQUEST);
        }

        return Promise.all(
            files.map(async (filePromise) => {
                const file = await filePromise;
                return this.uploadToCloudinary(file, target);
            }),
        );
    }
}
