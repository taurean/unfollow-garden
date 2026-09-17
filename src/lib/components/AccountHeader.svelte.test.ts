import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import AccountHeader from './AccountHeader.svelte';
import { HandleResolver } from '$lib/triage/handles.svelte';
import type { FollowSnapshot } from '$lib/storage/db';

function subject(description: string): FollowSnapshot {
	return {
		ownerDid: 'did:plc:owner',
		subjectDid: 'did:plc:alice',
		rkeys: ['aaa'],
		followedAt: '2021-06-04T00:00:00Z',
		followsOwner: null,
		loadedAt: '2026-09-11T00:00:00Z',
		profileMissingSince: null,
		profile: { did: 'did:plc:alice', handle: 'alice.test', displayName: 'Alice', description }
	};
}

const hrefOf = (root: Element, selector: string) =>
	root.querySelector(selector)?.getAttribute('href');

describe('the account’s own link', () => {
	it('uses the DID for a client that addresses accounts that way', async () => {
		const screen = render(AccountHeader, {
			props: { subject: subject('hi'), linkClient: 'blacksky' }
		});

		expect(hrefOf(screen.container, '.handle')).toBe(
			'https://blacksky.community/profile/did:plc:alice'
		);
	});
});

describe('a mention inside a bio', () => {
	it('falls back while the handle is still unknown, rather than not linking', async () => {
		// A bio carries no facets, so the DID is not in the text. The link has
		// to work before the lookup answers.
		const screen = render(AccountHeader, {
			props: { subject: subject('see @bob.test'), linkClient: 'blacksky' }
		});

		expect(hrefOf(screen.container, '.in-bio')).toBe('https://bsky.app/profile/bob.test');
	});

	it('moves to the chosen client once the handle resolves', async () => {
		const handles = new HandleResolver();
		vi.spyOn(handles, 'get').mockReturnValue('did:plc:bob');

		const screen = render(AccountHeader, {
			props: { subject: subject('see @bob.test'), linkClient: 'blacksky', handles }
		});

		expect(hrefOf(screen.container, '.in-bio')).toBe(
			'https://blacksky.community/profile/did:plc:bob'
		);
	});

	it('asks for the handles a bio names, and only those', async () => {
		const handles = new HandleResolver();
		const resolve = vi.spyOn(handles, 'resolve').mockResolvedValue();

		render(AccountHeader, {
			props: { subject: subject('@bob.test and @carol.test'), linkClient: 'blacksky', handles }
		});

		expect(resolve.mock.calls.map(([h]) => h).sort()).toEqual(['bob.test', 'carol.test']);
	});

	it('looks nothing up for a client that takes handles', async () => {
		// A lookup that cannot change the link is a request for nothing.
		const handles = new HandleResolver();
		const resolve = vi.spyOn(handles, 'resolve').mockResolvedValue();

		render(AccountHeader, {
			props: { subject: subject('see @bob.test'), linkClient: 'bsky', handles }
		});

		expect(resolve).not.toHaveBeenCalled();
	});
});
