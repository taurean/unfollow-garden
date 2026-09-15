<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import SwipeCard from '$lib/components/SwipeCard.svelte';
	import { fn } from 'storybook/test';

	const { Story } = defineMeta({
		title: 'Triage/SwipeCard',
		component: SwipeCard,
		tags: ['autodocs'],
		args: { oncommit: fn() }
	});
</script>

<!--
	The gesture surface, with a stand-in for the account inside it.

	Drag it: right past about a quarter of its width keeps, left unfollows, and
	down skips — the last only when the page is already scrolled to the top,
	which in a story frame it always is. Release short of the threshold and it
	springs back, because a gesture has to be abandonable.

	The affordance is what to look at. The tint and the word appear behind the
	card and fade in with travel, so the intent is readable *before* release
	rather than discovered after it. The word matters as much as the colour:
	keep and unfollow are never told apart by hue alone (PRD, "Interface").
-->
<Story name="Draggable" asChild>
	<SwipeCard oncommit={fn()}>
		<div
			style="
				display: grid;
				place-items: center;
				min-block-size: 18rem;
				padding: var(--space-xl);
				border: 1px solid var(--hue-z0-divider);
				border-radius: var(--radius-lg);
				background-color: var(--surface-raised);
				font-family: var(--ff-ui);
				text-align: center;
			"
		>
			Drag me — right keeps, left unfollows, down skips
		</div>
	</SwipeCard>
</Story>

<!--
	A card taller than the viewport, which is the phone case.

	The surface keeps `touch-action: pan-y`, so a vertical drag still scrolls
	the page and only a *horizontal* one is claimed. This is the story for
	checking that the page has not been made to feel stuck.
-->
<Story name="Taller than the viewport" asChild>
	<SwipeCard oncommit={fn()}>
		<div
			style="
				display: grid;
				place-items: center;
				min-block-size: 140vh;
				padding: var(--space-xl);
				border: 1px solid var(--hue-z0-divider);
				border-radius: var(--radius-lg);
				background-color: var(--surface-raised);
				font-family: var(--ff-ui);
				text-align: center;
			"
		>
			Vertical drags still scroll. Horizontal ones are still decisions.
		</div>
	</SwipeCard>
</Story>

<!--
	Gesture off. The card is inert while one is already leaving, so a fast
	second swipe cannot land on an account that has stopped meaning anything.
-->
<Story name="Gesture disabled" asChild>
	<SwipeCard enabled={false} oncommit={fn()}>
		<div
			style="
				display: grid;
				place-items: center;
				min-block-size: 12rem;
				padding: var(--space-xl);
				border: 1px solid var(--hue-z0-divider);
				border-radius: var(--radius-lg);
				background-color: var(--surface-raised);
				font-family: var(--ff-ui);
				opacity: 0.6;
			"
		>
			This one does not move
		</div>
	</SwipeCard>
</Story>
