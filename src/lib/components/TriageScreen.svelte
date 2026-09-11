<script lang="ts">
	import AccountCard from '$lib/components/AccountCard.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import type { TriageSession } from '$lib/triage/session.svelte';

	let { session }: { session: TriageSession } = $props();

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

<section class="triage">
	<header class="l:repel counts u:fs-1">
		<p>
			<strong>{session.remaining.length.toLocaleString()}</strong> to review
			{#if session.skippedCount > 0}
				<span class="muted">· {session.skippedCount.toLocaleString()} skipped</span>
			{/if}
		</p>
		<p class="muted">
			{session.keptCount.toLocaleString()} kept · {session.markedCount.toLocaleString()} marked
		</p>
	</header>

	{#if session.error}
		<p class="error u:fs-1" role="alert">{session.error}</p>
	{/if}

	{#if session.current}
		{#key session.current.subjectDid}
			<AccountCard subject={session.current} />
		{/key}

		<div class="actions">
			<Button onclick={() => session.decide('keep')}>Keep <kbd>K</kbd></Button>
			<Button class="action--unfollow" onclick={() => session.decide('unfollow')}>
				Unfollow <kbd>U</kbd>
			</Button>
			<Button class="action--quiet" onclick={() => session.skip()}>Skip <kbd>S</kbd></Button>
			<Button class="action--quiet" onclick={() => session.undo()}>Undo <kbd>Z</kbd></Button>
		</div>

		<p class="note u:fs-0">
			Marking an account for unfollow changes nothing yet. Runs happen after you review the full
			list.
		</p>
	{/if}
</section>

<style>
	.triage {
		display: flex;
		flex-direction: column;
		gap: var(--space-lg);
		max-width: 44rem;
		margin-inline: auto;
		padding-block: var(--space-xl);
	}

	.counts {
		font-variant-numeric: tabular-nums;
		flex-wrap: wrap;
		gap: var(--space-sm);
	}

	.counts p {
		margin: 0;
	}

	.muted {
		color: var(--hue-slate-600);
	}

	.error {
		margin: 0;
		color: var(--hue-red-700);
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-xs);
		margin-block-start: var(--space-sm);
	}

	/*
	 * Keep and unfollow are told apart by more than colour: each carries its own
	 * word and its own shortcut key, so the pair still reads when colour does
	 * not (PRD, "Interface").
	 */
	.actions :global(.action--unfollow) {
		background-color: var(--hue-red-600);
	}

	.actions :global(.action--unfollow:hover:not(:disabled)) {
		background-color: var(--hue-red-700);
	}

	.actions :global(.action--quiet) {
		background-color: transparent;
		color: var(--hue-slate-700);
		border: 1px solid var(--hue-slate-300);
	}

	.actions :global(.action--quiet:hover:not(:disabled)) {
		background-color: var(--hue-slate-100);
	}

	kbd {
		font-family: var(--ff-mono);
		font-size: var(--fs-0);
		opacity: 0.7;
		margin-inline-start: var(--space-3xs);
	}

	.note {
		margin: 0;
		color: var(--hue-slate-600);
	}

	@media (prefers-color-scheme: dark) {
		.muted,
		.note {
			color: var(--hue-slate-400);
		}
		.error {
			color: var(--hue-red-400);
		}
		.actions :global(.action--quiet) {
			color: var(--hue-slate-300);
			border-color: var(--hue-slate-700);
		}
		.actions :global(.action--quiet:hover:not(:disabled)) {
			background-color: var(--hue-slate-900);
		}
	}
</style>
