import { BadRequestException, UseGuards } from '@nestjs/common';
import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { createWriteStream } from 'fs';
import { validMimeTypes, getSerialForImage, isValidUploadTarget } from '../../libs/config';
import { AuthGuard } from '../auth/guards/auth.guard';
import { GraphQLUpload, FileUpload } from 'graphql-upload';
import { Messages } from '../../libs/enums/common.enum';


@Resolver()
export class ImageUploaderResolver {
    @UseGuards(AuthGuard)
    @Mutation((returns) => String)
    public async imageUploader(
        @Args({ name: 'file', type: () => GraphQLUpload })
        { createReadStream, filename, mimetype }: FileUpload,
        @Args('target') target: String,
    ): Promise<string> {
        console.log('Mutation: imageUploader');

        if (!filename) throw new Error(Messages.UPLOAD_FAILED);
        if (!isValidUploadTarget(target)) throw new BadRequestException(Messages.BAD_REQUEST);
        const validMime = validMimeTypes.includes(mimetype);
        if (!validMime) throw new Error(Messages.PROVIDE_ALLOWED_FORMAT);

        const imageName = getSerialForImage(mimetype);
        const url = `uploads/${target}/${imageName}`;
        const stream = createReadStream();

        const result = await new Promise((resolve, reject) => {
            stream.on('error', reject);
            stream
                .pipe(createWriteStream(url))
                .on('finish', () => resolve(true))
                .on('error', reject);
        });
        if (!result) throw new Error(Messages.UPLOAD_FAILED);

        return url;
    }

    @UseGuards(AuthGuard)
    @Mutation((returns) => [String])
    public async imagesUploader(
        @Args('files', { type: () => [GraphQLUpload] })
        files: Promise<FileUpload>[],
        @Args('target') target: String,
    ): Promise<string[]> {
        console.log('Mutation: imagesUploader');
        if (!isValidUploadTarget(target)) throw new BadRequestException(Messages.BAD_REQUEST);

        const uploadedImages = [];
        const promisedList = files.map(
            async (img: Promise<FileUpload>, index: number): Promise<Promise<void>> => {
                try {
                    const { filename, mimetype, encoding, createReadStream } = await img;

                    const validMime = validMimeTypes.includes(mimetype);
                    if (!validMime) throw new Error(Messages.PROVIDE_ALLOWED_FORMAT);

                    const imageName = getSerialForImage(mimetype);
                    const url = `uploads/${target}/${imageName}`;
                    const stream = createReadStream();

                    const result = await new Promise((resolve, reject) => {
                        stream
                            .pipe(createWriteStream(url))
                            .on('finish', () => resolve(true))
                            .on('error', () => reject(false));
                    });
                    if (!result) throw new Error(Messages.UPLOAD_FAILED);

                    // @ts-ignore
                    uploadedImages[index] = url;
                } catch (err) {
                    console.log('Error, file missing!');
                }
            },
        );

        await Promise.all(promisedList);
        return uploadedImages;
    }
}
