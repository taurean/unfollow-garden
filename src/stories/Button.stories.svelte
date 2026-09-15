<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import Button from '$lib/components/ui/Button.svelte';
	import { fn } from 'storybook/test';

	const { Story } = defineMeta({
		title: 'UI/Button',
		component: Button,
		tags: ['autodocs'],
		args: {
			onclick: fn()
		},
		argTypes: {
			href: { control: 'text' },
			disabled: { control: 'boolean' }
		}
	});
</script>

<Story name="Primary" asChild>
	<Button onclick={fn()}>Click me</Button>
</Story>

<Story name="Disabled" asChild>
	<Button disabled onclick={fn()}>Disabled</Button>
</Story>

<Story name="As link" asChild>
	<Button href="https://bits-ui.com" onclick={fn()}>Visit bits-ui</Button>
</Story>

<Story name="With class override" asChild>
	<Button class="u:fs-1" style="background-color: var(--hue-emerald-500);" onclick={fn()}>
		Custom styled
	</Button>
</Story>

<!--
	The tap floor. Every button clears `--tap-min` (2.75rem / 44px) however
	little text it holds, because `--space-*` is fluid and shrinks on exactly
	the small screens where a finger needs more room.
-->
<Story name="Short label keeps its tap target" asChild>
	<Button onclick={fn()}>OK</Button>
</Story>

<!--
	The link variant is the one exemption: it is text inside a sentence rather
	than a control, so the floor is off and it sets its own line height.
-->
<Story name="Link variant has no tap floor" asChild>
	<Button href="https://bits-ui.com" onclick={fn()}>an inline link</Button>
</Story>
