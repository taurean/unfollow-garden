<script lang="ts">
	/**
	 * The two decisions, the two ways out, and the small print under them.
	 *
	 * Its own block rather than part of the triage screen's, because it is its
	 * own contextual problem: above the phone breakpoint it is a row in the
	 * reading column, and below it leaves the flow entirely and becomes a bar
	 * pinned within thumb reach. Nothing else on the screen does that, and
	 * carrying both arrangements alongside the stage layout put that block at
	 * twice the size a block is meant to be.
	 */
	import Button from '$lib/components/ui/Button.svelte';
	import type { SwipeOutcome } from '$lib/triage/swipe';

	let {
		oncommit,
		onundo,
		lookbackDays
	}: {
		oncommit: (outcome: SwipeOutcome) => void;
		onundo: () => void;
		lookbackDays: number;
	} = $props();
</script>

<div class="actions">
	<div class="decisions">
		<Button data-variant="keep" onclick={() => oncommit('keep')}>
			Keep <kbd>K</kbd>
		</Button>
		<Button data-variant="unfollow" onclick={() => oncommit('unfollow')}>
			Unfollow <kbd>U</kbd>
		</Button>
	</div>

	<!-- Skip and undo are set apart from the two decisions, not lined up with
	     them: they are ways out, not a third and fourth choice. -->
	<div class="quiet-actions">
		<Button data-variant="quiet" onclick={() => oncommit('skip')}>Skip <kbd>S</kbd></Button>
		<Button data-variant="quiet" onclick={onundo}>Undo <kbd>Z</kbd></Button>
	</div>

	<p class="scope u:fs-0">
		<!--
			The lookback is already stated on the card itself, next to the
			figures it governs, so the phone bar drops this half rather than
			spending a line of thumb space repeating it. The reassurance below
			has no second home and always shows.
		-->
		<span class="lookback">checking data from the last {lookbackDays} days<br /></span>marking
		changes nothing yet — unfollows happen in a run
	</p>

	<!--
		Shown only where a gesture is possible at all. On a desktop with no touch
		screen it would be advice about a control that is not there.

		Not `aria-hidden`: a touch screen and a screen reader are not
		alternatives, and hiding this would hide the only description of the
		gesture from someone who can perform it but cannot see the card move.
	-->
	<p class="hint u:fs-0">swipe right to keep · left to unfollow · down to skip</p>
</div>

<style>
	@layer layout {
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

		kbd {
			font-family: var(--ff-mono);
			font-size: var(--fs-0);
			opacity: 0.7;
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

		/*
		 * phone — the bar leaves the flow and pins itself within thumb reach.
		 * The card above it is taller than the screen, and a bar in the flow
		 * would mean scrolling the whole account past to reach the two
		 * buttons, every single time. See the breakpoint note in
		 * src/lib/styles/tokens.css; its height is `--pinned-bar`.
		 */
		@media (max-width: 40rem) {
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
			.decisions,
			.quiet-actions {
				display: grid;
				grid-template-columns: 1fr 1fr;
			}

			.quiet-actions {
				margin-inline-start: 0;
			}

			.scope,
			.hint {
				margin-inline-start: 0;
				text-align: center;
			}

			.lookback {
				display: none;
			}
		}
	}
</style>
