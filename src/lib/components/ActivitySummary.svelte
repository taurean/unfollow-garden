<script lang="ts">
	import { countsSentence, duration, longDate } from '$lib/format';
	import type { ActivityStats } from '$lib/stats/activity-stats';
	import type { FollowSnapshot } from '$lib/storage/db';

	let {
		subject,
		stats,
		lookbackDays,
		likesError
	}: {
		subject: FollowSnapshot;
		stats: ActivityStats | null;
		lookbackDays: number;
		likesError: string | null;
	} = $props();

	/**
	 * The gap that decides things.
	 *
	 * An ongoing gap says "they stopped"; a historical one says "they have been
	 * quiet before and came back". Leading with the latest gap puts the more
	 * useful of the two first without having to explain the difference.
	 */
	const latest = $derived(stats?.latestLongGap ?? null);
</script>

<dl class="summary tabular">
	<div>
		<dd>{longDate(subject.followedAt)}</dd>
		<dt>You followed</dt>
	</div>
	<div>
		<dd>{stats ? (stats.lastActive ? longDate(stats.lastActive) : 'Never') : '—'}</dd>
		<dt>Last active</dt>
	</div>
	<div>
		<dd>
			{#if latest}
				{latest.atLeast ? '≥ ' : ''}{duration(latest.days)}
			{:else if stats}
				None
			{:else}
				—
			{/if}
		</dd>
		<dt>{latest?.ongoing ? 'Quiet for' : 'Last gap'}</dt>
	</div>
	<div>
		<dd>{duration(stats?.medianGapDays)}</dd>
		<dt>Typical gap</dt>
	</div>

	<p class="totals">
		{#if stats}
			<span>{countsSentence(stats.counts)}</span>
			<span class="scope">last {lookbackDays} days</span>
		{:else}
			<span class="scope">Loading activity…</span>
		{/if}
	</p>
</dl>

{#if likesError}
	<p class="caveat u:fs-0">
		Likes could not be loaded from this account's server, so the gap figures count posts, replies,
		and reposts only. ({likesError})
	</p>
{/if}

<style>
	@layer layout {
		.summary {
			display: flex;
			flex-wrap: wrap;
			align-items: baseline;
			gap: var(--space-lg) var(--space-xl);
			margin: 0;
		}

		/* Figure over label, matching the follower counts above it. */
		.summary > div {
			display: flex;
			flex-direction: column;
		}

		dd {
			margin: 0;
			font-size: var(--fs-3);
			line-height: 1.2;
		}

		dt {
			font-family: var(--ff-ui);
			font-size: var(--fs-0);
			color: var(--ink-quiet);
		}

		/*
		 * The totals sentence belongs to the strip below, not to the figures
		 * beside it, so it is pushed to the far end rather than joining the row.
		 */
		.totals {
			display: flex;
			flex-direction: column;
			align-items: flex-end;
			text-align: end;
			margin: 0;
			margin-inline-start: auto;
			font-size: var(--fs-2);
		}

		.scope {
			font-family: var(--ff-ui);
			font-size: var(--fs-0);
			color: var(--ink-quiet);
		}

		.caveat {
			margin: var(--space-sm) 0 0;
			font-family: var(--ff-ui);
			color: var(--warn-ink);
			max-inline-size: 70ch;
		}

		@media (max-width: 50rem) {
			.totals {
				align-items: flex-start;
				text-align: start;
				margin-inline-start: 0;
			}
		}
	}
</style>
