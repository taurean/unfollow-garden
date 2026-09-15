<script lang="ts">
	import { EVENT_KINDS, type ActivityEvent, type CoveredWindow } from '$lib/atproto/activity';
	import { bucketEvents, monthTicks } from '$lib/stats/activity-stats';

	let {
		events,
		window: covered,
		lookbackDays
	}: {
		events: readonly ActivityEvent[];
		window: CoveredWindow;
		lookbackDays: number;
	} = $props();

	/**
	 * One bucket per five days.
	 *
	 * Fine enough that a burst of posting reads as a burst, coarse enough that a
	 * year fits without the bars becoming hairlines.
	 */
	const DAYS_PER_BUCKET = 5;
	const bucketCount = $derived(Math.max(24, Math.round(lookbackDays / DAYS_PER_BUCKET)));

	const months = $derived(monthTicks(covered, lookbackDays));

	const rows = $derived(
		EVENT_KINDS.map((kind) => ({
			kind,
			buckets: bucketEvents(events, kind, covered, lookbackDays, bucketCount),
			count: events.filter((event) => event.kind === kind).length
		}))
	);

	/** The row labels, which are plurals because they name a quantity of things. */
	const LABEL: Record<(typeof EVENT_KINDS)[number], string> = {
		post: 'posts',
		reply: 'replies',
		repost: 'reposts',
		like: 'likes'
	};

	/** Why part of the strip is hatched, said plainly rather than left blank. */
	const uncoveredReason = $derived(
		covered.reason === 'fetch-limit'
			? 'not loaded (fetch limit reached)'
			: covered.reason === 'account-created'
				? 'before the account existed'
				: null
	);
</script>

<div class="strip">
	<div class="months" aria-hidden="true">
		{#each months as month (month.offset)}
			<span class="month" style="left: {month.offset * 100}%">{month.label}</span>
		{/each}
	</div>

	{#each rows as row (row.kind)}
		<div class="row">
			<div
				class="track"
				role="img"
				aria-label="{row.count.toLocaleString()} {LABEL[row.kind]} in the last {lookbackDays} days"
				style="--bucket-count: {bucketCount}"
			>
				{#each row.buckets as bucket, index (index)}
					<span
						class="bucket"
						data-state={bucket.uncovered ? 'uncovered' : bucket.count > 0 ? 'active' : 'empty'}
					></span>
				{/each}
			</div>
			<span class="label">{LABEL[row.kind]}</span>
		</div>
	{/each}

	{#if uncoveredReason && covered.reason !== 'lookback'}
		<p class="uncovered-note">Hatched: {uncoveredReason}</p>
	{/if}
</div>

<style>
	@layer layout {
		.strip {
			display: flex;
			flex-direction: column;
			gap: var(--space-lg);
			/* Bars are sized against this, not the viewport, so the strip can be
			   dropped into a narrower column without a media query. */
			container-type: inline-size;
		}

		.months {
			position: relative;
			block-size: 1.4em;
			font-size: var(--fs-1);
			color: var(--ink-quiet);
		}

		.month {
			position: absolute;
			inset-block-start: 0;
			white-space: nowrap;
		}

		.row {
			display: flex;
			flex-direction: column;
			gap: var(--space-2xs);
		}

		/*
		 * A grid, not flex: every bucket is the same fraction of the track
		 * whatever the count, so a 180-day strip and a 365-day strip are the
		 * same width and differ only in bar density.
		 */
		.track {
			display: grid;
			grid-template-columns: repeat(var(--bucket-count), 1fr);
			gap: 2px;
			block-size: 2.75rem;
		}

		.bucket {
			background-color: var(--strip-empty);
			border-radius: 1px;
		}

		.bucket[data-state='active'] {
			background-color: var(--strip-active);
		}

		/*
		 * Hatching, not a third colour. "We did not look here" is a different
		 * claim from "nothing happened here", and a texture says so without
		 * being read as another level of activity.
		 */
		.bucket[data-state='uncovered'] {
			background-color: transparent;
			background-image: repeating-linear-gradient(
				45deg,
				var(--strip-empty) 0 2px,
				transparent 2px 4px
			);
		}

		.label,
		.uncovered-note {
			font-family: var(--ff-ui);
			font-size: var(--fs-0);
			color: var(--ink-quiet);
		}

		.uncovered-note {
			margin: 0;
		}

		/* Below about 30rem the bars fall under a pixel; fewer, wider ones read. */
		@container (max-width: 30rem) {
			.track {
				gap: 1px;
				block-size: 2rem;
			}
			.month:nth-of-type(even) {
				display: none;
			}
		}
	}
</style>
