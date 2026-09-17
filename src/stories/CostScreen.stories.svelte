<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import CostScreen from '$lib/components/CostScreen.svelte';
	import { TriageSession } from '$lib/triage/session.svelte';

	const { Story } = defineMeta({
		title: 'Triage/CostScreen',
		component: CostScreen,
		tags: ['autodocs'],
		parameters: { layout: 'fullscreen' }
	});

	function parked(counts: Record<string, number>) {
		const session = new TriageSession();
		session.meter.counts = { ownerDid: 'did:plc:owner', ...counts } as never;
		session.phase = 'cost';
		return session;
	}
</script>

<!-- A real follow list of about 640 accounts, fully scanned. -->
<Story name="A finished review" asChild>
	<CostScreen
		session={parked({
			follows: 641,
			profiles: 641,
			relationships: 641,
			posts: 255729,
			likes: 191796
		})}
	/>
</Story>

<!-- Nothing fetched: the page has to say so rather than showing an empty table. -->
<Story name="Nothing fetched yet" asChild>
	<CostScreen session={parked({ follows: 0, profiles: 0, relationships: 0, posts: 0, likes: 0 })} />
</Story>
