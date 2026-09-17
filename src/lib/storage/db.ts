import {
	openDB,
	type DBSchema,
	type IDBPDatabase,
	type IDBPTransaction,
	type StoreNames
} from 'idb';
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
	/**
	 * The last profile the AppView returned for this subject.
	 *
	 * Kept when the AppView stops returning one, rather than nulled. "The
	 * AppView did not return a profile" and "this account has no profile" are
	 * different claims, and only the first is what a deactivation looks like
	 * from here. Nulling it threw away the only answer to "who was this".
	 */
	profile: Profile | null;
	/**
	 * When the profile first stopped being returned, or null while it still is.
	 *
	 * Paired with `profile`, this is what lets the card say who an account used
	 * to be and how long ago that was true.
	 */
	profileMissingSince: string | null;
	/** Whether the subject follows the owner back. Null when the AppView did not say. */
	followsOwner: boolean | null;
	loadedAt: string;
}

export interface Settings {
	ownerDid: string;
	lookbackDays: number;
	thresholdDays: number;
	/**
	 * When the queue last emptied with nothing skipped, or null before the
	 * first full pass.
	 *
	 * A follow made after this is new since the user last finished, which is
	 * what lets a second pass distinguish new follows from the backlog instead
	 * of presenting both as one undifferentiated queue.
	 */
	lastPassCompletedAt: string | null;
}

/**
 * How many of each resource this owner's review has actually fetched.
 *
 * Counts, not money: the rate card lives in `$lib/cost/x-rates` and can change
 * without rewriting anyone's history. Only resources that crossed the network
 * are counted, so a reload served from the activity cache adds nothing.
 */
export interface MeterCounts {
	ownerDid: string;
	follows: number;
	profiles: number;
	relationships: number;
	posts: number;
	likes: number;
}

export const EMPTY_COUNTS: Omit<MeterCounts, 'ownerDid'> = {
	follows: 0,
	profiles: 0,
	relationships: 0,
	posts: 0,
	likes: 0
};

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
	thresholdDays: 30,
	lastPassCompletedAt: null
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
	meter: { key: string; value: MeterCounts };
}

const DB_NAME = 'follow-triage';
const DB_VERSION = 3;

let dbPromise: Promise<IDBPDatabase<TriageDB>> | undefined;

export function db(): Promise<IDBPDatabase<TriageDB>> {
	dbPromise ??= openDB<TriageDB>(DB_NAME, DB_VERSION, { upgrade: upgradeTriageDb });
	return dbPromise;
}

/**
 * Bring a database at any older version up to `DB_VERSION`.
 *
 * Every version is an additive step, and a step may transform `decisions` or
 * `runs` but never drop them. Losing a decision is the one failure this app
 * cannot recover from — the user made that call once and will not remember
 * making it.
 *
 * Exported so its tests can drive it against a throwaway database seeded at an
 * older version, which is the only way to check a migration against real
 * fixture data rather than against the shape it happens to produce today.
 */
export function upgradeTriageDb(
	database: IDBPDatabase<TriageDB>,
	oldVersion: number,
	_newVersion: number | null,
	transaction: IDBPTransaction<TriageDB, ArrayLike<StoreNames<TriageDB>>, 'versionchange'>
): void {
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
	if (oldVersion < 3) {
		database.createObjectStore('meter', { keyPath: 'ownerDid' });

		/*
		 * Two fields backfilled rather than left optional, so a stored record
		 * always has the shape its type claims. Reading one written before this
		 * version would otherwise hand back `undefined` where the type promises
		 * `null`, and the difference would surface as a bug somewhere far from
		 * here.
		 *
		 * Nothing is transformed and nothing is dropped: both stores keep every
		 * record they had.
		 */
		void backfillV3(transaction);
	}
}

/**
 * Give records written before version 3 the two fields version 3 added.
 *
 * Runs inside the upgrade transaction, so either the whole step lands or the
 * database stays at the previous version.
 */
async function backfillV3(
	transaction: IDBPTransaction<TriageDB, ArrayLike<StoreNames<TriageDB>>, 'versionchange'>
): Promise<void> {
	const follows = transaction.objectStore('follows');
	for (const snapshot of await follows.getAll()) {
		if (snapshot.profileMissingSince === undefined) {
			await follows.put({ ...snapshot, profileMissingSince: null });
		}
	}

	const settings = transaction.objectStore('settings');
	for (const stored of await settings.getAll()) {
		if (stored.lastPassCompletedAt === undefined) {
			await settings.put({ ...stored, lastPassCompletedAt: null });
		}
	}
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
 *
 * A subject the AppView no longer returns a profile for keeps the profile it
 * had, stamped with when it went missing. That is what a deactivation looks
 * like from the outside, and overwriting it with null would destroy the only
 * record of who the account was — the app would be deleting the evidence its
 * own screen needs.
 *
 * The read of the existing snapshots and the write of the new ones share one
 * transaction on purpose: split across two, a concurrent load could land
 * between them and the carried-over profile would be the thing lost.
 */
export async function saveFollows(
	ownerDid: string,
	follows: FollowRecord[],
	profiles: Map<string, Profile>,
	followsOwner?: Map<string, boolean>
): Promise<FollowSnapshot[]> {
	const loadedAt = new Date().toISOString();
	const tx = (await db()).transaction('follows', 'readwrite');
	const store = tx.objectStore('follows');

	const previous = new Map<string, FollowSnapshot>(
		(await store.index('byOwner').getAll(ownerDid)).map((snapshot) => [
			snapshot.subjectDid,
			snapshot
		])
	);

	// One subject can have more than one follow record. All of their rkeys
	// belong to the same snapshot, because unfollowing means deleting all of
	// them, and the followed date is the earliest.
	const bySubject = new Map<string, FollowSnapshot>();

	for (const follow of follows) {
		const existing = bySubject.get(follow.subjectDid);
		if (existing) {
			existing.rkeys.push(follow.rkey);
			existing.followedAt = earliest(existing.followedAt, follow.followedAt);
			continue;
		}

		const fetched = profiles.get(follow.subjectDid) ?? null;
		const before = previous.get(follow.subjectDid);

		bySubject.set(follow.subjectDid, {
			ownerDid,
			subjectDid: follow.subjectDid,
			rkeys: [follow.rkey],
			followedAt: follow.followedAt,
			profile: fetched ?? before?.profile ?? null,
			/*
			 * Set on the load that first misses, kept at its original value on
			 * every later miss, and cleared the moment a profile comes back.
			 * Re-stamping it each time would report an account that has been
			 * gone for months as having just left.
			 */
			profileMissingSince: fetched ? null : (before?.profileMissingSince ?? loadedAt),
			followsOwner: followsOwner?.get(follow.subjectDid) ?? null,
			loadedAt
		});
	}

	const snapshots = [...bySubject.values()];

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

/** What this owner's review has fetched so far, zeroed before it fetches anything. */
export async function loadCounts(ownerDid: string): Promise<MeterCounts> {
	const stored = await (await db()).get('meter', ownerDid);
	return stored ?? { ownerDid, ...EMPTY_COUNTS };
}

export async function saveCounts(counts: MeterCounts): Promise<void> {
	await (await db()).put('meter', counts);
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
		['decisions', 'undo', 'follows', 'runs', 'settings', 'meter'],
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
		tx.objectStore('meter').delete(ownerDid),
		tx.done
	]);
}

/**
 * Clear this owner's decisions and undo stack, and nothing else.
 *
 * The narrow sibling of `deleteOwnerData`: it starts the review over rather
 * than erasing the account. Follows, cached activity, settings, and run history
 * all survive, and each for its own reason.
 *
 * Run history most of all. It is the only record of which accounts were
 * actually unfollowed and the only route back to re-following them, so a
 * "start over" that took it with it would quietly destroy the recovery path
 * for deletions that already happened.
 *
 * The meter survives too: starting the review again does not un-fetch what was
 * already fetched, and a counter that reset would understate the real cost.
 */
export async function deleteDecisions(ownerDid: string): Promise<void> {
	const tx = (await db()).transaction(['decisions', 'undo'], 'readwrite');

	for (const key of await tx.objectStore('decisions').getAllKeys()) {
		if (key[0] === ownerDid) await tx.objectStore('decisions').delete(key);
	}
	await Promise.all([tx.objectStore('undo').delete(ownerDid), tx.done]);
}

/** The undo stack, so it can survive a reload rather than living in memory. */
export async function loadUndoStack(ownerDid: string): Promise<string[]> {
	return (await (await db()).get('undo', ownerDid))?.subjectDids ?? [];
}
