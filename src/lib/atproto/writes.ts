import { XrpcError } from './xrpc';
import type { OwnerSession } from './oauth';
import { listFollows } from './graph';

/**
 * The only authenticated writes this app makes.
 *
 * Every read goes through public endpoints; this file is the whole of what the
 * OAuth grant is for. Keeping it small and in one place is what makes
 * "it can only add and remove follows" checkable rather than a promise — the
 * grant permits exactly these two operations on exactly this collection.
 */

const FOLLOW_COLLECTION = 'app.bsky.graph.follow';

/** `applyWrites` takes many operations per call; 100 keeps a failure small. */
const WRITE_BATCH = 100;

interface ApplyWrite {
	$type: string;
	collection: string;
	rkey?: string;
	value?: unknown;
}

/**
 * Send one batch of writes.
 *
 * The session's `fetch` signs with DPoP and refreshes an expired token on its
 * own, so there is no retry-on-401 here — a scan and a review can easily
 * outlive an access token, and the library is what keeps that from being the
 * app's problem.
 */
async function applyWrites(session: OwnerSession, writes: ApplyWrite[]): Promise<void> {
	const endpoint = 'com.atproto.repo.applyWrites';
	let response: Response;

	try {
		response = await session.fetch(`/xrpc/${endpoint}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ repo: session.did, writes })
		});
	} catch (cause) {
		throw new XrpcError(0, endpoint, `could not reach your PDS: ${String(cause)}`, { cause });
	}

	if (!response.ok) {
		const body = await response.text().catch(() => '');
		throw new XrpcError(
			response.status,
			endpoint,
			`${endpoint} failed with ${response.status}${body ? `: ${body.slice(0, 200)}` : ''}`
		);
	}
}

/**
 * Delete follow records, a batch at a time.
 *
 * `onBatch` runs after each batch commits and before the next is sent, so the
 * caller can write its bookkeeping. A crash then loses at most one batch's
 * record of what happened, and the run can be reconciled against the repo
 * rather than guessed at.
 */
export async function deleteFollows(
	session: OwnerSession,
	rkeys: string[],
	onBatch: (done: string[]) => Promise<void>
): Promise<void> {
	for (let i = 0; i < rkeys.length; i += WRITE_BATCH) {
		const batch = rkeys.slice(i, i + WRITE_BATCH);
		await applyWrites(
			session,
			batch.map((rkey) => ({
				$type: 'com.atproto.repo.applyWrites#delete',
				collection: FOLLOW_COLLECTION,
				rkey
			}))
		);
		await onBatch(batch);
	}
}

/**
 * Create follow records for a set of subjects.
 *
 * Used by restore. The original follow date is not recoverable — a new record
 * carries a new `createdAt` — and the subject is notified, which is why the
 * screen says both before anything is sent.
 */
export async function createFollows(
	session: OwnerSession,
	subjectDids: string[],
	onBatch: (done: string[]) => Promise<void>
): Promise<void> {
	for (let i = 0; i < subjectDids.length; i += WRITE_BATCH) {
		const batch = subjectDids.slice(i, i + WRITE_BATCH);
		const createdAt = new Date().toISOString();
		await applyWrites(
			session,
			batch.map((subject) => ({
				$type: 'com.atproto.repo.applyWrites#create',
				collection: FOLLOW_COLLECTION,
				value: { $type: FOLLOW_COLLECTION, subject, createdAt }
			}))
		);
		await onBatch(batch);
	}
}

/**
 * The follow records the owner's repo holds right now, by subject.
 *
 * Read at run start rather than trusted from the snapshot. Follows added or
 * removed in another client since the last load are exactly the case a run has
 * to get right: deleting a stale rkey fails the batch, and missing a new one
 * leaves the subject followed after the app said otherwise.
 */
export async function currentFollowRkeys(session: OwnerSession): Promise<Map<string, string[]>> {
	const bySubject = new Map<string, string[]>();
	for (const follow of await listFollows(session)) {
		const existing = bySubject.get(follow.subjectDid);
		if (existing) existing.push(follow.rkey);
		else bySubject.set(follow.subjectDid, [follow.rkey]);
	}
	return bySubject;
}
