<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import { identityLink } from '$lib/atproto/links';
	import { exact, longDate, relative } from '$lib/format';
	import type { TriageSession } from '$lib/triage/session.svelte';

	let { session }: { session: TriageSession } = $props();

	let filter = $state('');

	/**
	 * A kept list runs to thousands of rows, which is past the point where
	 * scrolling is a way of finding anything. Matching covers the display name,
	 * the handle, and the DID, because any of the three might be what someone
	 * remembers about an account.
	 */
	const shown = $derived.by(() => {
		const needle = filter.trim().toLowerCase();
		if (!needle) return session.kept;
		return session.kept.filter((subject) =>
			[subject.profile?.displayName, subject.profile?.handle, subject.subjectDid]
				.filter((field): field is string => Boolean(field))
				.some((field) => field.toLowerCase().includes(needle))
		);
	});

	const decidedAt = (subjectDid: string) => session.decisions.get(subjectDid)?.decidedAt ?? null;
</script>

<section class="[ kept ] [ l:stage ]">
	<header>
		<h1 class="u:fs-5">
			{session.kept.length === 0
				? 'Nothing kept yet'
				: `${exact(session.kept.length)} account${session.kept.length === 1 ? '' : 's'} kept`}
		</h1>
		<p class="lede u:fs-2 u:lh-standard">
			{#if session.kept.length === 0}
				Accounts you keep are recorded here, so a later pass only has to deal with what is new.
			{:else}
				These are decided and out of the queue. A later pass through your follows will only offer
				what you have not seen. Any of them can still be marked for unfollow.
			{/if}
		</p>
	</header>

	{#if session.kept.length > 0}
		<!--
			A real form control, not a div that listens for keys. It is also the
			only interactive element on the screen that is not a button.
		-->
		<label class="find">
			<span class="u:fs-0">Find an account</span>
			<input
				type="search"
				bind:value={filter}
				placeholder="name, handle, or DID"
				autocomplete="off"
			/>
		</label>

		{#if shown.length === 0}
			<p class="empty u:fs-1" role="status">Nothing kept matches “{filter.trim()}”.</p>
		{:else}
			<ul>
				{#each shown as subject (subject.subjectDid)}
					{@const link = identityLink(subject.profile, subject.subjectDid)}
					<li>
						{#if subject.profile?.avatar}
							<img src={subject.profile.avatar} alt="" width="40" height="40" loading="lazy" />
						{:else}
							<div class="avatar-empty" aria-hidden="true"></div>
						{/if}

						<div class="who">
							<span class="name u:fs-2">
								{subject.profile?.displayName || subject.profile?.handle || 'Account unavailable'}
							</span>
							<a
								class="handle u:fs-0"
								data-kind={link.kind}
								href={link.href}
								target="_blank"
								rel="external noreferrer noopener">{link.label}</a
							>
						</div>

						<span class="when u:fs-0 tabular">
							{#if decidedAt(subject.subjectDid)}
								kept {relative(decidedAt(subject.subjectDid))}
							{:else}
								followed {longDate(subject.followedAt)}
							{/if}
						</span>

						<Button
							data-variant="quiet"
							onclick={() => session.unfollowInstead(subject.subjectDid)}
						>
							Unfollow instead
						</Button>
					</li>
				{/each}
			</ul>
		{/if}
	{/if}

	<div class="actions">
		<Button data-variant="quiet" onclick={() => session.backToTriage()}>Back to the queue</Button>
	</div>
</section>

<style>
	@layer layout {
		.kept {
			display: flex;
			flex-direction: column;
			gap: var(--space-xl);
			--stage-width: 56rem;
		}

		h1 {
			margin: 0;
		}

		.lede {
			margin: var(--space-sm) 0 0;
			max-inline-size: 60ch;
			color: var(--ink-quiet);
		}

		.find {
			display: flex;
			flex-direction: column;
			gap: var(--space-2xs);
			max-inline-size: 24rem;
		}

		.find span {
			font-family: var(--ff-ui);
			color: var(--ink-quiet);
		}

		input {
			font: inherit;
			font-size: var(--fs-1);
			padding: var(--space-sm) var(--space-medium);
			min-block-size: var(--tap-min);
			border: 1px solid var(--hue-z0-divider);
			border-radius: var(--radius-md);
			background-color: var(--surface-raised);
			color: var(--ink);
		}

		.empty {
			margin: 0;
			font-family: var(--ff-ui);
			color: var(--ink-quiet);
		}

		ul {
			list-style: none;
			margin: 0;
			padding: 0;
			display: flex;
			flex-direction: column;
		}

		/* A hairline per row rather than a card each, matching the review list:
		   grouping by whitespace stops working at a hundred rows of one shape. */
		li {
			display: grid;
			grid-template-columns: auto minmax(0, 1fr) auto auto;
			align-items: center;
			gap: var(--space-lg);
			padding-block: var(--space-sm);
			border-block-end: 1px solid var(--hue-z0-divider);
		}

		img,
		.avatar-empty {
			inline-size: 2.5rem;
			block-size: 2.5rem;
			border-radius: var(--radius-pill);
			object-fit: cover;
		}

		.avatar-empty {
			background-color: var(--strip-empty);
		}

		.who {
			display: flex;
			flex-direction: column;
			min-inline-size: 0;
		}

		.name {
			overflow-wrap: anywhere;
		}

		.handle,
		.when {
			font-family: var(--ff-ui);
			color: var(--ink-quiet);
			overflow-wrap: anywhere;
		}

		.handle {
			text-decoration: none;
		}

		.handle:hover {
			text-decoration: underline;
		}

		/* A DID is an identifier, not a name — same as on the card. */
		.handle[data-kind='did'] {
			font-family: var(--ff-mono);
		}

		.actions {
			display: flex;
			flex-wrap: wrap;
			gap: var(--space-sm);
		}

		.actions :global(.button[data-variant='quiet']),
		li :global(.button[data-variant='quiet']) {
			min-block-size: var(--tap-min);
			background-color: transparent;
			color: var(--ink-quiet);
			border: 1px solid var(--hue-z0-divider);
		}

		.actions :global(.button[data-variant='quiet']:hover:not(:disabled)),
		li :global(.button[data-variant='quiet']:hover:not(:disabled)) {
			color: var(--ink);
		}

		/* phone — see the breakpoint note in src/lib/styles/tokens.css */
		@media (max-width: 40rem) {
			/*
			 * The per-row button drops to its own line rather than squeezing
			 * the name, as on the review screen: a four-column row leaves the
			 * handle about six characters, and the handle is how a row is
			 * recognised.
			 */
			li {
				grid-template-columns: auto minmax(0, 1fr);
				gap: var(--space-sm) var(--space-lg);
				padding-block: var(--space-lg);
			}

			.when {
				grid-column: 2 / -1;
			}

			li :global(.button[data-variant='quiet']) {
				grid-column: 2 / -1;
				justify-self: start;
			}
		}
	}
</style>
