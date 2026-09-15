<script lang="ts">
	import AccountCard from '$lib/components/AccountCard.svelte';
	import RecentColumns from '$lib/components/RecentColumns.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { exact } from '$lib/format';
	import type { TriageSession } from '$lib/triage/session.svelte';

	let { session }: { session: TriageSession } = $props();

	const activity = $derived(
		session.current
			? session.scanner.get(session.current.subjectDid)
			: { status: 'pending' as const, activity: null, error: null, lastActive: null }
	);

	const recent = $derived(activity.activity?.recent ?? []);

	/**
	 * Keyboard triage.
	 *
	 * Ignored while focus is in a text field or a modifier is held, so the
	 * shortcuts never steal a keystroke meant for typing or for the browser.
	 */
	function onKeydown(event: KeyboardEvent) {
		if (event.metaKey || event.ctrlKey || event.altKey) return;

		const target = event.target as HTMLElement | null;
		if (target?.matches('input, textarea, select, [contenteditable]')) return;

		switch (event.key.toLowerCase()) {
			case 'k':
				event.preventDefault();
				session.decide('keep');
				break;
			case 'u':
				event.preventDefault();
				session.decide('unfollow');
				break;
			case 's':
				event.preventDefault();
				session.skip();
				break;
			case 'z':
				event.preventDefault();
				session.undo();
				break;
		}
	}
</script>

<svelte:window onkeydown={onKeydown} />

<section class="stage">
	<header class="status u:fs-0 tabular">
		<p>
			<strong>{exact(session.remaining.length)}</strong> to review
			{#if session.skippedCount > 0}
				· {exact(session.skippedCount)} skipped
			{/if}
			· {exact(session.keptCount)} kept ·
			{#if session.markedCount > 0}
				<!-- Reachable mid-queue, not only at the end: a few thousand
				     accounts is several sittings, and a run should not have to
				     wait for the last one. -->
				<Button data-variant="link" onclick={() => session.review()}>
					{exact(session.markedCount)} marked
				</Button>
			{:else}
				{exact(session.markedCount)} marked
			{/if}
		</p>

		<p role="status">
			{#if session.scanner.waitingOnRateLimit}
				Waiting out a rate limit…
			{:else if session.scanner.running}
				Loading activity {exact(session.scanner.loaded)} of {exact(session.scanner.total)} · order settles
				when loading finishes
			{/if}
		</p>
	</header>

	{#if session.error}
		<p class="error u:fs-1" role="alert">{session.error}</p>
	{/if}

	{#if session.followBackError}
		<p class="caveat u:fs-0">
			Whether these accounts follow you back could not be loaded, so no card shows it either way. ({session.followBackError})
		</p>
	{/if}

	{#if session.current}
		{#key session.current.subjectDid}
			<AccountCard
				subject={session.current}
				{activity}
				lookbackDays={session.settings.lookbackDays}
				thresholdDays={session.settings.thresholdDays}
			/>
		{/key}

		<div class="actions">
			<Button data-variant="keep" onclick={() => session.decide('keep')}>
				Keep <kbd>K</kbd>
			</Button>
			<Button data-variant="unfollow" onclick={() => session.decide('unfollow')}>
				Unfollow <kbd>U</kbd>
			</Button>

			<div class="quiet-actions">
				<Button data-variant="quiet" onclick={() => session.skip()}>Skip <kbd>S</kbd></Button>
				<Button data-variant="quiet" onclick={() => session.undo()}>Undo <kbd>Z</kbd></Button>
			</div>

			<p class="scope u:fs-0">
				checking data from the last {session.settings.lookbackDays} days<br />
				marking changes nothing yet — unfollows happen in a run
			</p>
		</div>
	{/if}
</section>

{#if session.current?.profile && activity.status === 'ready'}
	<section class="recent">
		<RecentColumns {recent} />
	</section>
{/if}

<style>
	@layer layout {
		.stage {
			display: flex;
			flex-direction: column;
			gap: var(--space-xl);
			max-inline-size: var(--stage-max);
			margin-inline: auto;
			padding: var(--space-xl) var(--space-lg) var(--space-2xl);
			/* Room for the fixed wordmark tab on the viewport's left edge. */
			padding-inline-start: var(--space-2xl);
		}

		.status {
			display: flex;
			flex-wrap: wrap;
			justify-content: space-between;
			gap: var(--space-sm);
			font-family: var(--ff-ui);
			color: var(--ink-quiet);
		}

		.status p {
			margin: 0;
		}

		/* An inline text link, not a control: it sits inside a sentence. */
		.status :global(.button[data-variant='link']) {
			display: inline;
			background: transparent;
			color: inherit;
			font: inherit;
			padding: 0;
			text-decoration: underline;
			text-underline-offset: 0.2em;
		}

		.status :global(.button[data-variant='link']:hover) {
			color: var(--ink);
		}

		.error {
			margin: 0;
			font-family: var(--ff-ui);
			color: var(--danger-ink);
		}

		.caveat {
			margin: 0;
			font-family: var(--ff-ui);
			color: var(--warn-ink);
			max-inline-size: 70ch;
		}

		.actions {
			display: flex;
			flex-wrap: wrap;
			align-items: center;
			gap: var(--space-sm);
		}

		/* Skip and undo are set apart from the two decisions, not lined up with
		   them: they are ways out, not a third and fourth choice. */
		.quiet-actions {
			display: flex;
			gap: var(--space-2xs);
			margin-inline-start: var(--space-lg);
		}

		.scope {
			margin: 0;
			margin-inline-start: auto;
			text-align: end;
			font-family: var(--ff-ui);
			color: var(--ink-quiet);
		}

		/*
		 * The recent columns sit on their own surface below the fold. Everything
		 * needed to decide is above it; this is for when that was not enough.
		 */
		.recent {
			background-color: var(--surface-raised);
			border-block-start: 1px solid var(--hue-z0-divider);
			padding: var(--space-2xl) var(--space-lg) var(--space-2xl) var(--space-2xl);
		}

		.recent :global(.columns) {
			max-inline-size: var(--stage-max);
			margin-inline: auto;
		}

		.actions :global(.button[data-variant='keep']) {
			background-color: var(--keep);
		}

		.actions :global(.button[data-variant='keep']:hover:not(:disabled)) {
			background-color: var(--keep-hover);
		}

		.actions :global(.button[data-variant='unfollow']) {
			background-color: var(--unfollow);
		}

		.actions :global(.button[data-variant='unfollow']:hover:not(:disabled)) {
			background-color: var(--unfollow-hover);
		}

		.actions :global(.button[data-variant='quiet']) {
			background-color: transparent;
			color: var(--ink-quiet);
		}

		.actions :global(.button[data-variant='quiet']:hover:not(:disabled)) {
			background-color: var(--chip-bg);
			color: var(--ink);
		}

		kbd {
			font-family: var(--ff-mono);
			font-size: var(--fs-0);
			opacity: 0.7;
		}

		@media (max-width: 40rem) {
			.quiet-actions {
				margin-inline-start: 0;
			}
			.scope {
				margin-inline-start: 0;
				text-align: start;
			}
		}
	}
</style>
