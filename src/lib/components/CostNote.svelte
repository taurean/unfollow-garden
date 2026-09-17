<script lang="ts">
	import { costOf, formatCost } from '$lib/cost/x-rates';
	import type { MeterCounts } from '$lib/storage/db';

	let { counts }: { counts: MeterCounts } = $props();

	const dollars = $derived(costOf(counts));
</script>

<!--
	Hidden until the total is above zero. Nobody should be shown $0.00 before
	they have done anything — the point is what a finished review cost, not a
	counter that starts at nothing and dares you to watch it.
-->
{#if dollars > 0}
	<p class="cost u:fs-0 u:lh-standard">
		Doing this on x.com would have cost unfollow.garden
		<a
			class="figure"
			href="https://docs.x.com/x-api/getting-started/pricing"
			target="_blank"
			rel="external noreferrer noopener">{formatCost(dollars)}</a
		>. On AT Protocol it was free. Inspired by
		<a href="https://xbill.bisks.net" target="_blank" rel="external noreferrer noopener">xbill</a>.
	</p>
{/if}

<style>
	@layer layout {
		.cost {
			margin: 0;
			font-family: var(--ff-ui);
			color: var(--ink-quiet);
			max-inline-size: 60ch;
		}

		/*
		 * The figure is the only emphasised thing in the sentence, and it is
		 * also the link to the rate card it came from — the number and its
		 * source are the same target, so a reader checking the claim does not
		 * have to hunt for where it came from.
		 *
		 * Colour is emphasis here, not meaning: the sentence says everything
		 * without it.
		 */
		.figure {
			color: var(--warn-ink);
			font-weight: 600;
			text-decoration: none;
			font-variant-numeric: tabular-nums;
		}

		.figure:hover {
			text-decoration: underline;
		}

		a:not(.figure) {
			color: inherit;
		}
	}
</style>
