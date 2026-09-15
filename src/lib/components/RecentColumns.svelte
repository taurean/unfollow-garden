<script lang="ts">
	import { EVENT_KINDS, type EventKind, type RecentItem } from '$lib/atproto/activity';
	import { relative } from '$lib/format';

	let { recent }: { recent: readonly RecentItem[] } = $props();

	const HEADING: Record<EventKind, string> = {
		post: 'Posts',
		reply: 'Replies',
		repost: 'Reposts',
		like: 'Likes'
	};

	/** How the attribution reads, which differs by what the subject did. */
	const PREPOSITION: Record<EventKind, string> = {
		post: '',
		reply: 'replying to',
		repost: 'by',
		like: 'by'
	};

	const columns = $derived(
		EVENT_KINDS.map((kind) => ({
			kind,
			items: recent.filter((item) => item.kind === kind)
		}))
	);
</script>

<div class="columns">
	{#each columns as column (column.kind)}
		<section>
			<h3 class="u:fs-0">{HEADING[column.kind]}</h3>

			{#if column.items.length === 0}
				<p class="empty u:fs-1">None in this window.</p>
			{:else}
				<ol>
					{#each column.items as item (item.url + item.at)}
						<li>
							{#if item.attribution}
								<p class="attribution u:fs-0">
									{PREPOSITION[column.kind]} @{item.attribution}
								</p>
							{/if}

							<p class="text u:fs-1 u:lh-standard">
								{item.text || '—'}
							</p>

							<p class="meta u:fs-0">
								<!-- rel="external": the URL is built at runtime, so the router
							     cannot tell it leaves the app without being told. -->
								<a href={item.url} target="_blank" rel="external noreferrer noopener">
									{relative(item.at)}
								</a>
								{#each item.media as note (note)}
									<span class="note">{note}</span>
								{/each}
							</p>
						</li>
					{/each}
				</ol>
			{/if}
		</section>
	{/each}
</div>

<style>
	@layer layout {
		/*
		 * Four columns of the same width, wrapping rather than shrinking: these
		 * are read one column at a time, and a column narrower than about 14rem
		 * breaks post text into unreadable slivers.
		 */
		.columns {
			display: grid;
			grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
			gap: var(--space-xl);
		}

		h3 {
			font-family: var(--ff-ui);
			font-weight: 600;
			margin: 0 0 var(--space-lg);
			color: var(--ink-quiet);
		}

		ol {
			list-style: none;
			margin: 0;
			padding: 0;
			display: flex;
			flex-direction: column;
			gap: var(--space-lg);
		}

		li {
			display: flex;
			flex-direction: column;
			gap: var(--space-3xs);
		}

		p {
			margin: 0;
		}

		.text {
			/* Posts carry meaningful line breaks, and a long one is truncated
			   rather than allowed to set the height of the whole row. */
			white-space: pre-wrap;
			overflow-wrap: anywhere;
			display: -webkit-box;
			-webkit-box-orient: vertical;
			-webkit-line-clamp: 5;
			line-clamp: 5;
			overflow: hidden;
		}

		.attribution,
		.meta,
		.empty {
			font-family: var(--ff-ui);
			color: var(--ink-quiet);
		}

		.meta {
			display: flex;
			flex-wrap: wrap;
			gap: var(--space-xs);
			align-items: center;
		}

		.meta a {
			color: inherit;
			text-decoration: none;
		}

		.meta a:hover {
			text-decoration: underline;
		}

		/* Media notes stop a text-free post being misread as an empty one. */
		.note {
			background-color: var(--chip-bg);
			color: var(--chip-ink);
			padding: 0 var(--space-2xs);
			border-radius: 2px;
		}
	}
</style>
