import { json } from '@sveltejs/kit';
import { buildClientMetadata } from '$lib/atproto/client-config';

/**
 * The client metadata document, written to a file at build time.
 *
 * Prerendered rather than served: there is no server in this app's request
 * path, so this route has to become a static file like everything else. That
 * means the origin cannot be read from the request — it is fixed when the
 * bundle is built.
 *
 * The default is the production origin, and that is deliberate. An `http:`
 * page uses the loopback `client_id` form, which carries its own redirect URI
 * and scope and makes the authorization server skip fetching this document
 * entirely — so in development this file is written and never read. A
 * development default would therefore exist only to be ignored, while being
 * the one value that silently breaks production when a build runs the wrong
 * script. Cloudflare's build did exactly that.
 *
 * `PUBLIC_APP_ORIGIN` overrides it, for a preview deploy on another hostname.
 *
 * The default is the loopback dev origin, which is correct for a local build
 * and never reached in practice: an `http:` page uses the loopback `client_id`
 * form, which carries its own redirect URI and scope and makes the
 * authorization server skip fetching this document entirely.
 *
 * Getting it wrong does not fail quietly. The authorization server checks that
 * `client_id` equals the URL it fetched this from, so a bundle built for the
 * wrong origin is rejected at sign-in rather than half-working. That is also
 * why `www.` has to redirect to the apex — see CONTEXT.md.
 *
 * The headers below apply in development, where this route is served live.
 * Prerendering keeps the body and drops them, so production restates them in
 * `static/_headers`.
 */
export const prerender = true;

const PRODUCTION_ORIGIN = 'https://unfollow.garden';

export const GET = () => {
	// Prerendering runs in Node, so the build environment is readable here.
	const origin = (process.env.PUBLIC_APP_ORIGIN || PRODUCTION_ORIGIN).replace(/\/$/, '');

	return json(buildClientMetadata(origin), {
		headers: {
			// Authorization servers fetch this cross-origin.
			'Access-Control-Allow-Origin': '*',
			'Cache-Control': 'no-store'
		}
	});
};
