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

	it('builds a profile link on the chosen client', () => {
		expect(profileUrl('alice.test', 'blacksky')).toBe('https://blacksky.app/profile/alice.test');
	});

	it('builds a post link on the chosen client', () => {
		expect(postUrl('alice.test', 'abc123', 'mu')).toBe(
			'https://mu.social/profile/alice.test/post/abc123'
		);
	});
});

describe('toClient', () => {
	it('moves a cached bsky.app link to the chosen client', () => {
		// Recent items are cached with their link already built, so a link
		// stored before the preference changed still has to follow it.
		expect(toClient('https://bsky.app/profile/alice.test/post/abc123', 'blacksky')).toBe(
			'https://blacksky.app/profile/alice.test/post/abc123'
		);
	});

	it('keeps the handle and the record key intact', () => {
		expect(toClient('https://bsky.app/profile/a.b.example.com/post/3kabc', 'mu')).toBe(
			'https://mu.social/profile/a.b.example.com/post/3kabc'
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
