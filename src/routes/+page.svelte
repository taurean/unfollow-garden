<script lang="ts">
	import { onMount } from 'svelte';
	import SignIn from '$lib/components/SignIn.svelte';
	import LoadingScreen from '$lib/components/LoadingScreen.svelte';
	import TriageScreen from '$lib/components/TriageScreen.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { TriageSession } from '$lib/triage/session.svelte';

	const session = new TriageSession();

	// IndexedDB and sessionStorage exist only in the browser, and the app is
	// client-rendered, so restoring waits for mount rather than running in load.
	onMount(() => {
		session.restore();
	});
</script>

<main>
	{#if session.phase === 'signed-out' || session.phase === 'signing-in'}
		<SignIn
			busy={session.phase === 'signing-in'}
			error={session.error}
			onSignIn={(handle, appPassword) => session.signIn(handle, appPassword)}
		/>
	{:else if session.phase === 'loading'}
		<LoadingScreen progress={session.progress} />
	{:else if session.phase === 'triage'}
		<TriageScreen {session} />
	{:else}
		<section class="done">
			<h1 class="u:fs-4">
				{session.skippedCount > 0 ? 'Only skipped accounts left' : 'Every account reviewed'}
			</h1>
			<p class="u:fs-2">
				{session.keptCount.toLocaleString()} kept · {session.markedCount.toLocaleString()} marked for
				unfollow
			</p>
			{#if session.skippedCount > 0}
				<Button onclick={() => session.reviewSkipped()}>
					Review {session.skippedCount.toLocaleString()} skipped
				</Button>
			{/if}
			<Button data-variant="quiet" onclick={() => session.signOut()}>Sign out</Button>
		</section>
	{/if}
</main>

<style>
	@layer layout {
		.done {
			display: flex;
			flex-direction: column;
			align-items: flex-start;
			gap: var(--space-sm);
			max-inline-size: 40rem;
			margin-inline: auto;
			padding: var(--space-4xl) var(--space-lg);
		}

		h1 {
			margin: 0;
		}

		p {
			margin: 0;
			font-variant-numeric: tabular-nums;
		}

		.done :global(.button[data-variant='quiet']) {
			background-color: transparent;
			color: var(--ink-quiet);
			border: 1px solid var(--hue-z0-divider);
			margin-block-start: var(--space-lg);
		}
	}
</style>
