<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import CostNote from '$lib/components/CostNote.svelte';

	const { Story } = defineMeta({
		title: 'Triage/CostNote',
		component: CostNote,
		tags: ['autodocs']
	});

	const none = {
		ownerDid: 'did:plc:owner',
		follows: 0,
		profiles: 0,
		relationships: 0,
		posts: 0,
		likes: 0
	};
</script>

<!-- A review of about 1,200 accounts, most of the way through its first scan. -->
<Story name="A review in progress" asChild>
	<CostNote
		counts={{
			...none,
			follows: 1204,
			profiles: 1204,
			relationships: 1204,
			posts: 28400,
			likes: 16920
		}}
	/>
</Story>

<!-- Just signed in: nothing fetched, so the line is absent rather than zero. -->
<Story name="Nothing fetched yet" asChild>
	<CostNote counts={none} />
</Story>
