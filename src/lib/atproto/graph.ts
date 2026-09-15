import { APPVIEW } from './identity';
import { query } from './xrpc';
import type { OwnerSession } from './oauth';

/** One `app.bsky.graph.follow` record in the owner's repo. */
export interface FollowRecord {
	/** The record key, which is what a delete needs. */
	rkey: string;
	/** The DID of the account being followed. */
	subjectDid: string;
	/** When the owner followed them, if the record says so parseably. */
	followedAt: string | null;
}

/** The subset of a profile this app shows. */
export interface Profile {
	did: string;
	handle: string;
	displayName?: string;
	description?: string;
	avatar?: string;
	followersCount?: number;
	followsCount?: number;
	postsCount?: number;
	/**
	 * When the account was created, per the AppView.
	 *
	 * Used to stop the activity window reaching back before the account
	 * existed, which would otherwise report a young account as having an
	 * eleven-month silence.
	 */
	createdAt?: string;
}

interface ListRecordsResponse {
	cursor?: string;
	records: Array<{ uri: string; value: { subject?: string; createdAt?: string } }>;
}

/**
 * Every account the owner follows, read from their own repo.
 *
 * Deliberately not the AppView's follow list: the repo is the only source that
 * still lists accounts which were deleted, deactivated, or suspended, and those
 * are exactly the follows a review most wants to reach.
 *
 * Unauthenticated, like every read here. `listRecords` is public, so reading
 * your own follows needs no grant — which is what keeps the OAuth scope down to
 * creating and deleting them.
 */
export async function listFollows(
	session: OwnerSession,
	onProgress?: (loaded: number) => void
): Promise<FollowRecord[]> {
	const follows: FollowRecord[] = [];
	let cursor: string | undefined;

	do {
		const page = await query<ListRecordsResponse>(session.pds, 'com.atproto.repo.listRecords', {
			repo: session.did,
			collection: 'app.bsky.graph.follow',
			limit: '100',
			cursor
		});

		for (const record of page.records) {
			if (!record.value.subject) continue;
			follows.push({
				rkey: record.uri.split('/').pop() ?? '',
				subjectDid: record.value.subject,
				followedAt: parseDate(record.value.createdAt)
			});
		}

		cursor = page.cursor;
		onProgress?.(follows.length);
	} while (cursor);

	return follows;
}

/** An unparseable `createdAt` hides the followed date rather than failing the load. */
function parseDate(value: string | undefined): string | null {
	if (!value) return null;
	return Number.isNaN(Date.parse(value)) ? null : value;
}

/** The AppView takes at most 25 actors per `getProfiles` call. */
const PROFILE_BATCH = 25;

/**
 * Profiles for a set of DIDs, in batches.
 *
 * Duplicate DIDs are collapsed. A DID with no profile is simply absent from the result — the account may be
 * deleted, deactivated, or suspended, and the triage screen says so rather than
 * treating it as an error.
 */
export async function getProfiles(
	dids: string[],
	onProgress?: (loaded: number) => void
): Promise<Map<string, Profile>> {
	const profiles = new Map<string, Profile>();
	// Deduplicated here rather than by the caller: a subject followed twice
	// would otherwise cost a second lookup, and every caller would have to
	// remember that duplicates are possible.
	const unique = [...new Set(dids)];

	for (let i = 0; i < unique.length; i += PROFILE_BATCH) {
		const batch = unique.slice(i, i + PROFILE_BATCH);
		const page = await query<{ profiles: Profile[] }>(APPVIEW, 'app.bsky.actor.getProfiles', {
			actors: batch
		});
		for (const profile of page.profiles) profiles.set(profile.did, profile);
		onProgress?.(profiles.size);
	}

	return profiles;
}

/** The AppView takes at most 30 actors per `getRelationships` call. */
const RELATIONSHIP_BATCH = 30;

interface RelationshipsResponse {
	relationships: Array<{ did?: string; following?: string; followedBy?: string }>;
}

/**
 * Which of these subjects follow the owner back.
 *
 * A DID missing from the result is absent rather than false: the AppView
 * returns nothing for accounts it cannot see, and "we do not know" is a
 * different claim from "they do not follow you" on a screen where the answer
 * changes someone's mind.
 */
export async function getFollowsOwner(
	ownerDid: string,
	subjectDids: string[],
	onProgress?: (loaded: number) => void
): Promise<Map<string, boolean>> {
	const result = new Map<string, boolean>();
	const unique = [...new Set(subjectDids)];

	for (let i = 0; i < unique.length; i += RELATIONSHIP_BATCH) {
		const batch = unique.slice(i, i + RELATIONSHIP_BATCH);
		const page = await query<RelationshipsResponse>(APPVIEW, 'app.bsky.graph.getRelationships', {
			actor: ownerDid,
			others: batch
		});
		for (const relationship of page.relationships) {
			if (!relationship.did) continue;
			// `followedBy` is set from the owner's point of view: the other
			// account follows the owner.
			result.set(relationship.did, Boolean(relationship.followedBy));
		}
		onProgress?.(result.size);
	}

	return result;
}
