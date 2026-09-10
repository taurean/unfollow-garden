import adapter from '@sveltejs/adapter-cloudflare';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	compilerOptions: {
		// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
		runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true)
	},
	kit: {
		adapter: adapter(),

		// Subjects' PDSes are arbitrary hosts discovered at runtime from DID
		// documents, so connect-src cannot be an allowlist — `https:` is the
		// narrowest form that still lets the app read a self-hosted PDS. Every
		// other directive stays tight to compensate.
		csp: {
			mode: 'auto',
			directives: {
				'default-src': ['self'],
				'connect-src': ['self', 'https:'],
				// Avatars and post embeds come from the same arbitrary hosts.
				'img-src': ['self', 'data:', 'https:'],
				// Svelte emits scoped styles as inline <style> blocks.
				'style-src': ['self', 'unsafe-inline'],
				'font-src': ['self', 'data:'],
				'base-uri': ['self'],
				'form-action': ['self'],
				'frame-ancestors': ['none'],
				'object-src': ['none']
			}
		}
	}
};

export default config;
