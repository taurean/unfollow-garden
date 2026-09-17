/**
 * Which web client a profile or post link opens in.
 *
 * atproto separates the data from the app that shows it: the same repo is
 * served by several web clients, and the one a person actually uses is a
 * preference the network supports rather than a detail to hard-code. This app
 * links out constantly — every handle, every recent post — so sending all of
 * that to one client is a choice worth letting someone change.
 *
 * All of these follow bsky.app's URL shape, which is why a single
 * `profile/{handle}` and `profile/{handle}/post/{rkey}` form covers them. A
 * client that did not would need its own formatter here rather than a host.
 */

export interface WebClient {
	id: string;
	label: string;
	host: string;
}

export const WEB_CLIENTS: WebClient[] = [
	{ id: 'bsky', label: 'Bluesky', host: 'bsky.app' },
	{ id: 'blacksky', label: 'Blacksky', host: 'blacksky.app' },
	{ id: 'mu', label: 'mu.social', host: 'mu.social' }
];

export const DEFAULT_CLIENT = 'bsky';

export function clientById(id: string | undefined): WebClient {
	return WEB_CLIENTS.find((client) => client.id === id) ?? WEB_CLIENTS[0];
}

/** Where a handle's profile lives on the chosen client. */
export function profileUrl(handle: string, clientId?: string): string {
	return `https://${clientById(clientId).host}/profile/${handle}`;
}

/** Where a post lives on the chosen client. */
export function postUrl(handle: string, rkey: string, clientId?: string): string {
	return `https://${clientById(clientId).host}/profile/${handle}/post/${rkey}`;
}

/**
 * Move a stored post link to the chosen client.
 *
 * Recent items are cached with their URL already built, so a link written
 * before the preference changed — or before there was one — still has to point
 * where the reader asked. The handle and rkey are read back out of the stored
 * link rather than the host being swapped, so a client that needs a different
 * path shape can have one without the cache being wrong.
 *
 * A link that does not parse is returned untouched: it still works, and a
 * broken rewrite would be worse than the original.
 */
export function toClient(url: string, clientId?: string): string {
	const match = /^https:\/\/[^/]+\/profile\/([^/]+)\/post\/([^/?#]+)/.exec(url);
	if (!match) return url;
	return postUrl(match[1], match[2], clientId);
}
