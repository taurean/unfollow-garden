import { afterEach, describe, expect, it, vi } from 'vitest';
import { getProfiles } from './graph';

afterEach(() => {
	vi.unstubAllGlobals();
});

/** Records the URLs requested and answers with a profile for every actor asked for. */
function stubAppView() {
	const requested: string[] = [];
	vi.stubGlobal(
		'fetch',
		vi.fn(async (url: string) => {
			requested.push(url);
			const actors = new URL(url).searchParams.getAll('actors');
			return new Response(
				JSON.stringify({ profiles: actors.map((did) => ({ did, handle: `${did}.test` })) }),
				{ status: 200, headers: { 'Content-Type': 'application/json' } }
			);
		})
	);
	return requested;
}

describe('getProfiles', () => {
	it('asks for a repeated DID only once', async () => {
		// A subject followed twice would otherwise cost a second lookup.
		const requested = stubAppView();

		await getProfiles(['did:plc:alice', 'did:plc:alice', 'did:plc:bob']);

		expect(new URL(requested[0]).searchParams.getAll('actors')).toEqual([
			'did:plc:alice',
			'did:plc:bob'
		]);
	});

	it('splits more than 25 actors across requests, because the AppView caps them', async () => {
		const requested = stubAppView();
		const dids = Array.from({ length: 60 }, (_, i) => `did:plc:subject-${i}`);

		const profiles = await getProfiles(dids);

		expect({
			requests: requested.length,
			batchSizes: requested.map((url) => new URL(url).searchParams.getAll('actors').length),
			resolved: profiles.size
		}).toEqual({ requests: 3, batchSizes: [25, 25, 10], resolved: 60 });
	});

	it('reports progress as batches land, so the loading screen can count up', async () => {
		stubAppView();
		const seen: number[] = [];

		await getProfiles(
			Array.from({ length: 30 }, (_, i) => `did:plc:subject-${i}`),
			(loaded) => seen.push(loaded)
		);

		expect(seen).toEqual([25, 30]);
	});
});
