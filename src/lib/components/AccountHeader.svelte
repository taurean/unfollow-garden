<script lang="ts">
	import { compact } from '$lib/format';
	import type { FollowSnapshot } from '$lib/storage/db';

	let { subject }: { subject: FollowSnapshot } = $props();

	const profile = $derived(subject.profile);
	const name = $derived(profile?.displayName?.trim() || profile?.handle || 'Account unavailable');
</script>

<header class="identity">
	{#if profile?.avatar}
		<img class="avatar" src={profile.avatar} alt="" width="96" height="96" loading="lazy" />
	{:else}
		<div class="avatar" data-state="empty" aria-hidden="true"></div>
	{/if}

	<div class="names">
		<h2 class="u:fs-5">{name}</h2>
		{#if profile}
			<a
				class="handle u:fs-2"
				href="https://bsky.app/profile/{profile.handle}"
				target="_blank"
				rel="noreferrer noopener">@{profile.handle}</a
			>
		{:else}
			<span class="handle u:fs-1">{subject.subjectDid}</span>
		{/if}

		{#if profile}
			<dl class="counts tabular">
				<div>
					<dd class="u:fs-3">{compact(profile.followersCount)}</dd>
					<dt class="u:fs-0">Followers</dt>
				</div>
				<div>
					<dd class="u:fs-3">{compact(profile.followsCount)}</dd>
					<dt class="u:fs-0">Following</dt>
				</div>
				<div>
					<dd class="u:fs-3">{compact(profile.postsCount)}</dd>
					<dt class="u:fs-0">Posts</dt>
				</div>
			</dl>
		{/if}
	</div>

	<p class="bio u:fs-1 u:lh-standard">
		{#if profile?.description}
			{profile.description}
		{:else if !profile}
			No profile could be loaded. The account may be deleted, deactivated, or suspended. You still
			follow it, so unfollowing here still removes the record.
		{/if}
	</p>

	<div class="flags">
		{#if subject.followsOwner}
			<span class="chip u:fs-0">follows you</span>
		{/if}
		{#if subject.rkeys.length > 1}
			<span class="chip" data-state="warn">followed {subject.rkeys.length}&times;</span>
		{/if}
	</div>
</header>

<style>
	@layer layout {
		/*
		 * Four columns that collapse to a stack: the flags sit far right on a
		 * wide screen and directly under the name on a narrow one, where a
		 * right-aligned badge would be stranded.
		 */
		.identity {
			display: grid;
			grid-template-columns: auto minmax(16rem, 1fr) minmax(0, 1.4fr) auto;
			gap: var(--space-lg) var(--space-xl);
			align-items: start;
		}

		.avatar {
			inline-size: 5.5rem;
			block-size: 5.5rem;
			border-radius: var(--radius-pill);
			object-fit: cover;
		}

		.avatar[data-state='empty'] {
			background-color: var(--strip-empty);
		}

		.names {
			display: flex;
			flex-direction: column;
			gap: var(--space-3xs);
			min-inline-size: 0;
		}

		h2 {
			margin: 0;
			line-height: 1.1;
			overflow-wrap: anywhere;
		}

		.handle {
			color: var(--ink-quiet);
			text-decoration: none;
			overflow-wrap: anywhere;
		}

		.handle:hover {
			text-decoration: underline;
		}

		.counts {
			display: flex;
			gap: var(--space-lg);
			margin: var(--space-sm) 0 0;
		}

		/* Figure over label: the number is what is being compared. */
		.counts div {
			display: flex;
			flex-direction: column;
		}

		dd {
			margin: 0;
		}

		dt {
			font-family: var(--ff-ui);
			color: var(--ink-quiet);
		}

		.bio {
			margin: 0;
			/* Bios carry meaningful line breaks; keeping them is the point. */
			white-space: pre-wrap;
			overflow-wrap: anywhere;
		}

		.flags {
			display: flex;
			flex-wrap: wrap;
			gap: var(--space-2xs);
			justify-self: end;
		}

		.chip {
			font-family: var(--ff-ui);
			font-size: var(--fs-0);
			background-color: var(--chip-bg);
			color: var(--chip-ink);
			padding: var(--space-3xs) var(--space-sm);
			border-radius: var(--radius-pill);
			white-space: nowrap;
		}

		.chip[data-state='warn'] {
			color: var(--warn-ink);
		}

		/* wide — see the breakpoint note in src/lib/styles/tokens.css */
		@media (max-width: 60rem) {
			.identity {
				grid-template-columns: auto 1fr;
			}
			.bio,
			.flags {
				grid-column: 1 / -1;
			}
			.flags {
				justify-self: start;
			}
		}

		/* phone */
		@media (max-width: 40rem) {
			.identity {
				gap: var(--space-lg);
			}

			/*
			 * A smaller avatar, because on a phone the name and handle are
			 * what identifies the account and they are competing with it for
			 * the same line.
			 */
			.avatar {
				inline-size: 3.5rem;
				block-size: 3.5rem;
			}

			/*
			 * The three figures keep their row but lose the generous gap: they
			 * are read together, so wrapping them would break the comparison
			 * they exist for.
			 */
			.counts {
				gap: var(--space-medium);
			}

			/*
			 * A long bio is a scroll's worth of text above the decision. It is
			 * capped and scrollable rather than truncated, because a bio is
			 * often exactly where the reason to keep someone is written.
			 */
			.bio {
				max-block-size: 9lh;
				overflow-y: auto;
				overscroll-behavior: contain;
			}
		}
	}
</style>
