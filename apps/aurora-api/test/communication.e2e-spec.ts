import { INestApplication } from '@nestjs/common';
import { Types } from 'mongoose';
import { io, Socket } from 'socket.io-client';
import { NotificationService } from '../src/components/notification/notification.service';
import { MemberType } from '../src/libs/enums/member.enum';
import { NotificationGroup, NotificationType } from '../src/libs/enums/notification.enum';
import { clearDatabase, createTestApp, getTestUrl, graphQL, model, seedMember } from './helpers/e2e.helper';

describe('Notice, Notification, Chat and Socket.IO (e2e)', () => {
	let app: INestApplication;
	const sockets: Socket[] = [];

	beforeAll(async () => {
		app = await createTestApp();
	});

	afterEach(async () => {
		for (const socket of sockets.splice(0)) socket.disconnect();
		await clearDatabase(app);
	});

	afterAll(async () => {
		await app.close();
	});

	function connect(token: string): Promise<Socket> {
		return new Promise((resolve, reject) => {
			const socket = io(`${getTestUrl(app)}/chat`, {
				auth: { token },
				transports: ['websocket'],
				forceNew: true,
			});
			sockets.push(socket);
			socket.once('connect', () => resolve(socket));
			socket.once('connect_error', reject);
			setTimeout(() => reject(new Error('Socket connection timeout')), 5000);
		});
	}

	function emitAck<T = any>(socket: Socket, event: string, payload: unknown): Promise<T> {
		return new Promise((resolve, reject) => {
			socket.timeout(5000).emit(event, payload, (error: Error | null, response: T) => {
				if (error) reject(error);
				else resolve(response);
			});
		});
	}

	it('supports admin notice lifecycle and active authenticated feed', async () => {
		const admin = await seedMember(app, 'noticeadmin', MemberType.ADMIN);
		const user = await seedMember(app, 'noticeuser');
		const denied = await graphQL(
			app,
			`mutation { createNotice(input: { noticeCategory: FAQ, noticeTitle: "Denied notice", noticeContent: "Denied content" }) { _id } }`,
			{},
			user.accessToken,
		);
		expect(denied.body.errors).toBeDefined();

		const created = await graphQL(
			app,
			`mutation { createNotice(input: { noticeCategory: FAQ, noticeTitle: "Travel FAQ", noticeContent: "Booking guide" }) { _id noticeStatus } }`,
			{},
			admin.accessToken,
		);
		expect(created.body.errors).toBeUndefined();
		const noticeId = created.body.data.createNotice._id;
		await graphQL(
			app,
			`mutation Update($input: NoticeUpdate!) { updateNoticeByAdmin(input: $input) { _id noticeStatus } }`,
			{ input: { _id: noticeId, noticeStatus: 'ACTIVE' } },
			admin.accessToken,
		);

		const feed = await graphQL(
			app,
			`query Feed($input: NoticesInquiry!) { getNotices(input: $input) { list { _id noticeTitle noticeStatus } metaCounter { total } } }`,
			{ input: { page: 1, limit: 10 } },
			user.accessToken,
		);
		expect(feed.body.errors).toBeUndefined();
		expect(feed.body.data.getNotices.list).toHaveLength(1);

		const removed = await graphQL(
			app,
			`mutation Remove($id: String!) { removeNoticeByAdmin(noticeId: $id) }`,
			{ id: noticeId },
			admin.accessToken,
		);
		expect(removed.body.errors).toBeUndefined();
		expect((await model(app, 'Notice').findById(noticeId).lean()).noticeStatus).toBe('DELETED');
	});

	it('keeps notifications private and handles unread/read transitions', async () => {
		const receiver = await seedMember(app, 'notifyone');
		const other = await seedMember(app, 'notifytwo');
		const service = app.get(NotificationService);
		const notification = await service.createNotification({
			receiverId: new Types.ObjectId(receiver._id),
			notificationType: NotificationType.SYSTEM,
			notificationGroup: NotificationGroup.SYSTEM,
			notificationTitle: 'Welcome',
			notificationDesc: 'Welcome to AURA',
		});

		const unread = await graphQL(app, `query { getUnreadNotificationCount }`, {}, receiver.accessToken);
		expect(unread.body.data.getUnreadNotificationCount).toBe(1);
		const inbox = await graphQL(
			app,
			`query Inbox($input: NotificationsInquiry!) {
				getMyNotifications(input: $input) { list { _id notificationTitle notificationStatus } metaCounter { total } }
			}`,
			{ input: { page: 1, limit: 10 } },
			receiver.accessToken,
		);
		expect(inbox.body.errors).toBeUndefined();
		expect(inbox.body.data.getMyNotifications.list).toHaveLength(1);

		const otherRead = await graphQL(
			app,
			`mutation Read($input: MarkNotificationAsReadInput!) { markNotificationAsRead(input: $input) { _id } }`,
			{ input: { notificationId: notification._id.toString() } },
			other.accessToken,
		);
		expect(otherRead.body.errors).toBeDefined();

		const read = await graphQL(
			app,
			`mutation Read($input: MarkNotificationAsReadInput!) {
				markNotificationAsRead(input: $input) { _id notificationStatus }
			}`,
			{ input: { notificationId: notification._id.toString() } },
			receiver.accessToken,
		);
		expect(read.body.errors).toBeUndefined();
		expect(read.body.data.markNotificationAsRead.notificationStatus).toBe('READ');

		await service.createNotification({
			receiverId: new Types.ObjectId(receiver._id),
			notificationType: NotificationType.SYSTEM,
			notificationGroup: NotificationGroup.SYSTEM,
			notificationTitle: 'Second',
		});
		const allRead = await graphQL(app, `mutation { markAllNotificationsAsRead }`, {}, receiver.accessToken);
		expect(allRead.body.data.markAllNotificationsAsRead).toBe(1);
	});

	it('uses the authenticated chat socket for notification:new', async () => {
		const receiver = await seedMember(app, 'socketnotify');
		const socket = await connect(receiver.accessToken);
		const event = new Promise<any>((resolve, reject) => {
			socket.once('notification:new', resolve);
			setTimeout(() => reject(new Error('notification:new timeout')), 5000);
		});
		await app.get(NotificationService).createNotification({
			receiverId: new Types.ObjectId(receiver._id),
			notificationType: NotificationType.SYSTEM,
			notificationGroup: NotificationGroup.SYSTEM,
			notificationTitle: 'Realtime notification',
		});
		expect((await event).notificationTitle).toBe('Realtime notification');
	});

	it('never fails the caller when a notification cannot be created', async () => {
		const receiver = await seedMember(app, 'notifysafe');
		const service = app.get(NotificationService);
		await expect(
			service.createNotification({
				receiverId: new Types.ObjectId(receiver._id),
				notificationType: NotificationType.SYSTEM,
				notificationGroup: NotificationGroup.MEMBER,
				notificationTitle: 'Invalid group',
			}),
		).resolves.toBeNull();
		expect(await model(app, 'Notification').countDocuments({ receiverId: receiver._id })).toBe(0);
	});

	it('pushes notification:new in realtime when a member is followed', async () => {
		const owner = await seedMember(app, 'followowner');
		const follower = await seedMember(app, 'followfan');
		const socket = await connect(owner.accessToken);
		const event = new Promise<any>((resolve, reject) => {
			socket.once('notification:new', resolve);
			setTimeout(() => reject(new Error('notification:new timeout')), 5000);
		});
		const followed = await graphQL(app, `mutation Follow($input: String!) { subscribe(input: $input) { _id } }`, { input: owner._id }, follower.accessToken);
		expect(followed.body.errors).toBeUndefined();
		const notification = await event;
		expect(notification.notificationType).toBe(NotificationType.FOLLOW);
		expect(notification.authorId.toString()).toBe(follower._id.toString());
	});

	it('refreshes the JWT only on own getMember so role changes apply without re-login', async () => {
		const member = await seedMember(app, 'roleowner');
		const other = await seedMember(app, 'roleother');
		await model(app, 'Member').updateOne({ _id: member._id }, { memberType: MemberType.AGENT });
		const query = `query Member($input: String!) { getMember(input: $input) { _id memberType accessToken } }`;

		const own = await graphQL(app, query, { input: member._id }, member.accessToken);
		expect(own.body.errors).toBeUndefined();
		const payload = JSON.parse(Buffer.from(own.body.data.getMember.accessToken.split('.')[1], 'base64').toString());
		expect(payload.memberType).toBe(MemberType.AGENT);
		expect(payload.memberPassword).toBeUndefined();

		const foreign = await graphQL(app, query, { input: member._id }, other.accessToken);
		expect(foreign.body.data.getMember.accessToken).toBeNull();
	});

	it('canonicalizes DIRECT chat, keeps GLOBAL singleton and rejects self-chat', async () => {
		const first = await seedMember(app, 'chatfirst');
		const second = await seedMember(app, 'chatsecond');
		const createMutation = `mutation Direct($id: String!) {
			getOrCreateDirectChat(memberTwoId: $id) { _id directKey chatType }
		}`;
		const one = await graphQL(app, createMutation, { id: second._id }, first.accessToken);
		const two = await graphQL(app, createMutation, { id: first._id }, second.accessToken);
		expect(one.body.errors).toBeUndefined();
		expect(two.body.data.getOrCreateDirectChat._id).toBe(one.body.data.getOrCreateDirectChat._id);
		expect(await model(app, 'Chat').countDocuments({ chatType: 'DIRECT' })).toBe(1);

		const self = await graphQL(app, createMutation, { id: first._id }, first.accessToken);
		expect(self.body.errors).toBeDefined();

		const globalQuery = `query { getGlobalChat { _id chatType } }`;
		const globalOne = await graphQL(app, globalQuery, {}, first.accessToken);
		const globalTwo = await graphQL(app, globalQuery, {}, second.accessToken);
		expect(globalTwo.body.data.getGlobalChat._id).toBe(globalOne.body.data.getGlobalChat._id);
		expect(await model(app, 'Chat').countDocuments({ chatType: 'GLOBAL' })).toBe(1);
	});

	it('authenticates Socket.IO, protects direct rooms and delivers idempotent messages', async () => {
		const sender = await seedMember(app, 'socketsend');
		const receiver = await seedMember(app, 'socketrecv');
		const outsider = await seedMember(app, 'socketout');
		const direct = await graphQL(
			app,
			`mutation Direct($id: String!) { getOrCreateDirectChat(memberTwoId: $id) { _id } }`,
			{ id: receiver._id },
			sender.accessToken,
		);
		const chatId = direct.body.data.getOrCreateDirectChat._id;
		const senderSocket = await connect(sender.accessToken);
		const receiverSocket = await connect(receiver.accessToken);
		const outsiderSocket = await connect(outsider.accessToken);

		const deniedJoin: any = await emitAck(outsiderSocket, 'chat:join', { chatId });
		expect(deniedJoin.ok).toBe(false);
		const deniedSend: any = await emitAck(outsiderSocket, 'message:send', { chatId, messageContent: 'Denied' });
		expect(deniedSend.ok).toBe(false);

		const newMessage = new Promise<any>((resolve, reject) => {
			receiverSocket.once('message:new', resolve);
			setTimeout(() => reject(new Error('message:new timeout')), 5000);
		});
		const payload = { chatId, messageContent: 'Hello from socket', messageType: 'TEXT', clientMessageId: 'retry-001' };
		const sent: any = await emitAck(senderSocket, 'message:send', payload);
		expect(sent.ok).toBe(true);
		expect((await newMessage).messageContent).toBe('Hello from socket');
		const retry: any = await emitAck(senderSocket, 'message:send', payload);
		expect(retry.message._id).toBe(sent.message._id);
		expect(await model(app, 'Message').countDocuments({ chatId, clientMessageId: 'retry-001' })).toBe(1);

		const history = await graphQL(
			app,
			`query Messages($input: MessagesCursorInquiry!) {
				getMessages(input: $input) { list { _id messageContent clientMessageId senderId } nextCursor }
			}`,
			{ input: { chatId, limit: 20 } },
			receiver.accessToken,
		);
		expect(history.body.errors).toBeUndefined();
		expect(history.body.data.getMessages.list).toHaveLength(1);
	});

	it('rejects socket connection without JWT', async () => {
		const socket = io(`${getTestUrl(app)}/chat`, { transports: ['websocket'], forceNew: true });
		sockets.push(socket);
		const disconnected = new Promise<boolean>((resolve) => {
			socket.once('chat:error', () => resolve(true));
			socket.once('disconnect', () => resolve(true));
		});
		expect(await disconnected).toBe(true);
	});
});
