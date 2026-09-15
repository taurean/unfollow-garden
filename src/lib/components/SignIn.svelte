<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';

	let {
		onSignIn,
		busy = false,
		error = null
	}: {
		onSignIn: (handle: string) => void;
		busy?: boolean;
		error?: string | null;
	} = $props();

	let handle = $state('');

	/**
	 * Services whose accounts can sign in here, which is all of them.
	 *
	 * atproto has no privileged operator, and naming one in the sign-in copy
	 * would teach otherwise. Cycling the name is the cheapest way to say "yours
	 * works too" to someone whose service is not the famous one.
	 *
	 * Illustrative, not an allowlist: nothing in the app reads this, and a
	 * service absent from it signs in exactly the same way.
	 *
	 * Each carries its real handle domain rather than a `name.social` pattern,
	 * so the example someone reads is one they could actually type. Blacksky
	 * appears twice on purpose — one service can hand out more than one domain,
	 * and a list that hid that would be teaching the wrong shape again.
	 */
	const SERVICES: ReadonlyArray<{ name: string; domain: string }> = [
		{ name: 'Bluesky', domain: 'bsky.social' },
		{ name: 'Blacksky', domain: 'blacksky.app' },
		{ name: 'Eurosky', domain: 'eurosky.social' },
		{ name: 'Spark', domain: 'sprk.so' },
		{ name: 'Margin', domain: 'margin.cafe' },
		{ name: 'Blacksky', domain: 'myatproto.social' },
		{ name: 'Pckt', domain: 'pckt.cafe' },
		{ name: 'Selfhosted', domain: 'selfhosted.social' }
	];

	const ROTATE_MS = 2600;

	let index = $state(0);
	let rotating = $state(false);

	/**
	 * Rotation is opt-in on the viewer's motion preference.
	 *
	 * Text that changes on a timer is motion, so anyone who asked for less gets
	 * a still label instead. The "any service" claim does not live in the
	 * animation — it is written out in the hint below, which everyone reads.
	 */
	$effect(() => {
		const query = window.matchMedia('(prefers-reduced-motion: reduce)');
		const apply = () => (rotating = !query.matches);
		apply();
		query.addEventListener('change', apply);
		return () => query.removeEventListener('change', apply);
	});

	$effect(() => {
		if (!rotating) return;
		const timer = setInterval(() => (index += 1), ROTATE_MS);
		return () => clearInterval(timer);
	});

	const service = $derived(rotating ? SERVICES[index % SERVICES.length] : null);
	const label = $derived(service ? `${service.name} username` : 'Username');
	const ghost = $derived(service ? `you.${service.domain}` : 'you.example.social');
</script>

<section class="[ sign-in ] [ l:stage ]">
	<!-- The product is `unfollow.garden`; `unfollow-garden` is only the repo. -->
	<h1 class="u:fs-6">unfollow.garden</h1>
	<p class="lede u:fs-2 u:lh-standard">
		Review every account you follow, one at a time. Nothing is unfollowed until you review the full
		list and start a run.
	</p>

	<form
		onsubmit={(event) => {
			event.preventDefault();
			onSignIn(handle);
		}}
	>
		<!--
			The visible label cycles; the accessible name does not. A label that
			renamed itself every few seconds would be announced again on each
			change, so `aria-label` on the input gives assistive technology one
			stable, complete name and the rotation stays decorative.
		-->
		<label for="handle" aria-hidden="true">
			{#key label}
				<span class="swap">{label}</span>
			{/key}
		</label>

		<div class="field">
			<input
				id="handle"
				name="handle"
				type="text"
				autocomplete="username"
				autocapitalize="none"
				autocorrect="off"
				spellcheck="false"
				aria-label="Your username on any atproto service"
				bind:value={handle}
				disabled={busy}
			/>

			<!--
				A real `placeholder` attribute cannot be animated, so this stands in
				for one. Hidden from assistive technology and from the pointer, so it
				is only ever a picture of a placeholder.
			-->
			{#if !handle}
				<span class="ghost" aria-hidden="true">
					{#key ghost}
						<span class="swap">{ghost}</span>
					{/key}
				</span>
			{/if}
		</div>

		<p class="hint u:fs-0 u:lh-standard">
			Any atproto account works — Bluesky, Blacksky, Eurosky, or one you host yourself. You sign in
			there, not here, so this app never sees a password. It asks for one permission: to add and
			remove follows. It cannot read your messages or post as you.
		</p>

		{#if error}
			<p class="error u:fs-1" role="alert">{error}</p>
		{/if}

		<Button type="submit" disabled={busy}>
			{busy ? 'Redirecting…' : 'Verify identity'}
		</Button>
	</form>
</section>

<style>
	@layer layout {
		.sign-in {
			display: flex;
			flex-direction: column;
			gap: var(--space-lg);
			--stage-width: 32rem;
			--stage-leading: var(--space-4xl);
		}

		h1 {
			margin: 0;
		}

		.lede {
			margin: 0;
			max-inline-size: 34ch;
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
			/* The name changes width and height; the row must not jump with it. */
			min-block-size: 1.4em;
		}

		.field {
			position: relative;
			display: grid;
		}

		input,
		.ghost {
			font-family: var(--ff-ui);
			/*
			 * 16px or larger, always.
			 *
			 * iOS Safari zooms the whole page in when a focused input's text
			 * is under 16px, and it does not zoom back out on blur. `--fs-2`
			 * tops out at about 18.75px but *starts* at 14.4px, which is
			 * exactly the small-screen end where the zoom would fire.
			 */
			font-size: max(1rem, var(--fs-2));
			/* The ghost sits inside the border box, so it clears the 1px border. */
			padding: var(--space-sm) calc(var(--space-xs) + 1px);
		}

		input {
			min-block-size: var(--tap-min);
			border: 1px solid var(--hue-z0-divider);
			border-radius: var(--radius-md);
			background: transparent;
			color: inherit;
		}

		.ghost {
			position: absolute;
			inset: 0;
			display: flex;
			align-items: center;
			color: var(--ink-quiet);
			pointer-events: none;
			overflow: hidden;
			white-space: nowrap;
		}

		/* One rule for both the label word and the stand-in placeholder. */
		.swap {
			display: inline-block;
			animation: swap-in 440ms ease both;
		}

		@keyframes swap-in {
			from {
				opacity: 0;
				transform: translateY(0.4em);
			}
			to {
				opacity: 1;
				transform: none;
			}
		}

		.hint {
			margin: var(--space-3xs) 0 0;
			color: var(--ink-quiet);
			max-inline-size: 52ch;
		}

		.error {
			margin: var(--space-sm) 0 0;
			color: var(--danger-ink);
		}

		/* The submit button needs room from the fields it commits. */
		form :global(.button) {
			min-block-size: var(--tap-min);
			margin-block-start: var(--space-lg);
			align-self: flex-start;
		}

		/* phone — see the breakpoint note in src/lib/styles/tokens.css */
		@media (max-width: 40rem) {
			/* Full width, because it is the only thing to do on this screen. */
			form :global(.button) {
				align-self: stretch;
			}
		}
	}
</style>
