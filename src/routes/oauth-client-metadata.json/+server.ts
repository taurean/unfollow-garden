import { json } from '@sveltejs/kit';
import { buildClientMetadata } from '$lib/atproto/client-config';
import type { RequestHandler } from './$types';

/**
 * The app's identity to every atproto authorization server.
 *
 * This is the only server-generated output in the project; everything else is
 * a static asset. It cannot be prerendered, because the document has to name
 * the origin it is actually being served from.
 */
export const GET: RequestHandler = ({ url }) =>
	json(buildClientMetadata(url.origin), {
		headers: {
			// Authorization servers fetch this cross-origin, from any PDS.
			'Access-Control-Allow-Origin': '*',
			// A stale scope here is a sign-in failure that outlives the deploy.
			'Cache-Control': 'no-store'
		}
	});
