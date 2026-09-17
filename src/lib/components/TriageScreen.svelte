<script lang="ts">
	import AccountCard from '$lib/components/AccountCard.svelte';
	import CostNote from '$lib/components/CostNote.svelte';
	import RecentColumns from '$lib/components/RecentColumns.svelte';
	import SwipeCard from '$lib/components/SwipeCard.svelte';
	import TriageActions from '$lib/components/TriageActions.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Toast from '$lib/components/ui/Toast.svelte';
	import { exact } from '$lib/format';
	import type { SwipeOutcome } from '$lib/triage/swipe';
	import type { TriageSession } from '$lib/triage/session.svelte';

	let { session }: { session: TriageSession } = $props();

	const activity = $derived(
		session.current
			? session.scanner.get(session.current.subjectDid)
			: { status: 'pending' as const, activity: null, error: null, lastActive: null }
	);

	const recent = $derived(activity.activity?.recent ?? []);

	/*
	 * Only accounts with nothing to show are looked up, and only once they are
	 * the card on screen. A follow list can hold hundreds of dead accounts, and
	 * probing them all in the background would be hundreds of requests to
	 * third-party hosts to answer a question nobody has asked yet.
	 */
	$effect(() => {
		const subject = session.current;
		if (subject && !subject.profile) session.identities.probe(subject.subjectDid);
	});

	const identity = $derived(
		session.current
			? session.identities.get(session.current.subjectDid)
			: { status: 'pending' as const, account: null, history: null, error: null }
	);

	/**
	 * The last action, read once into a value the notice's body can narrow.
	 *
	 * Defaulting the kind at each use site instead — `?? 'keep'` — types fine
	 * and is a liability: the one time it fired, the notice would calmly report
	 * a keep that never happened and offer to undo it.
	 */
	const lastAction = $derived(session.lastAction);

	/** How the last action reads in the notice. */
	const TOAST_VERB: Record<SwipeOutcome, string> = {
		keep: 'Keeping',
		unfollow: 'Marked',
		skip: 'Skipped'
	};

	/** Whether the account still has to be told what happens next. */
	const TOAST_TAIL: Record<SwipeOutcome, string> = {
		keep: '',
		unfollow: ' for unfollow',
		skip: ' for later'
	};

	/**
	 * A swipe and a button press are the same decision.
	 *
	 * Routing both through one function is what keeps them that way: the
	 * gesture is an input method, not a second code path with its own rules
	 * about what keeping means.
	 */
	function oncommit(outcome: SwipeOutcome) {
		if (outcome === 'skip') session.skip();
		else session.decide(outcome);
	}

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
				oncommit('keep');
				break;
			case 'u':
				event.preventDefault();
				oncommit('unfollow');
				break;
			case 's':
				event.preventDefault();
				oncommit('skip');
				break;
			case 'z':
				event.preventDefault();
				session.undo();
				break;
		}
	}
</script>

<svelte:window onkeydown={onKeydown} />

<section class="[ stage ] [ l:stage ]">
	<header class="status u:fs-0 tabular">
		<p>
			<strong>{exact(session.remaining.length)}</strong> to review
			{#if session.newSinceLastPass > 0}
				<!-- Coming back to a reviewed list, the new follows are the
				     whole reason for the second pass, so they get counted
				     separately from the ones carried over. -->
				· {exact(session.newSinceLastPass)} new
			{/if}
			{#if session.skippedCount > 0}
				· {exact(session.skippedCount)} skipped
			{/if}
			·
			{#if session.keptCount > 0}
				<!-- The kept list is how a second pass gets audited without
				     walking the whole queue again. -->
				<Button data-variant="link" onclick={() => session.showKept()}>
					{exact(session.keptCount)} kept
				</Button>
			{:else}
				{exact(session.keptCount)} kept
			{/if} ·
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
			<SwipeCard {oncommit}>
				<AccountCard
					subject={session.current}
					{activity}
					{identity}
					isNew={session.isNewSinceLastPass(session.current)}
					lookbackDays={session.settings.lookbackDays}
					thresholdDays={session.settings.thresholdDays}
				/>
			</SwipeCard>
		{/key}

		<TriageActions
			{oncommit}
			onundo={() => session.undo()}
			lookbackDays={session.settings.lookbackDays}
		/>

		<CostNote counts={session.meter.counts} onexplain={() => session.showCost()} />
	{/if}
</section>

{#if session.current?.profile && activity.status === 'ready'}
	<section class="recent">
		<RecentColumns {recent} />
	</section>
{/if}

<Toast
	open={lastAction !== null}
	key={lastAction?.seq}
	tone={lastAction?.kind ?? 'neutral'}
	action="Undo"
	offset="var(--pinned-bar)"
	onaction={() => session.undo()}
	ondismiss={() => session.dismissLastAction()}
>
	{#if lastAction}
		{TOAST_VERB[lastAction.kind]}
		{lastAction.label}{TOAST_TAIL[lastAction.kind]}
	{/if}
</Toast>

<style>
	@layer layout {
		/* Width, centring and the wordmark gutter come from `l:stage`. */
		.stage {
			display: flex;
			flex-direction: column;
			gap: var(--space-xl);
			--stage-leading: var(--space-xl);
			--stage-trailing: var(--space-2xl);
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

		/*
		 * The recent columns sit on their own surface below the fold. Everything
		 * needed to decide is above it; this is for when that was not enough.
		 *
		 * The change of surface is the whole of the division — no rule across
		 * the top. A line and a tonal step both say "new section", and saying
		 * it twice is what makes a page look ruled rather than composed.
		 */
		.recent {
			background-color: var(--surface-raised);
			padding: var(--space-2xl) var(--space-lg) var(--space-2xl) var(--space-2xl);
		}

		.recent :global(.columns) {
			max-inline-size: var(--stage-max);
			margin-inline: auto;
		}

		/* phone — see the breakpoint note in src/lib/styles/tokens.css */
		@media (max-width: 40rem) {
			.stage {
				gap: var(--space-lg);
				--stage-leading: var(--space-lg);
				/*
				 * Clearance for the bar now pinned over the bottom of the page,
				 * so the last of the card is still reachable by scrolling.
				 */
				--stage-trailing: calc(var(--pinned-bar) + var(--space-2xl));
			}

			.recent {
				padding: var(--space-2xl) var(--space-lg);
			}
		}
	}
</style>
