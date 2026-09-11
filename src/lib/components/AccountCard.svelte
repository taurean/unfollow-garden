<script lang="ts">
	import type { FollowSnapshot } from '$lib/storage/db';

	let { subject }: { subject: FollowSnapshot } = $props();

	const profile = $derived(subject.profile);
	const followedAt = $derived(
		subject.followedAt
			? new Date(subject.followedAt).toLocaleDateString(undefined, {
					year: 'numeric',
					month: 'long',
					day: 'numeric'
				})
			: null
	);
</script>

<article class="account">
	{#if profile}
		<header>
			{#if profile.avatar}
				<img class="avatar" src={profile.avatar} alt="" width="64" height="64" />
			{:else}
				<div class="avatar avatar--empty" aria-hidden="true"></div>
			{/if}
			<div class="identity">
				<h2 class="u:fs-3">{profile.displayName || profile.handle}</h2>
				<a
					class="handle u:fs-1"
					href="https://bsky.app/profile/{profile.handle}"
					target="_blank"
					rel="noreferrer noopener">@{profile.handle}</a
				>
			</div>
		</header>

		{#if profile.description}
			<p class="bio u:fs-2 u:lh-standard">{profile.description}</p>
		{/if}

		<dl class="stats u:fs-1">
			<div>
				<dt>Followers</dt>
				<dd>{(profile.followersCount ?? 0).toLocaleString()}</dd>
			</div>
			<div>
				<dt>Following</dt>
				<dd>{(profile.followsCount ?? 0).toLocaleString()}</dd>
			</div>
			<div>
				<dt>Posts</dt>
				<dd>{(profile.postsCount ?? 0).toLocaleString()}</dd>
			</div>
			{#if followedAt}
				<div>
					<dt>You followed</dt>
					<dd>{followedAt}</dd>
				</div>
			{/if}
		</dl>

		{#if subject.rkeys.length > 1}
			<p class="note u:fs-0">
				You follow this account {subject.rkeys.length} times. All of those follow records would be removed.
			</p>
		{/if}
	{:else}
		<header>
			<div class="avatar avatar--empty" aria-hidden="true"></div>
			<div class="identity">
				<h2 class="u:fs-3">Account unavailable</h2>
				<span class="handle u:fs-1">{subject.subjectDid}</span>
			</div>
		</header>
		<p class="bio u:fs-2 u:lh-standard">
			No profile could be loaded. The account may be deleted, deactivated, or suspended. You are
			still following it, so unfollowing here still removes the record.
		</p>
	{/if}
</article>

<style>
	.account {
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
	}

	header {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
	}

	.avatar {
		inline-size: 4rem;
		block-size: 4rem;
		border-radius: 50%;
		object-fit: cover;
		flex-shrink: 0;
	}

	.avatar--empty {
		background-color: var(--hue-slate-200);
	}

	.identity {
		display: flex;
		flex-direction: column;
		gap: var(--space-5xs);
		min-inline-size: 0;
	}

	h2 {
		font-family: var(--ff-heading);
		margin: 0;
		overflow-wrap: anywhere;
	}

	.handle {
		color: var(--hue-slate-600);
		text-decoration: none;
		overflow-wrap: anywhere;
	}

	.handle:hover {
		text-decoration: underline;
	}

	.bio {
		margin: 0;
		/* Bios carry meaningful line breaks; keeping them is the point. */
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		max-width: 60ch;
	}

	.stats {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-lg);
		margin: 0;
		font-variant-numeric: tabular-nums;
	}

	.stats div {
		display: flex;
		flex-direction: column;
		gap: var(--space-5xs);
	}

	dt {
		color: var(--hue-slate-600);
	}

	dd {
		margin: 0;
		font-weight: 600;
	}

	.note {
		margin: 0;
		color: var(--hue-amber-700);
	}

	@media (prefers-color-scheme: dark) {
		.avatar--empty {
			background-color: var(--hue-slate-800);
		}
		.handle,
		dt {
			color: var(--hue-slate-400);
		}
		.note {
			color: var(--hue-amber-400);
		}
	}
</style>
