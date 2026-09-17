import { EMPTY_COUNTS, loadCounts, saveCounts, type MeterCounts } from '$lib/storage/db';

type Kind = keyof Omit<MeterCounts, 'ownerDid'>;

/**
 * How many resources this review has actually fetched.
 *
 * Counts only what crossed the network. A reload served from the activity
 * cache costs nothing, so it adds nothing — the figure is what the review cost
 * this app, not what it would have cost if nothing were ever cached.
 *
 * It accumulates across sittings like everything else here, so it is written to
 * storage. Not per resource, though: a full review fetches tens of thousands of
 * them, and that many writes to render one number to the cent would be absurd.
 * `record` moves an in-memory total and `flush` is called at the points where
 * work naturally finishes.
 */
export class CostMeter {
	counts = $state<MeterCounts>({ ownerDid: '', ...EMPTY_COUNTS });

	/** Set when the in-memory counts have moved past what storage holds. */
	#dirty = false;

	/** Pick up where the last sitting left off. */
	async start(ownerDid: string): Promise<void> {
		this.counts = await loadCounts(ownerDid);
		this.#dirty = false;
	}

	/**
	 * Note that `n` of something were fetched.
	 *
	 * Called from the places that already know both the kind and the number —
	 * nothing here inspects a response, and no fetcher had to change shape to
	 * report.
	 */
	record(kind: Kind, n: number): void {
		if (n <= 0 || !this.counts.ownerDid) return;
		this.counts = { ...this.counts, [kind]: this.counts[kind] + n };
		this.#dirty = true;
	}

	/** Write the running totals, if they have moved. */
	async flush(): Promise<void> {
		if (!this.#dirty || !this.counts.ownerDid) return;
		this.#dirty = false;
		await saveCounts($state.snapshot(this.counts));
	}

	/** Back to nothing, for when the owner's data is deleted. */
	reset(ownerDid: string): void {
		this.counts = { ownerDid, ...EMPTY_COUNTS };
		this.#dirty = false;
	}
}
