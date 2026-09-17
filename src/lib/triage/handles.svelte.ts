import { SvelteMap } from 'svelte/reactivity';
import { resolveHandle } from '$lib/atproto/identity';

/**
 * Handles seen in a bio, turned into DIDs.
 *
 * A bio names people by handle and nothing else — the description is plain
 * text, with no facet carrying the DID the way a post's mention does. A web
 * client that addresses accounts by DID therefore has nothing to build a link
 * from, and a mention would quietly open somewhere the reader did not choose.
 *
 * One public lookup per distinct handle, cached for the sitting. Bios mention
 * few people, the answer does not change, and this only runs when the chosen
 * client actually needs a DID.
 */
export class HandleResolver {
	#dids = new SvelteMap<string, string | null>();

	/** The DID for a handle, or undefined while it is unknown. */
	get(handle: string): string | undefined {
		return this.#dids.get(handle) ?? undefined;
	}

	/**
	 * Look a handle up, once.
	 *
	 * A failure is remembered as `null` rather than retried: a handle in a bio
	 * can be misspelled or long gone, and re-asking on every render would turn
	 * one dead mention into a stream of requests.
	 */
	async resolve(handle: string): Promise<void> {
		if (this.#dids.has(handle)) return;
		this.#dids.set(handle, null);

		try {
			this.#dids.set(handle, await resolveHandle(handle));
		} catch {
			// Left null: the link falls back, which is what it was already doing.
		}
	}
}
