import { pdsForDid } from './identity';
import { query } from './xrpc';

/**
 * What an account looks like when the AppView has stopped answering for it.
 *
 * The AppView simply omits an account it will not serve, so "deactivated",
 * "suspended", "taken down" and "deleted" all arrive as the same silence. The
 * two public sources that still say something are the account's own PDS, which
 * reports a status word, and the PLC audit log, which is a full history of the
 * identity's handles and hosts.
 *
 * Neither records deactivation history. A repo carries one current status and
 * no memory of previous ones, and the PLC log covers identity operations only.
 * So the question "does this person deactivate often?" cannot be answered from
 * public data, and the card says so rather than reading an absence as a no.
 */

/** The status words a PDS reports for a repo it is not serving normally. */
export type RepoStatus =
	| 'active'
	| 'deactivated'
	| 'suspended'
	| 'takendown'
	| 'desynchronized'
	| 'throttled'
	| 'unknown';

export interface AccountStatus {
	status: RepoStatus;
	/** When the PDS says the repo was last active, if it says. */
	activeSince: string | null;
}

interface RepoStatusResponse {
	did: string;
	active: boolean;
	status?: string;
	rev?: string;
}

/**
 * Ask the account's own PDS what state its repo is in.
 *
 * `com.atproto.sync.getRepoStatus` is public and answers for repos the AppView
 * has dropped, which is the whole reason to call it. The host is a third party
 * that may be down, may send no CORS headers, or may be the reason the account
 * is unreachable in the first place, so a failure here is the subject's and is
 * reported as `unknown` rather than thrown.
 */
export async function getRepoStatus(subjectDid: string): Promise<AccountStatus> {
	const pds = await pdsForDid(subjectDid);
	const response = await query<RepoStatusResponse>(pds, 'com.atproto.sync.getRepoStatus', {
		did: subjectDid
	});

	if (response.active) return { status: 'active', activeSince: null };
	return { status: normalise(response.status), activeSince: null };
}

/** Keep the server's own word when it is one we know, rather than guessing. */
function normalise(status: string | undefined): RepoStatus {
	const known: RepoStatus[] = [
		'deactivated',
		'suspended',
		'takendown',
		'desynchronized',
		'throttled'
	];
	return known.find((word) => word === status) ?? 'unknown';
}

/** One name this identity went by, and when it took it. */
export interface HandleChange {
	handle: string;
	at: string;
}

/** One host this identity's repo lived on, and when it moved there. */
export interface HostChange {
	host: string;
	at: string;
}

export interface IdentityHistory {
	/** Newest first, so the first entry is the last handle the account held. */
	handles: HandleChange[];
	hosts: HostChange[];
	/**
	 * True when the DID method keeps no log, so an empty history means "not
	 * published" rather than "never changed".
	 *
	 * `did:web` has no audit trail: the document is whatever the domain serves
	 * today. Saying that plainly matters more than it sounds — without it, a
	 * `did:web` account reads as one that never moved or renamed.
	 */
	unavailable: boolean;
}

interface AuditEntry {
	createdAt?: string;
	operation?: {
		alsoKnownAs?: string[];
		services?: { atproto_pds?: { endpoint?: string } };
	};
}

const EMPTY: IdentityHistory = { handles: [], hosts: [], unavailable: true };

/**
 * Every handle and host this identity has held, newest first.
 *
 * This is the only public answer to "who was this account before", and it keeps
 * working after the account goes dark, because PLC serves the identity rather
 * than the content.
 */
export async function identityHistory(subjectDid: string): Promise<IdentityHistory> {
	if (!subjectDid.startsWith('did:plc:')) return EMPTY;

	const url = `https://plc.directory/${encodeURIComponent(subjectDid)}/log/audit`;
	const response = await fetch(url);
	if (!response.ok) return EMPTY;

	const entries = (await response.json()) as AuditEntry[];
	return reduceAudit(entries);
}

/**
 * Turn the raw operation log into the two lists worth showing.
 *
 * The log has one entry per identity operation, most of which change neither
 * the handle nor the host — a rotation key change is not something to put on a
 * card. Only entries where the value actually changed from the one before are
 * kept, so the list reads as "these are the moves" rather than "here is the
 * log".
 *
 * Exported for its tests: the shape of this reduction is the whole of what the
 * card shows, and it is worth checking against real log shapes without a
 * network in the way.
 */
export function reduceAudit(entries: AuditEntry[]): IdentityHistory {
	const handles: HandleChange[] = [];
	const hosts: HostChange[] = [];

	// The log arrives oldest first, which is the order a change has to be read
	// in to know whether it was a change at all.
	for (const entry of entries) {
		const at = entry.createdAt;
		if (!at) continue;

		const handle = entry.operation?.alsoKnownAs?.[0]?.replace(/^at:\/\//, '');
		if (handle && handle !== handles.at(-1)?.handle) handles.push({ handle, at });

		const endpoint = entry.operation?.services?.atproto_pds?.endpoint;
		if (endpoint) {
			const host = hostOf(endpoint);
			if (host && host !== hosts.at(-1)?.host) hosts.push({ host, at });
		}
	}

	// Newest first for display: the last name an account held is the one a
	// reader is most likely to recognise.
	return { handles: handles.reverse(), hosts: hosts.reverse(), unavailable: false };
}

/** A bare host reads better on a card than a full origin, and is what changed. */
function hostOf(endpoint: string): string | null {
	try {
		return new URL(endpoint).host;
	} catch {
		return null;
	}
}
