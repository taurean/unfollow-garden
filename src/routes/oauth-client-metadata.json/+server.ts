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
 * `pnpm build:deploy` sets `PUBLIC_APP_ORIGIN` to the production origin; plain
 * `pnpm build` leaves it at the loopback default. The origin lives in
 * `package.json` rather than a dashboard setting so it is reviewable, and so a
 * deploy cannot quietly pick up the wrong one.
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

const DEV_ORIGIN = 'http://127.0.0.1:5173';

export const GET = () => {
	// Prerendering runs in Node, so the build environment is readable here.
	const origin = (process.env.PUBLIC_APP_ORIGIN || DEV_ORIGIN).replace(/\/$/, '');

	return json(buildClientMetadata(origin), {
		headers: {
			// Authorization servers fetch this cross-origin.
			'Access-Control-Allow-Origin': '*',
			'Cache-Control': 'no-store'
		}
	});
};
