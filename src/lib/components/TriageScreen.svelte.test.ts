import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import TriageScreen from './TriageScreen.svelte';
import { TriageSession } from '$lib/triage/session.svelte';
import type { FollowSnapshot } from '$lib/storage/db';

const subject: FollowSnapshot = {
	ownerDid: 'did:plc:owner',
	subjectDid: 'did:plc:alice',
	rkeys: ['aaa'],
	followedAt: '2021-06-04T00:00:00Z',
	followsOwner: null,
	loadedAt: '2026-09-11T00:00:00Z',
	profile: { did: 'did:plc:alice', handle: 'alice.test', displayName: 'Alice' }
};

/** A session parked on one subject, with the network and storage left out. */
function parkedSession() {
	const session = new TriageSession();
	session.session = {
		did: 'did:plc:owner',
		handle: 'owner.test',
		pds: 'https://pds.test',
		loginService: 'https://pds.test',
		accessJwt: 'access',
		refreshJwt: 'refresh'
	};
	session.subjects = [subject];
	session.current = subject;
	session.phase = 'triage';
	return session;
}

let session: TriageSession;

beforeEach(() => {
	session = parkedSession();
	vi.spyOn(session, 'decide').mockResolvedValue();
	vi.spyOn(session, 'undo').mockResolvedValue();
});

describe('keyboard triage', () => {
	it.each([
		['k', 'keep'],
		['u', 'unfollow']
	])('records a decision when %s is pressed', async (key, decision) => {
		render(TriageScreen, { session });

		document.body.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));

		expect(session.decide).toHaveBeenCalledWith(decision);
	});

	it('ignores a shortcut while the user is typing in a text field', async () => {
		render(TriageScreen, { session });

		// A real text field, because the guard reads the event target.
		const input = document.createElement('input');
		document.body.append(input);
		input.focus();
		input.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', bubbles: true }));
		input.remove();

		expect(session.decide).not.toHaveBeenCalled();
	});

	it('ignores a shortcut held with a modifier, leaving browser shortcuts alone', async () => {
		render(TriageScreen, { session });

		document.body.dispatchEvent(
			new KeyboardEvent('keydown', { key: 'u', metaKey: true, bubbles: true })
		);

		expect(session.decide).not.toHaveBeenCalled();
	});

	it('takes the last decision back when z is pressed', async () => {
		render(TriageScreen, { session });

		document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', bubbles: true }));

		expect(session.undo).toHaveBeenCalled();
	});
});

describe('the subject on screen', () => {
	it('shows who is being decided about', async () => {
		const screen = render(TriageScreen, { session });

		await expect.element(screen.getByRole('heading', { name: 'Alice' })).toBeInTheDocument();
	});

	it('says that marking for unfollow has not changed anything yet', async () => {
		const screen = render(TriageScreen, { session });

		await expect.element(screen.getByText(/changes nothing yet/i)).toBeInTheDocument();
	});
});
