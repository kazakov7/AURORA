import { INestApplication } from '@nestjs/common';
import { Types } from 'mongoose';
import { MemberService } from '../src/components/member/member.service';
import { Messages } from '../src/libs/enums/common.enum';
import { MemberType } from '../src/libs/enums/member.enum';
import { clearDatabase, createTestApp, graphQL, model, seedMember } from './helpers/e2e.helper';

describe('Board article (e2e)', () => {
	let app: INestApplication;

	beforeAll(async () => {
		app = await createTestApp();
	});

	afterEach(async () => {
		jest.restoreAllMocks();
		await clearDatabase(app);
	});

	afterAll(async () => {
		await app.close();
	});

	const CREATE = `mutation Create($input: BoardArticleInput!) {
		createBoardArticle(input: $input) { _id articleTitle articleContent }
	}`;
	const UPDATE = `mutation Update($input: BoardArticleUpdate!) {
		updateBoardArticle(input: $input) { _id articleTitle articleImage articleStatus }
	}`;
	const DETAIL = `query Detail($id: String!) {
		getBoardArticle(articleId: $id) { _id articleTitle memberData { _id } }
	}`;
	const LIST = `query List($input: BoardArticlesInquiry!) {
		getBoardArticles(input: $input) { list { _id memberData { _id } } metaCounter { total } }
	}`;

	function story(extra: object = {}) {
		return {
			articleCategory: 'GUIDE',
			articleTitle: 'Two days in Seoul',
			articleContent: 'Day one: palaces.\nDay two: markets.',
			...extra,
		};
	}

	async function seedArticle(memberId: string, extra: object = {}) {
		return await model(app, 'BoardArticle').create({ memberId, ...story(), ...extra });
	}

	function feed(search: object = {}, extra: object = {}) {
		return graphQL(app, LIST, { input: { page: 1, limit: 10, search, ...extra } });
	}

	it('stores a story as plain text within the new limits', async () => {
		const author = await seedMember(app, 'storyauthor');
		const create = async (extra: object) =>
			await graphQL(app, CREATE, { input: story(extra) }, author.accessToken);

		for (const invalid of [
			{ articleTitle: '   ' },
			{ articleTitle: 'a'.repeat(101) },
			{ articleContent: '  ' },
			{ articleContent: 'a'.repeat(2001) },
			{ articleImage: 'javascript:alert(1)' },
		]) {
			expect((await create(invalid)).body.errors?.[0].extensions.code).toBe('BAD_REQUEST');
		}

		const longest = 'a'.repeat(1990) + '\nend.';
		const created = await create({
			articleTitle: `  ${'t'.repeat(100)}  `,
			articleContent: `  ${longest}  `,
		});
		expect(created.body.errors).toBeUndefined();
		// Line breaks are part of the text; only the outer spaces go
		expect(created.body.data.createBoardArticle).toMatchObject({
			articleTitle: 't'.repeat(100),
			articleContent: longest,
		});
		expect((await model(app, 'Member').findById(author._id).lean()).memberArticles).toBe(1);

		const updated = await graphQL(
			app,
			UPDATE,
			{ input: { _id: created.body.data.createBoardArticle._id, articleTitle: '  Seoul again  ' } },
			author.accessToken,
		);
		expect(updated.body.data.updateBoardArticle.articleTitle).toBe('Seoul again');
	});

	it('rejects null and blank required fields on update and keeps the feed readable', async () => {
		const author = await seedMember(app, 'nullauthor');
		const admin = await seedMember(app, 'nulladmin', MemberType.ADMIN);
		const article = await seedArticle(author._id, { articleImage: 'uploads/article/1.jpg' });
		const _id = article._id.toString();

		for (const input of [
			{ articleTitle: null },
			{ articleTitle: '  ' },
			{ articleContent: null },
			{ articleCategory: null },
			{ articleStatus: null },
		]) {
			const rejected = await graphQL(app, UPDATE, { input: { _id, ...input } }, author.accessToken);
			expect(rejected.body.errors?.[0].extensions.code).toBe('BAD_REQUEST');
		}
		const byAdmin = await graphQL(
			app,
			`mutation A($input: BoardArticleUpdate!) { updateBoardArticleByAdmin(input: $input) { _id } }`,
			{ input: { _id, articleTitle: null } },
			admin.accessToken,
		);
		expect(byAdmin.body.errors?.[0].extensions.code).toBe('BAD_REQUEST');

		const cleared = await graphQL(
			app,
			UPDATE,
			{ input: { _id, articleImage: null } },
			author.accessToken,
		);
		expect(cleared.body.errors).toBeUndefined();
		expect(cleared.body.data.updateBoardArticle).toMatchObject({
			articleTitle: 'Two days in Seoul',
			articleImage: null,
			articleStatus: 'PUBLISHED',
		});

		const list = await feed();
		expect(list.body.errors).toBeUndefined();
		expect(list.body.data.getBoardArticles.list).toHaveLength(1);
	});

	it('opens a story of a deleted author and answers 404 for a missing one', async () => {
		const author = await seedMember(app, 'goneauthor');
		const reader = await seedMember(app, 'gonereader');
		const article = await seedArticle(author._id);
		const deleted = await seedArticle(author._id, { articleStatus: 'DELETED' });
		const id = article._id.toString();

		await model(app, 'Member').updateOne(
			{ _id: author._id },
			{ memberStatus: 'DELETED', deletedAt: new Date() },
		);
		const opened = await graphQL(app, DETAIL, { id });
		expect(opened.body.errors).toBeUndefined();
		expect(opened.body.data.getBoardArticle).toEqual({
			_id: id,
			articleTitle: 'Two days in Seoul',
			memberData: null,
		});

		await model(app, 'Member').deleteOne({ _id: author._id });
		const list = await feed();
		expect(list.body.data.getBoardArticles).toEqual({
			list: [{ _id: id, memberData: null }],
			metaCounter: [{ total: 1 }],
		});

		for (const missing of [deleted._id.toString(), new Types.ObjectId().toString()]) {
			expect((await graphQL(app, DETAIL, { id: missing })).body.errors?.[0]).toMatchObject({
				message: Messages.ARTICLE_NOT_FOUND,
				extensions: { code: 'NOT_FOUND' },
			});
			const liked = await graphQL(
				app,
				`mutation Like($id: String!) { likeTargetArticle(input: $id) { _id } }`,
				{ id: missing },
				reader.accessToken,
			);
			expect(liked.body.errors?.[0].extensions.code).toBe('NOT_FOUND');
		}
	});

	it('keeps a saved story when the counter update fails', async () => {
		const author = await seedMember(app, 'counterauthor');
		jest
			.spyOn(app.get(MemberService), 'memberStatusEditor')
			.mockRejectedValue(new Error('counter store is down'));

		const created = await graphQL(app, CREATE, { input: story() }, author.accessToken);
		expect(created.body.errors).toBeUndefined();
		expect(await model(app, 'BoardArticle').countDocuments({ memberId: author._id })).toBe(1);
	});

	it('purges a removed story together with its comments, likes, views and notifications', async () => {
		const author = await seedMember(app, 'purgeauthor');
		const reader = await seedMember(app, 'purgereader');
		const admin = await seedMember(app, 'purgeadmin', MemberType.ADMIN);
		const created = await graphQL(app, CREATE, { input: story() }, author.accessToken);
		const target = new Types.ObjectId(created.body.data.createBoardArticle._id);
		const kept = await seedArticle(author._id, { articleTitle: 'Busan by night' });
		for (const article of [target, kept._id]) {
			const id = article.toString();
			await graphQL(app, DETAIL, { id }, reader.accessToken);
			await graphQL(
				app,
				`mutation Like($id: String!) { likeTargetArticle(input: $id) { _id } }`,
				{ id },
				reader.accessToken,
			);
			await graphQL(
				app,
				`mutation Comment($input: CommentInput!) { createComment(input: $input) { _id } }`,
				{ input: { commentGroup: 'ARTICLE', commentRefId: id, commentContent: 'Great story' } },
				reader.accessToken,
			);
		}
		const leftovers = async (refId: Types.ObjectId) => [
			await model(app, 'Comment').countDocuments({ commentRefId: refId }),
			await model(app, 'Like').countDocuments({ likeRefId: refId }),
			await model(app, 'View').countDocuments({ viewRefId: refId }),
			await model(app, 'Notification').countDocuments({ notificationRefId: refId }),
		];
		expect(await leftovers(target)).toEqual([1, 1, 1, 2]);
		const readerComments = async () =>
			(await model(app, 'Member').findById(reader._id).lean()).memberComments;
		expect(await readerComments()).toBe(2);
		const remove = async () =>
			await graphQL(
				app,
				`mutation Remove($id: String!) { removeBoardArticleByAdmin(articleId: $id) { _id } }`,
				{ id: target.toString() },
				admin.accessToken,
			);

		// Only a story its author or an admin already deleted can be purged
		expect((await remove()).body.errors?.[0].message).toBe(Messages.REMOVE_FAILED);
		await graphQL(
			app,
			UPDATE,
			{ input: { _id: target.toString(), articleStatus: 'DELETED' } },
			author.accessToken,
		);
		expect((await model(app, 'Member').findById(author._id).lean()).memberArticles).toBe(0);

		expect((await remove()).body.errors).toBeUndefined();
		expect(await model(app, 'BoardArticle').exists({ _id: target })).toBeNull();
		expect(await leftovers(target)).toEqual([0, 0, 0, 0]);
		expect(await leftovers(kept._id)).toEqual([1, 1, 1, 2]);
		expect((await model(app, 'Member').findById(author._id).lean()).memberArticles).toBe(0);
		expect(await readerComments()).toBe(1);
	});

	it('counts the first visit of every signed-in member, the author included', async () => {
		const author = await seedMember(app, 'viewauthor');
		const reader = await seedMember(app, 'viewreader');
		const article = await seedArticle(author._id);
		const id = article._id.toString();

		for (const token of [author.accessToken, author.accessToken, reader.accessToken, undefined]) {
			expect((await graphQL(app, DETAIL, { id }, token)).body.errors).toBeUndefined();
		}

		expect((await model(app, 'BoardArticle').findById(id).lean()).articleViews).toBe(2);
	});

	it('validates the nested search and pages through stories without repeats', async () => {
		const author = await seedMember(app, 'pageauthor');
		await model(app, 'BoardArticle').insertMany(
			Array.from({ length: 25 }, (_, i) => ({
				memberId: author._id,
				...story({ articleTitle: `Story ${i}` }),
			})),
		);

		for (const invalid of [{ text: 'a'.repeat(101) }, { memberId: 'not-an-id' }]) {
			expect((await feed(invalid)).body.errors?.[0].extensions.code).toBe('BAD_REQUEST');
		}
		expect((await feed({ text: '   ' })).body.data.getBoardArticles.metaCounter).toEqual([
			{ total: 25 },
		]);

		const ids: string[] = [];
		for (const page of [1, 2, 3]) {
			const result = await graphQL(app, LIST, {
				input: { page, limit: 10, sort: 'articleLikes', direction: 'DESC', search: {} },
			});
			expect(result.body.errors).toBeUndefined();
			ids.push(...result.body.data.getBoardArticles.list.map((article) => article._id));
		}
		expect(ids).toHaveLength(25);
		expect(new Set(ids).size).toBe(25);
	});
});
