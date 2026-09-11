<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import AccountCard from '$lib/components/AccountCard.svelte';

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
		postsCount: 9134
	};

	const base = {
		ownerDid: 'did:plc:owner',
		subjectDid: 'did:plc:alice',
		rkeys: ['aaa'],
		followedAt: '2021-06-04T00:00:00Z',
		loadedAt: '2026-09-11T00:00:00Z'
	};
</script>

<Story name="With profile" asChild>
	<AccountCard subject={{ ...base, profile }} />
</Story>

<!-- Bios carry meaningful line breaks and long unbroken handles; both have to survive. -->
<Story name="Long bio and no display name" asChild>
	<AccountCard
		subject={{
			...base,
			profile: {
				...profile,
				displayName: undefined,
				handle: 'averyveryverylonghandle.example.social',
				description: 'a'.repeat(400)
			}
		}}
	/>
</Story>

<!-- One subject can be followed more than once; a run deletes every record. -->
<Story name="Followed more than once" asChild>
	<AccountCard subject={{ ...base, profile, rkeys: ['aaa', 'bbb', 'ccc'] }} />
</Story>

<!-- Deleted, deactivated, and suspended accounts have no profile but are still followed. -->
<Story name="Unavailable account" asChild>
	<AccountCard subject={{ ...base, profile: null }} />
</Story>

<!-- An unparseable createdAt hides the followed date rather than failing the load. -->
<Story name="No followed date" asChild>
	<AccountCard subject={{ ...base, profile, followedAt: null }} />
</Story>
