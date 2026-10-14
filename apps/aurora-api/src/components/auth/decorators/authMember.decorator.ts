import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const AuthMember = createParamDecorator((data: string, context: ExecutionContext | any) => {
	let request: any;
	if (context.contextType === 'graphql') {
		request = context.getArgByIndex(2).req;
		if (request.authMember) {
			request.authMember.authorization = request.headers?.authorization;
		}
	} else request = context.switchToHttp().getRequest();

	// Only a guard sets request.authMember; the body is client data and is never trusted
	const member = request.authMember;

	if (member) return data ? member?.[data] : member;
	else return null;
});
