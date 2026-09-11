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
	.loading {
		display: flex;
		flex-direction: column;
		gap: var(--space-2xs);
		max-width: 32rem;
		margin-inline: auto;
		padding-block: var(--space-4xl);
	}

	.step {
		font-family: var(--ff-heading);
		margin: 0;
	}

	.count {
		margin: 0;
		font-variant-numeric: tabular-nums;
		color: var(--hue-slate-600);
	}

	.note {
		margin-block-start: var(--space-lg);
		color: var(--hue-slate-600);
		max-width: 40ch;
	}

	@media (prefers-color-scheme: dark) {
		.count,
		.note {
			color: var(--hue-slate-400);
		}
	}
</style>
