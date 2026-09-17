import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import RecentColumns from './RecentColumns.svelte';
import type { RecentItem } from '$lib/atproto/activity';

const SUBJECT = 'did:plc:alice';

function item(kind: RecentItem['kind'], partial: Partial<RecentItem> = {}): RecentItem {
	return {
		kind,
		at: '2026-09-01T00:00:00Z',
		url: 'https://bsky.app/profile/alice.test/post/abc123',
		text: 'a post',
		attribution: null,
		media: [],
		...partial
	};
}

const hrefs = (root: Element) =>
	[...root.querySelectorAll('li a')].map((a) => a.getAttribute('href'));

/**
 * Which account a row's link names.
 *
 * Only matters for a client that names accounts by DID. Items cached before
 * author DIDs were stored have none, and the subject's DID can stand in for
 * exactly the two kinds that are the subject's own writing.
 */
describe('recent links on a client that needs a DID', () => {
	it('uses the stored author DID when the item has one', async () => {
		const screen = render(RecentColumns, {
			props: {
				recent: [item('post', { authorDid: 'did:plc:alice' })],
				linkClient: 'blacksky',
				subjectDid: SUBJECT
			}
		});

		expect(hrefs(screen.container)).toEqual([
			'https://blacksky.community/profile/did:plc:alice/post/abc123'
		]);
	});

	it('falls back to the subject for their own post, which has no other author', async () => {
		// The case that matters in practice: a cache written before author DIDs
		// were kept would otherwise send every row to the wrong client.
		const screen = render(RecentColumns, {
			props: { recent: [item('post')], linkClient: 'blacksky', subjectDid: SUBJECT }
		});

		expect(hrefs(screen.container)).toEqual([
			`https://blacksky.community/profile/${SUBJECT}/post/abc123`
		]);
	});

	it('treats a reply as the subject’s own writing too', async () => {
		const screen = render(RecentColumns, {
			props: {
				recent: [item('reply', { attribution: 'bob.test' })],
				linkClient: 'blacksky',
				subjectDid: SUBJECT
			}
		});

		expect(hrefs(screen.container)).toEqual([
			`https://blacksky.community/profile/${SUBJECT}/post/abc123`
		]);
	});

	it('does not claim a repost was written by the subject', async () => {
		// A repost points at somebody else's post. Guessing the subject here
		// would link confidently to the wrong person.
		const screen = render(RecentColumns, {
			props: {
				recent: [item('repost', { attribution: 'bob.test' })],
				linkClient: 'blacksky',
				subjectDid: SUBJECT
			}
		});

		expect(hrefs(screen.container)).toEqual(['https://bsky.app/profile/alice.test/post/abc123']);
	});

	it('leaves links alone on a client that takes handles', async () => {
		const screen = render(RecentColumns, {
			props: { recent: [item('post')], linkClient: 'bsky', subjectDid: SUBJECT }
		});

		expect(hrefs(screen.container)).toEqual(['https://bsky.app/profile/alice.test/post/abc123']);
	});
});
