<script lang="ts">
	import type { Progress } from '$lib/triage/session.svelte';

	let { progress }: { progress: Progress } = $props();
</script>

<section class="loading">
	<p class="step u:fs-3">{progress.step || 'Getting ready'}</p>
	<p class="count u:fs-2">
		{#if progress.total !== null}
			{progress.loaded.toLocaleString()} of {progress.total.toLocaleString()}
		{:else if progress.loaded > 0}
			{progress.loaded.toLocaleString()} so far
		{/if}
	</p>
	<p class="note u:fs-1">
		A few thousand follows can take several minutes the first time. Decisions are saved as you go.
	</p>
</section>

<style>
	@layer layout {
		.loading {
			display: flex;
			flex-direction: column;
			gap: var(--space-2xs);
			max-inline-size: 32rem;
			margin-inline: auto;
			padding: var(--space-4xl) var(--space-lg) var(--space-3xl) var(--space-2xl);
		}

		.step {
			margin: 0;
		}

		.count {
			margin: 0;
			font-variant-numeric: tabular-nums;
			color: var(--ink-quiet);
		}

		.note {
			margin-block-start: var(--space-lg);
			color: var(--ink-quiet);
			max-width: 40ch;
		}
	}
</style>
