<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';

	let {
		onSignIn,
		busy = false,
		error = null
	}: {
		onSignIn: (handle: string, appPassword: string) => void;
		busy?: boolean;
		error?: string | null;
	} = $props();

	let handle = $state('');
	let appPassword = $state('');
</script>

<section class="sign-in">
	<!-- The product is `unfollow.garden`; `unfollow-garden` is only the repo. -->
	<h1 class="u:fs-6">unfollow.garden</h1>
	<p class="lede u:fs-2 u:lh-standard">
		Review every account you follow, one at a time. Nothing is unfollowed until you review the full
		list and start a run.
	</p>

	<form
		onsubmit={(event) => {
			event.preventDefault();
			onSignIn(handle, appPassword);
		}}
	>
		<label for="handle">Handle</label>
		<input
			id="handle"
			name="handle"
			type="text"
			autocomplete="username"
			placeholder="alice.bsky.social"
			bind:value={handle}
			disabled={busy}
		/>

		<label for="app-password">App password</label>
		<input
			id="app-password"
			name="app-password"
			type="password"
			autocomplete="current-password"
			placeholder="xxxx-xxxx-xxxx-xxxx"
			bind:value={appPassword}
			disabled={busy}
		/>
		<p class="hint u:fs-0">
			Create one at Settings → Privacy and security → App passwords. It is used once to sign in and
			is never stored.
		</p>

		{#if error}
			<p class="error u:fs-1" role="alert">{error}</p>
		{/if}

		<Button type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</Button>
	</form>
</section>

<style>
	@layer layout {
		.sign-in {
			display: flex;
			flex-direction: column;
			gap: var(--space-lg);
			max-inline-size: 32rem;
			margin-inline: auto;
			padding: var(--space-4xl) var(--space-lg) var(--space-3xl) var(--space-2xl);
		}

		h1 {
			margin: 0;
		}

		.lede {
			margin: 0;
			max-width: 34ch;
			color: var(--ink-quiet);
		}

		form {
			display: flex;
			flex-direction: column;
			gap: var(--space-2xs);
		}

		label {
			font-family: var(--ff-ui);
			font-size: var(--fs-1);
			font-weight: 600;
			margin-block-start: var(--space-sm);
		}

		input {
			font-family: var(--ff-ui);
			font-size: var(--fs-2);
			padding: var(--space-2xs) var(--space-xs);
			border: 1px solid var(--hue-z0-divider);
			border-radius: 0.25rem;
			background: transparent;
			color: inherit;
		}

		.hint {
			margin: var(--space-3xs) 0 0;
			color: var(--ink-quiet);
		}

		.error {
			margin: var(--space-sm) 0 0;
			color: var(--danger-ink);
		}

		/* The submit button needs room from the fields it commits. */
		form :global(.button) {
			margin-block-start: var(--space-lg);
			align-self: flex-start;
		}
	}
</style>
