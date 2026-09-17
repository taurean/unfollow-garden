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

/**
 * Two presses inside one write.
 *
 * Every decision reads the subject on screen, writes it, and only then moves
 * on. A press arriving inside that window still sees the same subject — and
 * writing it twice put it on the undo stack twice. The decisions map hides
 * that, because both writes land on one key; the stack does not, and the
 * second undo popped an entry whose decision was already gone and appeared to
 * do nothing at all.
 */
describe('acting twice before the screen has moved', () => {
	const settle = () => new Promise((resolve) => setTimeout(resolve, 30));

	/** The undo stack as stored, which is the thing that went wrong. */
	async function stack(): Promise<string[]> {
		return (await (await db()).get('undo', 'did:plc:owner'))?.subjectDids ?? [];
	}

	it('puts the subject on the undo stack once, however many times it was pressed', async () => {
		void session.decide('keep');
		void session.decide('keep');
		await settle();

		expect(await stack()).toEqual(['did:plc:alice']);
	});

	it('leaves no entry behind that would make a later undo do nothing', async () => {
		// The symptom: an undo that pops a subject whose decision is already
		// gone changes nothing on screen, so undo looks broken from that press
		// onward.
		void session.decide('keep');
		void session.decide('keep');
		await settle();
		await session.decide('keep');

		expect(await stack()).toEqual(['did:plc:alice', 'did:plc:bob']);
	});

	it('keeps undoing, one decision at a time, for as many as were made', async () => {
		await session.decide('keep');
		await session.decide('keep');

		await session.undo();
		const afterFirst = session.decisions.size;
		await session.undo();

		expect({ afterFirst, afterSecond: session.decisions.size }).toEqual({
			afterFirst: 1,
			afterSecond: 0
		});
	});

	it('ignores a skip that lands while a decision is still being written', async () => {
		void session.decide('keep');
		session.skip();
		await settle();

		expect(session.skippedCount).toBe(0);
	});
});

/**
 * Going back through a sitting, not just one step.
 *
 * A skip never reaches storage — it is session-only by design (PRD, "Terms") —
 * so the only record that one happened is in memory. That record was a single
 * field holding the most recent action, and undoing cleared it, so a second
 * undo had nothing to dispatch on and fell through to the persisted decision
 * stack. With only skips behind it, that stack is empty and undo silently did
 * nothing from the second press onward.
 */
describe('undoing a run of skips', () => {
	it('takes back every skip, one at a time', async () => {
		session.skip();
		session.skip();

		await session.undo();
		const afterFirst = session.skippedCount;
		await session.undo();

		expect({ afterFirst, afterSecond: session.skippedCount }).toEqual({
			afterFirst: 1,
			afterSecond: 0
		});
	});

	it('puts each skipped subject back on screen as it is taken back', async () => {
		session.skip();
		session.skip();

		await session.undo();
		const first = session.current?.subjectDid;
		await session.undo();

		expect({ first, second: session.current?.subjectDid }).toEqual({
			first: 'did:plc:bob',
			second: 'did:plc:alice'
		});
	});

	it('still undoes a skip after the notice about it was dismissed', async () => {
		// The notice is a message, not the record. Dismissing it used to take
		// the only trace of the skip with it.
		session.skip();
		session.dismissLastAction();

		await session.undo();

		expect(session.skippedCount).toBe(0);
	});

	it('walks back through skips and decisions in the order they happened', async () => {
		session.skip();
		await session.decide('keep');

		await session.undo();
		const afterDecisionUndone = { decided: session.decisions.size, skipped: session.skippedCount };
		await session.undo();

		expect({
			afterDecisionUndone,
			afterSkipUndone: { decided: session.decisions.size, skipped: session.skippedCount }
		}).toEqual({
			afterDecisionUndone: { decided: 0, skipped: 1 },
			afterSkipUndone: { decided: 0, skipped: 0 }
		});
	});

	it('does not re-offer a skip that reviewing the skipped list already took back', async () => {
		session.skip();
		session.reviewSkipped();

		await session.undo();

		expect(session.skippedCount).toBe(0);
	});
});
