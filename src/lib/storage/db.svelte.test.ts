import { beforeEach, describe, expect, it } from 'vitest';
import { deleteDB, openDB } from 'idb';
import {
	deleteDecisions,
	loadDecisions,
	loadFollows,
	loadRuns,
	saveDecision,
	saveFollows,
	undoLast,
	upgradeTriageDb
} from './db';
import type { FollowRecord, Profile } from '$lib/atproto/graph';

const OWNER = 'did:plc:owner';

/**
 * Each test starts from an empty database. The module caches its connection, so
 * the store contents are cleared rather than the database deleted.
 */
beforeEach(async () => {
	const { db } = await import('./db');
	const database = await db();
	for (const store of ['decisions', 'undo', 'follows', 'runs', 'settings', 'meter'] as const) {
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

describe('a profile that stops being returned', () => {
	const alice: Profile = { did: 'did:plc:alice', handle: 'alice.test', displayName: 'Alice' };

	it('keeps the last profile it saw, and stamps when it went missing', async () => {
		// This is what a deactivation looks like from the outside: the repo
		// still holds the follow record, and the AppView stops answering.
		await saveFollows(
			OWNER,
			[follow('did:plc:alice', 'aaa', null)],
			new Map([['did:plc:alice', alice]])
		);

		await saveFollows(OWNER, [follow('did:plc:alice', 'aaa', null)], new Map());

		const [snapshot] = await loadFollows(OWNER);

		expect({
			handle: snapshot.profile?.handle,
			missing: snapshot.profileMissingSince !== null
		}).toEqual({ handle: 'alice.test', missing: true });
	});

	it('does not move the missing-since stamp on a later load that still misses', async () => {
		// An account gone for months must not report as having just left.
		await saveFollows(
			OWNER,
			[follow('did:plc:alice', 'aaa', null)],
			new Map([['did:plc:alice', alice]])
		);
		await saveFollows(OWNER, [follow('did:plc:alice', 'aaa', null)], new Map());
		const first = (await loadFollows(OWNER))[0].profileMissingSince;

		await saveFollows(OWNER, [follow('did:plc:alice', 'aaa', null)], new Map());

		expect((await loadFollows(OWNER))[0].profileMissingSince).toBe(first);
	});

	it('clears the stamp when the account comes back', async () => {
		await saveFollows(
			OWNER,
			[follow('did:plc:alice', 'aaa', null)],
			new Map([['did:plc:alice', alice]])
		);
		await saveFollows(OWNER, [follow('did:plc:alice', 'aaa', null)], new Map());

		await saveFollows(
			OWNER,
			[follow('did:plc:alice', 'aaa', null)],
			new Map([['did:plc:alice', alice]])
		);

		expect((await loadFollows(OWNER))[0].profileMissingSince).toBeNull();
	});

	it('leaves a subject that never had a profile with nothing to carry forward', async () => {
		await saveFollows(OWNER, [follow('did:plc:ghost', 'ggg', null)], new Map());

		const [snapshot] = await loadFollows(OWNER);

		expect({ profile: snapshot.profile, missing: snapshot.profileMissingSince !== null }).toEqual({
			profile: null,
			missing: true
		});
	});
});

describe('deleteDecisions', () => {
	it('clears this owner’s decisions and undo stack', async () => {
		await saveDecision(OWNER, 'did:plc:alice', 'keep');

		await deleteDecisions(OWNER);

		expect({ decisions: (await loadDecisions(OWNER)).size, undone: await undoLast(OWNER) }).toEqual(
			{
				decisions: 0,
				undone: null
			}
		);
	});

	it('leaves another owner’s decisions alone', async () => {
		await saveDecision(OWNER, 'did:plc:alice', 'keep');
		await saveDecision('did:plc:someone-else', 'did:plc:alice', 'unfollow');

		await deleteDecisions(OWNER);

		expect((await loadDecisions('did:plc:someone-else')).size).toBe(1);
	});

	it('leaves follows and run history intact, because runs are the only way back', async () => {
		// Starting the review over must not destroy the record of what was
		// already unfollowed — that record is the restore path.
		const { saveRun } = await import('./db');
		await saveFollows(OWNER, [follow('did:plc:alice', 'aaa', null)], new Map());
		await saveRun({
			id: 'run-1',
			ownerDid: OWNER,
			kind: 'unfollow',
			createdAt: '2026-09-01T00:00:00Z',
			status: 'complete',
			targets: [],
			error: null
		});

		await deleteDecisions(OWNER);

		expect({
			follows: (await loadFollows(OWNER)).length,
			runs: (await loadRuns(OWNER)).length
		}).toEqual({ follows: 1, runs: 1 });
	});
});

describe('the version 3 migration', () => {
	const NAME = 'follow-triage-migration-fixture';

	/**
	 * A database at version 2, built the way version 2 actually built it.
	 *
	 * Written out here rather than derived from the current upgrade function:
	 * the point of a migration test is to meet data shaped the way an older
	 * release shaped it, and a fixture generated by today's code cannot do that.
	 */
	async function seedV2() {
		const database = await openDB(NAME, 2, {
			upgrade(db) {
				db.createObjectStore('settings', { keyPath: 'ownerDid' });
				db.createObjectStore('decisions', { keyPath: ['ownerDid', 'subjectDid'] });
				db.createObjectStore('undo', { keyPath: 'ownerDid' });
				db.createObjectStore('follows', { keyPath: ['ownerDid', 'subjectDid'] }).createIndex(
					'byOwner',
					'ownerDid'
				);
				db.createObjectStore('runs', { keyPath: 'id' }).createIndex('byOwner', 'ownerDid');
				db.createObjectStore('activity', { keyPath: 'subjectDid' });
			}
		});

		await database.put('decisions', {
			ownerDid: OWNER,
			subjectDid: 'did:plc:alice',
			decision: 'keep',
			decidedAt: '2026-01-01T00:00:00Z'
		});
		await database.put('follows', {
			ownerDid: OWNER,
			subjectDid: 'did:plc:alice',
			rkeys: ['aaa'],
			followedAt: '2021-06-04T00:00:00Z',
			profile: { did: 'did:plc:alice', handle: 'alice.test' },
			followsOwner: true,
			loadedAt: '2026-01-01T00:00:00Z'
		});
		await database.put('settings', { ownerDid: OWNER, lookbackDays: 365, thresholdDays: 30 });
		await database.put('runs', {
			id: 'run-1',
			ownerDid: OWNER,
			kind: 'unfollow',
			createdAt: '2026-01-01T00:00:00Z',
			status: 'complete',
			targets: [],
			error: null
		});
		database.close();
	}

	beforeEach(async () => {
		await deleteDB(NAME);
		await seedV2();
	});

	it('carries every decision and run across the upgrade', async () => {
		const database = await openDB(NAME, 4, { upgrade: upgradeTriageDb });

		const result = {
			decision: (await database.get('decisions', [OWNER, 'did:plc:alice']))?.decision,
			runs: (await database.getAll('runs')).length
		};
		database.close();

		expect(result).toEqual({ decision: 'keep', runs: 1 });
	});

	it('backfills the two fields version 3 added, rather than leaving them undefined', async () => {
		const database = await openDB(NAME, 4, { upgrade: upgradeTriageDb });

		const result = {
			missingSince: (await database.get('follows', [OWNER, 'did:plc:alice']))?.profileMissingSince,
			lastPass: (await database.get('settings', OWNER))?.lastPassCompletedAt
		};
		database.close();

		expect(result).toEqual({ missingSince: null, lastPass: null });
	});

	it('leaves the profile a version 2 record already had', async () => {
		const database = await openDB(NAME, 4, { upgrade: upgradeTriageDb });

		const snapshot = await database.get('follows', [OWNER, 'did:plc:alice']);
		database.close();

		expect(snapshot?.profile?.handle).toBe('alice.test');
	});

	it('backfills the link-client preference added in version 4', async () => {
		// A settings record written before the preference existed must read
		// back as the default rather than as `undefined`.
		const database = await openDB(NAME, 4, { upgrade: upgradeTriageDb });

		const stored = await database.get('settings', OWNER);
		database.close();

		expect(stored?.linkClient).toBe('bsky');
	});

	it('creates the meter store the version expects', async () => {
		const database = await openDB(NAME, 4, { upgrade: upgradeTriageDb });

		const has = database.objectStoreNames.contains('meter');
		database.close();

		expect(has).toBe(true);
	});
});
