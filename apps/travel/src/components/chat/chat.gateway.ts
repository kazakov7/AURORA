import { SubscribeMessage, WebSocketGateway, WebSocketServer, ConnectedSocket, MessageBody } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Types } from 'mongoose';
import { MessageInput } from '../../libs/dto/message/message.input';
import { Messages } from '../../libs/enums/common.enum';
import { AuthService } from '../auth/auth.service';
import { MessageService } from '../message/message.service';
import { ChatService } from './chat.service';

@WebSocketGateway({ namespace: 'chat', cors: { origin: true, credentials: true } })
export class ChatGateway {
	@WebSocketServer()
	server: Server;

	constructor(
		private readonly authService: AuthService,
		private readonly chatService: ChatService,
		private readonly messageService: MessageService,
	) { }

	public async handleConnection(client: Socket): Promise<void> {
		try {
			const token = this.extractToken(client);
			if (!token) throw new Error(Messages.TOKEN_NOT_EXIST);

			const authMember = await this.authService.verifyToken(token);
			client.data.authMember = authMember;
			await client.join(this.memberRoom(authMember._id));

			const globalChat = await this.chatService.getGlobalChat();
			await client.join(this.chatRoom(globalChat._id));
		} catch (err: any) {
			client.emit('chat:error', { message: err?.message ?? Messages.NOT_AUTHENTICATED });
			client.disconnect(true);
		}
	}

	@SubscribeMessage('chat:join')
	public async joinChat(@MessageBody() payload: { chatId?: string }, @ConnectedSocket() client: Socket) {
		try {
			const memberId = this.getMemberId(client);
			const chatId = this.getObjectId(payload?.chatId);
			await this.chatService.assertChatAccess(memberId, chatId);
			await client.join(this.chatRoom(chatId));
			return { ok: true, chatId: chatId.toString() };
		} catch (err: any) {
			return this.errorResult(err);
		}
	}

	@SubscribeMessage('chat:leave')
	public async leaveChat(@MessageBody() payload: { chatId?: string }, @ConnectedSocket() client: Socket) {
		try {
			const memberId = this.getMemberId(client);
			const chatId = this.getObjectId(payload?.chatId);
			await this.chatService.assertChatAccess(memberId, chatId);
			await client.leave(this.chatRoom(chatId));
			return { ok: true, chatId: chatId.toString() };
		} catch (err: any) {
			return this.errorResult(err);
		}
	}

	@SubscribeMessage('message:send')
	public async sendMessage(@MessageBody() payload: MessageInput, @ConnectedSocket() client: Socket) {
		try {
			const memberId = this.getMemberId(client);
			const message = await this.messageService.createMessage(memberId, payload);
			const recipients = await this.messageService.getChatRecipients(message.chatId as unknown as Types.ObjectId);

			if (recipients.length) {
				this.server.to(recipients.map((recipient) => this.memberRoom(recipient))).emit('message:new', message);
			} else {
				this.server.to(this.chatRoom(message.chatId)).emit('message:new', message);
			}

			return { ok: true, message };
		} catch (err: any) {
			return this.errorResult(err);
		}
	}

	private extractToken(client: Socket): string | undefined {
		const authToken = client.handshake.auth?.token;
		if (typeof authToken === 'string' && authToken) return authToken;

		const authorization = client.handshake.headers.authorization;
		if (typeof authorization !== 'string') return undefined;
		return authorization.startsWith('Bearer ') ? authorization.split(' ')[1] : undefined;
	}

	private getMemberId(client: Socket): Types.ObjectId {
		const memberId = client.data.authMember?._id;
		if (!memberId) throw new Error(Messages.NOT_AUTHENTICATED);
		return new Types.ObjectId(memberId);
	}

	private getObjectId(id?: string): Types.ObjectId {
		if (!id || !Types.ObjectId.isValid(id)) throw new Error(Messages.INVALID_ID);
		return new Types.ObjectId(id);
	}

	private memberRoom(memberId: any): string {
		return `member:${memberId.toString()}`;
	}

	private chatRoom(chatId: any): string {
		return `chat:${chatId.toString()}`;
	}

	private errorResult(err: any) {
		return { ok: false, message: err?.message ?? Messages.SOMETHING_WENT_WRONG };
	}
}
