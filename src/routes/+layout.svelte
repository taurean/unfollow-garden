<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>unfollow.garden</title>
</svelte:head>

<!--
	The wordmark is a tab on the page edge rather than a header bar.
	This app is one long screen the user reads top to bottom several hundred
	times, and a horizontal header would cost that screen a band of height on
	every one of them.
-->
<span class="wordmark">unfollow.garden</span>

{@render children()}

<style>
	@layer layout {
		.wordmark {
			position: fixed;
			top: 0;
			left: 0;
			z-index: var(--layer-tab);

			writing-mode: vertical-rl;
			padding: var(--space-lg) var(--space-2xs);

			font-family: var(--ff-ui);
			font-size: var(--fs-0);
			letter-spacing: 0.08em;
			text-decoration: none;

			background-color: var(--chip-bg);
			color: var(--chip-ink);
		}

		/*
		 * On a phone the edge tab would eat a gutter the content cannot spare,
		 * so it lies down into a band across the top.
		 *
		 * The band stays *fixed* rather than going static: the utility links
		 * opposite it are fixed too, and a static band would scroll out from
		 * under them and leave them floating over the card. Both keep the same
		 * block padding so they read as one bar.
		 *
		 * phone — see the breakpoint note in src/lib/styles/tokens.css
		 */
		@media (max-width: 40rem) {
			.wordmark {
				writing-mode: horizontal-tb;
				display: flex;
				align-items: center;
				inset-inline: 0;
				block-size: var(--top-band);
				padding: 0 var(--space-lg);
			}
		}
	}
</style>
