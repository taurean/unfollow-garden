/**
 * The app's identity to atproto authorization servers.
 *
 * Deliberately free of browser imports: the client metadata route prerenders
 * this in Node at build time, and the browser client reads the same constants
 * at runtime. One definition, so the scope on the consent screen and the scope
 * the app asks for cannot drift apart (PRD, "Client metadata").
 */

/**
 * Exactly what this app may do, and nothing else.
 *
 * `repo:app.bsky.graph.follow` with `create` and `delete` is the whole grant:
 * it can add and remove follow records in the user's repo and cannot read a
 * message, write a post, or touch any other collection. That narrowness is
 * most of why this app is defensible to someone who is not its author — the
 * consent screen shows it, and the user can hold the app to it.
 *
 * `create` is here because restore exists: re-following the targets of a past
 * run is the app's undo (PRD, RESTORE-1). Drop restore and `create` goes with
 * it.
 *
 * **`transition:generic` is never a fallback.** An authorization server that
 * rejects granular scopes fails the sign-in with its own error shown; it does
 * not get quietly handed the keys to the whole account (`CLAUDE.md`,
 * Guardrails).
 */
export const SCOPE = 'atproto repo:app.bsky.graph.follow?action=create&action=delete';

/**
 * Where this app is deployed.
 *
 * Here rather than beside the one route that used to hold it, because the
 * client metadata and the page's own social-preview tags both have to name the
 * same origin and neither can ask the other. `PUBLIC_APP_ORIGIN` overrides it
 * for a preview deploy on another hostname.
 */
export const PRODUCTION_ORIGIN = 'https://unfollow.garden';

/** The origin this build is for, trailing slash removed. */
export function appOrigin(): string {
	return (process.env.PUBLIC_APP_ORIGIN || PRODUCTION_ORIGIN).replace(/\/$/, '');
}

/** Shown on the consent screen next to the scope. */
export const CLIENT_NAME = 'unfollow.garden';

/**
 * The client metadata document an authorization server fetches from
 * `<origin>/oauth-client-metadata.json`.
 *
 * `client_id` has to equal the URL this is served from, and every redirect URI
 * has to sit on the same origin — that is what the server validates. Because
 * both derive from one `origin` argument here, a deploy to a new hostname needs
 * no edit beyond pointing the build at it.
 */
export function buildClientMetadata(origin: string) {
	return {
		client_id: `${origin}/oauth-client-metadata.json`,
		client_name: CLIENT_NAME,
		client_uri: origin,
		application_type: 'web',
		// The app is one route that reads the callback in place, so the redirect
		// comes back to the root rather than to a dedicated callback page.
		redirect_uris: [`${origin}/`],
		scope: SCOPE,
		grant_types: ['authorization_code', 'refresh_token'],
		response_types: ['code'],
		// A public client: there is no server, so there is no secret to hold.
		token_endpoint_auth_method: 'none',
		dpop_bound_access_tokens: true
	};
}
