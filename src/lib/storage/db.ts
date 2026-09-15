import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { FollowRecord, Profile } from '$lib/atproto/graph';
import type { SubjectActivity } from '$lib/atproto/activity';

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
	/** Whether the subject follows the owner back. Null when the AppView did not say. */
	followsOwner: boolean | null;
	loadedAt: string;
}

export interface Settings {
	ownerDid: string;
	lookbackDays: number;
	thresholdDays: number;
}

/**
 * How much history to load per subject, and how long a quiet stretch has to be
 * before it is worth naming.
 *
 * The lookback is a year because the strip is laid out in months and a year of
 * them is the span that makes a seasonal poster distinguishable from someone
 * who left.
 */
export const DEFAULT_SETTINGS: Omit<Settings, 'ownerDid'> = {
	lookbackDays: 365,
	thresholdDays: 30
};

/** One target of a run, captured fresh from the owner's repo at run start. */
export interface RunTarget {
	subjectDid: string;
	handle: string;
	displayName: string | null;
	/** Every follow record for this subject. Unfollowing means deleting all of them. */
	rkeys: string[];
	status: 'pending' | 'done' | 'already-gone';
}

/**
 * One execution of unfollows or re-follows.
 *
 * Written before the first delete request and updated after every batch, so a
 * closed tab or a dead network loses at most one batch of bookkeeping and the
 * run can be picked up where it stopped.
 */
export interface RunRecord {
	id: string;
	ownerDid: string;
	kind: 'unfollow' | 'refollow';
	createdAt: string;
	status: 'running' | 'complete' | 'interrupted';
	targets: RunTarget[];
	error: string | null;
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
	activity: { key: string; value: SubjectActivity };
	runs: { key: string; value: RunRecord; indexes: { byOwner: string } };
}

const DB_NAME = 'follow-triage';
const DB_VERSION = 2;

let dbPromise: Promise<IDBPDatabase<TriageDB>> | undefined;

export function db(): Promise<IDBPDatabase<TriageDB>> {
	dbPromise ??= openDB<TriageDB>(DB_NAME, DB_VERSION, {
		/*
		 * Every version is an additive step, and a step may transform
		 * `decisions` or `runs` but never drop them. Losing a decision is the
		 * one failure this app cannot recover from — the user made that call
		 * once and will not remember making it.
		 */
		upgrade(database, oldVersion) {
			if (oldVersion < 1) {
				database.createObjectStore('settings', { keyPath: 'ownerDid' });
				database.createObjectStore('decisions', { keyPath: ['ownerDid', 'subjectDid'] });
				database.createObjectStore('undo', { keyPath: 'ownerDid' });
				database
					.createObjectStore('follows', { keyPath: ['ownerDid', 'subjectDid'] })
					.createIndex('byOwner', 'ownerDid');
				database.createObjectStore('runs', { keyPath: 'id' }).createIndex('byOwner', 'ownerDid');
			}
			if (oldVersion < 2) {
				// Activity is keyed by subject alone, not by owner: it describes
				// the subject, so two owners on one browser can share it.
				database.createObjectStore('activity', { keyPath: 'subjectDid' });
			}
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
	profiles: Map<string, Profile>,
	followsOwner?: Map<string, boolean>
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
			followsOwner: followsOwner?.get(follow.subjectDid) ?? null,
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

/** This owner's settings, falling back to the documented defaults. */
export async function loadSettings(ownerDid: string): Promise<Settings> {
	const stored = await (await db()).get('settings', ownerDid);
	return stored ?? { ownerDid, ...DEFAULT_SETTINGS };
}

export async function saveSettings(settings: Settings): Promise<void> {
	await (await db()).put('settings', settings);
}

/** How long a subject's loaded activity is trusted before it is fetched again. */
const ACTIVITY_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Cached activity for a subject, if it is still fresh and still the right shape.
 *
 * A changed lookback is a cache miss rather than a trim: a wider window needs
 * events the cache never held, and a narrower one would leave the covered
 * window claiming coverage the user did not ask for.
 */
export async function loadActivityCache(
	subjectDid: string,
	lookbackDays: number
): Promise<SubjectActivity | null> {
	const cached = await (await db()).get('activity', subjectDid);
	if (!cached) return null;
	if (cached.lookbackDays !== lookbackDays) return null;
	if (Date.now() - Date.parse(cached.fetchedAt) > ACTIVITY_TTL_MS) return null;
	return cached;
}

export async function saveActivityCache(activity: SubjectActivity): Promise<void> {
	await (await db()).put('activity', activity);
}

export async function saveRun(run: RunRecord): Promise<void> {
	await (await db()).put('runs', run);
}

/** This owner's runs, newest first. */
export async function loadRuns(ownerDid: string): Promise<RunRecord[]> {
	const runs = await (await db()).getAllFromIndex('runs', 'byOwner', ownerDid);
	return runs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Set a decision without touching the undo stack.
 *
 * Used by runs, which record `unfollowed` as a fact that already happened.
 * Undo is for taking back a judgement, and a deleted follow record is not a
 * judgement that can be taken back by popping a stack.
 */
export async function markDecided(
	ownerDid: string,
	subjectDid: string,
	decision: Decision
): Promise<void> {
	await (
		await db()
	).put('decisions', {
		ownerDid,
		subjectDid,
		decision,
		decidedAt: new Date().toISOString()
	});
}

/**
 * Drop subjects from the undo stack once a run has deleted their follows.
 *
 * Undoing to a subject whose follow record is gone would offer a choice the
 * app can no longer act on (PRD, TRI-3).
 */
export async function forgetUndo(ownerDid: string, subjectDids: string[]): Promise<void> {
	const drop = new Set(subjectDids);
	const store = (await db()).transaction('undo', 'readwrite').objectStore('undo');
	const stack = (await store.get(ownerDid))?.subjectDids ?? [];
	await store.put({ ownerDid, subjectDids: stack.filter((did) => !drop.has(did)) });
}

/** Everything stored for one owner, for the export file and the delete-all button. */
export async function deleteOwnerData(ownerDid: string): Promise<void> {
	const database = await db();
	const tx = database.transaction(
		['decisions', 'undo', 'follows', 'runs', 'settings'],
		'readwrite'
	);

	for (const key of await tx.objectStore('decisions').getAllKeys()) {
		if (key[0] === ownerDid) await tx.objectStore('decisions').delete(key);
	}
	for (const key of await tx.objectStore('follows').index('byOwner').getAllKeys(ownerDid)) {
		await tx.objectStore('follows').delete(key);
	}
	for (const key of await tx.objectStore('runs').index('byOwner').getAllKeys(ownerDid)) {
		await tx.objectStore('runs').delete(key);
	}
	await Promise.all([
		tx.objectStore('undo').delete(ownerDid),
		tx.objectStore('settings').delete(ownerDid),
		tx.done
	]);
}

/** The undo stack, so it can survive a reload rather than living in memory. */
export async function loadUndoStack(ownerDid: string): Promise<string[]> {
	return (await (await db()).get('undo', ownerDid))?.subjectDids ?? [];
}
