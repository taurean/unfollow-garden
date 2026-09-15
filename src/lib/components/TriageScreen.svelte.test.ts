import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import TriageScreen from './TriageScreen.svelte';
import { TriageSession } from '$lib/triage/session.svelte';
import { intentOf } from '$lib/triage/swipe';
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
		fetch: async () => new Response(null, { status: 200 })
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
	vi.spyOn(session, 'skip').mockReturnValue();
});

/**
 * Drag the card and let go.
 *
 * Real pointer events on the real element, because this is the seam the pure
 * gesture tests cannot reach: `swipe.ts` proves a rightward drag *resolves* to
 * `keep`, and the screen is what decides that `keep` means `decide('keep')`.
 * Swap those two in the screen and every geometry test stays green.
 */
async function drag(card: Element, dx: number, dy: number) {
	const box = card.getBoundingClientRect();
	const x = box.left + box.width / 2;
	const y = box.top + box.height / 2;
	const opts = { bubbles: true, pointerId: 1, pointerType: 'touch', isPrimary: true };

	card.dispatchEvent(new PointerEvent('pointerdown', { ...opts, clientX: x, clientY: y }));
	// Two moves: the first locks the axis, the second carries it past the line.
	card.dispatchEvent(
		new PointerEvent('pointermove', {
			...opts,
			clientX: x + Math.sign(dx) * 20,
			clientY: y + Math.sign(dy) * 20
		})
	);
	card.dispatchEvent(
		new PointerEvent('pointermove', { ...opts, clientX: x + dx, clientY: y + dy })
	);
	card.dispatchEvent(new PointerEvent('pointerup', { ...opts, clientX: x + dx, clientY: y + dy }));
	await new Promise((resolve) => setTimeout(resolve, 0));
}

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

describe('swipe triage', () => {
	/*
	 * The axis mapping, end to end. `swipe.ts` owns which direction a drag
	 * resolves to; this owns what the screen then does about it — and a flip
	 * between the two would leave every geometry test passing while the app
	 * unfollowed the accounts the user meant to keep.
	 */
	it('keeps the account when the card is thrown to the right', async () => {
		const screen = render(TriageScreen, { session });
		const card = screen.baseElement.querySelector('.card')!;

		await drag(card, 400, 0);

		expect(session.decide).toHaveBeenCalledWith('keep');
	});

	it('marks the account for unfollow when the card is thrown to the left', async () => {
		const screen = render(TriageScreen, { session });
		const card = screen.baseElement.querySelector('.card')!;

		await drag(card, -400, 0);

		expect(session.decide).toHaveBeenCalledWith('unfollow');
	});

	it('skips the account when the card is thrown downward from the top', async () => {
		window.scrollTo(0, 0);
		const screen = render(TriageScreen, { session });
		const card = screen.baseElement.querySelector('.card')!;

		await drag(card, 0, 300);

		expect(session.skip).toHaveBeenCalled();
	});

	it('decides nothing when the drag stops short of the threshold', async () => {
		const screen = render(TriageScreen, { session });
		const card = screen.baseElement.querySelector('.card')!;

		await drag(card, 30, 0);

		expect(session.decide).not.toHaveBeenCalled();
	});
});

describe('the buttons and the gesture as one vocabulary', () => {
	/*
	 * The invariant, asserted against the gesture rules themselves rather than
	 * against a hardcoded order.
	 *
	 * These drifted apart once already: keep sat on the left while a leftward
	 * swipe unfollowed, so anyone who learned the gesture and then reached for
	 * a button got the opposite of what they meant. Reading the expected label
	 * out of `intentOf` means changing either side without the other fails
	 * here, which is the only way the two stay one vocabulary.
	 */
	const swipe = (dx: number) => intentOf({ dx, dy: 0, width: 400, downArmed: false });

	it('puts each decision button on the side its own swipe travels', async () => {
		const screen = render(TriageScreen, { session });
		const [left, right] = [
			...screen.baseElement.querySelectorAll('.decisions .button')
		] as HTMLElement[];

		expect(left.textContent?.toLowerCase()).toContain(swipe(-200));
		expect(right.textContent?.toLowerCase()).toContain(swipe(200));
	});

	it('describes the gesture in the order the buttons sit in', async () => {
		const screen = render(TriageScreen, { session });
		const hint = screen.baseElement.querySelector('.hint')!.textContent!.toLowerCase();

		expect(hint.indexOf(swipe(-200)!)).toBeLessThan(hint.indexOf(swipe(200)!));
	});
});
