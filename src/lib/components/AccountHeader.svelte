<script lang="ts">
	import { compact, longDate, relative } from '$lib/format';
	import { identityLink, INVALID_HANDLE } from '$lib/atproto/links';
	import { parseBio } from '$lib/atproto/richtext';
	import type { FollowSnapshot } from '$lib/storage/db';
	import type { IdentityState } from '$lib/triage/identity.svelte';

	let {
		subject,
		identity = { status: 'pending', account: null, history: null, error: null },
		isNew = false
	}: {
		subject: FollowSnapshot;
		/** Who this account used to be, looked up only when there is no profile. */
		identity?: IdentityState;
		/** Followed since the user last finished a full pass. */
		isNew?: boolean;
	} = $props();

	const profile = $derived(subject.profile);

	/*
	 * A carried-over profile is the last one the AppView returned, not a
	 * current one. The card has to say which it is looking at, because "Alice
	 * Example" under a deactivated banner is a name from the past.
	 */
	const gone = $derived(subject.profileMissingSince !== null);

	const link = $derived(identityLink(profile, subject.subjectDid));

	/*
	 * A profile description carries no facets — unlike a post, nothing in the
	 * record marks where a link or a handle is — so they are detected from the
	 * text, the way Bluesky's own client does it.
	 */
	const bio = $derived(parseBio(profile?.description ?? ''));
	const name = $derived(
		profile?.displayName?.trim() ||
			(profile && profile.handle !== INVALID_HANDLE ? profile.handle : null) ||
			'Account unavailable'
	);

	/** The status word, said the way a person would say it. */
	const STATUS_COPY: Record<string, string> = {
		deactivated: 'deactivated by its owner',
		suspended: 'suspended by its server',
		takendown: 'taken down',
		desynchronized: 'out of sync with its server',
		throttled: 'throttled by its server',
		active: 'reachable, but not served by the app view'
	};

	const statusWord = $derived(identity.account?.status ?? null);

	/**
	 * A label worth a chip, said plainly.
	 *
	 * `!no-unauthenticated` is the one most people will meet and the least
	 * self-explanatory: it is the account asking not to be shown to logged-out
	 * viewers, which is also why this app may be seeing less of them.
	 */
	const LABEL_COPY: Record<string, string> = {
		'!no-unauthenticated': 'logged-out viewing off',
		'!warn': 'content warning',
		'!hide': 'hidden by moderation',
		'!takendown': 'taken down',
		porn: 'adult content',
		sexual: 'suggestive',
		nudity: 'nudity',
		'graphic-media': 'graphic media'
	};

	const labels = $derived(
		(profile?.labels ?? []).map((label) => ({
			text: LABEL_COPY[label.val] ?? label.val,
			/* Who said it changes what it means, so it is never left implicit. */
			self: label.src === profile?.did
		}))
	);
</script>

<header class="[ identity ] [ l:columns ]">
	{#if profile?.avatar}
		<img class="avatar" src={profile.avatar} alt="" width="96" height="96" loading="lazy" />
	{:else}
		<div class="avatar" data-state="empty" aria-hidden="true"></div>
	{/if}

	<div class="names">
		<h2 class="u:fs-5">{name}</h2>
		<!--
			Always a link, never a span that merely looks like one. When the
			handle is missing or did not verify, the DID goes to a DID browser,
			which is the only page that can still say anything about an account
			the app view has dropped.
		-->
		<a
			class="handle"
			class:u:fs-2={link.kind === 'handle'}
			class:u:fs-1={link.kind === 'did'}
			data-kind={link.kind}
			href={link.href}
			target="_blank"
			rel="external noreferrer noopener">{link.label}</a
		>

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

	<div class="bio">
		{#if profile?.description}
			<p class="description u:fs-1 u:lh-standard">
				{#each bio as segment, index (index)}{#if segment.kind === 'text'}{segment.text}{:else}<a
							class="in-bio"
							href={segment.href}
							target="_blank"
							rel="external noreferrer noopener">{segment.text}</a
						>{/if}{/each}
			</p>
		{/if}

		{#if gone}
			<!--
				What is known about an account the app view stopped answering
				for. The profile above, if there is one, is the last one seen
				rather than a current one, so this block has to date it.
			-->
			<div class="gone u:fs-1 u:lh-standard">
				<p>
					{#if profile}
						This profile is the last one loaded, {relative(subject.profileMissingSince)}.
					{:else}
						No profile has ever loaded for this account.
					{/if}
					{#if statusWord && statusWord !== 'unknown'}
						Its server reports the account as <strong
							>{STATUS_COPY[statusWord] ?? statusWord}</strong
						>.
					{:else if identity.status === 'loading'}
						Checking its server…
					{:else if identity.status === 'error'}
						{identity.error}
					{/if}
					You still follow it, so unfollowing here still removes the record.
				</p>

				{#if identity.history && identity.history.handles.length > 1}
					<p>
						Previously known as
						{#each identity.history.handles.slice(1) as past, i (past.at)}{i > 0 ? ', ' : ''}<span
								class="past">@{past.handle}</span
							>{/each}.
					</p>
				{/if}

				{#if identity.history && identity.history.hosts.length > 0}
					<p>
						Hosted on {identity.history.hosts[0].host} since {longDate(
							identity.history.hosts[0].at
						)}{#if identity.history.hosts.length > 1}, after {identity.history.hosts.length - 1} earlier
							{identity.history.hosts.length === 2 ? 'host' : 'hosts'}{/if}.
					</p>
				{/if}

				{#if identity.history?.unavailable}
					<p class="caveat">
						This account uses an identity method that publishes no history, so earlier names and
						hosts cannot be looked up.
					</p>
				{:else if identity.status === 'ready'}
					<p class="caveat">
						Whether an account has been deactivated before is not published by atproto, so there is
						no way to tell from here how often this happens.
					</p>
				{/if}
			</div>
		{/if}
	</div>

	<div class="flags">
		{#if isNew}
			<span class="chip" data-state="new">new since your last pass</span>
		{/if}
		{#if subject.followsOwner}
			<span class="chip u:fs-0">follows you</span>
		{/if}
		{#if subject.rkeys.length > 1}
			<span class="chip" data-state="warn">followed {subject.rkeys.length}&times;</span>
		{/if}
		{#if gone && statusWord && statusWord !== 'unknown' && statusWord !== 'active'}
			<span class="chip" data-state="warn">{statusWord}</span>
		{:else if gone}
			<span class="chip" data-state="warn">no profile</span>
		{/if}
		{#if profile?.handle === INVALID_HANDLE}
			<span class="chip" data-state="warn">handle unverified</span>
		{/if}
		{#if subject.subjectDid.startsWith('did:web:')}
			<span class="chip">did:web</span>
		{/if}
		{#each labels as label (label.text)}
			<span class="chip" data-state="label">
				{label.text}{#if label.self}&nbsp;(self){/if}
			</span>
		{/each}
	</div>
</header>

<style>
	@layer layout {
		/*
		 * Four blocks on the shared twelve columns: avatar, name, bio, flags.
		 *
		 * Spans rather than line numbers, so the same rule holds when the grid
		 * drops to six columns and then to two. The proportions are the ones
		 * the design is drawn at — the name block gets four columns because a
		 * display name and a handle need the room, and the bio gets the widest
		 * share because it is the part that decides the call.
		 */
		.avatar {
			grid-column: span 1;
		}

		.names {
			grid-column: span 4;
		}

		.bio {
			grid-column: span 5;
		}

		.flags {
			grid-column: span 2;
		}

		/*
		 * `block-size: auto` is load-bearing. The `width` and `height`
		 * attributes on the image map to presentational `height: 96px`, and
		 * `aspect-ratio` only sizes an axis that is `auto` — so without this
		 * the avatar took the column's width and the attribute's height and
		 * rendered as a stretched rounded rectangle rather than a circle.
		 */
		.avatar,
		.avatar[data-state='empty'] {
			inline-size: 100%;
			max-inline-size: 5.5rem;
			block-size: auto;
			aspect-ratio: 1;
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

		/*
		 * An anchor in every case. This used to be a span whenever the handle
		 * was missing, and it kept the hover underline — a DID that offered to
		 * be clicked and then did nothing.
		 */
		.handle {
			color: var(--ink-quiet);
			text-decoration: none;
			overflow-wrap: anywhere;
		}

		.handle:hover {
			text-decoration: underline;
		}

		/* A DID is an identifier, not a name: monospace so it can be compared. */
		.handle[data-kind='did'] {
			font-family: var(--ff-mono);
		}

		/*
		 * Underlined at rest, unlike the handle above. These sit inside a
		 * paragraph with no other cue that part of it is a link, and a bio is
		 * exactly where someone puts the thing they want you to go and read.
		 */
		.in-bio {
			color: inherit;
			text-decoration: underline;
			text-underline-offset: 0.15em;
			overflow-wrap: anywhere;
		}

		.in-bio:hover {
			color: var(--ink);
			text-decoration-thickness: 2px;
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
			display: flex;
			flex-direction: column;
			gap: var(--space-sm);
		}

		.bio p {
			margin: 0;
			overflow-wrap: anywhere;
		}

		/*
		 * Only the bio itself keeps its line breaks — that is the author's
		 * formatting and the point of showing it. App-written prose beside it
		 * must not, or the template's own indentation renders as ragged gaps
		 * in the middle of a sentence.
		 */
		.description {
			white-space: pre-wrap;
		}

		/*
		 * The absence of a profile is a finding, not a blank. It gets the quiet
		 * treatment used elsewhere for app-voice text rather than a panel,
		 * because the page groups with whitespace and not with borders.
		 */
		.gone {
			font-family: var(--ff-ui);
			color: var(--ink-quiet);
			display: flex;
			flex-direction: column;
			gap: var(--space-xs);
		}

		.gone strong {
			color: var(--ink);
			font-weight: 600;
		}

		.gone .past {
			font-family: var(--ff-mono);
			color: var(--ink);
		}

		/* A limit of the data, set below the data it qualifies. */
		.gone .caveat {
			font-size: var(--fs-0);
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

		/*
		 * Every chip states its meaning in words. Colour separates the kinds at
		 * a glance and carries none of the meaning on its own, which is the
		 * floor this project holds itself to (PRD, "Interface").
		 */
		.chip[data-state='new'] {
			color: var(--keep);
		}

		.chip[data-state='label'] {
			font-family: var(--ff-mono);
			font-size: var(--fs-0);
		}

		/*
		 * wide — six columns. The bio no longer fits beside the name without
		 * both becoming slivers, so it takes a row of its own and the flags
		 * follow it. See the breakpoint note in src/lib/styles/tokens.css.
		 */
		@media (max-width: 60rem) {
			.avatar {
				grid-column: span 1;
			}
			.names {
				grid-column: span 5;
			}
			.bio,
			.flags {
				grid-column: 1 / -1;
			}
			.flags {
				justify-self: start;
			}
		}

		/*
		 * phone — the grid stops being equal columns.
		 *
		 * At this width there are only two of them, so an avatar occupying one
		 * would take half the screen to hold a 3.5rem circle and strand the
		 * name against the far edge. The avatar gets the width it needs and the
		 * name takes the rest, which is the same relationship the wide layout
		 * has, just without the ceremony of a column to sit in.
		 */
		@media (max-width: 40rem) {
			.identity {
				grid-template-columns: auto 1fr;
			}

			.avatar,
			.names {
				grid-column: auto;
			}

			/*
			 * A smaller avatar, because on a phone the name and handle are
			 * what identifies the account and they are competing with it for
			 * the same line.
			 */
			/*
			 * An explicit width, not a capped percentage. The track here is
			 * `auto`, and `inline-size: 100%` of a track sized to its contents
			 * resolves to nothing — the avatar vanished entirely.
			 */
			.avatar,
			.avatar[data-state='empty'] {
				inline-size: 3.5rem;
				max-inline-size: none;
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
