<script lang="ts">
	import AccountHeader from '$lib/components/AccountHeader.svelte';
	import ActivitySummary from '$lib/components/ActivitySummary.svelte';
	import TimelineStrip from '$lib/components/TimelineStrip.svelte';
	import { computeStats } from '$lib/stats/activity-stats';
	import type { ActivityState } from '$lib/triage/scanner.svelte';
	import type { FollowSnapshot } from '$lib/storage/db';

	let {
		subject,
		activity,
		lookbackDays,
		thresholdDays
	}: {
		subject: FollowSnapshot;
		activity: ActivityState;
		lookbackDays: number;
		thresholdDays: number;
	} = $props();

	const loaded = $derived(activity.status === 'ready' ? activity.activity : null);

	/**
	 * Recomputed rather than stored.
	 *
	 * The threshold is a setting the user can move, and moving it must not mean
	 * refetching a year of anyone's posts — it only decides which stretches are
	 * long enough to name (PRD, "Metrics").
	 */
	const stats = $derived(loaded ? computeStats(loaded.events, loaded.window, thresholdDays) : null);
</script>

<article class="account">
	<AccountHeader {subject} />

	{#if subject.profile}
		<ActivitySummary {subject} {stats} {lookbackDays} likesError={loaded?.likesError ?? null} />

		{#if loaded}
			<TimelineStrip events={loaded.events} window={loaded.window} {lookbackDays} />
		{:else if activity.status === 'error'}
			<p class="failed u:fs-1" role="status">
				Activity could not be loaded for this account. Decide on the profile alone, or skip and come
				back. ({activity.error})
			</p>
		{:else}
			<!-- A placeholder the height of the real strip, so deciding on one
			     subject does not make the action bar jump under the pointer. -->
			<div class="placeholder" role="status" aria-label="Loading activity"></div>
		{/if}
	{/if}
</article>

<style>
	@layer layout {
		.account {
			display: flex;
			flex-direction: column;
			gap: var(--space-xl);
		}

		.placeholder {
			block-size: 18rem;
		}

		.failed {
			margin: 0;
			font-family: var(--ff-ui);
			color: var(--warn-ink);
			max-inline-size: 70ch;
		}
	}
</style>
