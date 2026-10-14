import { UnauthorizedException } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import graphqlUploadExpress from 'graphql-upload/graphqlUploadExpress.js';
import { AuthService } from '../components/auth/auth.service';
import { Messages } from './enums/common.enum';

/** graphql-upload reads the whole multipart body before any GraphQL guard runs, so only a verified token may reach it **/
export const verifyUploadToken =
	(authService: AuthService) => async (req: Request, res: Response, next: NextFunction) => {
		if (!req.is('multipart/form-data')) return next();

		const bearerToken = req.headers.authorization;
		const token = bearerToken?.startsWith('Bearer ') ? bearerToken.slice(7).trim() : '';
		try {
			if (!token) {
				throw new UnauthorizedException(
					bearerToken ? Messages.NOT_AUTHENTICATED : Messages.TOKEN_NOT_EXIST,
				);
			}
			await authService.verifyToken(token);
		} catch (error) {
			if (!(error instanceof UnauthorizedException)) return next(error);
			/** The same GraphQL error the AuthGuard returns, so the client still signs the member out when the token expired **/
			return res.status(200).json({
				data: null,
				errors: [{ message: error.message, extensions: { code: 'UNAUTHENTICATED' } }],
			});
		}
		return next();
	};

/** Multipart uploads for /graphql: the body is parsed only after its token is verified **/
export const graphqlUploadMiddleware = (authService: AuthService) => [
	verifyUploadToken(authService),
	graphqlUploadExpress({ maxFileSize: 20 * 1024 * 1024, maxFiles: 10 }),
];
