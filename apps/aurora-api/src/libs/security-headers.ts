import { NextFunction, Request, Response } from 'express';

/** The API answers JSON and images only: nothing to frame, sniff or refer to, and no framework to announce **/
export function securityHeaders(_request: Request, response: Response, next: NextFunction): void {
	response.removeHeader('X-Powered-By');
	response.setHeader('X-Content-Type-Options', 'nosniff');
	response.setHeader('X-Frame-Options', 'DENY');
	response.setHeader('Referrer-Policy', 'no-referrer');
	next();
}
