<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import AccountCard from '$lib/components/AccountCard.svelte';
	import type { ActivityEvent, EventKind, SubjectActivity } from '$lib/atproto/activity';
	import type { ActivityState } from '$lib/triage/scanner.svelte';

	const { Story } = defineMeta({
		title: 'Triage/AccountCard',
		component: AccountCard,
		tags: ['autodocs']
	});

	const profile = {
		did: 'did:plc:alice',
		handle: 'alice.bsky.social',
		displayName: 'Alice Example',
		description: 'Writes about typography and old maps.\n\nReply guy in remission.',
		followersCount: 4210,
		followsCount: 380,
		postsCount: 9134,
		createdAt: '2019-03-02T00:00:00Z'
	};

	const base = {
		ownerDid: 'did:plc:owner',
		subjectDid: 'did:plc:alice',
		rkeys: ['aaa'],
		followedAt: '2021-06-04T00:00:00Z',
		followsOwner: null,
		loadedAt: '2026-09-11T00:00:00Z'
	};

	/** A fixed "now", so the strip looks the same on every run. */
	const NOW = Date.parse('2026-09-14T12:00:00Z');
	const DAY = 86_400_000;
	const daysAgo = (days: number) => new Date(NOW - days * DAY).toISOString();
	const ev = (kind: EventKind, days: number): ActivityEvent => ({ kind, at: daysAgo(days) });

	const fullWindow: SubjectActivity['window'] = {
		start: daysAgo(365),
		end: new Date(NOW).toISOString(),
		reason: 'lookback',
		truncated: false
	};

	/** A year of scattered activity, thinning out toward the present. */
	const busyEvents: SubjectActivity['events'] = [
		...Array.from({ length: 30 }, (_, i) => ev('post', 40 + i * 11)),
		...Array.from({ length: 22 }, (_, i) => ev('reply', 55 + i * 14)),
		...Array.from({ length: 9 }, (_, i) => ev('repost', 120 + i * 25)),
		...Array.from({ length: 48 }, (_, i) => ev('like', 35 + i * 7))
	];

	const ready = (activity: Partial<SubjectActivity>): ActivityState => ({
		status: 'ready',
		activity: {
			subjectDid: 'did:plc:alice',
			events: [],
			recent: [],
			window: fullWindow,
			lookbackDays: 365,
			fetchedAt: new Date(NOW).toISOString(),
			likesError: null,
			...activity
		},
		error: null,
		lastActive: null
	});

	const args = { lookbackDays: 365, thresholdDays: 30 };
</script>

<!-- The ordinary case: a full year loaded, activity across all four rows. -->
<Story name="Active account" asChild>
	<AccountCard
		{...args}
		subject={{ ...base, profile, followsOwner: true }}
		activity={ready({ events: busyEvents })}
	/>
</Story>

<!-- The case the app exists for: followed years ago, silent for most of a year. -->
<Story name="Ongoing gap" asChild>
	<AccountCard
		{...args}
		subject={{ ...base, profile }}
		activity={ready({ events: [ev('post', 300)] })}
	/>
</Story>

<!-- No events at all in the window: the whole strip is empty and that is a finding. -->
<Story name="No events in the window" asChild>
	<AccountCard {...args} subject={{ ...base, profile }} activity={ready({ events: [] })} />
</Story>

<!--
	A prolific account fills five pages in weeks, so most of the strip was never
	loaded. Hatching says "not looked at" rather than "nothing happened".
-->
<Story name="Truncated window" asChild>
	<AccountCard
		{...args}
		subject={{ ...base, profile }}
		activity={ready({
			events: Array.from({ length: 60 }, (_, i) => ev('like', i * 0.4)),
			window: { ...fullWindow, start: daysAgo(24), reason: 'fetch-limit', truncated: true }
		})}
	/>
</Story>

<!-- A young account: the region before it existed is hatched for a different reason. -->
<Story name="Account younger than the lookback" asChild>
	<AccountCard
		{...args}
		subject={{ ...base, profile: { ...profile, createdAt: daysAgo(90) } }}
		activity={ready({
			events: Array.from({ length: 14 }, (_, i) => ev('post', 4 + i * 6)),
			window: { ...fullWindow, start: daysAgo(90), reason: 'account-created' }
		})}
	/>
</Story>

<!-- Some PDSes send no CORS headers. Posts still load; the summary says likes did not. -->
<Story name="Likes unavailable" asChild>
	<AccountCard
		{...args}
		subject={{ ...base, profile }}
		activity={ready({
			events: busyEvents.filter((event) => event.kind !== 'like'),
			likesError: 'could not reach pds.example.com'
		})}
	/>
</Story>

<!-- Activity is still loading: the strip holds its height so the buttons stay put. -->
<Story name="Activity loading" asChild>
	<AccountCard
		{...args}
		subject={{ ...base, profile }}
		activity={{ status: 'loading', activity: null, error: null, lastActive: null } as ActivityState}
	/>
</Story>

<!-- Deleted, deactivated, and suspended accounts have no profile but are still followed. -->
<Story name="Unavailable account" asChild>
	<AccountCard
		{...args}
		subject={{ ...base, profile: null }}
		activity={{ status: 'pending', activity: null, error: null, lastActive: null } as ActivityState}
	/>
</Story>

<!-- One subject can be followed more than once; a run deletes every record. -->
<Story name="Followed more than once" asChild>
	<AccountCard
		{...args}
		subject={{ ...base, profile, rkeys: ['aaa', 'bbb', 'ccc'] }}
		activity={ready({ events: busyEvents })}
	/>
</Story>

<!-- Bios carry meaningful line breaks and long unbroken handles; both have to survive. -->
<Story name="Long bio and no display name" asChild>
	<AccountCard
		{...args}
		subject={{
			...base,
			profile: {
				...profile,
				displayName: undefined,
				handle: 'averyveryverylonghandle.example.social',
				description: 'a'.repeat(400)
			}
		}}
		activity={ready({ events: busyEvents })}
	/>
</Story>

<!--
	A month tick landing within days of the window's end.

	`monthTicks` places labels on the first of each month, so the last one can
	sit almost at the right edge of the track. Left-anchored it ran past the
	track and clipped to a fragment — "Septem" — so past 0.9 it is anchored by
	its right edge instead. This is the story that shows it staying inside.
-->
<Story name="Month label at the very end of the window" asChild>
	<AccountCard
		{...args}
		subject={{ ...base, profile }}
		activity={ready({
			events: busyEvents,
			window: { ...fullWindow, end: '2026-09-01T06:00:00Z' }
		})}
	/>
</Story>
