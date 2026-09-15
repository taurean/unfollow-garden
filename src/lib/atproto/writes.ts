import { procedure, XrpcError } from './xrpc';
import { refreshSession, type Session } from './session';
import { listFollows } from './graph';

/**
 * The only authenticated writes this app makes.
 *
 * Every read in the app is public and unauthenticated; the session exists for
 * this file and nothing else. Keeping the writes in one small module is what
 * makes that claim checkable rather than a promise.
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
 * Send one batch, refreshing the session once if the token has expired.
 *
 * A scan and a review can easily outlive an access token, so the first write
 * of a run is a likely place to find an expired one. Refreshing here rather
 * than failing the run means a long sitting does not cost the user their
 * progress.
 */
async function applyWrites(session: Session, writes: ApplyWrite[]): Promise<{ session: Session }> {
	try {
		await procedure(
			session.pds,
			'com.atproto.repo.applyWrites',
			{ repo: session.did, writes },
			session.accessJwt
		);
		return { session };
	} catch (cause) {
		const expired = cause instanceof XrpcError && (cause.status === 400 || cause.status === 401);
		if (!expired) throw cause;

		const refreshed = await refreshSession(session);
		await procedure(
			refreshed.pds,
			'com.atproto.repo.applyWrites',
			{ repo: refreshed.did, writes },
			refreshed.accessJwt
		);
		return { session: refreshed };
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
	session: Session,
	rkeys: string[],
	onBatch: (done: string[], session: Session) => Promise<void>
): Promise<Session> {
	let current = session;

	for (let i = 0; i < rkeys.length; i += WRITE_BATCH) {
		const batch = rkeys.slice(i, i + WRITE_BATCH);
		const result = await applyWrites(
			current,
			batch.map((rkey) => ({
				$type: 'com.atproto.repo.applyWrites#delete',
				collection: FOLLOW_COLLECTION,
				rkey
			}))
		);
		current = result.session;
		await onBatch(batch, current);
	}

	return current;
}

/**
 * Create follow records for a set of subjects.
 *
 * Used by restore. The original follow date is not recoverable — a new record
 * has a new `createdAt` — and the subject is notified, which is why the screen
 * says both before anything is sent.
 */
export async function createFollows(
	session: Session,
	subjectDids: string[],
	onBatch: (done: string[], session: Session) => Promise<void>
): Promise<Session> {
	let current = session;

	for (let i = 0; i < subjectDids.length; i += WRITE_BATCH) {
		const batch = subjectDids.slice(i, i + WRITE_BATCH);
		const createdAt = new Date().toISOString();
		const result = await applyWrites(
			current,
			batch.map((subject) => ({
				$type: 'com.atproto.repo.applyWrites#create',
				collection: FOLLOW_COLLECTION,
				value: { $type: FOLLOW_COLLECTION, subject, createdAt }
			}))
		);
		current = result.session;
		await onBatch(batch, current);
	}

	return current;
}

/**
 * The follow records the owner's repo holds right now, by subject.
 *
 * Read at run start rather than trusted from the snapshot. Follows added or
 * removed in another client since the last load are exactly the case a run has
 * to get right: deleting a stale rkey fails the batch, and missing a new one
 * leaves the subject followed after the app said otherwise.
 */
export async function currentFollowRkeys(session: Session): Promise<Map<string, string[]>> {
	const bySubject = new Map<string, string[]>();
	for (const follow of await listFollows(session)) {
		const existing = bySubject.get(follow.subjectDid);
		if (existing) existing.push(follow.rkey);
		else bySubject.set(follow.subjectDid, [follow.rkey]);
	}
	return bySubject;
}
