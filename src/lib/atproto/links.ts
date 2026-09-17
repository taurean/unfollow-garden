import { profileUrl } from './clients';
import type { Profile } from './graph';

/**
 * The handle the AppView returns when a handle does not resolve.
 *
 * Not an error and not an empty field: a real string that sorts, renders, and
 * links like any other handle, which is how it ends up on screen as
 * `@handle.invalid` pointing at a profile page that does not exist.
 */
export const INVALID_HANDLE = 'handle.invalid';

/** A DID browser that resolves both DID methods this app can meet. */
const DID_BROWSER = 'https://atproto.at/';

export interface IdentityLink {
	href: string;
	label: string;
	/** Which of the two an account is being named by, so the caller can style it. */
	kind: 'handle' | 'did';
}

/**
 * How to name an account and where that name should point.
 *
 * One function because the card has three ways to end up without a usable
 * handle — no profile at all, a handle that failed to verify, and an account
 * whose profile is a carried-over snapshot — and all three should read and
 * behave the same rather than each growing its own branch at the call site.
 *
 * A DID is linked to a DID browser rather than to `bsky.app`, which has no page
 * for an account it cannot resolve. `did:plc:` and `did:web:` take the same
 * form, so nothing here needs to know which method it was handed.
 */
export function identityLink(
	profile: Profile | null,
	subjectDid: string,
	clientId?: string
): IdentityLink {
	if (profile && profile.handle && profile.handle !== INVALID_HANDLE) {
		return {
			// Both identifiers, so a client that needs the DID gets one.
			href: profileUrl({ handle: profile.handle, did: profile.did || subjectDid }, clientId),
			label: `@${profile.handle}`,
			kind: 'handle'
		};
	}

	/*
	 * `atproto.at//<did>` — the second slash is the browser's own syntax, not a
	 * path-joining slip.
	 */
	return { href: `${DID_BROWSER}/${subjectDid}`, label: subjectDid, kind: 'did' };
}
