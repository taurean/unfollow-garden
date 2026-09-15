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
