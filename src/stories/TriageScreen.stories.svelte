<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import TriageScreen from '$lib/components/TriageScreen.svelte';
	import { TriageSession } from '$lib/triage/session.svelte';
	import type { ActivityEvent, EventKind, SubjectActivity } from '$lib/atproto/activity';
	import type { FollowSnapshot } from '$lib/storage/db';

	const { Story } = defineMeta({
		title: 'Triage/TriageScreen',
		component: TriageScreen,
		tags: ['autodocs'],
		parameters: { layout: 'fullscreen' }
	});

	/** A fixed "now", so the strip looks the same on every run. */
	const NOW = Date.parse('2026-09-14T12:00:00Z');
	const DAY = 86_400_000;
	const daysAgo = (days: number) => new Date(NOW - days * DAY).toISOString();
	const ev = (kind: EventKind, days: number): ActivityEvent => ({ kind, at: daysAgo(days) });

	const subject: FollowSnapshot = {
		ownerDid: 'did:plc:owner',
		subjectDid: 'did:plc:alice',
		rkeys: ['aaa'],
		followedAt: '2021-06-04T00:00:00Z',
		followsOwner: true,
		loadedAt: '2026-09-11T00:00:00Z',
		profileMissingSince: null,
		profile: {
			did: 'did:plc:alice',
			handle: 'alice.bsky.social',
			displayName: 'Alice Example',
			description: 'Writes about typography and old maps.\n\nReply guy in remission.',
			followersCount: 4210,
			followsCount: 380,
			postsCount: 9134,
			createdAt: '2019-03-02T00:00:00Z'
		}
	};

	const activity: SubjectActivity = {
		subjectDid: 'did:plc:alice',
		events: [
			...Array.from({ length: 30 }, (_, i) => ev('post', 40 + i * 11)),
			...Array.from({ length: 22 }, (_, i) => ev('reply', 55 + i * 14)),
			...Array.from({ length: 9 }, (_, i) => ev('repost', 120 + i * 25)),
			...Array.from({ length: 48 }, (_, i) => ev('like', 35 + i * 7))
		],
		recent: [],
		window: {
			start: daysAgo(365),
			end: new Date(NOW).toISOString(),
			reason: 'lookback',
			truncated: false
		},
		lookbackDays: 365,
		fetchedAt: new Date(NOW).toISOString(),
		likesError: null
	};

	/**
	 * A session parked on one subject, with no network and no storage behind it.
	 *
	 * Built rather than mocked: the screen reads a dozen fields off the session,
	 * and a stub shaped like one would drift from the real thing the first time
	 * a field moved. Nothing here calls `start`, so the scanner stays still.
	 */
	function parked({ marked = 0, decided = false } = {}) {
		const session = new TriageSession();
		session.session = {
			did: 'did:plc:owner',
			handle: 'owner.test',
			pds: 'https://pds.test',
			fetch: async () => new Response(null, { status: 200 })
		};
		session.subjects = [subject];
		session.current = subject;
		session.phase = 'triage';
		session.settings = {
			ownerDid: 'did:plc:owner',
			lookbackDays: 365,
			thresholdDays: 30,
			lastPassCompletedAt: null
		};
		session.scanner.states.set('did:plc:alice', {
			status: 'ready',
			activity,
			error: null,
			lastActive: activity.events[0].at
		});

		// `marked` and `keptCount` read off the decision map, so seeding it is
		// what makes the counters in the status line real.
		for (let i = 0; i < marked; i++) {
			session.decisions.set(`did:plc:marked-${i}`, {
				ownerDid: 'did:plc:owner',
				subjectDid: `did:plc:marked-${i}`,
				decision: 'unfollow',
				decidedAt: new Date(NOW).toISOString()
			});
		}

		if (decided) {
			session.lastAction = {
				kind: 'unfollow',
				subjectDid: 'did:plc:previous',
				label: 'Someone Else',
				seq: 1
			};
		}

		return session;
	}
</script>

<!--
	The whole triage screen. Narrow the viewport past 40rem and the action bar
	leaves the flow and pins itself to the bottom of the window: on a phone the
	card is taller than the screen, and a bar in the flow would mean scrolling
	the entire account past to reach the two buttons — several hundred times.
-->
<Story name="Reviewing an account" asChild>
	<TriageScreen session={parked({ marked: 12 })} />
</Story>

<!--
	Just after a decision. The notice names the account and its fate and offers
	the way back, because a swiped card is gone before the user can re-read who
	it was.
-->
<Story name="With the undo notice up" asChild>
	<TriageScreen session={parked({ marked: 12, decided: true })} />
</Story>

<!-- Nothing marked yet: the counter is plain text rather than a link to a run. -->
<Story name="Nothing marked yet" asChild>
	<TriageScreen session={parked()} />
</Story>
