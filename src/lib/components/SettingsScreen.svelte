<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import { exact, longDate } from '$lib/format';
	import { runAsJson } from '$lib/triage/runs.svelte';
	import type { TriageSession } from '$lib/triage/session.svelte';

	let { session }: { session: TriageSession } = $props();

	let confirmingDelete = $state(false);
	let exportHref = $state('');
	let importInput = $state<HTMLInputElement | null>(null);

	/** Built on demand: a few thousand decisions is too much to hold in the DOM. */
	async function prepareExport() {
		const json = await session.exportData();
		exportHref = `data:application/json;charset=utf-8,${encodeURIComponent(json)}`;
	}

	async function onImportFile(event: Event) {
		const file = (event.target as HTMLInputElement).files?.[0];
		if (!file) return;
		await session.importData(await file.text());
		if (importInput) importInput.value = '';
	}

	const storageNote = $derived(
		session.persisted === true
			? 'This browser has promised not to evict your decisions.'
			: session.persisted === false
				? 'This browser would not promise to keep your decisions. They can be cleared when space runs low — export regularly.'
				: 'This browser does not offer a storage guarantee. Safari in particular can clear stored data for a site you have not visited in a week, so export regularly.'
	);
</script>

<section class="settings">
	<header class="l:repel">
		<h1 class="u:fs-5">Settings</h1>
		<Button data-variant="quiet" onclick={() => session.closeSettings()}>Done</Button>
	</header>

	{#if session.error}
		<p class="error u:fs-1" role="alert">{session.error}</p>
	{/if}

	<section class="group">
		<h2 class="u:fs-2">What counts as activity</h2>
		<div class="fields">
			<label for="lookback">
				Days of history to load
				<input
					id="lookback"
					type="number"
					min="30"
					max="730"
					step="1"
					value={session.settings.lookbackDays}
					onchange={(event) =>
						session.updateSettings({ lookbackDays: Number(event.currentTarget.value) })}
				/>
				<span class="hint u:fs-0">Changing this reloads every account's activity.</span>
			</label>

			<label for="threshold">
				Shortest gap worth flagging, in days
				<input
					id="threshold"
					type="number"
					min="1"
					max="365"
					step="1"
					value={session.settings.thresholdDays}
					onchange={(event) =>
						session.updateSettings({ thresholdDays: Number(event.currentTarget.value) })}
				/>
				<span class="hint u:fs-0">Applied to what is already loaded. Nothing is refetched.</span>
			</label>
		</div>
	</section>

	<section class="group">
		<h2 class="u:fs-2">Storage</h2>
		<p class="hint u:fs-1 u:lh-standard">{storageNote}</p>
		<div class="row">
			{#if exportHref}
				<Button data-variant="quiet" href={exportHref} download="unfollow-garden-backup.json">
					Save the file
				</Button>
			{:else}
				<Button data-variant="quiet" onclick={prepareExport}>Export decisions</Button>
			{/if}

			<Button data-variant="quiet" onclick={() => importInput?.click()}>Import a backup</Button>
			<input
				bind:this={importInput}
				type="file"
				accept="application/json,.json"
				onchange={onImportFile}
				hidden
			/>
		</div>

		{#if session.importReport}
			<p class="hint u:fs-1" role="status">
				Imported: {exact(session.importReport.added)} added, {exact(session.importReport.updated)} updated,
				{exact(session.importReport.skipped)} already current.
			</p>
		{/if}
	</section>

	<section class="group">
		<h2 class="u:fs-2">Past runs</h2>
		{#if session.pastRuns.length === 0}
			<p class="hint u:fs-1">No runs yet.</p>
		{:else}
			<ul>
				{#each session.pastRuns as run (run.id)}
					<li>
						<div>
							<span class="u:fs-2">{longDate(run.createdAt)}</span>
							<span class="hint u:fs-0 tabular">
								{exact(run.targets.length)} account{run.targets.length === 1 ? '' : 's'} · {run.status}
							</span>
						</div>
						<Button
							data-variant="quiet"
							href={`data:application/json;charset=utf-8,${encodeURIComponent(runAsJson(run))}`}
							download="unfollow-run-{run.id}.json"
						>
							Download
						</Button>
						<Button
							data-variant="quiet"
							disabled={session.runs.busy}
							onclick={() => session.restoreRun(run)}
						>
							Follow all again
						</Button>
					</li>
				{/each}
			</ul>
			<p class="hint u:fs-0 u:lh-standard">
				Following again creates new follow records. Each account is notified, and the date you first
				followed them is not recovered.
			</p>
		{/if}
	</section>

	<section class="group">
		<h2 class="u:fs-2">Delete everything</h2>
		<p class="hint u:fs-1 u:lh-standard">
			Removes every decision, run, and setting stored for this account in this browser. Accounts
			already unfollowed stay unfollowed. Nothing here exists anywhere else.
		</p>
		{#if confirmingDelete}
			<div class="row">
				<Button
					data-variant="unfollow"
					onclick={async () => {
						await session.deleteAllData();
						confirmingDelete = false;
					}}
				>
					Yes, delete it all
				</Button>
				<Button data-variant="quiet" onclick={() => (confirmingDelete = false)}>Cancel</Button>
			</div>
		{:else}
			<div class="row">
				<Button data-variant="quiet" onclick={() => (confirmingDelete = true)}>
					Delete all stored data
				</Button>
			</div>
		{/if}
	</section>
</section>

<style>
	@layer layout {
		.settings {
			display: flex;
			flex-direction: column;
			gap: var(--space-2xl);
			max-inline-size: 48rem;
			margin-inline: auto;
			padding: var(--space-2xl) var(--space-lg) var(--space-3xl) var(--space-2xl);
		}

		h1,
		h2,
		p {
			margin: 0;
		}

		.group {
			display: flex;
			flex-direction: column;
			gap: var(--space-sm);
		}

		.fields {
			display: flex;
			flex-wrap: wrap;
			gap: var(--space-xl);
		}

		label {
			display: flex;
			flex-direction: column;
			gap: var(--space-3xs);
			font-family: var(--ff-ui);
			font-size: var(--fs-1);
		}

		input[type='number'] {
			inline-size: 8rem;
			font: inherit;
			font-size: var(--fs-2);
			padding: var(--space-2xs) var(--space-xs);
			border: 1px solid var(--hue-z0-divider);
			border-radius: 0.25rem;
			background: transparent;
			color: inherit;
		}

		.hint {
			font-family: var(--ff-ui);
			color: var(--ink-quiet);
			max-inline-size: 64ch;
		}

		.error {
			font-family: var(--ff-ui);
			color: var(--danger-ink);
		}

		.row {
			display: flex;
			flex-wrap: wrap;
			gap: var(--space-sm);
		}

		ul {
			list-style: none;
			margin: 0;
			padding: 0;
			display: flex;
			flex-direction: column;
		}

		li {
			display: flex;
			flex-wrap: wrap;
			align-items: center;
			gap: var(--space-sm);
			padding-block: var(--space-sm);
			border-block-end: 1px solid var(--hue-z0-divider);
		}

		li div {
			display: flex;
			flex-direction: column;
			margin-inline-end: auto;
		}

		.settings :global(.button[data-variant='quiet']) {
			background-color: transparent;
			color: var(--ink-quiet);
			border: 1px solid var(--hue-z0-divider);
			text-decoration: none;
		}

		.settings :global(.button[data-variant='quiet']:hover:not(:disabled)) {
			color: var(--ink);
		}

		.settings :global(.button[data-variant='unfollow']) {
			background-color: var(--unfollow);
		}
	}
</style>
