import adapter from '@sveltejs/adapter-cloudflare';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	compilerOptions: {
		// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
		runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true)
	},
	kit: {
		/*
		 * Cloudflare Workers with static assets, configured in `wrangler.jsonc`.
		 *
		 * The Worker's whole job is to hand back files and headers. Every route
		 * is client-rendered (`ssr = false`), so nothing is rendered on it and
		 * nothing user-owned passes through it — which is what keeps "no user
		 * data on a server" true with a Worker in the path. A route on this
		 * Worker that received user data would re-open that decision, not extend
		 * it (CONTEXT.md).
		 */
		adapter: adapter(),

		/*
		 * The Content-Security-Policy, built by SvelteKit rather than written by
		 * hand.
		 *
		 * SvelteKit emits an inline bootstrap `<script>` into every page. A
		 * hand-written `script-src 'self'` blocks it and the app never boots —
		 * which is exactly what happened the first time this was tried. `mode:
		 * 'hash'` makes SvelteKit hash its own inline content and emit the policy
		 * as a `<meta>` tag, so inline scripts stay blocked for everyone except
		 * the one script the framework needs.
		 *
		 * `frame-ancestors` cannot live in a meta tag, so it is a real response
		 * header in `static/_headers` instead.
		 */
		csp: {
			mode: 'hash',
			directives: {
				'default-src': ['self'],
				'script-src': ['self'],
				// Element styles are hashed; only inline style *attributes* need the
				// escape hatch, and the strip sets its bucket count that way.
				// Scoping it to -attr keeps `<style>` injection blocked.
				'style-src': ['self'],
				'style-src-attr': ['unsafe-inline'],
				// Avatars are blobs on whatever host the subject's account lives on.
				'img-src': ['self', 'https:', 'data:'],
				'font-src': ['self'],
				/*
				 * This cannot be an allowlist. Subjects' PDSes are arbitrary hosts
				 * discovered at runtime from DID documents, and so is the
				 * authorization server a self-hosted account signs in against.
				 * Narrowing it to known Bluesky hosts would silently break every
				 * self-hosted account — the exact failure this app exists not to
				 * have. Everything else is kept tight to compensate.
				 */
				'connect-src': ['self', 'https:'],
				'base-uri': ['self'],
				'form-action': ['self'],
				'object-src': ['none'],
				'manifest-src': ['self'],
				'upgrade-insecure-requests': true
			}
		}
	}
};

export default config;
