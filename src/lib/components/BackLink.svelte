<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';

	/**
	 * The way out of a screen that is not the queue.
	 *
	 * It sits where the triage header's counts sit, so the top-left of the
	 * reading column means the same thing on every screen: where you are and
	 * how to leave. A single action at the bottom of a long page is a scroll
	 * away from someone who has just decided this is not what they wanted.
	 */
	let { onback, label = 'Back to the queue' }: { onback: () => void; label?: string } = $props();
</script>

<div class="back u:fs-0">
	<Button data-variant="link" onclick={onback}>
		<span aria-hidden="true">&larr;</span>
		{label}
	</Button>
</div>

<style>
	@layer layout {
		/*
		 * Matched to the triage header's status line rather than to a button:
		 * it occupies that line's place and should carry its weight, which is
		 * almost none.
		 */
		/*
		 * A flex box, so the button is not sitting on the wrapper's text
		 * baseline — inline, it hung two pixels below the utility links it is
		 * meant to line up with.
		 */
		.back {
			display: flex;
		}

		.back :global(.button[data-variant='link']) {
			gap: var(--space-2xs);
			padding: 0;
			min-block-size: 0;
			background: transparent;
			color: var(--ink-quiet);
			font-family: var(--ff-ui);
			font-size: var(--fs-0);
			font-weight: normal;
		}

		.back :global(.button[data-variant='link']:hover) {
			color: var(--ink);
			text-decoration: underline;
		}
	}
</style>
