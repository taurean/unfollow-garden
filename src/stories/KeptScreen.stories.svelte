<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import KeptScreen from '$lib/components/KeptScreen.svelte';
	import { TriageSession } from '$lib/triage/session.svelte';
	import type { FollowSnapshot } from '$lib/storage/db';

	const { Story } = defineMeta({
		title: 'Triage/KeptScreen',
		component: KeptScreen,
		tags: ['autodocs'],
		parameters: { layout: 'fullscreen' }
	});

	function subject(did: string, handle: string, displayName?: string): FollowSnapshot {
		return {
			ownerDid: 'did:plc:owner',
			subjectDid: did,
			rkeys: ['aaa'],
			followedAt: '2021-06-04T00:00:00Z',
			followsOwner: null,
			loadedAt: '2026-09-11T00:00:00Z',
			profileMissingSince: null,
			profile: { did, handle, displayName }
		};
	}

	/** A session holding kept subjects, with storage and the network left out. */
	function parked(entries: Array<[FollowSnapshot, string]>) {
		const session = new TriageSession();
		session.session = {
			did: 'did:plc:owner',
			handle: 'owner.test',
			pds: 'https://pds.test',
			fetch: async () => new Response(null, { status: 200 })
		};
		session.subjects = entries.map(([s]) => s);
		for (const [s, decidedAt] of entries) {
			session.decisions.set(s.subjectDid, {
				ownerDid: 'did:plc:owner',
				subjectDid: s.subjectDid,
				decision: 'keep',
				decidedAt
			});
		}
		session.phase = 'kept';
		return session;
	}

	const roster: Array<[FollowSnapshot, string]> = [
		[subject('did:plc:alice', 'alice.bsky.social', 'Alice Example'), '2026-09-14T10:00:00Z'],
		[
			subject('did:plc:bob', 'bob.example.com', 'Bob With A Rather Long Display Name'),
			'2026-09-13T10:00:00Z'
		],
		[subject('did:plc:carol', 'carol.bsky.social'), '2026-08-01T10:00:00Z'],
		[
			{
				...subject('did:plc:ghost', 'x'),
				profile: null,
				profileMissingSince: '2026-09-01T00:00:00Z'
			},
			'2026-07-04T10:00:00Z'
		]
	];
</script>

<!--
	The ordinary case: kept accounts newest first, each still switchable to
	unfollow, and one that has gone dark since it was kept.
-->
<Story name="Accounts kept" asChild>
	<KeptScreen session={parked(roster)} />
</Story>

<!--
	Before anything has been decided. The copy has to explain what the list is
	for rather than leaving an empty page.
-->
<Story name="Nothing kept yet" asChild>
	<KeptScreen session={parked([])} />
</Story>
