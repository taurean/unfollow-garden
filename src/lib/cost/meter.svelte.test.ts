import { beforeEach, describe, expect, it } from 'vitest';
import { CostMeter } from './meter.svelte';
import { db, saveFollows, saveActivityCache, loadCounts } from '$lib/storage/db';
import type { FollowRecord, Profile } from '$lib/atproto/graph';

const OWNER = 'did:plc:owner';

beforeEach(async () => {
	const database = await db();
	for (const store of ['follows', 'activity', 'meter'] as const) await database.clear(store);
});

function follow(subjectDid: string): FollowRecord {
	return { subjectDid, rkey: `rkey-${subjectDid}`, followedAt: '2021-06-04T00:00:00Z' };
}

function profile(did: string): Profile {
	return { did, handle: `${did.split(':').pop()}.test` };
}

async function cacheActivity(subjectDid: string, posts: number, likes: number) {
	await saveActivityCache({
		subjectDid,
		events: [
			...Array.from({ length: posts }, () => ({
				kind: 'post' as const,
				at: '2026-01-01T00:00:00Z'
			})),
			...Array.from({ length: likes }, () => ({
				kind: 'like' as const,
				at: '2026-01-01T00:00:00Z'
			}))
		],
		recent: [],
		window: {
			start: '2025-01-01T00:00:00Z',
			end: '2026-01-01T00:00:00Z',
			reason: 'lookback',
			truncated: false
		},
		lookbackDays: 365,
		fetchedAt: new Date().toISOString(),
		likesError: null
	});
}

describe('starting the meter', () => {
	it('is zero on an install that has never fetched anything', async () => {
		const meter = new CostMeter();

		await meter.start(OWNER);

		expect(meter.counts.posts + meter.counts.profiles + meter.counts.follows).toBe(0);
	});

	it('seeds from what is already cached, rather than reporting a used install as free', async () => {
		// The case this exists for: follows and activity cached from earlier
		// sittings, so a new session fetches nothing and would otherwise say
		// the whole review had cost nothing.
		await saveFollows(
			OWNER,
			[follow('did:plc:alice'), follow('did:plc:bob')],
			new Map([
				['did:plc:alice', profile('did:plc:alice')],
				['did:plc:bob', profile('did:plc:bob')]
			]),
			new Map([
				['did:plc:alice', true],
				['did:plc:bob', false]
			])
		);
		await cacheActivity('did:plc:alice', 30, 12);
		await cacheActivity('did:plc:bob', 5, 0);

		const meter = new CostMeter();
		await meter.start(OWNER);

		expect({
			follows: meter.counts.follows,
			profiles: meter.counts.profiles,
			relationships: meter.counts.relationships,
			posts: meter.counts.posts,
			likes: meter.counts.likes
		}).toEqual({ follows: 2, profiles: 2, relationships: 2, posts: 35, likes: 12 });
	});

	it('writes the seed, so it survives the reload it was computed for', async () => {
		await saveFollows(OWNER, [follow('did:plc:alice')], new Map(), new Map());

		await new CostMeter().start(OWNER);

		expect((await loadCounts(OWNER)).follows).toBe(1);
	});

	it('seeds once, and never re-counts a cache that is still sitting there', async () => {
		await saveFollows(
			OWNER,
			[follow('did:plc:alice')],
			new Map([['did:plc:alice', profile('did:plc:alice')]]),
			new Map()
		);
		await cacheActivity('did:plc:alice', 10, 0);

		const first = new CostMeter();
		await first.start(OWNER);
		const second = new CostMeter();
		await second.start(OWNER);

		expect(second.counts.posts).toBe(first.counts.posts);
	});

	it('does not count a cached subject this owner does not follow', async () => {
		// The activity store is keyed by subject alone and shared between
		// owners on one browser, so it can hold accounts this owner never had.
		await saveFollows(OWNER, [follow('did:plc:alice')], new Map(), new Map());
		await cacheActivity('did:plc:stranger', 99, 99);

		const meter = new CostMeter();
		await meter.start(OWNER);

		expect(meter.counts.posts).toBe(0);
	});
});

describe('recording a fetch', () => {
	it('adds to the running total', async () => {
		const meter = new CostMeter();
		await meter.start(OWNER);

		meter.record('posts', 40);
		meter.record('posts', 2);

		expect(meter.counts.posts).toBe(42);
	});

	it('ignores a fetch that pulled nothing down', async () => {
		const meter = new CostMeter();
		await meter.start(OWNER);

		meter.record('likes', 0);

		expect(meter.counts.likes).toBe(0);
	});

	it('persists what it recorded once flushed', async () => {
		const meter = new CostMeter();
		await meter.start(OWNER);
		meter.record('profiles', 25);

		await meter.flush();

		expect((await loadCounts(OWNER)).profiles).toBe(25);
	});
});
