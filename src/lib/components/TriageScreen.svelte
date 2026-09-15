<script lang="ts">
	import AccountCard from '$lib/components/AccountCard.svelte';
	import RecentColumns from '$lib/components/RecentColumns.svelte';
	import SwipeCard from '$lib/components/SwipeCard.svelte';
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
	function commit(outcome: SwipeOutcome) {
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
				commit('keep');
				break;
			case 'u':
				event.preventDefault();
				commit('unfollow');
				break;
			case 's':
				event.preventDefault();
				commit('skip');
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
			<SwipeCard oncommit={commit}>
				<AccountCard
					subject={session.current}
					{activity}
					lookbackDays={session.settings.lookbackDays}
					thresholdDays={session.settings.thresholdDays}
				/>
			</SwipeCard>
		{/key}

		<!--
			The bar sticks to the bottom of the viewport on a phone and sits in
			the flow on a wider screen. On a phone the card is taller than the
			screen, so a bar in the flow means scrolling past the whole account
			to act on it — several hundred times.
		-->
		<div class="actions">
			<div class="decisions">
				<Button data-variant="keep" onclick={() => commit('keep')}>
					Keep <kbd>K</kbd>
				</Button>
				<Button data-variant="unfollow" onclick={() => commit('unfollow')}>
					Unfollow <kbd>U</kbd>
				</Button>
			</div>

			<div class="quiet-actions">
				<Button data-variant="quiet" onclick={() => commit('skip')}>Skip <kbd>S</kbd></Button>
				<Button data-variant="quiet" onclick={() => session.undo()}>Undo <kbd>Z</kbd></Button>
			</div>

			<p class="scope u:fs-0">
				<!--
					The lookback is already stated on the card itself, next to
					the figures it governs, so the phone bar drops this half
					rather than spending a line of thumb space repeating it.
					The reassurance below has no second home and always shows.
				-->
				<span class="lookback"
					>checking data from the last {session.settings.lookbackDays} days<br /></span
				>marking changes nothing yet — unfollows happen in a run
			</p>

			<!--
				Shown only where a gesture is possible at all. On a desktop with
				no touch screen it would be advice about a control that is not
				there.
			-->
			<p class="hint u:fs-0" aria-hidden="true">
				swipe right to keep · left to unfollow · down to skip
			</p>
		</div>
	{/if}
</section>

{#if session.current?.profile && activity.status === 'ready'}
	<section class="recent">
		<RecentColumns {recent} />
	</section>
{/if}

<Toast
	open={session.lastAction !== null}
	key={session.lastAction?.seq}
	tone={session.lastAction?.kind ?? 'neutral'}
	action="Undo"
	offset="var(--pinned-bar)"
	onaction={() => session.undo()}
	ondismiss={() => session.dismissLastAction()}
>
	{TOAST_VERB[session.lastAction?.kind ?? 'keep']}
	{session.lastAction?.label}{TOAST_TAIL[session.lastAction?.kind ?? 'keep']}
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

		.actions {
			display: flex;
			flex-wrap: wrap;
			align-items: center;
			gap: var(--space-sm);
		}

		.decisions {
			display: flex;
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

		/* A pointer that cannot swipe gets no advice about swiping. */
		.hint {
			display: none;
			margin: 0;
			font-family: var(--ff-ui);
			color: var(--ink-quiet);
		}

		@media (pointer: coarse) {
			.hint {
				display: block;
			}
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

		.actions :global(.button) {
			min-block-size: var(--tap-min);
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

			/*
			 * Pinned within thumb reach. The card above it is taller than the
			 * screen, and a bar in the flow would mean scrolling the whole
			 * account past to reach the two buttons — every single time.
			 */
			.actions {
				position: fixed;
				z-index: var(--layer-bar);
				inset-block-end: 0;
				inset-inline: 0;
				flex-direction: column;
				align-items: stretch;
				gap: var(--space-2xs);
				padding: var(--space-sm) var(--space-lg);
				padding-block-end: calc(var(--space-sm) + env(safe-area-inset-bottom, 0px));
				background-color: var(--surface-raised);
				border-block-start: 1px solid var(--hue-z0-divider);
			}

			/* Two equal halves: neither decision is the default. */
			.decisions {
				display: grid;
				grid-template-columns: 1fr 1fr;
			}

			.quiet-actions {
				display: grid;
				grid-template-columns: 1fr 1fr;
				margin-inline-start: 0;
			}

			.scope {
				margin-inline-start: 0;
				text-align: center;
			}

			.lookback {
				display: none;
			}

			.hint {
				text-align: center;
			}

			.recent {
				padding: var(--space-2xl) var(--space-lg);
			}
		}
	}
</style>
