import { SvelteMap } from 'svelte/reactivity';
import { getRepoStatus, identityHistory } from '$lib/atproto/status';
import type { AccountStatus, IdentityHistory } from '$lib/atproto/status';

export interface IdentityState {
	status: 'pending' | 'loading' | 'ready' | 'error';
	account: AccountStatus | null;
	history: IdentityHistory | null;
	error: string | null;
}

const PENDING: IdentityState = { status: 'pending', account: null, history: null, error: null };

/**
 * Who an account used to be, for the ones the AppView will not answer for.
 *
 * Deliberately not part of the background scan. The scanner skips profile-less
 * subjects on purpose, and these two requests exist to answer a question the
 * reader is looking at right now — probing every deactivated account in a
 * follow list up front would be hundreds of requests to third-party hosts to
 * fill a screen nobody has reached yet.
 *
 * Held in memory rather than in IndexedDB. A status is the one fact here that
 * can change without warning, and a cached "deactivated" outliving a
 * reactivation would be worse than fetching it again.
 */
export class IdentityProbe {
	states = new SvelteMap<string, IdentityState>();

	get(subjectDid: string): IdentityState {
		return this.states.get(subjectDid) ?? PENDING;
	}

	/**
	 * Look up one subject, once.
	 *
	 * The two sources are independent and fail independently: PLC is up when a
	 * dead PDS is not, and a `did:web` domain that is down still leaves the
	 * status readable from nothing at all. Whichever answers is shown, because
	 * half of who someone was still beats a bare DID.
	 */
	async probe(subjectDid: string): Promise<void> {
		if (this.states.has(subjectDid)) return;
		this.states.set(subjectDid, { ...PENDING, status: 'loading' });

		const [account, history] = await Promise.all([
			getRepoStatus(subjectDid).catch(() => null),
			identityHistory(subjectDid).catch(() => null)
		]);

		this.states.set(subjectDid, {
			status: account || history ? 'ready' : 'error',
			account,
			history,
			error:
				account || history
					? null
					: 'Neither this account’s server nor its identity log could be reached.'
		});
	}
}
