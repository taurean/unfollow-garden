<script lang="ts">
	import BackLink from '$lib/components/BackLink.svelte';
	import { costLines, costOf, formatCost, formatRate, RATES_AS_OF } from '$lib/cost/x-rates';
	import { exact, longDate } from '$lib/format';
	import type { TriageSession } from '$lib/triage/session.svelte';

	let { session }: { session: TriageSession } = $props();

	const counts = $derived(session.meter.counts);
	const lines = $derived(costLines(counts));
	const total = $derived(costOf(counts));
</script>

<section class="[ cost ] [ l:stage ]">
	<BackLink onback={() => session.backToTriage()} />

	<header>
		<h1 class="u:fs-5">
			{formatCost(total)} on X
		</h1>
		<p class="lede u:fs-2 u:lh-standard">
			What this review would have cost if the same reads were bought from X's API. On AT Protocol
			every one of them was free.
		</p>
	</header>

	{#if lines.length === 0}
		<p class="empty u:fs-1" role="status">
			Nothing has been fetched yet, so there is nothing to price.
		</p>
	{:else}
		<table class="tabular">
			<caption class="u:fs-0">
				Only reads that actually crossed the network are counted. Anything served from this
				browser's cache cost nothing and is not here.
			</caption>
			<thead>
				<tr>
					<th scope="col">Read</th>
					<th scope="col" class="num">Count</th>
					<th scope="col" class="[ num ] [ rate-col ]">Rate</th>
					<th scope="col" class="num">Cost</th>
				</tr>
			</thead>
			<tbody>
				{#each lines as line (line.kind)}
					<tr>
						<th scope="row">
							<span class="u:fs-1">{line.label}</span>
							<span class="source u:fs-0">{line.source}</span>
						</th>
						<td class="num u:fs-1">{exact(line.count)}</td>
						<td class="[ num rate-col ] [ u:fs-1 ]">{formatRate(line.rate)}</td>
						<td class="num u:fs-1">{formatCost(line.subtotal)}</td>
					</tr>
				{/each}
			</tbody>
			<tfoot>
				<tr>
					<th scope="row" class="u:fs-2">Total</th>
					<td></td>
					<td class="rate-col"></td>
					<td class="num u:fs-2">{formatCost(total)}</td>
				</tr>
			</tfoot>
		</table>
	{/if}

	<div class="notes u:fs-0 u:lh-standard">
		<h2 class="u:fs-1">Where these numbers come from</h2>
		<p>
			Rates are X's published per-resource prices, last checked on {longDate(RATES_AS_OF)}. X has
			replaced its pricing model once already — monthly tiers became pay-per-resource — so this
			needs re-checking rather than trusting.
			<a
				href="https://docs.x.com/x-api/getting-started/pricing"
				target="_blank"
				rel="external noreferrer noopener">X's pricing page</a
			>.
		</p>
		<p>
			Counts come from this browser only. Nothing is sent anywhere to produce this page, and the app
			never contacts x.com.
		</p>
		<p>
			The figure is conservative in three places. A liked post whose text failed to load is not
			counted. Identity lookups against PLC, which X has no equivalent of, are not priced at all.
			And X publishes no way to read another account's likes at any price, so the largest part of
			what this app shows you could not be bought there even at the rate above.
		</p>
		<p>
			The idea is taken from
			<a href="https://xbill.bisks.net" target="_blank" rel="external noreferrer noopener">xbill</a
			>, which prices a Bluesky repo the same way.
		</p>
	</div>
</section>

<style>
	@layer layout {
		.cost {
			display: flex;
			flex-direction: column;
			gap: var(--space-xl);
			--stage-width: 52rem;
		}

		h1 {
			margin: 0;
		}

		.lede {
			margin: var(--space-sm) 0 0;
			max-inline-size: 60ch;
			color: var(--ink-quiet);
		}

		.empty,
		.notes p {
			margin: 0;
			color: var(--ink-quiet);
		}

		/*
		 * Capped to about the measure of the prose around it.
		 *
		 * Left to fill the stage, a row put its label at one edge and its three
		 * figures at the other, with a hand's width of nothing between them —
		 * and a table is read by carrying a row's label across to its numbers.
		 */
		table {
			inline-size: 100%;
			max-inline-size: 42rem;
			border-collapse: collapse;
			text-align: start;
		}

		caption {
			text-align: start;
			color: var(--ink-quiet);
			font-family: var(--ff-ui);
			margin-block-end: var(--space-lg);
			max-inline-size: 60ch;
		}

		th,
		td {
			padding-block: var(--space-sm);
			border-block-end: 1px solid var(--hue-z0-divider);
			vertical-align: baseline;
		}

		thead th {
			font-family: var(--ff-ui);
			font-size: var(--fs-0);
			font-weight: 600;
			color: var(--ink-quiet);
		}

		/*
		 * Stacked with block children rather than `display: flex`. A flex `th`
		 * stops being a table cell, so its border no longer lines up with the
		 * borders of the cells beside it and every row drew two rules at
		 * different heights.
		 */
		tbody th {
			font-weight: normal;
			text-align: start;
			padding-inline-end: var(--space-lg);
		}

		tbody th span {
			display: block;
		}

		tbody th .source {
			margin-block-start: var(--space-3xs);
		}

		/* The endpoint, so a reader can go and check what was actually called. */
		.source {
			font-family: var(--ff-mono);
			color: var(--ink-quiet);
		}

		/*
		 * Right-aligned so the figures line up down the column, and spaced from
		 * each other: with none, a count ran straight into the rate beside it
		 * as "255,729$0.005".
		 */
		.num {
			text-align: end;
			white-space: nowrap;
			padding-inline-start: var(--space-lg);
		}

		tfoot th,
		tfoot td {
			border-block-end: none;
			padding-block-start: var(--space-lg);
		}

		.notes {
			display: flex;
			flex-direction: column;
			gap: var(--space-sm);
			font-family: var(--ff-ui);
			max-inline-size: 70ch;
		}

		.notes h2 {
			margin: 0;
			font-family: var(--ff-ui);
			color: var(--ink);
		}

		.notes a {
			color: inherit;
		}

		/* phone — see the breakpoint note in src/lib/styles/tokens.css */
		@media (max-width: 40rem) {
			/*
			 * The rate column goes: it is the same handful of numbers on every
			 * row and the one a reader is least likely to be checking. Count
			 * and cost are the pair that has to stay side by side.
			 */
			.rate-col {
				display: none;
			}
		}
	}
</style>
