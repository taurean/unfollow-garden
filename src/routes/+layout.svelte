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
			z-index: 1;

			writing-mode: vertical-rl;
			padding: var(--space-lg) var(--space-2xs);

			font-family: var(--ff-ui);
			font-size: var(--fs-0);
			letter-spacing: 0.08em;
			text-decoration: none;

			background-color: var(--chip-bg);
			color: var(--chip-ink);
		}

		/* On a phone the edge tab would eat a gutter the content cannot spare. */
		@media (max-width: 40rem) {
			.wordmark {
				position: static;
				writing-mode: horizontal-tb;
				display: block;
				padding: var(--space-2xs) var(--space-lg);
			}
		}
	}
</style>
