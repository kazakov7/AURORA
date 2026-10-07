import { Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { OAuth2Client } from 'google-auth-library';
import { Member } from '../../libs/dto/member/member';
import { T } from '../../libs/types/common';
import { shapeIntoMongoObjectId } from '../../libs/config';
import { Messages } from '../../libs/enums/common.enum';

export interface GoogleIdentity {
	subject: string;
	email: string;
	name?: string;
}
@Injectable()
export class AuthService {
	constructor(private jwtService: JwtService) {}
	public async hashPassword(memberPassword: string): Promise<string> {
		const salt = await bcrypt.genSalt();
		return await bcrypt.hash(memberPassword, salt);
	}

	public async comparePasswords(password: string, hashedPassword: string): Promise<boolean> {
		return await bcrypt.compare(password, hashedPassword);
	}

	public async createToken(member: Member): Promise<string> {
		const payload: T = {};
		Object.keys(member['_doc'] ? member['_doc'] : member).map((ele) => {
			payload[`${ele}`] = member[`${ele}`];
		});
		delete payload.memberPassword;

		return await this.jwtService.signAsync(payload);
	}
	public async verifyToken(token: string): Promise<Member> {
		const member = await this.jwtService.verifyAsync(token);
		member._id = shapeIntoMongoObjectId(member._id);
		return member;
	}

	public async verifyGoogleCredential(credential: string): Promise<GoogleIdentity> {
		const clientId = process.env.GOOGLE_WEB_CLIENT_ID;
		if (!clientId) throw new ServiceUnavailableException(Messages.GOOGLE_AUTH_NOT_CONFIGURED);

		try {
			const client = new OAuth2Client(clientId);
			const ticket = await client.verifyIdToken({ idToken: credential, audience: clientId });
			const payload = ticket.getPayload();

			if (!payload?.sub || !payload.email || payload.email_verified !== true) {
				throw new UnauthorizedException(Messages.INVALID_GOOGLE_CREDENTIAL);
			}

			return {
				subject: payload.sub,
				email: payload.email.toLowerCase(),
				name: payload.name,
			};
		} catch (error) {
			if (error instanceof UnauthorizedException) throw error;
			throw new UnauthorizedException(Messages.INVALID_GOOGLE_CREDENTIAL);
		}
	}
}
