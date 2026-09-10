/**
 * The single source of truth for this app's OAuth client identity.
 *
 * Both the metadata document served at `/oauth-client-metadata.json` and the
 * `BrowserOAuthClient` built in the app read their scope from here. An
 * authorization server compares the scope it was asked for against the scope in
 * the metadata it fetched; if those two strings drift apart, sign-in fails with
 * an error that names neither file.
 */

/**
 * Exactly what this app is allowed to do to the signed-in account.
 *
 * `delete` covers unfollowing. `create` covers restoring a past run. Nothing
 * else is requested, so the consent screen can honestly say the app cannot read
 * posts, post, or touch anything but follow records.
 *
 * `transition:generic` is never an acceptable substitute. It grants full
 * account write access, and an authorization server that rejects granular
 * scopes is a failure to show the user, not to work around.
 */
export const OAUTH_SCOPE = 'atproto repo:app.bsky.graph.follow?action=create&action=delete';

/** Shown on the consent screen, so it should read as the app the user opened. */
export const CLIENT_NAME = 'unfollow-garden';

/** Where the authorization server sends the user back after they decide. */
export const CALLBACK_PATH = '/auth/callback';

/** Where the metadata document below is served from. */
export const CLIENT_METADATA_PATH = '/oauth-client-metadata.json';

export interface ClientMetadata {
	client_id: string;
	client_name: string;
	client_uri: string;
	application_type: 'web';
	redirect_uris: [string];
	scope: string;
	grant_types: ['authorization_code', 'refresh_token'];
	response_types: ['code'];
	token_endpoint_auth_method: 'none';
	dpop_bound_access_tokens: true;
}

/**
 * Build the client metadata document for whichever origin is serving it.
 *
 * `client_id` must equal the URL the document was fetched from, and every
 * redirect URI must sit on that same origin — both are checked by the
 * authorization server. Deriving them from the live request origin keeps that
 * true on every deploy without a hostname baked into the build, which matters
 * because the production origin is what appears on the consent screen.
 */
export function buildClientMetadata(origin: string): ClientMetadata {
	return {
		client_id: `${origin}${CLIENT_METADATA_PATH}`,
		client_name: CLIENT_NAME,
		client_uri: origin,
		application_type: 'web',
		redirect_uris: [`${origin}${CALLBACK_PATH}`],
		scope: OAUTH_SCOPE,
		grant_types: ['authorization_code', 'refresh_token'],
		response_types: ['code'],
		token_endpoint_auth_method: 'none',
		dpop_bound_access_tokens: true
	};
}
