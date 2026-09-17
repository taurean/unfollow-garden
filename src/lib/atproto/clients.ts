/**
 * Which web client a profile or post link opens in.
 *
 * atproto separates the data from the app that shows it: the same repo is
 * served by several web clients, and the one a person actually uses is a
 * preference the network supports rather than a detail to hard-code. This app
 * links out constantly — every handle, every recent post — so sending all of
 * that to one client is a choice worth letting someone change.
 *
 * They do not agree on how to name an account in a URL. Bluesky accepts either
 * a handle or a DID; Blacksky takes a DID only. So a client says which it
 * needs, and a link built without it falls back rather than being built wrong.
 */

export interface WebClient {
	id: string;
	label: string;
	host: string;
	/**
	 * Which identifier this client's URLs name an account by.
	 *
	 * `handle` means either works — every client that takes a handle also
	 * takes a DID, so this is really "does it need the DID specifically".
	 */
	identifier: 'handle' | 'did';
}

export const WEB_CLIENTS: WebClient[] = [
	{ id: 'bsky', label: 'Bluesky', host: 'bsky.app', identifier: 'handle' },
	{ id: 'blacksky', label: 'Blacksky', host: 'blacksky.community', identifier: 'did' },
	{ id: 'mu', label: 'mu.social', host: 'mu.social', identifier: 'handle' }
];

export const DEFAULT_CLIENT = 'bsky';

/** How an account can be named. A link needs whichever its client asks for. */
export interface Identity {
	handle?: string | null;
	did?: string | null;
}

export function clientById(id: string | undefined): WebClient {
	return WEB_CLIENTS.find((client) => client.id === id) ?? WEB_CLIENTS[0];
}

/**
 * Pick the client that can actually name this account, and the name to use.
 *
 * A client needing a DID cannot be sent a handle: a mention inside a bio is
 * only ever a handle, and a cached post link names its author the same way.
 * Rather than build a URL that 404s, those fall back to the default client,
 * which takes either. A working link somewhere is worth more than a broken one
 * in the right place.
 */
function resolve(identity: Identity, clientId: string | undefined): { host: string; name: string } {
	const client = clientById(clientId);

	if (client.identifier === 'did') {
		if (identity.did) return { host: client.host, name: identity.did };
		const fallback = clientById(DEFAULT_CLIENT);
		return { host: fallback.host, name: identity.handle ?? '' };
	}

	return { host: client.host, name: identity.handle || (identity.did ?? '') };
}

/** Where an account's profile lives on the chosen client. */
export function profileUrl(identity: Identity, clientId?: string): string {
	const { host, name } = resolve(identity, clientId);
	return `https://${host}/profile/${name}`;
}

/** Where a post lives on the chosen client. */
export function postUrl(identity: Identity, rkey: string, clientId?: string): string {
	const { host, name } = resolve(identity, clientId);
	return `https://${host}/profile/${name}/post/${rkey}`;
}

/**
 * Move a stored post link to the chosen client.
 *
 * Recent items are cached with their URL already built, so a link written
 * before the preference changed — or before there was one — still has to point
 * where the reader asked. The record key is read back out of the stored link
 * rather than the host being swapped, so a client that names accounts
 * differently gets a correct URL instead of a rewritten one.
 *
 * `authorDid` comes from the cached item when it has one. Entries cached before
 * this existed do not, which is why a DID-only client falls back for them until
 * that subject's activity is fetched again.
 *
 * A link that does not parse is returned untouched: it still works, and a
 * broken rewrite would be worse than the original.
 */
export function toClient(url: string, clientId?: string, authorDid?: string | null): string {
	const match = /^https:\/\/[^/]+\/profile\/([^/]+)\/post\/([^/?#]+)/.exec(url);
	if (!match) return url;
	return postUrl({ handle: match[1], did: authorDid }, match[2], clientId);
}
