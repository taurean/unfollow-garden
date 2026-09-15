import type { OwnerSession } from '$lib/atproto/oauth';
import { createFollows, currentFollowRkeys, deleteFollows } from '$lib/atproto/writes';
import {
	forgetUndo,
	loadRuns,
	markDecided,
	saveRun,
	type FollowSnapshot,
	type RunRecord,
	type RunTarget
} from '$lib/storage/db';

/**
 * Unfollow and re-follow runs.
 *
 * A run is the only part of this app that changes anything outside the browser,
 * so it is written down before it starts and updated after every batch. That
 * record is what makes an interrupted run resumable and a completed one
 * reversible.
 */

function newId(): string {
	return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export class RunController {
	run = $state<RunRecord | null>(null);
	busy = $state(false);
	error = $state<string | null>(null);

	/** Follow records removed so far, and how many there are in total. */
	done = $state(0);
	total = $state(0);

	/** A run that was left unfinished, offered for resumption on next load. */
	unfinished = $state<RunRecord | null>(null);

	/** Look for a run that never reached a terminal state (PRD, RUN-4). */
	async findUnfinished(ownerDid: string): Promise<void> {
		const runs = await loadRuns(ownerDid);
		this.unfinished = runs.find((run) => run.status !== 'complete') ?? null;
	}

	/**
	 * Write the run record, then start deleting.
	 *
	 * Targets are read fresh from the owner's repo, not from the stored
	 * snapshot: a subject unfollowed in another client since the last load has
	 * no record left to delete, and one followed again has a different rkey.
	 * Getting this wrong fails the batch rather than the subject.
	 */
	async startUnfollow(session: OwnerSession, subjects: FollowSnapshot[]): Promise<void> {
		this.busy = true;
		this.error = null;

		try {
			const live = await currentFollowRkeys(session);

			const targets: RunTarget[] = subjects.map((subject) => {
				const rkeys = live.get(subject.subjectDid) ?? [];
				return {
					subjectDid: subject.subjectDid,
					handle: subject.profile?.handle ?? subject.subjectDid,
					displayName: subject.profile?.displayName ?? null,
					rkeys,
					// Nothing left to delete: they were unfollowed elsewhere, and
					// the decision is recorded without a request (PRD, RUN-2).
					status: rkeys.length === 0 ? 'already-gone' : 'pending'
				};
			});

			const run: RunRecord = {
				id: newId(),
				ownerDid: session.did,
				kind: 'unfollow',
				// eslint-disable-next-line svelte/prefer-svelte-reactivity -- read once, never held
				createdAt: new Date().toISOString(),
				status: 'running',
				targets,
				error: null
			};

			// Written before the first delete request, so a crash one line later
			// still leaves a record of what was about to happen.
			await saveRun($state.snapshot(run));
			this.run = run;

			await this.#execute(session, run);
		} catch (cause) {
			this.error = cause instanceof Error ? cause.message : String(cause);
			this.busy = false;
		}
	}

	/**
	 * Pick a run back up.
	 *
	 * The repo is re-read first, so records already deleted before the
	 * interruption are recognised rather than deleted again.
	 */
	async resume(session: OwnerSession): Promise<void> {
		const run = this.unfinished;
		if (!run) return;

		this.busy = true;
		this.error = null;

		try {
			const live = await currentFollowRkeys(session);
			for (const target of run.targets) {
				if (target.status === 'done') continue;
				const rkeys = live.get(target.subjectDid) ?? [];
				target.rkeys = rkeys;
				target.status = rkeys.length === 0 ? 'already-gone' : 'pending';
			}

			run.status = 'running';
			run.error = null;
			// `run` came out of `$state`, so it is a proxy. A proxy cannot be
			// structured-cloned and throws on write (CONTEXT.md).
			await saveRun($state.snapshot(run));
			this.run = run;
			this.unfinished = null;

			await this.#execute(session, run);
		} catch (cause) {
			this.error = cause instanceof Error ? cause.message : String(cause);
			this.busy = false;
		}
	}

	/**
	 * Follow every target of a past run again.
	 *
	 * Not an undo of the run so much as a new set of follows: the original
	 * follow dates are gone and the subjects are notified. The screen says both
	 * before this is reachable (PRD, RESTORE-1).
	 */
	async restore(session: OwnerSession, run: RunRecord, subjectDids: string[]): Promise<void> {
		this.busy = true;
		this.error = null;
		this.done = 0;
		this.total = subjectDids.length;

		try {
			await createFollows(session, subjectDids, async (batch) => {
				this.done += batch.length;
				for (const subjectDid of batch) await markDecided(run.ownerDid, subjectDid, 'keep');
			});
		} catch (cause) {
			this.error = cause instanceof Error ? cause.message : String(cause);
		} finally {
			this.busy = false;
		}
	}

	/** Delete every pending target's records, writing progress as it goes. */
	async #execute(session: OwnerSession, run: RunRecord): Promise<void> {
		// Targets that were already gone still get their decision recorded, so
		// the queue and the counts agree with the repo.
		for (const target of run.targets) {
			if (target.status === 'already-gone') {
				await markDecided(run.ownerDid, target.subjectDid, 'unfollowed');
			}
		}

		// Locals for the length of one run, read imperatively and never rendered.
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const owners = new Map<string, RunTarget>();
		const rkeys: string[] = [];
		for (const target of run.targets) {
			if (target.status !== 'pending') continue;
			for (const rkey of target.rkeys) {
				owners.set(rkey, target);
				rkeys.push(rkey);
			}
		}

		this.done = 0;
		this.total = rkeys.length;

		try {
			// eslint-disable-next-line svelte/prefer-svelte-reactivity
			const removed = new Set<string>();

			await deleteFollows(session, rkeys, async (batch) => {
				for (const rkey of batch) removed.add(rkey);
				this.done += batch.length;

				// A subject counts as unfollowed once every one of their records
				// is gone. A subject followed twice is not half-unfollowed.
				const settled: string[] = [];
				for (const rkey of batch) {
					const target = owners.get(rkey);
					if (!target || target.status === 'done') continue;
					if (!target.rkeys.every((each) => removed.has(each))) continue;
					target.status = 'done';
					settled.push(target.subjectDid);
				}

				// Bookkeeping lands before the next batch is sent.
				await saveRun($state.snapshot(run));
				for (const subjectDid of settled) {
					await markDecided(run.ownerDid, subjectDid, 'unfollowed');
				}
				if (settled.length > 0) await forgetUndo(run.ownerDid, settled);
			});

			run.status = 'complete';
			await saveRun($state.snapshot(run));
		} catch (cause) {
			// The run stops where it is rather than unwinding. Everything already
			// deleted stays deleted, and resuming re-reads the repo to find out
			// exactly what that was.
			run.status = 'interrupted';
			run.error = cause instanceof Error ? cause.message : String(cause);
			await saveRun($state.snapshot(run));
			this.error = run.error;
			this.unfinished = run;
		} finally {
			this.busy = false;
		}
	}
}

/** The run's target list as a JSON file the user can keep (PRD, RUN-5). */
export function runAsJson(run: RunRecord): string {
	return JSON.stringify(
		{
			formatVersion: 1,
			runId: run.id,
			ownerDid: run.ownerDid,
			kind: run.kind,
			createdAt: run.createdAt,
			status: run.status,
			targets: run.targets.map((target) => ({
				subjectDid: target.subjectDid,
				handle: target.handle,
				displayName: target.displayName,
				status: target.status
			}))
		},
		null,
		2
	);
}
