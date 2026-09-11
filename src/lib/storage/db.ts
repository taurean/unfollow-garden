import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { FollowRecord, Profile } from '$lib/atproto/graph';

/**
 * Local storage for decisions.
 *
 * The schema follows the version 1 table in PRD.md, including the stores v0
 * does not write yet. Matching it now means v1 adds rows rather than a
 * migration, and a migration that moves decisions is the one kind this project
 * cannot afford to get wrong.
 */

export type Decision = 'keep' | 'unfollow' | 'unfollowed';

export interface DecisionRecord {
	ownerDid: string;
	subjectDid: string;
	decision: Decision;
	decidedAt: string;
}

export interface FollowSnapshot {
	ownerDid: string;
	subjectDid: string;
	rkeys: string[];
	followedAt: string | null;
	profile: Profile | null;
	loadedAt: string;
}

export interface Settings {
	ownerDid: string;
	lookbackDays: number;
	thresholdDays: number;
}

interface TriageDB extends DBSchema {
	settings: { key: string; value: Settings };
	decisions: { key: [string, string]; value: DecisionRecord };
	undo: { key: string; value: { ownerDid: string; subjectDids: string[] } };
	follows: {
		key: [string, string];
		value: FollowSnapshot;
		indexes: { byOwner: string };
	};
	runs: { key: string; value: { id: string; ownerDid: string }; indexes: { byOwner: string } };
}

const DB_NAME = 'follow-triage';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<TriageDB>> | undefined;

export function db(): Promise<IDBPDatabase<TriageDB>> {
	dbPromise ??= openDB<TriageDB>(DB_NAME, DB_VERSION, {
		upgrade(database) {
			database.createObjectStore('settings', { keyPath: 'ownerDid' });
			database.createObjectStore('decisions', { keyPath: ['ownerDid', 'subjectDid'] });
			database.createObjectStore('undo', { keyPath: 'ownerDid' });
			database
				.createObjectStore('follows', { keyPath: ['ownerDid', 'subjectDid'] })
				.createIndex('byOwner', 'ownerDid');
			database.createObjectStore('runs', { keyPath: 'id' }).createIndex('byOwner', 'ownerDid');
		}
	});
	return dbPromise;
}

/** Every decision this owner has made, keyed by subject DID. */
export async function loadDecisions(ownerDid: string): Promise<Map<string, DecisionRecord>> {
	const all = await (await db()).getAll('decisions');
	return new Map(all.filter((d) => d.ownerDid === ownerDid).map((d) => [d.subjectDid, d]));
}

/**
 * Record one decision and push it onto the undo stack, atomically.
 *
 * Both stores change together or neither does. A decision saved without its
 * undo entry is one the user cannot take back, which is worse than a decision
 * that did not save at all — the second is visible, the first is not.
 */
export async function saveDecision(
	ownerDid: string,
	subjectDid: string,
	decision: Decision
): Promise<DecisionRecord> {
	const record: DecisionRecord = {
		ownerDid,
		subjectDid,
		decision,
		decidedAt: new Date().toISOString()
	};

	const tx = (await db()).transaction(['decisions', 'undo'], 'readwrite');
	const undoStore = tx.objectStore('undo');
	const existing = (await undoStore.get(ownerDid))?.subjectDids ?? [];
	await Promise.all([
		tx.objectStore('decisions').put(record),
		undoStore.put({ ownerDid, subjectDids: [...existing, subjectDid] }),
		tx.done
	]);

	return record;
}

/** Take back the last decision, returning the subject it belonged to. */
export async function undoLast(ownerDid: string): Promise<string | null> {
	const tx = (await db()).transaction(['decisions', 'undo'], 'readwrite');
	const undoStore = tx.objectStore('undo');
	const stack = (await undoStore.get(ownerDid))?.subjectDids ?? [];
	const subjectDid = stack.at(-1);

	if (!subjectDid) {
		await tx.done;
		return null;
	}

	await Promise.all([
		tx.objectStore('decisions').delete([ownerDid, subjectDid]),
		undoStore.put({ ownerDid, subjectDids: stack.slice(0, -1) }),
		tx.done
	]);

	return subjectDid;
}

/**
 * Replace this owner's follow snapshot with what the repo says now.
 *
 * Follows added or removed in another client since the last load appear and
 * disappear here. Decisions are keyed separately and survive, so a subject
 * re-followed elsewhere keeps the decision it already had.
 */
export async function saveFollows(
	ownerDid: string,
	follows: FollowRecord[],
	profiles: Map<string, Profile>
): Promise<FollowSnapshot[]> {
	// One subject can have more than one follow record. All of their rkeys
	// belong to the same snapshot, because unfollowing means deleting all of
	// them, and the followed date is the earliest.
	const bySubject = new Map<string, FollowSnapshot>();
	const loadedAt = new Date().toISOString();

	for (const follow of follows) {
		const existing = bySubject.get(follow.subjectDid);
		if (existing) {
			existing.rkeys.push(follow.rkey);
			existing.followedAt = earliest(existing.followedAt, follow.followedAt);
			continue;
		}
		bySubject.set(follow.subjectDid, {
			ownerDid,
			subjectDid: follow.subjectDid,
			rkeys: [follow.rkey],
			followedAt: follow.followedAt,
			profile: profiles.get(follow.subjectDid) ?? null,
			loadedAt
		});
	}

	const snapshots = [...bySubject.values()];
	const tx = (await db()).transaction('follows', 'readwrite');
	const store = tx.objectStore('follows');

	for (const stale of await store.index('byOwner').getAllKeys(ownerDid)) {
		if (!bySubject.has(stale[1])) await store.delete(stale);
	}
	await Promise.all([...snapshots.map((snapshot) => store.put(snapshot)), tx.done]);

	return snapshots;
}

/** Whichever of two dates came first, tolerating nulls on either side. */
function earliest(a: string | null, b: string | null): string | null {
	if (!a) return b;
	if (!b) return a;
	return Date.parse(a) <= Date.parse(b) ? a : b;
}

export async function loadFollows(ownerDid: string): Promise<FollowSnapshot[]> {
	return (await db()).getAllFromIndex('follows', 'byOwner', ownerDid);
}
