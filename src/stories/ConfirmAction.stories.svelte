<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import ConfirmAction from '$lib/components/ConfirmAction.svelte';

	const { Story } = defineMeta({
		title: 'UI/ConfirmAction',
		component: ConfirmAction,
		tags: ['autodocs']
	});
</script>

<!--
	At rest it is quiet. The destructive styling arrives only with the armed
	state, so the resting control does not shout at someone who is not about to
	use it.
-->
<Story name="At rest" asChild>
	<ConfirmAction
		label="Start over"
		confirmLabel="Clear every decision"
		onconfirm={() => undefined}
	/>
</Story>

<!--
	The armed label names the consequence rather than saying "Yes", so the
	sentence still makes sense read on its own.
-->
<Story name="The nuclear wording" asChild>
	<ConfirmAction
		label="Delete all stored data"
		confirmLabel="Yes, delete it all"
		onconfirm={() => undefined}
	/>
</Story>
