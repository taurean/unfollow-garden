import adapter from '@sveltejs/adapter-static';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	compilerOptions: {
		// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
		runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true)
	},
	kit: {
		// v0 runs locally and ships nothing. The whole app is client-rendered
		// already (`ssr = false`), so a static build with an SPA fallback is the
		// honest shape: `pnpm build` produces files a browser can open, with no
		// server in the request path at all.
		//
		// The Content-Security-Policy that lived here went with the Cloudflare
		// adapter. It was a response header, which a static build cannot send —
		// it comes back with the deploy. See CONTEXT.md.
		adapter: adapter({ fallback: 'index.html', strict: false })
	}
};

export default config;
