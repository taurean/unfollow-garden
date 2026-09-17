import type { Handle } from '@sveltejs/kit';
import { appOrigin } from '$lib/atproto/client-config';

/**
 * Social-preview and description metadata, written into the served shell.
 *
 * It cannot come from a component. The app is `ssr = false`, so `svelte:head`
 * is applied in the browser and a crawler — which does not run the page — sees
 * an empty head. These tags have to be in the HTML as served, which means
 * either a literal in `app.html` or this.
 *
 * This, because `og:image` and `og:url` must be absolute, and the origin is
 * already decided once in `client-config`. A literal in `app.html` would be a
 * second copy of it, and the copy that drifts is the one nobody reads.
 *
 * Runs at build time, not per request: the only page is prerendered as a static
 * shell and the Worker serves files. There is no server in the request path,
 * and this does not put one there.
 */
export const handle: Handle = async ({ event, resolve }) => {
	const origin = appOrigin();

	const tags = [
		`<meta property="og:type" content="website" />`,
		`<meta property="og:site_name" content="unfollow.garden" />`,
		`<meta property="og:title" content="unfollow.garden" />`,
		`<meta property="og:description" content="${DESCRIPTION}" />`,
		`<meta property="og:url" content="${origin}/" />`,
		`<meta property="og:image" content="${origin}/og-image.png" />`,
		`<meta property="og:image:width" content="1200" />`,
		`<meta property="og:image:height" content="630" />`,
		`<meta property="og:image:alt" content="unfollow.garden, with a cross-stitched flower in place of the dot" />`,
		`<meta name="twitter:card" content="summary_large_image" />`,
		`<meta name="twitter:title" content="unfollow.garden" />`,
		`<meta name="twitter:description" content="${DESCRIPTION}" />`,
		`<meta name="twitter:image" content="${origin}/og-image.png" />`
	].join('\n\t\t');

	return resolve(event, {
		transformPageChunk: ({ html }) => html.replace('%unfollow.meta%', tags)
	});
};

/**
 * One sentence, reused by both card formats.
 *
 * Says what the app does and the thing that makes it worth opening — that the
 * decisions stay in the browser — because a preview card is usually all anyone
 * reads before deciding whether to follow the link.
 */
const DESCRIPTION =
	'Review every account you follow, one at a time, and decide whether to keep following it. Your decisions stay in your browser.';
