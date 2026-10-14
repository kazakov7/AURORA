import { INestApplication } from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';
import { Writable } from 'stream';
import request from 'supertest';
import { Messages } from '../src/libs/enums/common.enum';
import { clearDatabase, createTestApp, graphQL, seedMember } from './helpers/e2e.helper';

const IMAGE_UPLOADER = `mutation ImageUploader($file: Upload!, $target: String!) { imageUploader(file: $file, target: $target) }`;
const IMAGES_UPLOADER = `mutation ImagesUploader($files: [Upload!]!, $target: String!) { imagesUploader(files: $files, target: $target) }`;

/** The real Cloudinary account is never called: upload_stream is replaced by a sink that reports a fake URL **/
describe('Image uploads through the GraphQL multipart parser (e2e)', () => {
	let app: INestApplication;
	let uploadStream: jest.SpyInstance;

	beforeAll(async () => {
		process.env.CLOUDINARY_CLOUD_NAME = 'aurora-test';
		process.env.CLOUDINARY_API_KEY = 'test-key';
		process.env.CLOUDINARY_API_SECRET = 'test-secret';
		app = await createTestApp();
		uploadStream = jest.spyOn(cloudinary.uploader, 'upload_stream').mockImplementation(
			((options: { folder: string }, callback: (error: unknown, result: unknown) => void) =>
				new Writable({
					write(_chunk, _encoding, next) {
						next();
					},
					final(done) {
						callback(undefined, {
							secure_url: `https://res.cloudinary.com/aurora-test/image/upload/${options.folder}/stub.png`,
						});
						done();
					},
				})) as never,
		);
	});

	afterEach(async () => {
		uploadStream.mockClear();
		await clearDatabase(app);
	});

	afterAll(async () => {
		uploadStream.mockRestore();
		delete process.env.CLOUDINARY_CLOUD_NAME;
		delete process.env.CLOUDINARY_API_KEY;
		delete process.env.CLOUDINARY_API_SECRET;
		await app.close();
	});

	/** Builds a GraphQL multipart request; each file is attached under the key the map points to **/
	const sendUpload = (
		token: string | undefined,
		operations: Record<string, unknown>,
		map: Record<string, string[]>,
		fileNames: string[],
	) => {
		const testRequest = request(app.getHttpServer())
			.post('/graphql')
			.set('Apollo-Require-Preflight', 'true')
			.field('operations', JSON.stringify(operations))
			.field('map', JSON.stringify(map));
		if (token) testRequest.set('Authorization', `Bearer ${token}`);
		fileNames.forEach((fileName, index) =>
			testRequest.attach(String(index), Buffer.from('fake image bytes'), {
				filename: fileName,
				contentType: 'image/png',
			}),
		);
		return testRequest;
	};

	const uploadOne = (token: string | undefined) =>
		sendUpload(
			token,
			{ query: IMAGE_UPLOADER, variables: { file: null, target: 'member' } },
			{ '0': ['variables.file'] },
			['avatar.png'],
		);

	it('refuses an upload without a token and keeps answering other requests', async () => {
		const response = await uploadOne(undefined);

		expect(response.body.errors[0].extensions.code).toBe('UNAUTHENTICATED');
		expect(response.body.errors[0].message).toBe(Messages.TOKEN_NOT_EXIST);
		expect(uploadStream).not.toHaveBeenCalled();

		const alive = await graphQL(app, '{ __typename }');
		expect(alive.body.data).toEqual({ __typename: 'Query' });
	});

	it('refuses an invalid token with the same error the AuthGuard returns', async () => {
		const response = await uploadOne('not-a-real-token');

		expect(response.body.errors[0].extensions.code).toBe('UNAUTHENTICATED');
		expect(response.body.errors[0].message).toBe(Messages.NOT_AUTHENTICATED);
		expect(uploadStream).not.toHaveBeenCalled();
	});

	it('uploads one image for a signed-in member and returns its URL', async () => {
		const member = await seedMember(app, 'uploader');

		const response = await uploadOne(member.accessToken);

		expect(response.body.errors).toBeUndefined();
		expect(response.body.data.imageUploader).toBe(
			'https://res.cloudinary.com/aurora-test/image/upload/aurora/member/stub.png',
		);
		expect(uploadStream).toHaveBeenCalledTimes(1);
		expect(uploadStream.mock.calls[0][0]).toMatchObject({ folder: 'aurora/member' });
	});

	it('uploads several images in one request and returns every URL', async () => {
		const member = await seedMember(app, 'gallery');

		const response = await sendUpload(
			member.accessToken,
			{ query: IMAGES_UPLOADER, variables: { files: [null, null], target: 'member' } },
			{ '0': ['variables.files.0'], '1': ['variables.files.1'] },
			['first.png', 'second.png'],
		);

		expect(response.body.errors).toBeUndefined();
		expect(response.body.data.imagesUploader).toHaveLength(2);
		expect(uploadStream).toHaveBeenCalledTimes(2);
	});
});
