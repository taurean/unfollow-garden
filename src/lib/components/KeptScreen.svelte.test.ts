import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import KeptScreen from './KeptScreen.svelte';
import { TriageSession } from '$lib/triage/session.svelte';
import type { FollowSnapshot } from '$lib/storage/db';

function subject(did: string, handle: string, displayName?: string): FollowSnapshot {
	return {
		ownerDid: 'did:plc:owner',
		subjectDid: did,
		rkeys: ['aaa'],
		followedAt: '2021-06-04T00:00:00Z',
		followsOwner: null,
		loadedAt: '2026-09-11T00:00:00Z',
		profileMissingSince: null,
		profile: { did, handle, displayName }
	};
}

/** A session holding decided subjects, with storage and the network left out. */
function withKept(entries: Array<[FollowSnapshot, string]>) {
	const session = new TriageSession();
	session.session = {
		did: 'did:plc:owner',
		handle: 'owner.test',
		pds: 'https://pds.test',
		fetch: async () => new Response(null, { status: 200 })
	};
	session.subjects = entries.map(([s]) => s);
	for (const [s, decidedAt] of entries) {
		session.decisions.set(s.subjectDid, {
			ownerDid: 'did:plc:owner',
			subjectDid: s.subjectDid,
			decision: 'keep',
			decidedAt
		});
	}
	session.phase = 'kept';
	return session;
}

const alice = subject('did:plc:alice', 'alice.test', 'Alice');
const bob = subject('did:plc:bob', 'bob.test', 'Bob');

describe('the kept list', () => {
	it('says plainly when nothing has been kept yet', async () => {
		const screen = render(KeptScreen, { props: { session: withKept([]) } });

		await expect.element(screen.getByText('Nothing kept yet')).toBeVisible();
	});

	it('shows the most recently kept account first', async () => {
		// Coming back after a sitting, "what did I just decide" is the question
		// the order has to answer.
		const session = withKept([
			[alice, '2026-01-01T00:00:00Z'],
			[bob, '2026-09-01T00:00:00Z']
		]);

		render(KeptScreen, { props: { session } });

		expect(session.kept.map((s) => s.subjectDid)).toEqual(['did:plc:bob', 'did:plc:alice']);
	});

	it('can mark a kept account for unfollow after all', async () => {
		const session = withKept([[alice, '2026-01-01T00:00:00Z']]);
		const mark = vi.spyOn(session, 'unfollowInstead').mockResolvedValue();

		const screen = render(KeptScreen, { props: { session } });
		await screen.getByRole('button', { name: 'Unfollow instead' }).click();

		expect(mark).toHaveBeenCalledWith('did:plc:alice');
	});

	it('filters by handle, so a long list can be searched rather than scrolled', async () => {
		const session = withKept([
			[alice, '2026-01-01T00:00:00Z'],
			[bob, '2026-02-01T00:00:00Z']
		]);

		const screen = render(KeptScreen, { props: { session } });
		await screen.getByRole('searchbox', { name: 'Find an account' }).fill('bob');
		await expect.element(screen.getByRole('link', { name: '@bob.test' })).toBeVisible();

		expect({
			rows: screen.container.querySelectorAll('li').length,
			hasAlice: screen.container.textContent?.includes('Alice')
		}).toEqual({ rows: 1, hasAlice: false });
	});

	it('says nothing matched rather than showing an empty list', async () => {
		const session = withKept([[alice, '2026-01-01T00:00:00Z']]);

		const screen = render(KeptScreen, { props: { session } });
		await screen.getByRole('searchbox', { name: 'Find an account' }).fill('zzz');

		await expect.element(screen.getByRole('status')).toBeVisible();
	});

	it('links an account with no usable handle by its DID', async () => {
		const ghost: FollowSnapshot = { ...subject('did:plc:ghost', 'x'), profile: null };
		const session = withKept([[ghost, '2026-01-01T00:00:00Z']]);

		const screen = render(KeptScreen, { props: { session } });

		const link = screen.container.querySelector('.handle');
		expect(link?.getAttribute('href')).toBe('https://atproto.at//did:plc:ghost');
	});
});
