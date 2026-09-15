<script lang="ts">
	/**
	 * The gesture surface around one account.
	 *
	 * Owns the card's position and the affordance that tells the user what
	 * releasing would do; owns no decision. `oncommit` hands the outcome up to
	 * the screen, which is the only thing that knows what a decision means.
	 */
	import {
		swipe,
		exitOffset,
		tiltFor,
		type SwipeOutcome,
		type SwipeState,
		IDLE
	} from '$lib/triage/swipe';
	import type { Snippet } from 'svelte';

	let {
		oncommit,
		children,
		enabled = true
	}: {
		oncommit: (outcome: SwipeOutcome) => void;
		children: Snippet;
		enabled?: boolean;
	} = $props();

	let drag = $state<SwipeState>(IDLE);

	/**
	 * The card leaving, held separately from the drag.
	 *
	 * While it is set the gesture is off and the card is animating out under
	 * its own transform — the alternative is a second drag starting on a card
	 * that is already mid-flight and no longer means anything.
	 */
	let leaving = $state<{ outcome: SwipeOutcome; x: number; y: number } | null>(null);

	/** The card's width at the moment it was thrown, so its exit tilt matches its drag tilt. */
	let leavingWidth = $state(0);

	/**
	 * Whether the viewer asked for less motion.
	 *
	 * Read here rather than answered in CSS, because the transform is an inline
	 * style and a stylesheet can only beat an inline style with `!important`.
	 * Keeping the decision in the one place that writes the transform means the
	 * prohibition does not need an exception. Same `matchMedia` shape as
	 * `SignIn.svelte`, which already had this problem.
	 */
	let reducedMotion = $state(false);

	$effect(() => {
		const query = window.matchMedia('(prefers-reduced-motion: reduce)');
		const apply = () => (reducedMotion = query.matches);
		apply();
		query.addEventListener('change', apply);
		return () => query.removeEventListener('change', apply);
	});

	/**
	 * Whether a downward drag may mean skip, sampled when the finger lands.
	 *
	 * Only at the very top of the page: anywhere below it a downward drag is
	 * the user scrolling back toward the card, and taking that gesture from
	 * them would make the page feel broken.
	 */
	function isDownArmed(): boolean {
		return window.scrollY <= 1;
	}

	/*
	 * A card that is already leaving takes no further input.
	 *
	 * `[data-leaving] { pointer-events: none }` below is what actually enforces
	 * this, so these two guards are belt and braces — but they are cheap, and
	 * they are what stops a second `oncommit` if that rule is ever edited out.
	 * The failure they prevent is a card deciding twice.
	 */
	function onmove(next: SwipeState) {
		if (leaving) return;
		drag = next;
	}

	function oncancel() {
		drag = IDLE;
	}

	function commit(outcome: SwipeOutcome) {
		if (leaving) return;
		const to = exitOffset(outcome, window.innerWidth);
		leavingWidth = drag.width;
		leaving = { outcome, x: to.x, y: to.y };
		drag = IDLE;
		/*
		 * The decision is reported immediately, not when the flight ends.
		 * Waiting would mean a fast reviewer's second swipe landed before
		 * their first one was recorded, and the queue would skip a card. The
		 * animation is feedback about a thing that already happened.
		 */
		oncommit(outcome);
	}

	/**
	 * A committed card is never flown back in.
	 *
	 * `{#key}` in the caller destroys this component on every subject change,
	 * so `leaving` only ever has to survive until that happens. Clearing it
	 * here would race the swap and flash the outgoing account back into place.
	 */

	const dragging = $derived(drag.dragging && !leaving);
	const shown = $derived(leaving ? leaving.outcome : drag.intent);

	/*
	 * A small rotation, so the card reads as thrown rather than slid.
	 *
	 * The angle comes from `tiltFor`, which holds the far corner's *rise*
	 * constant instead of the angle. A fixed angle is not a fixed look: the
	 * same 5 degrees is a throw on a phone card and a bend on a desktop one.
	 */
	const tilt = $derived(
		leaving && leaving.outcome !== 'skip'
			? tiltFor(leaving.outcome === 'keep' ? 1 : -1, leavingWidth, 1)
			: tiltFor(drag.dx, drag.width, drag.progress)
	);

	/*
	 * With reduced motion the card never travels: it is gone either way, and
	 * the difference is only whether it moves to get there.
	 */
	const transform = $derived(
		reducedMotion
			? 'none'
			: leaving
				? `translate3d(${leaving.x}px, ${leaving.y}px, 0) rotate(${tilt}deg)`
				: `translate3d(${drag.dx}px, ${drag.dy}px, 0) rotate(${tilt}deg)`
	);

	const LABEL: Record<SwipeOutcome, string> = {
		keep: 'Keep',
		unfollow: 'Unfollow',
		skip: 'Skip'
	};
</script>

<div class="swipe">
	<div
		class="card"
		data-dragging={dragging ? 'true' : undefined}
		data-leaving={leaving ? 'true' : undefined}
		style="transform: {transform}"
		use:swipe={{ onmove, oncommit: commit, oncancel, enabled: enabled && !leaving, isDownArmed }}
	>
		{@render children()}
	</div>

	<!--
		The affordance sits *over* the card, not behind it.

		Behind was the first try and it does not work: the card is opaque, so
		it covers the badge completely until the drag is most of a card-width
		along — by which point the user has already committed and the label
		they needed is arriving too late to be read.

		It is aria-hidden because the action bar's live region already reports
		the outcome, and narrating the intent on every pixel of travel is noise.
	-->
	<!--
		`--progress` rather than `opacity` on this layer.

		Opacity here would multiply into the badge, so the label would be at
		its faintest exactly while the user is still reading it to decide. The
		wash follows the gesture; the label is legible from the start and only
		firms up.
	-->
	<div
		class="intent"
		data-outcome={shown ?? 'none'}
		style="--progress: {leaving ? 1 : drag.progress}"
		aria-hidden="true"
	>
		<span class="badge">{shown ? LABEL[shown] : ''}</span>
	</div>
</div>

<style>
	@layer layout {
		.swipe {
			position: relative;
			/*
			 * The browser keeps vertical scrolling. The action only claims a
			 * downward drag once it has locked the axis, and only at the top
			 * of the page — below that, `pan-y` means the page is already
			 * scrolling and there is nothing to claim.
			 */
			touch-action: pan-y;
			/* A thrown card must not widen the document on its way out. */
			overflow: clip;
			/* `clip` with no inset would also clip the focus rings inside. */
			overflow-clip-margin: var(--space-sm);
		}

		.card {
			/* No transition while the finger is down: the card tracks it exactly. */
			transition:
				transform 0.28s cubic-bezier(0.22, 0.61, 0.36, 1),
				opacity 0.28s ease;
			will-change: transform;
		}

		.card[data-dragging='true'] {
			transition: none;
			cursor: grabbing;
			user-select: none;
		}

		.card[data-leaving='true'] {
			opacity: 0;
			pointer-events: none;
		}

		/*
		 * The intent layer sits over the card and washes it in the decided
		 * colour. Nothing here is hit-testable — every pointer event still
		 * belongs to the card underneath.
		 *
		 * The wash is light enough to read the account through, because the
		 * user is still deciding and the thing they are deciding about must
		 * not be taken away while they do.
		 */
		.intent {
			position: absolute;
			inset: 0;
			display: flex;
			align-items: flex-start;
			padding: var(--space-lg);
			border-radius: var(--radius-lg);
			pointer-events: none;
		}

		.intent[data-outcome='none'] {
			display: none;
		}

		/*
		 * Anchored to the side the card is travelling *away from* — the space
		 * it vacates.
		 *
		 * This layer does not move with the card; it fills the container the
		 * card slides around inside. So a card thrown right uncovers the left,
		 * and the label belongs in the gap that opens rather than under the
		 * card's leading edge, where it would be the part still covered.
		 * Skip vacates the top, but a centred label reads better there than one
		 * pinned to a corner.
		 */
		.intent[data-outcome='keep'] {
			justify-content: flex-start;
			background-color: color-mix(in oklch, var(--keep) calc(var(--progress) * 12%), transparent);
		}

		.intent[data-outcome='unfollow'] {
			justify-content: flex-end;
			background-color: color-mix(
				in oklch,
				var(--unfollow) calc(var(--progress) * 12%),
				transparent
			);
		}

		.intent[data-outcome='skip'] {
			justify-content: center;
			background-color: color-mix(in oklch, var(--skip) calc(var(--progress) * 12%), transparent);
		}

		/*
		 * The word, not just the colour. Keep and unfollow are told apart by
		 * hue and by their own word (PRD, "Interface"), and a gesture is no
		 * excuse to drop the half that works without colour vision.
		 */
		.badge {
			font-family: var(--ff-ui);
			font-size: var(--fs-4);
			font-weight: 700;
			letter-spacing: 0.04em;
			text-transform: uppercase;
			padding: var(--space-sm) var(--space-xl);
			border-radius: var(--radius-pill);
			color: white;
			/* Tilted against the card's own tilt, like a stamp pressed on it. */
			rotate: -4deg;
			/*
			 * Legible as soon as the axis locks, then firming up. A label that
			 * started at nothing would be faintest at the moment it is being
			 * read to decide with.
			 */
			opacity: calc(0.45 + var(--progress) * 0.55);
			box-shadow: 0 0.25rem 0.75rem color-mix(in oklch, var(--hue-z0-fg) 30%, transparent);
		}

		.intent[data-outcome='keep'] .badge {
			background-color: var(--keep);
		}

		.intent[data-outcome='unfollow'] .badge {
			background-color: var(--unfollow);
			/* Leaning the other way, since it is stamped on the other side. */
			rotate: 4deg;
		}

		.intent[data-outcome='skip'] .badge {
			background-color: var(--skip);
			/* Skip has no side to lean away from. */
			rotate: 0deg;
		}

		/*
		 * Reduced motion is handled in the script, not here: the transform is
		 * an inline style and only `!important` could override it from a
		 * stylesheet. The global reduced-motion rule in `src/app.css` already
		 * flattens this transition's duration.
		 */
	}
</style>
