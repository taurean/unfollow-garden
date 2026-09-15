<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import { exact } from '$lib/format';
	import { runAsJson } from '$lib/triage/runs.svelte';
	import type { TriageSession } from '$lib/triage/session.svelte';

	let { session }: { session: TriageSession } = $props();

	const controller = $derived(session.runs);
	const run = $derived(controller.run);

	const unfollowed = $derived(
		run ? run.targets.filter((target) => target.status !== 'pending').length : 0
	);

	/**
	 * The target list as a file, built only when asked for.
	 *
	 * A data URL rather than a blob: the list is a few kilobytes of text, and a
	 * blob URL would have to be revoked on unmount to avoid leaking it.
	 */
	const downloadHref = $derived(
		run ? `data:application/json;charset=utf-8,${encodeURIComponent(runAsJson(run))}` : ''
	);
</script>

<section class="[ run ] [ l:stage ]">
	{#if controller.busy}
		<h1 class="u:fs-5">Unfollowing…</h1>
		<p class="count u:fs-3 tabular" role="status" aria-live="polite">
			{exact(controller.done)} of {exact(controller.total)} follow records removed
		</p>
		<p class="note u:fs-1">
			Keep this tab open. If it closes, the run can be picked up where it stopped.
		</p>
	{:else if controller.error}
		<h1 class="u:fs-5">The run stopped</h1>
		<p class="error u:fs-2" role="alert">{controller.error}</p>
		<p class="note u:fs-1">
			{exact(controller.done)} of {exact(controller.total)} follow records were removed before it stopped.
			Everything already removed stays removed. Resuming re-reads your repo first, so nothing is deleted
			twice.
		</p>
		<div class="actions">
			<Button onclick={() => session.resumeRun()}>Resume the run</Button>
			<Button data-variant="quiet" onclick={() => session.review()}>Back to the list</Button>
		</div>
	{:else if run}
		<h1 class="u:fs-5">Unfollowed {exact(unfollowed)} account{unfollowed === 1 ? '' : 's'}</h1>
		<p class="note u:fs-1 u:lh-standard">
			The follow records are gone from your repo. This run is kept, so those accounts can be
			followed again from it later.
		</p>
		<div class="actions">
			<Button data-variant="quiet" href={downloadHref} download="unfollow-run-{run.id}.json">
				Download the list
			</Button>
			<Button data-variant="quiet" onclick={() => session.backToTriage()}>Back to reviewing</Button>
		</div>
	{/if}
</section>

<style>
	@layer layout {
		.run {
			display: flex;
			flex-direction: column;
			align-items: flex-start;
			gap: var(--space-sm);
			--stage-width: 44rem;
			--stage-leading: var(--space-4xl);
		}

		h1,
		p {
			margin: 0;
		}

		.count {
			color: var(--ink);
		}

		.note {
			color: var(--ink-quiet);
			max-inline-size: 60ch;
		}

		.error {
			color: var(--danger-ink);
		}

		.actions {
			display: flex;
			flex-wrap: wrap;
			gap: var(--space-sm);
			margin-block-start: var(--space-lg);
		}

		.actions :global(.button[data-variant='quiet']) {
			min-block-size: var(--tap-min);
			background-color: transparent;
			color: var(--ink-quiet);
			border: 1px solid var(--hue-z0-divider);
			padding-inline: var(--space-lg);
			text-decoration: none;
		}

		.actions :global(.button[data-variant='quiet']:hover) {
			color: var(--ink);
		}
	}
</style>
