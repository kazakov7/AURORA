import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Connection, Model } from 'mongoose';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import request from 'supertest';
import { AddressInfo } from 'net';
import { AppModule } from '../../src/app.module';
import { AuthService } from '../../src/components/auth/auth.service';
import { MemberService } from '../../src/components/member/member.service';
import { MemberType } from '../../src/libs/enums/member.enum';
import { createCorsOptions } from '../../src/libs/cors';
import { graphqlUploadMiddleware } from '../../src/libs/upload-guard';

export interface TestMember {
	_id: string;
	memberNick: string;
	memberType: MemberType;
	accessToken: string;
}

export async function createTestApp(): Promise<INestApplication> {
	const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
	const app = moduleRef.createNestApplication({ rawBody: true });
	app.use('/graphql', graphqlUploadMiddleware(app.get(AuthService)));
	app.useGlobalPipes(new ValidationPipe());
	app.enableCors(createCorsOptions());
	await app.listen(0, '127.0.0.1');
	return app;
}

export function getTestUrl(app: INestApplication): string {
	const address = app.getHttpServer().address() as AddressInfo;
	return `http://127.0.0.1:${address.port}`;
}

export async function clearDatabase(app: INestApplication): Promise<void> {
	const connection = app.get<Connection>(getConnectionToken());
	await Promise.all(
		Object.values(connection.collections).map((collection) => collection.deleteMany({})),
	);
}

export async function graphQL(
	app: INestApplication,
	query: string,
	variables: Record<string, unknown> = {},
	token?: string,
) {
	const testRequest = request(app.getHttpServer()).post('/graphql').send({ query, variables });
	if (token) testRequest.set('Authorization', `Bearer ${token}`);
	return await testRequest;
}

export async function seedMember(
	app: INestApplication,
	memberNick: string,
	memberType: MemberType = MemberType.USER,
): Promise<TestMember> {
	const memberService = app.get(MemberService);
	const memberModel = app.get<Model<any>>(getModelToken('Member'));
	const member = await memberService.signup({ memberNick, memberPassword: 'pass1234' });
	if (memberType !== MemberType.USER) {
		await memberModel.updateOne({ _id: member._id }, { memberType }).exec();
	}
	const login = await memberService.login({ memberNick, memberPassword: 'pass1234' });
	return {
		_id: login._id.toString(),
		memberNick,
		memberType,
		accessToken: login.accessToken!,
	};
}

export function model<T = any>(app: INestApplication, name: string): Model<T> {
	return app.get<Model<T>>(getModelToken(name));
}
