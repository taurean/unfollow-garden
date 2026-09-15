import { afterEach, describe, expect, it, vi } from 'vitest';
import { pdsForDid } from './identity';

/**
 * Where an account's repo lives.
 *
 * OAuth resolves the *authorization* server on its own, which is why the
 * bsky.social entryway special case that used to live here is gone. This is
 * still needed for the public reads: the owner's follow records and every
 * subject's likes are read straight from their PDS.
 */

function mockFetch(handler: (url: string) => { ok: boolean; body?: unknown }) {
	vi.stubGlobal(
		'fetch',
		vi.fn(async (input: string | URL) => {
			const { ok, body } = handler(String(input));
			return {
				ok,
				status: ok ? 200 : 404,
				json: async () => body
			} as Response;
		})
	);
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('pdsForDid', () => {
	it('reads a did:plc document from the PLC directory', async () => {
		let requested = '';
		mockFetch((url) => {
			requested = url;
			return {
				ok: true,
				body: {
					service: [
						{
							id: '#atproto_pds',
							type: 'AtprotoPersonalDataServer',
							serviceEndpoint: 'https://pds.example'
						}
					]
				}
			};
		});

		expect(await pdsForDid('did:plc:abc123')).toBe('https://pds.example');
		expect(requested).toBe('https://plc.directory/did%3Aplc%3Aabc123');
	});

	it('reads a did:web document from the domain itself', async () => {
		// did:web has no directory; the document lives on the domain it names.
		let requested = '';
		mockFetch((url) => {
			requested = url;
			return {
				ok: true,
				body: {
					service: [{ id: '#atproto_pds', type: 'X', serviceEndpoint: 'https://self.example' }]
				}
			};
		});

		expect(await pdsForDid('did:web:self.example')).toBe('https://self.example');
		expect(requested).toBe('https://self.example/.well-known/did.json');
	});

	it('strips a trailing slash, so endpoints are not built with a double slash', async () => {
		mockFetch(() => ({
			ok: true,
			body: {
				service: [{ id: '#atproto_pds', type: 'X', serviceEndpoint: 'https://pds.example/' }]
			}
		}));

		expect(await pdsForDid('did:plc:abc')).toBe('https://pds.example');
	});

	it('finds the service by type when the id is not the conventional one', async () => {
		mockFetch(() => ({
			ok: true,
			body: {
				service: [
					{ id: '#other', type: 'Something', serviceEndpoint: 'https://wrong.example' },
					{
						id: '#not_conventional',
						type: 'AtprotoPersonalDataServer',
						serviceEndpoint: 'https://right.example'
					}
				]
			}
		}));

		expect(await pdsForDid('did:plc:abc')).toBe('https://right.example');
	});

	it('names the DID when the document has no PDS at all', async () => {
		mockFetch(() => ({ ok: true, body: { service: [] } }));

		await expect(pdsForDid('did:plc:abc')).rejects.toThrow(/did:plc:abc has no PDS/);
	});

	it('names the DID when there is no document to read', async () => {
		mockFetch(() => ({ ok: false }));

		await expect(pdsForDid('did:plc:missing')).rejects.toThrow(
			/no DID document for did:plc:missing/
		);
	});
});
