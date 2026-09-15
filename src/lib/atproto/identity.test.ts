import { describe, expect, it } from 'vitest';
import { pdsForLogin } from './identity';

describe('pdsForLogin', () => {
	it('sends Bluesky-hosted accounts to the entryway rather than their own PDS', () => {
		// The DID document names the PDS that stores the repo, but those hosts
		// authenticate nobody — sending credentials there fails in a way that
		// reads as a wrong password.
		expect(pdsForLogin('https://shiitake.us-east.host.bsky.network')).toBe('https://bsky.social');
	});

	it('leaves a self-hosted PDS alone, because it authenticates for itself', () => {
		expect(pdsForLogin('https://pds.example.com')).toBe('https://pds.example.com');
	});

	it('does not mistake a lookalike host for a Bluesky one', () => {
		// Suffix matching on the host, not a substring of the whole URL.
		expect(pdsForLogin('https://host.bsky.network.example.com')).toBe(
			'https://host.bsky.network.example.com'
		);
	});
});
