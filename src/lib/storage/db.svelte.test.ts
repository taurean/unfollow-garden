import { beforeEach, describe, expect, it } from 'vitest';
import { loadDecisions, loadFollows, saveDecision, saveFollows, undoLast } from './db';
import type { FollowRecord, Profile } from '$lib/atproto/graph';

const OWNER = 'did:plc:owner';

/**
 * Each test starts from an empty database. The module caches its connection, so
 * the store contents are cleared rather than the database deleted.
 */
beforeEach(async () => {
	const { db } = await import('./db');
	const database = await db();
	for (const store of ['decisions', 'undo', 'follows'] as const) {
		await database.clear(store);
	}
});

function follow(subjectDid: string, rkey: string, followedAt: string | null): FollowRecord {
	return { subjectDid, rkey, followedAt };
}

describe('decisions', () => {
	it('reads back a decision that was written', async () => {
		await saveDecision(OWNER, 'did:plc:alice', 'unfollow');

		const decisions = await loadDecisions(OWNER);

		expect(decisions.get('did:plc:alice')?.decision).toBe('unfollow');
	});

	it('keeps one owner out of another owner’s decisions', async () => {
		await saveDecision(OWNER, 'did:plc:alice', 'keep');
		await saveDecision('did:plc:someone-else', 'did:plc:alice', 'unfollow');

		const decisions = await loadDecisions(OWNER);

		expect(decisions.get('did:plc:alice')?.decision).toBe('keep');
	});

	it('undoes the most recent decision and leaves the one before it', async () => {
		await saveDecision(OWNER, 'did:plc:alice', 'keep');
		await saveDecision(OWNER, 'did:plc:bob', 'unfollow');

		const undone = await undoLast(OWNER);
		const decisions = await loadDecisions(OWNER);

		expect({ undone, remaining: [...decisions.keys()] }).toEqual({
			undone: 'did:plc:bob',
			remaining: ['did:plc:alice']
		});
	});

	it('reports nothing to undo on an empty stack rather than throwing', async () => {
		expect(await undoLast(OWNER)).toBeNull();
	});
});

describe('saveFollows', () => {
	it('collapses duplicate follow records into one subject holding every rkey', async () => {
		// A subject can be followed more than once. Unfollowing has to delete
		// all of those records, so all of them belong to one snapshot.
		await saveFollows(
			OWNER,
			[
				follow('did:plc:alice', 'aaa', '2024-03-01T00:00:00Z'),
				follow('did:plc:alice', 'bbb', '2022-01-01T00:00:00Z')
			],
			new Map()
		);

		const [snapshot] = await loadFollows(OWNER);

		expect({ rkeys: snapshot.rkeys.sort(), followedAt: snapshot.followedAt }).toEqual({
			rkeys: ['aaa', 'bbb'],
			// The earliest record is when the owner actually started following.
			followedAt: '2022-01-01T00:00:00Z'
		});
	});

	it('keeps a subject whose createdAt could not be parsed, with no followed date', async () => {
		await saveFollows(OWNER, [follow('did:plc:alice', 'aaa', null)], new Map());

		const [snapshot] = await loadFollows(OWNER);

		expect({ subject: snapshot.subjectDid, followedAt: snapshot.followedAt }).toEqual({
			subject: 'did:plc:alice',
			followedAt: null
		});
	});

	it('drops subjects that are no longer followed on a later load', async () => {
		await saveFollows(
			OWNER,
			[follow('did:plc:alice', 'aaa', null), follow('did:plc:bob', 'bbb', null)],
			new Map()
		);

		await saveFollows(OWNER, [follow('did:plc:alice', 'aaa', null)], new Map());

		expect((await loadFollows(OWNER)).map((s) => s.subjectDid)).toEqual(['did:plc:alice']);
	});

	it('attaches the profile it was given, and tolerates one that is missing', async () => {
		const alice: Profile = { did: 'did:plc:alice', handle: 'alice.test' };

		await saveFollows(
			OWNER,
			[follow('did:plc:alice', 'aaa', null), follow('did:plc:ghost', 'ggg', null)],
			new Map([['did:plc:alice', alice]])
		);

		const byDid = new Map((await loadFollows(OWNER)).map((s) => [s.subjectDid, s.profile]));

		expect({
			alice: byDid.get('did:plc:alice')?.handle,
			ghost: byDid.get('did:plc:ghost')
		}).toEqual({ alice: 'alice.test', ghost: null });
	});
});
