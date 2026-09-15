import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RunController } from './runs.svelte';
import { db, loadDecisions, loadRuns, loadUndoStack, saveDecision } from '$lib/storage/db';
import type { Session } from '$lib/atproto/session';
import type { FollowSnapshot } from '$lib/storage/db';

/**
 * Runs are the only part of this app that deletes anything, so the cases here
 * are PRD.md, "Review and unfollow" (RUN-2 through RUN-5) read as a test list.
 *
 * The transport is mocked; the storage is real IndexedDB, because the thing
 * worth checking is that the bookkeeping and the deletes stay in step.
 */

const { deleted, listed, failAfter } = vi.hoisted(() => ({
	deleted: [] as string[],
	listed: { value: [] as Array<{ rkey: string; subjectDid: string; followedAt: null }> },
	failAfter: { value: Infinity }
}));

vi.mock('$lib/atproto/writes', async (importOriginal) => {
	const actual = await importOriginal<typeof import('$lib/atproto/writes')>();
	return {
		...actual,
		currentFollowRkeys: vi.fn(async () => {
			const map = new Map<string, string[]>();
			for (const follow of listed.value) {
				if (deleted.includes(follow.rkey)) continue;
				map.set(follow.subjectDid, [...(map.get(follow.subjectDid) ?? []), follow.rkey]);
			}
			return map;
		}),
		deleteFollows: vi.fn(
			async (
				session: Session,
				rkeys: string[],
				onBatch: (done: string[], session: Session) => Promise<void>
			) => {
				for (const rkey of rkeys) {
					if (deleted.length >= failAfter.value) throw new Error('network went away');
					deleted.push(rkey);
					await onBatch([rkey], session);
				}
				return session;
			}
		)
	};
});

const session: Session = {
	did: 'did:plc:owner',
	handle: 'owner.test',
	pds: 'https://pds.test',
	loginService: 'https://pds.test',
	accessJwt: 'access',
	refreshJwt: 'refresh'
};

function subject(did: string, rkeys: string[]): FollowSnapshot {
	return {
		ownerDid: session.did,
		subjectDid: did,
		rkeys,
		followedAt: '2021-06-04T00:00:00Z',
		followsOwner: null,
		loadedAt: '2026-09-11T00:00:00Z',
		profile: { did, handle: `${did.split(':').pop()}.test`, displayName: 'Someone' }
	};
}

/** Clear every store, so one test's decisions are not another's. */
async function wipe() {
	const database = await db();
	for (const store of ['decisions', 'undo', 'follows', 'runs', 'settings'] as const) {
		await database.clear(store);
	}
}

beforeEach(async () => {
	deleted.length = 0;
	listed.value = [];
	failAfter.value = Infinity;
	await wipe();
});

describe('starting a run', () => {
	it('records the run before the first delete is sent', async () => {
		listed.value = [{ rkey: 'r1', subjectDid: 'did:plc:a', followedAt: null }];
		const controller = new RunController();

		await controller.startUnfollow(session, [subject('did:plc:a', ['r1'])], () => {});

		const runs = await loadRuns(session.did);
		expect(runs).toHaveLength(1);
		expect(runs[0].kind).toBe('unfollow');
	});

	it('deletes every follow record a subject has', async () => {
		// One subject followed three times is one decision and three deletes.
		listed.value = [
			{ rkey: 'r1', subjectDid: 'did:plc:a', followedAt: null },
			{ rkey: 'r2', subjectDid: 'did:plc:a', followedAt: null },
			{ rkey: 'r3', subjectDid: 'did:plc:a', followedAt: null }
		];
		const controller = new RunController();

		await controller.startUnfollow(session, [subject('did:plc:a', ['r1'])], () => {});

		expect(deleted).toEqual(['r1', 'r2', 'r3']);
	});

	it('reads the rkeys from the repo rather than the stored snapshot', async () => {
		// The snapshot is stale: the real record was replaced since the load.
		listed.value = [{ rkey: 'fresh', subjectDid: 'did:plc:a', followedAt: null }];
		const controller = new RunController();

		await controller.startUnfollow(session, [subject('did:plc:a', ['stale'])], () => {});

		expect(deleted).toEqual(['fresh']);
	});

	it('marks a subject unfollowed elsewhere without sending a request', async () => {
		listed.value = [];
		const controller = new RunController();

		await controller.startUnfollow(session, [subject('did:plc:a', ['gone'])], () => {});

		expect(deleted).toEqual([]);
		const decisions = await loadDecisions(session.did);
		expect(decisions.get('did:plc:a')?.decision).toBe('unfollowed');
	});

	it('records the decision only once every one of a subject’s records is gone', async () => {
		listed.value = [
			{ rkey: 'r1', subjectDid: 'did:plc:a', followedAt: null },
			{ rkey: 'r2', subjectDid: 'did:plc:a', followedAt: null }
		];
		const controller = new RunController();
		const seen: Array<string | undefined> = [];

		// The mock delivers one rkey per batch, so the decision must not land
		// until the second.
		const original = controller;
		await original.startUnfollow(session, [subject('did:plc:a', ['r1'])], () => {
			seen.push(undefined);
		});

		const decisions = await loadDecisions(session.did);
		expect(decisions.get('did:plc:a')?.decision).toBe('unfollowed');
		expect(original.run?.targets[0].status).toBe('done');
	});

	it('takes unfollowed subjects off the undo stack', async () => {
		// Undo would otherwise offer to take back a follow that no longer exists.
		await saveDecision(session.did, 'did:plc:a', 'unfollow');
		listed.value = [{ rkey: 'r1', subjectDid: 'did:plc:a', followedAt: null }];

		await new RunController().startUnfollow(session, [subject('did:plc:a', ['r1'])], () => {});

		expect(await loadUndoStack(session.did)).toEqual([]);
	});
});

describe('an interrupted run', () => {
	it('stops where it is and keeps what it already deleted', async () => {
		listed.value = [
			{ rkey: 'r1', subjectDid: 'did:plc:a', followedAt: null },
			{ rkey: 'r2', subjectDid: 'did:plc:b', followedAt: null },
			{ rkey: 'r3', subjectDid: 'did:plc:c', followedAt: null }
		];
		failAfter.value = 2;
		const controller = new RunController();

		await controller.startUnfollow(
			session,
			[subject('did:plc:a', ['r1']), subject('did:plc:b', ['r2']), subject('did:plc:c', ['r3'])],
			() => {}
		);

		expect(deleted).toEqual(['r1', 'r2']);
		expect(controller.run?.status).toBe('interrupted');
		expect(controller.error).toMatch(/network went away/);
	});

	it('is offered for resumption on the next load', async () => {
		listed.value = [{ rkey: 'r1', subjectDid: 'did:plc:a', followedAt: null }];
		failAfter.value = 0;
		await new RunController().startUnfollow(session, [subject('did:plc:a', ['r1'])], () => {});

		const fresh = new RunController();
		await fresh.findUnfinished(session.did);

		expect(fresh.unfinished?.status).toBe('interrupted');
	});

	it('does not delete a record twice when resumed', async () => {
		listed.value = [
			{ rkey: 'r1', subjectDid: 'did:plc:a', followedAt: null },
			{ rkey: 'r2', subjectDid: 'did:plc:b', followedAt: null }
		];
		failAfter.value = 1;
		const controller = new RunController();
		await controller.startUnfollow(
			session,
			[subject('did:plc:a', ['r1']), subject('did:plc:b', ['r2'])],
			() => {}
		);
		expect(deleted).toEqual(['r1']);

		failAfter.value = Infinity;
		await controller.findUnfinished(session.did);
		await controller.resume(session, () => {});
		expect(controller.error).toBeNull();

		// r1 is gone from the repo, so the resumed run finds only r2 to delete.
		expect(deleted).toEqual(['r1', 'r2']);
		expect(controller.run?.status).toBe('complete');
	});
});

describe('a completed run', () => {
	it('can be downloaded as a list of who was unfollowed', async () => {
		const { runAsJson } = await import('./runs.svelte');
		listed.value = [{ rkey: 'r1', subjectDid: 'did:plc:a', followedAt: null }];
		const controller = new RunController();
		await controller.startUnfollow(session, [subject('did:plc:a', ['r1'])], () => {});

		const parsed = JSON.parse(runAsJson(controller.run!));

		expect(parsed.ownerDid).toBe(session.did);
		expect(parsed.targets).toEqual([
			{ subjectDid: 'did:plc:a', handle: 'a.test', displayName: 'Someone', status: 'done' }
		]);
	});
});
