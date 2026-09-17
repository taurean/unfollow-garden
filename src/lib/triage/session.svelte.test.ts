import { beforeEach, describe, expect, it } from 'vitest';
import { TriageSession } from './session.svelte';
import { db, loadDecisions } from '$lib/storage/db';
import type { FollowSnapshot } from '$lib/storage/db';

/**
 * Undo, across the two kinds of thing it can take back.
 *
 * A decision lives in IndexedDB and on an undo stack; a skip lives only in
 * this sitting's memory and deliberately never reaches storage (PRD, "Terms").
 * "Undo" has to mean the last thing the user did whichever of the two it was,
 * and the storage here is real because that is the half that can disagree.
 */

function snapshot(did: string, displayName: string): FollowSnapshot {
	return {
		ownerDid: 'did:plc:owner',
		subjectDid: did,
		rkeys: ['rkey-' + did],
		followedAt: '2021-06-04T00:00:00Z',
		followsOwner: null,
		loadedAt: '2026-09-11T00:00:00Z',
		profileMissingSince: null,
		profile: { did, handle: `${did.split(':').pop()}.test`, displayName }
	};
}

const alice = snapshot('did:plc:alice', 'Alice');
const bob = snapshot('did:plc:bob', 'Bob');

/** A session holding two subjects, with the network left out. */
function parkedSession() {
	const session = new TriageSession();
	session.session = {
		did: 'did:plc:owner',
		handle: 'owner.test',
		pds: 'https://pds.test',
		fetch: async () => new Response(null, { status: 200 })
	};
	session.subjects = [alice, bob];
	session.current = alice;
	session.phase = 'triage';
	// The scanner has loaded nothing, so `advance` orders by follow date.
	return session;
}

async function wipe() {
	const database = await db();
	for (const store of ['decisions', 'undo', 'follows', 'runs', 'settings', 'meter'] as const) {
		await database.clear(store);
	}
}

let session: TriageSession;

beforeEach(async () => {
	await wipe();
	session = parkedSession();
});

describe('what the last action was', () => {
	it('names the account a decision was about, so the notice can report it', async () => {
		await session.decide('unfollow');

		expect(session.lastAction).toMatchObject({ kind: 'unfollow', subjectDid: alice.subjectDid });
		expect(session.lastAction?.label).toBe('Alice');
	});

	it('names the account a skip was about too', () => {
		session.skip();

		expect(session.lastAction).toMatchObject({ kind: 'skip', subjectDid: alice.subjectDid });
	});

	it('changes identity between two identical decisions in a row', async () => {
		await session.decide('keep');
		const first = session.lastAction?.seq;
		await session.decide('keep');

		// Two keeps produce identical records; without this the notice would
		// not know a second one had happened and would not restart its timer.
		expect(session.lastAction?.seq).not.toBe(first);
	});

	it('is forgotten once the notice is dismissed, without undoing anything', async () => {
		await session.decide('unfollow');
		session.dismissLastAction();

		expect(session.lastAction).toBeNull();
		expect(await loadDecisions('did:plc:owner')).toHaveProperty('size', 1);
	});
});

describe('undo, when the last thing was a skip', () => {
	it('puts the skipped account back on screen', () => {
		session.skip();
		expect(session.current?.subjectDid).toBe(bob.subjectDid);

		session.undo();

		expect(session.current?.subjectDid).toBe(alice.subjectDid);
		expect(session.skipped.has(alice.subjectDid)).toBe(false);
	});

	it('leaves the decision made before the skip alone', async () => {
		// The trap: a skip is not on the undo stack, so popping the stack here
		// would take back Bob's keep and hand back the wrong account entirely.
		session.current = bob;
		await session.decide('keep');
		session.current = alice;
		session.skip();

		await session.undo();

		expect(session.current?.subjectDid).toBe(alice.subjectDid);
		const decisions = await loadDecisions('did:plc:owner');
		expect(decisions.get(bob.subjectDid)?.decision).toBe('keep');
	});
});

describe('undo, when the last thing was a decision', () => {
	it('takes the decision back out of storage and returns to the account', async () => {
		await session.decide('unfollow');

		await session.undo();

		expect(session.current?.subjectDid).toBe(alice.subjectDid);
		expect(await loadDecisions('did:plc:owner')).toHaveProperty('size', 0);
	});

	it('leaves nothing to report once it has been taken back', async () => {
		await session.decide('unfollow');

		await session.undo();

		expect(session.lastAction).toBeNull();
	});
});

describe('finishing a pass', () => {
	it('records when the queue emptied, so a later pass can tell what is new', async () => {
		await session.decide('keep');
		await session.decide('keep');

		expect(session.settings.lastPassCompletedAt).not.toBeNull();
	});

	it('does not record a sitting that ended with accounts still skipped', async () => {
		// Stopping with a backlog is a sitting ending, not a review finishing.
		// Dating the next pass from here would file the skipped ones as new.
		await session.decide('keep');
		session.skip();

		expect(session.settings.lastPassCompletedAt).toBeNull();
	});

	it('treats nothing as new before a first pass has ever finished', () => {
		// Everything is the backlog at that point, and badging all of it says
		// nothing at all.
		expect(session.isNewSinceLastPass(alice)).toBe(false);
	});

	it('counts a follow made after the last finished pass as new', async () => {
		await session.decide('keep');
		await session.decide('keep');

		// A fixed date a day past the pass, rather than "now": the pass finishes
		// in the same millisecond as the test runs, and the comparison is
		// strictly-after.
		const dayAfter = new Date(
			Date.parse(session.settings.lastPassCompletedAt ?? '') + 86_400_000
		).toISOString();
		const fresh = { ...snapshot('did:plc:carol', 'Carol'), followedAt: dayAfter };
		session.subjects = [...session.subjects, fresh];

		expect(session.isNewSinceLastPass(fresh)).toBe(true);
	});

	it('does not claim a follow with no parseable date is new', async () => {
		await session.decide('keep');
		await session.decide('keep');

		const undated = { ...snapshot('did:plc:dave', 'Dave'), followedAt: null };

		expect(session.isNewSinceLastPass(undated)).toBe(false);
	});
});

describe('the kept list', () => {
	it('holds what was kept and not what was marked', async () => {
		await session.decide('keep');
		await session.decide('unfollow');

		expect(session.kept.map((s) => s.subjectDid)).toEqual(['did:plc:alice']);
	});

	it('drops a subject that is marked for unfollow from the kept list', async () => {
		await session.decide('keep');

		await session.unfollowInstead('did:plc:alice');

		expect({ kept: session.kept.length, marked: session.marked.length }).toEqual({
			kept: 0,
			marked: 1
		});
	});
});
