import { APPVIEW, pdsForDid } from './identity';
import { query } from './xrpc';

/**
 * One subject's activity, loaded from public endpoints.
 *
 * Two sources, two hosts: posts, replies, and reposts come from the AppView's
 * author feed, and likes come from the subject's own PDS, because the AppView
 * does not expose anyone's likes. That split is why a subject can have complete
 * post data and no likes at all — see `likesError`.
 */

export type EventKind = 'post' | 'reply' | 'repost' | 'like';

/** The four kinds in the order they are shown, which is also the strip's row order. */
export const EVENT_KINDS: readonly EventKind[] = ['post', 'reply', 'repost', 'like'];

/** A single thing the subject did, reduced to what the metrics need. */
export interface ActivityEvent {
	kind: EventKind;
	/** ISO timestamp. Always parseable — unparseable events are dropped at load. */
	at: string;
}

/** A post shown in the recent-items columns. */
export interface RecentItem {
	kind: EventKind;
	at: string;
	/** Link to the post on Bluesky. */
	url: string;
	/**
	 * The DID of whoever wrote the post, which is not always the subject — a
	 * repost or a like points at someone else's.
	 *
	 * Carried because some web clients name an account by DID only and a URL
	 * built from a handle would 404 there. Optional: entries cached before this
	 * existed do not have it.
	 */
	authorDid?: string;
	text: string;
	/**
	 * Who the item points at: the handle replied to, or the author of a post
	 * that was reposted or liked. Null for the subject's own posts.
	 */
	attribution: string | null;
	/** Notes like `images` or `quote`, so a bare-looking post is not misread as empty. */
	media: string[];
}

/** Why the covered window starts where it does. */
export type WindowStartReason = 'lookback' | 'account-created' | 'fetch-limit';

/**
 * The stretch of time the loaded events fully account for.
 *
 * Metrics are computed inside this window and nowhere else. A subject who likes
 * three hundred posts a day fills five pages in under a week, and without this
 * they would look inactive before last Tuesday.
 */
export interface CoveredWindow {
	start: string;
	end: string;
	reason: WindowStartReason;
	/** True when a page cap, rather than the lookback or the account's age, set the start. */
	truncated: boolean;
}

export interface SubjectActivity {
	subjectDid: string;
	events: ActivityEvent[];
	recent: RecentItem[];
	window: CoveredWindow;
	lookbackDays: number;
	fetchedAt: string;
	/** Set when the subject's PDS could not be read. Posts are unaffected. */
	likesError: string | null;
}

/** Each source loads at most this many pages of 100 (PRD, "Covered window"). */
const MAX_PAGES = 5;
const PAGE_SIZE = '100';

/** How many of each kind the recent-items columns show. */
const RECENT_LIMIT: Record<EventKind, number> = { post: 8, reply: 8, repost: 8, like: 10 };

/** The AppView takes at most 25 URIs per `getPosts` call. */
const POST_BATCH = 25;

interface PostView {
	uri: string;
	author: { did: string; handle: string; displayName?: string };
	record: {
		text?: string;
		createdAt?: string;
		reply?: { parent?: { uri: string } };
	};
	embed?: { $type: string; media?: { $type: string } };
	indexedAt: string;
}

interface FeedItem {
	post: PostView;
	reply?: { parent?: { author?: { handle?: string } } };
	reason?: { $type: string; indexedAt?: string };
}

/** A timestamp we can place in time, or null. */
function parseTime(value: string | undefined): string | null {
	if (!value) return null;
	const ms = Date.parse(value);
	return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

/**
 * The earlier of a record's claimed time and the AppView's index time.
 *
 * This is how the AppView orders author feeds: a backdated import keeps its
 * claimed date, and a post dated next year cannot sort ahead of real ones.
 */
function postTime(post: PostView): string | null {
	const claimed = parseTime(post.record.createdAt);
	const indexed = parseTime(post.indexedAt);
	if (!claimed) return indexed;
	if (!indexed) return claimed;
	return Date.parse(claimed) <= Date.parse(indexed) ? claimed : indexed;
}

/** `at://did/app.bsky.feed.post/rkey` as a link a person can open. */
function permalink(uri: string, handle: string): string {
	const rkey = uri.split('/').pop() ?? '';
	return `https://bsky.app/profile/${handle}/post/${rkey}`;
}

/** What a post carries besides text, so an empty-looking excerpt is not misread. */
function mediaNotes(post: PostView): string[] {
	const notes: string[] = [];
	const seen = (type: string | undefined) => {
		if (!type) return;
		if (type.startsWith('app.bsky.embed.images')) notes.push('images');
		else if (type.startsWith('app.bsky.embed.video')) notes.push('video');
		else if (type.startsWith('app.bsky.embed.external')) notes.push('link');
		else if (type.startsWith('app.bsky.embed.record#')) notes.push('quote');
	};

	if (post.embed?.$type.startsWith('app.bsky.embed.recordWithMedia')) {
		notes.push('quote');
		seen(post.embed.media?.$type);
	} else {
		seen(post.embed?.$type);
	}
	return notes;
}

/** What one source managed to load, and how far back it reaches. */
interface SourceResult<T> {
	items: T[];
	/** The oldest timestamp this source returned, if any. */
	oldest: string | null;
	/** True when the page cap stopped us rather than running out of items. */
	hitCap: boolean;
}

/**
 * Page through a source until it runs out, reaches `until`, or hits the cap.
 *
 * Both sources return newest first, so the first item older than `until` means
 * everything after it is older too.
 */
async function paginate<T>(
	fetchPage: (cursor: string | undefined) => Promise<{ cursor?: string; items: T[] }>,
	timeOf: (item: T) => string | null,
	until: number
): Promise<SourceResult<T>> {
	const items: T[] = [];
	let cursor: string | undefined;
	let oldest: string | null = null;
	let reachedStart = false;

	let page = 0;
	for (; page < MAX_PAGES; page++) {
		const result = await fetchPage(cursor);

		for (const item of result.items) {
			const at = timeOf(item);
			if (!at) continue;
			// Kept even when older than `until`: the window calculation needs to
			// know this source reached back past the start, and one extra page of
			// items costs nothing.
			items.push(item);
			if (!oldest || Date.parse(at) < Date.parse(oldest)) oldest = at;
			if (Date.parse(at) <= until) reachedStart = true;
		}

		cursor = result.cursor;
		if (!cursor || result.items.length === 0 || reachedStart) break;
	}

	// Only a loop that ran every page without breaking was stopped by the cap;
	// every other exit path breaks early.
	return { items, oldest, hitCap: page >= MAX_PAGES };
}

interface AuthorFeedResponse {
	cursor?: string;
	feed: FeedItem[];
}

/** Posts, replies, and reposts from the AppView. */
async function loadFeed(did: string, until: number) {
	return paginate<FeedItem>(
		async (cursor) => {
			const page = await query<AuthorFeedResponse>(APPVIEW, 'app.bsky.feed.getAuthorFeed', {
				actor: did,
				filter: 'posts_with_replies',
				limit: PAGE_SIZE,
				cursor
			});
			return { cursor: page.cursor, items: page.feed ?? [] };
		},
		(item) =>
			item.reason?.$type === 'app.bsky.feed.defs#reasonRepost'
				? parseTime(item.reason.indexedAt)
				: postTime(item.post),
		until
	);
}

interface LikeRecord {
	uri: string;
	value: { subject?: { uri?: string }; createdAt?: string };
}

/** Like records from the subject's own PDS, which is the only place they exist. */
async function loadLikes(pds: string, did: string, until: number) {
	return paginate<LikeRecord>(
		async (cursor) => {
			const page = await query<{ cursor?: string; records: LikeRecord[] }>(
				pds,
				'com.atproto.repo.listRecords',
				{ repo: did, collection: 'app.bsky.feed.like', limit: PAGE_SIZE, cursor }
			);
			return { cursor: page.cursor, items: page.records ?? [] };
		},
		// A like whose createdAt does not parse cannot be placed in time, so it
		// is dropped rather than guessed at (PRD, "Events").
		(record) => parseTime(record.value.createdAt),
		until
	);
}

/** Text and authors for liked posts, which like records identify only by URI. */
async function loadLikedPosts(uris: string[]): Promise<Map<string, PostView>> {
	const posts = new Map<string, PostView>();
	for (let i = 0; i < uris.length; i += POST_BATCH) {
		const batch = uris.slice(i, i + POST_BATCH);
		// A deleted liked post makes the whole batch fail on some AppView
		// versions. The like still counts toward the metrics; only its excerpt
		// is lost, so this is not worth failing the subject over.
		const page = await query<{ posts: PostView[] }>(APPVIEW, 'app.bsky.feed.getPosts', {
			uris: batch
		}).catch(() => ({ posts: [] as PostView[] }));
		for (const post of page.posts) posts.set(post.uri, post);
	}
	return posts;
}

/** Where a source's coverage begins, given how far it actually reached. */
function sourceStart(source: SourceResult<unknown> | null, loadingStart: number): number {
	if (!source || !source.oldest) return loadingStart;
	const oldest = Date.parse(source.oldest);
	return source.hitCap && oldest > loadingStart ? oldest : loadingStart;
}

/**
 * Load one subject's activity.
 *
 * `accountCreatedAt` shortens the window for young accounts, so a three-week-old
 * account is not reported as having an eleven-month gap before it existed.
 */
export async function loadActivity(
	subjectDid: string,
	{ lookbackDays, accountCreatedAt }: { lookbackDays: number; accountCreatedAt?: string }
): Promise<SubjectActivity> {
	const now = Date.now();
	const lookbackStart = now - lookbackDays * 86_400_000;
	const created = parseTime(accountCreatedAt);
	const loadingStart = Math.max(lookbackStart, created ? Date.parse(created) : -Infinity);

	const feed = await loadFeed(subjectDid, loadingStart);

	// Likes live on the subject's PDS, which is an arbitrary third-party host
	// that may be down or send no CORS headers. That failure belongs to this
	// subject, not to the load, so it is caught and reported rather than thrown.
	let likes: SourceResult<LikeRecord> | null = null;
	let likesError: string | null = null;
	try {
		const pds = await pdsForDid(subjectDid);
		likes = await loadLikes(pds, subjectDid, loadingStart);
	} catch (cause) {
		likesError = cause instanceof Error ? cause.message : String(cause);
	}

	const coveredStart = Math.max(
		loadingStart,
		sourceStart(feed, loadingStart),
		sourceStart(likes, loadingStart)
	);
	const truncated = coveredStart > loadingStart;

	const window: CoveredWindow = {
		start: new Date(coveredStart).toISOString(),
		end: new Date(now).toISOString(),
		truncated,
		reason: truncated
			? 'fetch-limit'
			: created && Date.parse(created) > lookbackStart
				? 'account-created'
				: 'lookback'
	};

	const { events, recent } = await assemble(feed, likes);

	return {
		subjectDid,
		events,
		recent,
		window,
		lookbackDays,
		fetchedAt: new Date(now).toISOString(),
		likesError
	};
}

/** Turn raw source items into the flat event list and the recent-items columns. */
async function assemble(
	feed: SourceResult<FeedItem>,
	likes: SourceResult<LikeRecord> | null
): Promise<{ events: ActivityEvent[]; recent: RecentItem[] }> {
	const events: ActivityEvent[] = [];
	const recent: RecentItem[] = [];
	const taken: Record<EventKind, number> = { post: 0, reply: 0, repost: 0, like: 0 };

	const take = (item: RecentItem) => {
		if (taken[item.kind] >= RECENT_LIMIT[item.kind]) return;
		taken[item.kind]++;
		recent.push(item);
	};

	for (const item of feed.items) {
		const repost = item.reason?.$type === 'app.bsky.feed.defs#reasonRepost';
		const at = repost ? parseTime(item.reason?.indexedAt) : postTime(item.post);
		if (!at) continue;

		const kind: EventKind = repost ? 'repost' : item.post.record.reply ? 'reply' : 'post';
		events.push({ kind, at });
		take({
			kind,
			at,
			url: permalink(item.post.uri, item.post.author.handle),
			authorDid: item.post.author.did,
			text: item.post.record.text ?? '',
			// A repost's feed item carries the original author's post, so the
			// attribution is the post's own author. A reply's is the parent's.
			attribution: repost
				? item.post.author.handle
				: kind === 'reply'
					? (item.reply?.parent?.author?.handle ?? null)
					: null,
			media: mediaNotes(item.post)
		});
	}

	if (likes) {
		const wanted: LikeRecord[] = [];
		for (const record of likes.items) {
			const at = parseTime(record.value.createdAt);
			if (!at) continue;
			events.push({ kind: 'like', at });
			if (wanted.length < RECENT_LIMIT.like && record.value.subject?.uri) wanted.push(record);
		}

		const posts = await loadLikedPosts(
			wanted.map((record) => record.value.subject?.uri).filter((uri): uri is string => !!uri)
		);

		for (const record of wanted) {
			const post = posts.get(record.value.subject?.uri ?? '');
			const at = parseTime(record.value.createdAt);
			if (!post || !at) continue;
			take({
				kind: 'like',
				at,
				url: permalink(post.uri, post.author.handle),
				authorDid: post.author.did,
				text: post.record.text ?? '',
				attribution: post.author.handle,
				media: mediaNotes(post)
			});
		}
	}

	events.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
	recent.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
	return { events, recent };
}
