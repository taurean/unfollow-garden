<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import SuedeButton from '$lib/components/ui/SuedeButton.svelte';
	import { fn } from 'storybook/test';

	const { Story } = defineMeta({
		title: 'UI/SuedeButton',
		component: SuedeButton,
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
	<SuedeButton onclick={fn()}>Click me</SuedeButton>
</Story>

<Story name="Disabled" asChild>
	<SuedeButton disabled onclick={fn()}>Disabled</SuedeButton>
</Story>

<Story name="As link" asChild>
	<SuedeButton href="https://bits-ui.com" onclick={fn()}>Visit bits-ui</SuedeButton>
</Story>

<Story name="With class override" asChild>
	<SuedeButton class="u:fs-1" style="background-color: var(--hue-emerald-500);" onclick={fn()}>
		Custom styled
	</SuedeButton>
</Story>
