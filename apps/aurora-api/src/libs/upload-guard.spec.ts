import { UnauthorizedException } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { AuthService } from '../components/auth/auth.service';
import { Messages } from './enums/common.enum';
import { verifyUploadToken } from './upload-guard';

describe('verifyUploadToken', () => {
	const verifyToken = jest.fn();
	const verify = verifyUploadToken({ verifyToken } as unknown as AuthService);

	const request = (authorization?: string, contentType = 'multipart/form-data') =>
		({
			is: (type: string) => (type === contentType ? type : false),
			headers: authorization ? { authorization } : {},
		}) as unknown as Request;
	const response = () => {
		const res = { status: jest.fn(), json: jest.fn() };
		res.status.mockReturnValue(res);
		return res as unknown as Response & typeof res;
	};

	beforeEach(() => verifyToken.mockReset());

	it('lets a request that is not multipart through without checking the token', async () => {
		const next = jest.fn();
		await verify(
			request(undefined, 'application/json'),
			response(),
			next as unknown as NextFunction,
		);
		expect(next).toHaveBeenCalledWith();
		expect(verifyToken).not.toHaveBeenCalled();
	});

	it('answers a multipart request without a token before the body is parsed', async () => {
		const res = response();
		const next = jest.fn();
		await verify(request(), res, next as unknown as NextFunction);
		expect(next).not.toHaveBeenCalled();
		expect(res.status).toHaveBeenCalledWith(200);
		expect(res.json).toHaveBeenCalledWith({
			data: null,
			errors: [{ message: Messages.TOKEN_NOT_EXIST, extensions: { code: 'UNAUTHENTICATED' } }],
		});
	});

	it('answers an expired token with the message the AuthGuard uses', async () => {
		verifyToken.mockRejectedValue(new UnauthorizedException(Messages.TOKEN_EXPIRED));
		const res = response();
		const next = jest.fn();
		await verify(request('Bearer old-token'), res, next as unknown as NextFunction);
		expect(next).not.toHaveBeenCalled();
		expect(res.json).toHaveBeenCalledWith({
			data: null,
			errors: [{ message: Messages.TOKEN_EXPIRED, extensions: { code: 'UNAUTHENTICATED' } }],
		});
	});

	it('hands a multipart request with a verified token on to the parser', async () => {
		verifyToken.mockResolvedValue({ _id: 'member-id' });
		const next = jest.fn();
		await verify(request('Bearer valid-token'), response(), next as unknown as NextFunction);
		expect(verifyToken).toHaveBeenCalledWith('valid-token');
		expect(next).toHaveBeenCalledWith();
	});

	it('passes a database failure to Nest instead of answering as unauthenticated', async () => {
		const failure = new Error('connection lost');
		verifyToken.mockRejectedValue(failure);
		const res = response();
		const next = jest.fn();
		await verify(request('Bearer valid-token'), res, next as unknown as NextFunction);
		expect(next).toHaveBeenCalledWith(failure);
		expect(res.json).not.toHaveBeenCalled();
	});
});
