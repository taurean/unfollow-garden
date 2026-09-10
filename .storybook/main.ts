import type { StorybookConfig } from '@storybook/sveltekit';

const config: StorybookConfig = {
	// Docs pages come from the `autodocs` tag on each story. There are no
	// standalone .mdx files, and globbing for them warns on every test run.
	stories: ['../src/**/*.stories.@(js|ts|svelte)'],
	addons: [
		'@storybook/addon-svelte-csf',
		'@chromatic-com/storybook',
		'@storybook/addon-vitest',
		'@storybook/addon-a11y',
		'@storybook/addon-docs'
	],
	framework: '@storybook/sveltekit'
};
export default config;
