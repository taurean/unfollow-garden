import { BrowserOAuthClient } from '@atproto/oauth-client-browser';
import type { OAuthSession } from '@atproto/oauth-client-browser';
import { APPVIEW, pdsForDid } from './identity';
import { getProfiles } from './graph';
import { SCOPE } from './client-config';

/**
 * atproto OAuth, as a public browser client.
 *
 * Replaces the app-password sign-in v0 shipped with. The difference that
 * matters is not the flow but the grant: an app password could read messages
 * and delete the whole repo, and this can add and remove follow records. See
 * `client-config.ts` for the scope.
 *
 * Tokens are DPoP-bound and held by the library in IndexedDB. Application code
 * never sees a credential — which is why there is no `storeSession` here.
 */

/**
 * The owner, as the rest of the app needs them.
 *
 * A project-level shape rather than the library's `OAuthSession`, so the queue,
 * the runs, and their tests depend on four fields instead of on an OAuth
 * implementation. `fetch` is the only authenticated thing in the app.
 */
export interface OwnerSession {
	did: string;
	handle: string;
	/** Where the owner's repo lives. Used for public reads of it. */
	pds: string;
	/**
	 * A DPoP-signed request against the owner's PDS, by pathname.
	 *
	 * Writes only. Every read in this app goes through a public endpoint, and
	 * an authenticated read would widen the scope for no gain (CONTEXT.md).
	 */
	fetch: (pathname: string, init?: RequestInit) => Promise<Response>;
}

/**
 * Build the OAuth client for whichever origin the app is running on.
 *
 * Two shapes, decided by protocol:
 *
 * - `http:` — the loopback exemption. The authorization server does not fetch
 *   metadata at all; the `client_id` carries the redirect URI and scope in its
 *   query string. This is what makes local development work without a
 *   hostname, and it is why the dev server must bind `127.0.0.1` rather than
 *   `localhost`, which RFC 8252 bans in redirect URIs.
 * - `https:` — a discoverable client. The server fetches
 *   `/oauth-client-metadata.json` and validates it.
 *
 * `load()` rather than `new BrowserOAuthClient({ clientMetadata })`: the
 * constructor validates metadata inline and rejects any non-HTTPS `client_id`,
 * which would make the loopback form impossible.
 *
 * Browser-only — it touches `window` and IndexedDB, so it must be called from
 * `onMount` and never from a `load` function.
 */
export async function createOAuthClient(): Promise<BrowserOAuthClient> {
	const { protocol, host, origin } = window.location;

	if (protocol === 'http:') {
		const redirectUri = `http://127.0.0.1${host.includes(':') ? `:${host.split(':')[1]}` : ''}/`;
		const clientId =
			`http://localhost` +
			`?redirect_uri=${encodeURIComponent(redirectUri)}` +
			`&scope=${encodeURIComponent(SCOPE)}`;
		return BrowserOAuthClient.load({ clientId, handleResolver: APPVIEW });
	}

	return BrowserOAuthClient.load({
		clientId: `${origin}/oauth-client-metadata.json`,
		handleResolver: APPVIEW,
		// Safari throws "Illegal invocation" when fetch loses its window binding.
		fetch: window.fetch.bind(window)
	});
}

/**
 * Turn the library's session into the shape the app uses.
 *
 * The handle comes from a public profile lookup rather than from the token:
 * a DID is permanent and a handle is not, so the handle is display only and is
 * re-read each time rather than stored.
 */
async function adopt(session: OAuthSession): Promise<OwnerSession> {
	const did = session.did;
	const [pds, profiles] = await Promise.all([
		pdsForDid(did),
		getProfiles([did]).catch(() => new Map())
	]);

	return {
		did,
		handle: profiles.get(did)?.handle ?? did,
		pds,
		fetch: (pathname, init) => session.fetchHandler(pathname, init)
	};
}

/**
 * Pick up whatever state the page loaded with.
 *
 * `init()` covers both cases in one call: a redirect back from the
 * authorization server, and an ordinary reload with a session already in
 * IndexedDB. The app is a single route, so the callback lands here rather than
 * on a dedicated page.
 *
 * Returns null when there is no session and no callback to process, which is
 * the ordinary first visit and not an error.
 */
export async function restoreOwner(
	client: BrowserOAuthClient
): Promise<{ session: OwnerSession } | null> {
	const result = await client.init();
	if (!result?.session) return null;
	return { session: await adopt(result.session) };
}

/**
 * Send the user to their own authorization server.
 *
 * `input` may be a handle, a DID, or a PDS URL; the library resolves it, so
 * self-hosted accounts work without the app knowing anything about them. This
 * navigates away and does not return.
 */
export async function startSignIn(client: BrowserOAuthClient, input: string): Promise<never> {
	const handle = input.trim().replace(/^@/, '').toLowerCase();
	if (!handle) throw new Error('Enter your handle, for example alice.bsky.social');
	return client.signInRedirect(handle, { scope: SCOPE });
}

/**
 * End the session with the authorization server, not just locally.
 *
 * Clearing app state alone would leave the tokens live in IndexedDB, and the
 * next `init()` would restore them — signing the user back in after they asked
 * to leave.
 */
export async function signOutOwner(client: BrowserOAuthClient, did: string): Promise<void> {
	await client.revoke(did);
}
