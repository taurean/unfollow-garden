<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';

	/**
	 * A destructive action behind one confirming step.
	 *
	 * Not a dialog. Nothing here is urgent enough to seize focus, and the
	 * explanation next to the button is the part that should be read — a modal
	 * would cover it with the same sentence in a smaller box.
	 *
	 * The confirming state is local, so two of these on one screen cannot arm
	 * each other, and it resets after the action runs.
	 */
	let {
		label,
		confirmLabel,
		onconfirm
	}: {
		/** What the resting button says, named by what it does. */
		label: string;
		/** What the armed button says. States the consequence, not "Yes". */
		confirmLabel: string;
		onconfirm: () => void | Promise<void>;
	} = $props();

	let arming = $state(false);
	let busy = $state(false);
</script>

<!--
	`data-armed` is on the element so a caller can lay the armed pair out
	differently from the resting link — on a phone the two buttons do not fit
	the band the resting one sits in, and CSS has no other way to know.
-->
<div class="row" data-armed={arming}>
	{#if arming}
		<Button
			data-variant="unfollow"
			disabled={busy}
			onclick={async () => {
				busy = true;
				try {
					await onconfirm();
				} finally {
					busy = false;
					arming = false;
				}
			}}
		>
			{confirmLabel}
		</Button>
		<Button class="cancel" disabled={busy} onclick={() => (arming = false)}>Cancel</Button>
	{:else}
		<Button data-variant="quiet" onclick={() => (arming = true)}>{label}</Button>
	{/if}
</div>

<style>
	@layer layout {
		.row {
			display: flex;
			flex-wrap: wrap;
			gap: var(--space-sm);
		}

		/*
		 * The destructive colour belongs to this component rather than to each
		 * caller. `unfollow` is a variant the primitive names but does not
		 * style, so a caller that forgot to paint it got the friendly primary
		 * blue on the button that erases everything — which is the one place
		 * the colour actually has to be right.
		 *
		 * Colour is not carrying the meaning on its own: the label names the
		 * consequence, which is the part that survives a screenshot in
		 * greyscale.
		 */
		.row :global(.button[data-variant='unfollow']) {
			background-color: var(--unfollow);
			color: white;
		}

		.row :global(.button[data-variant='unfollow']:hover:not(:disabled)) {
			background-color: var(--unfollow-hover);
		}

		/*
		 * Cancel carries its own class rather than the `quiet` variant. `quiet`
		 * is styled by each screen that uses it, and the resting label above
		 * relies on that — a caller skins the affordance to match its
		 * surroundings. The armed pair is this component's own, and must look
		 * right wherever it is dropped, including in a story with no screen
		 * around it.
		 */
		.row :global(.button.cancel) {
			background-color: transparent;
			color: var(--ink-quiet);
			border: 1px solid var(--hue-z0-divider);
		}

		.row :global(.button.cancel:hover:not(:disabled)) {
			color: var(--ink);
		}
	}
</style>
