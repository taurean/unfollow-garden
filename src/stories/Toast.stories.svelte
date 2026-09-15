<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import Toast from '$lib/components/ui/Toast.svelte';
	import { fn } from 'storybook/test';

	const { Story } = defineMeta({
		title: 'UI/Toast',
		component: Toast,
		tags: ['autodocs'],
		args: {
			open: true,
			action: 'Undo',
			onaction: fn(),
			ondismiss: fn(),
			/*
			 * Long enough that the notice is still there to look at.
			 *
			 * The real screen uses six seconds; a story that withdrew itself
			 * mid-inspection would be a story of an empty box.
			 */
			duration: 600_000
		},
		argTypes: {
			tone: { control: 'select', options: ['neutral', 'keep', 'unfollow', 'skip'] },
			open: { control: 'boolean' }
		}
	});
</script>

<!--
	The three tones carry a rule in the decided colour rather than a fill: the
	toast reports the last decision, and a full green or rose panel would read
	as a second decision being offered.
-->
<Story name="Kept" asChild>
	<Toast open tone="keep" action="Undo" onaction={fn()} ondismiss={fn()} duration={600000}>
		Keeping Alice Example
	</Toast>
</Story>

<Story name="Marked for unfollow" asChild>
	<Toast open tone="unfollow" action="Undo" onaction={fn()} ondismiss={fn()} duration={600000}>
		Marked Alice Example for unfollow
	</Toast>
</Story>

<Story name="Skipped" asChild>
	<Toast open tone="skip" action="Undo" onaction={fn()} ondismiss={fn()} duration={600000}>
		Skipped Alice Example for later
	</Toast>
</Story>

<!-- A notice with nothing to do about it drops the button and keeps the message. -->
<Story name="Without an action" asChild>
	<Toast open tone="neutral" ondismiss={fn()} duration={600000}>Decisions saved</Toast>
</Story>

<!--
	A display name can be as long as the account wants it to be. The message
	wraps and the button keeps its size, because the button is the part that
	has to stay hittable.
-->
<Story name="Long account name" asChild>
	<Toast open tone="unfollow" action="Undo" onaction={fn()} ondismiss={fn()} duration={600000}>
		Marked A Very Long Display Name That Somebody Actually Chose for unfollow
	</Toast>
</Story>

<!--
	Closed. The live region stays in the document rather than being removed —
	a region inserted already-populated is never announced.
-->
<Story name="Closed" asChild>
	<Toast open={false} ondismiss={fn()}>Nothing to report</Toast>
</Story>
