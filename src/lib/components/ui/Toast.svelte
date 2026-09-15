<script lang="ts">
	/**
	 * A transient notice with one action, used for undo after a decision.
	 *
	 * Not a Bits UI wrapper: Bits UI ships no toast primitive, so there is no
	 * headless accessibility behaviour here to inherit. What it needs instead
	 * is a live region, which is a markup decision rather than a component one.
	 *
	 * `role="status"` and not `role="alert"`: a recorded decision is not an
	 * error, and `alert` interrupts whatever a screen reader is mid-sentence
	 * on. `status` is announced at the next opportunity, which for something
	 * the user just did themselves is the right urgency.
	 */
	import Button from '$lib/components/ui/Button.svelte';
	import type { Snippet } from 'svelte';

	let {
		open,
		key,
		action,
		onaction,
		ondismiss,
		duration = 6000,
		offset = '0px',
		tone = 'neutral',
		children
	}: {
		open: boolean;
		/**
		 * Identifies *which* notice this is.
		 *
		 * The dismissal timer restarts when it changes. Without it, a second
		 * notice arriving while the first is still up would inherit the first
		 * one's remaining countdown and could vanish almost immediately.
		 */
		key?: unknown;
		/** The action's label. Omitted for a notice with nothing to do about it. */
		action?: string;
		onaction?: () => void;
		ondismiss: () => void;
		/** Milliseconds before it withdraws itself. */
		duration?: number;
		/**
		 * A CSS length already occupied at the bottom of the window, which the
		 * notice lifts itself clear of.
		 *
		 * The notice has no way to know what else is pinned down there, and
		 * guessing wrong means it covers the very controls it is reporting on.
		 * The caller names it.
		 */
		offset?: string;
		tone?: 'neutral' | 'keep' | 'unfollow' | 'skip';
		children: Snippet;
	} = $props();

	/**
	 * Whether the pointer is resting on the toast.
	 *
	 * The timer pauses while it is, because the one moment a toast must not
	 * vanish is while someone is reaching for its button.
	 */
	let held = $state(false);

	/** The region element, so a pointer leaving it can be told from one moving inside it. */
	let region = $state<HTMLElement | null>(null);

	/**
	 * `pointerover`/`pointerout` on the region rather than
	 * `pointerenter`/`pointerleave` on the toast.
	 *
	 * The enter/leave pair does not bubble, so it would have to live on the
	 * toast itself — an element with no role, which is both an accessibility
	 * lint failure and a fair one. The over/out pair bubbles to the region,
	 * which is already a labelled live region, at the cost of having to
	 * ignore the crossings between the toast's own children.
	 */
	function onpointerout(event: PointerEvent) {
		const to = event.relatedTarget;
		if (to instanceof Node && region?.contains(to)) return;
		held = false;
	}

	$effect(() => {
		// Gathered into one object so `key` is genuinely read: that read is what
		// makes the effect re-run — and the timer restart — when a different
		// notice takes this one's place.
		const notice = { key, open, held };
		if (!notice.open || notice.held) return;

		const timer = setTimeout(ondismiss, duration);
		return () => clearTimeout(timer);
	});
</script>

<!--
	Rendered even when closed, and emptied rather than removed.

	A live region has to exist in the accessibility tree *before* its contents
	change, or the change is not announced — inserting an already-populated
	region is the single most common way to build a toast nothing reads out.
-->
<div
	class="toast-region"
	role="status"
	aria-live="polite"
	style="--offset: {offset}"
	bind:this={region}
	onpointerover={() => (held = true)}
	{onpointerout}
	onfocusin={() => (held = true)}
	onfocusout={() => (held = false)}
>
	{#if open}
		<div class="toast" data-tone={tone}>
			<p class="message u:fs-1">{@render children()}</p>

			{#if action && onaction}
				<Button data-variant="toast" onclick={onaction}>{action}</Button>
			{/if}
		</div>
	{/if}
</div>

<style>
	@layer layout {
		.toast-region {
			position: fixed;
			z-index: var(--layer-toast);
			inset-block-end: 0;
			inset-inline: 0;
			display: flex;
			justify-content: center;
			/* Clear of the home indicator and of the phone action bar above it. */
			padding: var(--space-lg);
			padding-block-end: calc(
				var(--space-lg) + env(safe-area-inset-bottom, 0px) + var(--offset, 0px)
			);
			pointer-events: none;
		}

		.toast {
			display: flex;
			align-items: center;
			gap: var(--space-lg);
			max-inline-size: 32rem;
			padding: var(--space-sm) var(--space-sm) var(--space-sm) var(--space-lg);
			border-radius: var(--radius-pill);
			background-color: var(--hue-z0-fg);
			color: var(--hue-z0-bg);
			box-shadow: 0 0.5rem 1.5rem color-mix(in oklch, var(--hue-z0-fg) 25%, transparent);
			/* The region ignores pointers; the toast inside it must not. */
			pointer-events: auto;
			animation: toast-in 0.2s cubic-bezier(0.22, 0.61, 0.36, 1);
		}

		.message {
			margin: 0;
			font-family: var(--ff-ui);
		}

		/*
		 * A rule of the decided colour, not a fill: the toast is a receipt,
		 * and a full green or rose panel reads as a second decision being
		 * offered rather than the last one being reported.
		 */
		.toast[data-tone='keep'] {
			border-inline-start: var(--space-2xs) solid var(--keep);
		}

		.toast[data-tone='unfollow'] {
			border-inline-start: var(--space-2xs) solid var(--unfollow);
		}

		.toast[data-tone='skip'] {
			border-inline-start: var(--space-2xs) solid var(--skip);
		}

		.toast :global(.button[data-variant='toast']) {
			min-block-size: var(--tap-min);
			padding-inline: var(--space-lg);
			border-radius: var(--radius-pill);
			background-color: color-mix(in oklch, var(--hue-z0-bg) 18%, transparent);
			color: var(--hue-z0-bg);
		}

		.toast :global(.button[data-variant='toast']:hover:not(:disabled)) {
			background-color: color-mix(in oklch, var(--hue-z0-bg) 32%, transparent);
		}

		@keyframes toast-in {
			from {
				opacity: 0;
				transform: translateY(0.75rem);
			}
		}
	}
</style>
