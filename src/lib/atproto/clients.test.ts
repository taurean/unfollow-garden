import { describe, expect, it } from 'vitest';
import { clientById, DEFAULT_CLIENT, postUrl, profileUrl, toClient, WEB_CLIENTS } from './clients';

describe('web clients', () => {
	it('defaults to Bluesky, which is where these links have always gone', () => {
		expect(clientById(undefined).id).toBe(DEFAULT_CLIENT);
	});

	it('falls back rather than breaking on an id it does not know', () => {
		// A stored preference can outlive the client it names.
		expect(clientById('a-client-that-was-removed').id).toBe(DEFAULT_CLIENT);
	});

	it('offers every client with a distinct id', () => {
		const ids = WEB_CLIENTS.map((client) => client.id);

		expect(new Set(ids).size).toBe(ids.length);
	});

	it('builds a profile link on a client that takes a handle', () => {
		expect(profileUrl({ handle: 'alice.test' }, 'mu')).toBe('https://mu.social/profile/alice.test');
	});

	it('builds a post link on a client that takes a handle', () => {
		expect(postUrl({ handle: 'alice.test' }, 'abc123', 'mu')).toBe(
			'https://mu.social/profile/alice.test/post/abc123'
		);
	});
});

/**
 * Clients disagree on how a URL names an account. Blacksky takes a DID only, so
 * a link built from a handle would 404 there — and a bio mention, or a post
 * cached before the author's DID was kept, is only ever a handle.
 */
describe('a client that names accounts by DID', () => {
	it('uses the DID when there is one', () => {
		expect(profileUrl({ handle: 'alice.test', did: 'did:plc:alice' }, 'blacksky')).toBe(
			'https://blacksky.community/profile/did:plc:alice'
		);
	});

	it('keeps the did: prefix, which is part of the identifier', () => {
		expect(profileUrl({ did: 'did:plc:alice' }, 'blacksky')).toContain('/profile/did:plc:alice');
	});

	it('falls back to a client that takes handles when no DID is available', () => {
		// A working link somewhere beats a broken one in the right place.
		expect(profileUrl({ handle: 'alice.test' }, 'blacksky')).toBe(
			'https://bsky.app/profile/alice.test'
		);
	});

	it('builds a post link from the DID of whoever wrote it', () => {
		expect(postUrl({ handle: 'alice.test', did: 'did:plc:alice' }, 'abc123', 'blacksky')).toBe(
			'https://blacksky.community/profile/did:plc:alice/post/abc123'
		);
	});
});

describe('toClient', () => {
	it('moves a cached bsky.app link to the chosen client', () => {
		// Recent items are cached with their link already built, so a link
		// stored before the preference changed still has to follow it.
		expect(toClient('https://bsky.app/profile/alice.test/post/abc123', 'mu')).toBe(
			'https://mu.social/profile/alice.test/post/abc123'
		);
	});

	it('keeps the handle and the record key intact', () => {
		expect(toClient('https://bsky.app/profile/a.b.example.com/post/3kabc', 'mu')).toBe(
			'https://mu.social/profile/a.b.example.com/post/3kabc'
		);
	});

	it('uses the author’s DID for a client that needs one', () => {
		// Not the subject's DID: a repost or a like points at someone else's
		// post, and the author is whoever wrote it.
		expect(
			toClient('https://bsky.app/profile/alice.test/post/abc123', 'blacksky', 'did:plc:alice')
		).toBe('https://blacksky.community/profile/did:plc:alice/post/abc123');
	});

	it('falls back for an item cached before author DIDs were kept', () => {
		expect(toClient('https://bsky.app/profile/alice.test/post/abc123', 'blacksky')).toBe(
			'https://bsky.app/profile/alice.test/post/abc123'
		);
	});

	it('leaves a link it cannot parse alone, because a working link beats a guess', () => {
		expect(toClient('https://example.com/something', 'mu')).toBe('https://example.com/something');
	});

	it('is a no-op when the chosen client is the one the link already uses', () => {
		const url = 'https://bsky.app/profile/alice.test/post/abc123';

		expect(toClient(url, 'bsky')).toBe(url);
	});
});
