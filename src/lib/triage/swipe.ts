/**
 * The swipe gesture for the triage card.
 *
 * Split into a pure decision function and a thin Svelte action wrapped around
 * it. The pure half is where every rule that matters lives — which direction a
 * drag resolved to, whether it travelled far enough to count, whether the down
 * direction was even available — so those rules can be tested against a plain
 * object rather than against synthesised pointer events on a real element.
 *
 * Pointer Events rather than Touch Events: one code path covers finger, stylus
 * and mouse, and `setPointerCapture` keeps the drag alive when the pointer
 * leaves the card, which is exactly what a fling does.
 */

/** What a completed gesture resolved to. `null` means it snaps back. */
export type SwipeOutcome = 'keep' | 'unfollow' | 'skip';

/** Which way the card is currently being pulled, for the live affordance. */
export type SwipeAxis = 'none' | 'horizontal' | 'vertical';

export interface SwipeGeometry {
	/** Horizontal travel in CSS pixels; positive is toward the inline end. */
	dx: number;
	/** Vertical travel in CSS pixels; positive is downward. */
	dy: number;
	/** The card's own width, which the commit threshold is a fraction of. */
	width: number;
	/**
	 * Whether a downward flick is allowed to mean "skip" right now.
	 *
	 * False whenever the page is scrolled, because there a downward drag is
	 * the user scrolling back up and stealing it would be indefensible.
	 */
	downArmed: boolean;
}

/**
 * How far a drag has to travel before it counts, as a fraction of card width.
 *
 * A fraction rather than a fixed distance: the same flick has to feel the same
 * on a 380px phone and a 900px card, and a fixed 120px is a shove on one and a
 * twitch on the other.
 */
export const COMMIT_FRACTION = 0.28;

/** The ceiling on that fraction, so a very wide card is not a workout. */
export const COMMIT_MAX = 180;

/** The floor, so a very narrow card cannot be triggered by a tap wobble. */
export const COMMIT_MIN = 64;

/** Downward travel that means skip. Fixed: there is no "card height" to scale to. */
export const COMMIT_DOWN = 96;

/**
 * How much further the dominant axis must travel before the gesture locks to
 * it. Without this a drag that is 40px right and 39px down flickers between
 * two intents while the user is still deciding which one they meant.
 */
export const AXIS_LOCK_RATIO = 1.4;

/** The distance below which a drag is still just a tap that has not left yet. */
export const AXIS_LOCK_MIN = 10;

/** How far the card must travel before it counts as committed. */
export function commitDistance(width: number): number {
	return Math.min(COMMIT_MAX, Math.max(COMMIT_MIN, width * COMMIT_FRACTION));
}

/**
 * Which axis a drag has committed to, if any.
 *
 * Once locked the other axis is ignored for the rest of the gesture, so a
 * horizontal fling that drifts downward at the end still means what it meant
 * when it started.
 */
export function axisOf({ dx, dy, downArmed }: SwipeGeometry): SwipeAxis {
	const ax = Math.abs(dx);
	const ay = Math.abs(dy);

	if (ax < AXIS_LOCK_MIN && ay < AXIS_LOCK_MIN) return 'none';
	if (ax >= ay * AXIS_LOCK_RATIO) return 'horizontal';

	// Only a *downward* drag is ever a gesture. An upward one is the user
	// scrolling toward the recent columns, and always belongs to the page.
	if (ay >= ax * AXIS_LOCK_RATIO && dy > 0 && downArmed) return 'vertical';

	return 'none';
}

/**
 * How close the gesture is to committing, 0 to 1, for the live affordance.
 *
 * Reported for the locked axis only, so the label that is fading in is always
 * the one the release would actually pick.
 */
export function progressOf(geometry: SwipeGeometry): number {
	const axis = axisOf(geometry);
	if (axis === 'horizontal') {
		return Math.min(1, Math.abs(geometry.dx) / commitDistance(geometry.width));
	}
	if (axis === 'vertical') {
		return Math.min(1, geometry.dy / COMMIT_DOWN);
	}
	return 0;
}

/**
 * What the gesture is currently pointed at, committed or not.
 *
 * This is what the card shows while the finger is still down, which is why it
 * is separate from {@link resolve}: the user has to be able to read the intent
 * before they let go, or the gesture is a coin flip.
 */
export function intentOf(geometry: SwipeGeometry): SwipeOutcome | null {
	const axis = axisOf(geometry);
	// Right keeps, left unfollows, down skips. Right-for-yes is the direction
	// people already have, and the destructive one should not be the one they
	// have to unlearn.
	if (axis === 'horizontal') return geometry.dx > 0 ? 'keep' : 'unfollow';
	if (axis === 'vertical') return 'skip';
	return null;
}

/**
 * What a released gesture did.
 *
 * `null` for anything that did not travel far enough, which the card answers
 * by springing back — a gesture that is abandoned has to be abandonable.
 */
export function resolve(geometry: SwipeGeometry): SwipeOutcome | null {
	const intent = intentOf(geometry);
	if (!intent) return null;
	if (intent === 'skip') return geometry.dy >= COMMIT_DOWN ? 'skip' : null;
	return Math.abs(geometry.dx) >= commitDistance(geometry.width) ? intent : null;
}

/**
 * Where a committed card flies to, so it leaves in the direction it was thrown.
 *
 * Deliberately past the viewport edge rather than a fixed distance: on a wide
 * screen a 400px throw leaves the card sitting visibly mid-air.
 */
export function exitOffset(outcome: SwipeOutcome, viewportWidth: number): { x: number; y: number } {
	if (outcome === 'skip') return { x: 0, y: 160 };
	return { x: outcome === 'keep' ? viewportWidth : -viewportWidth, y: 0 };
}

export interface SwipeState {
	/** Whether a pointer is currently down and dragging. */
	dragging: boolean;
	dx: number;
	dy: number;
	/** The intent the card is currently showing. */
	intent: SwipeOutcome | null;
	/** 0 to 1 along the locked axis. */
	progress: number;
	/**
	 * The card's measured width.
	 *
	 * Reported alongside the drag because the card's tilt has to be computed
	 * from it — see {@link tiltFor}. Measuring it again in the component would
	 * mean a second `getBoundingClientRect` per pointer move for a number the
	 * action already has.
	 */
	width: number;
}

export const IDLE: SwipeState = {
	dragging: false,
	dx: 0,
	dy: 0,
	intent: null,
	progress: 0,
	width: 0
};

/**
 * How far a card's far corner rises when it is thrown, in CSS pixels.
 *
 * The tilt is derived from this rather than being a fixed angle, because a
 * fixed angle is not a fixed *look*: 5 degrees on a 360px phone card lifts the
 * corner about 16px and reads as a throw, while the same 5 degrees on a 1250px
 * desktop card lifts it 55px and reads as the card being bent.
 */
export const CORNER_LIFT = 16;

/** The card's rotation in degrees, for a drag of `dx` across a card of `width`. */
export function tiltFor(dx: number, width: number, progress: number): number {
	if (!width) return 0;
	const maxDegrees = (Math.atan2(CORNER_LIFT, width / 2) * 180) / Math.PI;
	return Math.sign(dx) * progress * maxDegrees;
}

export interface SwipeOptions {
	/** Called on every move, so the card can follow the finger. */
	onmove: (state: SwipeState) => void;
	/** Called once a released gesture cleared its threshold. */
	oncommit: (outcome: SwipeOutcome) => void;
	/** Called when a released gesture did not clear it, so the card springs back. */
	oncancel: () => void;
	/** Whether the gesture is available at all — false while a card is leaving. */
	enabled?: boolean;
	/**
	 * Whether a downward drag may mean skip.
	 *
	 * Read at the moment the pointer goes down rather than continuously: the
	 * page cannot scroll mid-gesture anyway, and sampling once means the
	 * gesture cannot change meaning underneath the finger.
	 */
	isDownArmed?: () => boolean;
}

/**
 * `use:swipe` — turn an element into the triage card's gesture surface.
 *
 * The element keeps `touch-action: pan-y`, so the browser still owns vertical
 * scrolling and the page never feels stuck. That is also why a downward
 * gesture is only claimed at the top of the page: below the top, the browser
 * has already started scrolling and there is nothing left to claim.
 */
export function swipe(node: HTMLElement, options: SwipeOptions) {
	let current = options;
	let pointerId: number | null = null;
	let startX = 0;
	let startY = 0;
	let downArmed = false;
	let axis: SwipeAxis = 'none';

	function geometry(event: PointerEvent): SwipeGeometry {
		return {
			dx: event.clientX - startX,
			dy: event.clientY - startY,
			width: node.getBoundingClientRect().width,
			downArmed
		};
	}

	function onpointerdown(event: PointerEvent) {
		if (current.enabled === false) return;
		// Secondary buttons and right-clicks are not gestures.
		if (event.pointerType === 'mouse' && event.button !== 0) return;
		// A drag that starts on a link or a control belongs to that control.
		if ((event.target as HTMLElement | null)?.closest('a, button, input, textarea, select')) {
			return;
		}

		pointerId = event.pointerId;
		startX = event.clientX;
		startY = event.clientY;
		axis = 'none';
		downArmed = current.isDownArmed ? current.isDownArmed() : false;
		current.onmove({ ...IDLE, dragging: true, width: node.getBoundingClientRect().width });
	}

	function onpointermove(event: PointerEvent) {
		if (event.pointerId !== pointerId) return;

		const g = geometry(event);
		const next = axisOf(g);

		if (axis === 'none' && next !== 'none') {
			axis = next;
			// Capture only once the gesture is real. Capturing on pointerdown
			// would swallow the taps that turn out to be clicks on the card.
			node.setPointerCapture(event.pointerId);
		}

		if (axis === 'none') return;

		// Now that this is a gesture rather than a scroll, the browser must
		// stop treating it as one. `pan-y` alone would let a diagonal drag
		// scroll the page while the card also moved.
		if (event.cancelable) event.preventDefault();

		const locked: SwipeGeometry =
			axis === 'horizontal' ? { ...g, dy: 0 } : { ...g, dx: 0, downArmed: true };

		current.onmove({
			dragging: true,
			dx: locked.dx,
			dy: locked.dy,
			intent: intentOf(locked),
			progress: progressOf(locked),
			width: g.width
		});
	}

	function finish(event: PointerEvent) {
		if (event.pointerId !== pointerId) return;
		if (node.hasPointerCapture(event.pointerId)) node.releasePointerCapture(event.pointerId);

		const g = geometry(event);
		const locked: SwipeGeometry =
			axis === 'horizontal' ? { ...g, dy: 0 } : axis === 'vertical' ? { ...g, dx: 0 } : g;

		pointerId = null;
		const wasAxis = axis;
		axis = 'none';

		const outcome = wasAxis === 'none' ? null : resolve(locked);
		if (outcome) current.oncommit(outcome);
		else current.oncancel();
	}

	function oncancel(event: PointerEvent) {
		if (event.pointerId !== pointerId) return;
		pointerId = null;
		axis = 'none';
		current.oncancel();
	}

	node.addEventListener('pointerdown', onpointerdown);
	node.addEventListener('pointermove', onpointermove, { passive: false });
	node.addEventListener('pointerup', finish);
	node.addEventListener('pointercancel', oncancel);

	return {
		update(next: SwipeOptions) {
			current = next;
		},
		destroy() {
			node.removeEventListener('pointerdown', onpointerdown);
			node.removeEventListener('pointermove', onpointermove);
			node.removeEventListener('pointerup', finish);
			node.removeEventListener('pointercancel', oncancel);
		}
	};
}
