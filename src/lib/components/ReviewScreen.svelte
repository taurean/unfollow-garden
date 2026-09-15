<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import { exact, longDate, relative } from '$lib/format';
	import type { TriageSession } from '$lib/triage/session.svelte';

	let { session }: { session: TriageSession } = $props();

	const marked = $derived(session.marked);

	/** Last active from the scan, so the list shows why each one is here. */
	const lastActive = (subjectDid: string) => session.scanner.get(subjectDid).lastActive;
</script>

<section class="[ review ] [ l:stage ]">
	<header>
		<h1 class="u:fs-5">
			{marked.length === 0
				? 'Nothing marked to unfollow'
				: `Unfollow ${exact(marked.length)} account${marked.length === 1 ? '' : 's'}`}
		</h1>
		<p class="lede u:fs-2 u:lh-standard">
			{#if marked.length === 0}
				Every account you marked has since been kept. Nothing will be sent.
			{:else}
				These follow records will be deleted from your repo. Each one can still be kept. Nothing is
				sent until you start the run.
			{/if}
		</p>
	</header>

	{#if session.runs.error}
		<p class="error u:fs-1" role="alert">{session.runs.error}</p>
	{/if}

	{#if marked.length > 0}
		<ul>
			{#each marked as subject (subject.subjectDid)}
				<li>
					{#if subject.profile?.avatar}
						<img src={subject.profile.avatar} alt="" width="40" height="40" loading="lazy" />
					{:else}
						<div class="avatar-empty" aria-hidden="true"></div>
					{/if}

					<div class="who">
						<span class="name u:fs-2"
							>{subject.profile?.displayName ||
								subject.profile?.handle ||
								'Account unavailable'}</span
						>
						<span class="handle u:fs-0"
							>{subject.profile ? `@${subject.profile.handle}` : subject.subjectDid}</span
						>
					</div>

					<span class="when u:fs-0 tabular">
						{#if lastActive(subject.subjectDid)}
							last active {relative(lastActive(subject.subjectDid))}
						{:else if session.scanner.get(subject.subjectDid).status === 'ready'}
							no activity in the last {session.settings.lookbackDays} days
						{:else}
							followed {longDate(subject.followedAt)}
						{/if}
					</span>

					<Button data-variant="quiet" onclick={() => session.keepInstead(subject.subjectDid)}>
						Keep
					</Button>
				</li>
			{/each}
		</ul>
	{/if}

	<div class="actions">
		{#if marked.length > 0}
			<Button
				data-variant="unfollow"
				disabled={session.runs.busy}
				onclick={() => session.startRun()}
			>
				Unfollow {exact(marked.length)} account{marked.length === 1 ? '' : 's'}
			</Button>
		{/if}
		<Button data-variant="quiet" onclick={() => session.backToTriage()}>Back to the queue</Button>
	</div>
</section>

<style>
	@layer layout {
		.review {
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

		.error {
			margin: 0;
			font-family: var(--ff-ui);
			color: var(--danger-ink);
		}

		ul {
			list-style: none;
			margin: 0;
			padding: 0;
			display: flex;
			flex-direction: column;
		}

		/* A hairline per row rather than a card each: grouping by whitespace
		   stops working at a hundred rows of the same shape. */
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

		.actions {
			display: flex;
			flex-wrap: wrap;
			gap: var(--space-sm);
		}

		.actions :global(.button[data-variant='unfollow']) {
			background-color: var(--unfollow);
		}

		.actions :global(.button[data-variant='unfollow']:hover:not(:disabled)) {
			background-color: var(--unfollow-hover);
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
			 * The per-row Keep button drops to its own line rather than
			 * squeezing the name: at this width a four-column row leaves the
			 * handle about six characters, and the handle is how the row is
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

			.actions {
				position: sticky;
				inset-block-end: 0;
				flex-direction: column;
				align-items: stretch;
				margin-inline: calc(var(--space-lg) * -1);
				padding: var(--space-sm) var(--space-lg);
				padding-block-end: calc(var(--space-sm) + env(safe-area-inset-bottom, 0px));
				background-color: var(--surface-raised);
				border-block-start: 1px solid var(--hue-z0-divider);
			}
		}
	}
</style>
