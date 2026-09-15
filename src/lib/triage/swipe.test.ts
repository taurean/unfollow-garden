import { describe, expect, it } from 'vitest';
import {
	axisOf,
	commitDistance,
	COMMIT_DOWN,
	COMMIT_MAX,
	COMMIT_MIN,
	exitOffset,
	intentOf,
	tiltFor,
	CORNER_LIFT,
	progressOf,
	resolve,
	type SwipeGeometry
} from './swipe';

/** A card of an ordinary phone width, with the down gesture available. */
function gesture(partial: Partial<SwipeGeometry> = {}): SwipeGeometry {
	return { dx: 0, dy: 0, width: 400, downArmed: true, ...partial };
}

/** How far a 400px card has to travel; 112px at the default fraction. */
const FAR = commitDistance(400);

describe('which direction a gesture means', () => {
	it('reads a rightward drag as keep', () => {
		expect(intentOf(gesture({ dx: 60 }))).toBe('keep');
	});

	it('reads a leftward drag as unfollow', () => {
		expect(intentOf(gesture({ dx: -60 }))).toBe('unfollow');
	});

	it('reads a downward drag as skip', () => {
		expect(intentOf(gesture({ dy: 60 }))).toBe('skip');
	});

	it('means nothing at all before the drag has left the dead zone', () => {
		// A tap that wobbles a few pixels must not read as a decision.
		expect(intentOf(gesture({ dx: 6, dy: 4 }))).toBeNull();
	});

	it('refuses a diagonal drag rather than guessing which way it leaned', () => {
		// 40 right and 39 down: the user has not decided yet, so neither does this.
		expect(axisOf(gesture({ dx: 40, dy: 39 }))).toBe('none');
		expect(intentOf(gesture({ dx: 40, dy: 39 }))).toBeNull();
	});

	it('locks to the axis once one clearly leads', () => {
		expect(axisOf(gesture({ dx: 60, dy: 20 }))).toBe('horizontal');
		expect(axisOf(gesture({ dx: 20, dy: 60 }))).toBe('vertical');
	});
});

describe('the down direction, which the page also wants', () => {
	it('is not a gesture when the page is scrolled away from the top', () => {
		// Below the top a downward drag is the user scrolling back up, and
		// taking it from them would make the page feel broken.
		expect(axisOf(gesture({ dy: 200, downArmed: false }))).toBe('none');
		expect(resolve(gesture({ dy: 200, downArmed: false }))).toBeNull();
	});

	it('is never read from an upward drag, armed or not', () => {
		// Up is how the reader reaches the recent columns. It is always the page's.
		expect(axisOf(gesture({ dy: -200 }))).toBe('none');
		expect(intentOf(gesture({ dy: -200 }))).toBeNull();
	});

	it('still lets a horizontal decision through while the page is scrolled', () => {
		expect(resolve(gesture({ dx: -FAR, downArmed: false }))).toBe('unfollow');
	});
});

describe('whether a released gesture counts', () => {
	it('commits once the drag has gone far enough', () => {
		expect(resolve(gesture({ dx: FAR }))).toBe('keep');
		expect(resolve(gesture({ dx: -FAR }))).toBe('unfollow');
		expect(resolve(gesture({ dy: COMMIT_DOWN }))).toBe('skip');
	});

	it('springs back from a drag that stopped short, so it can be abandoned', () => {
		expect(resolve(gesture({ dx: FAR - 1 }))).toBeNull();
		expect(resolve(gesture({ dy: COMMIT_DOWN - 1 }))).toBeNull();
	});
});

describe('how far the gesture has to travel', () => {
	it('scales with the card, so the same flick feels the same at any width', () => {
		expect(commitDistance(400)).toBeLessThan(commitDistance(900));
	});

	it('never asks for a workout on a very wide card', () => {
		expect(commitDistance(4000)).toBe(COMMIT_MAX);
	});

	it('never lets a tap wobble trigger a very narrow one', () => {
		expect(commitDistance(80)).toBe(COMMIT_MIN);
	});
});

describe('what the card shows while the finger is still down', () => {
	it('reports progress along the locked axis only', () => {
		// The affordance must describe the axis the release would actually
		// pick, or the user reads one intent and gets another.
		expect(progressOf(gesture({ dx: FAR / 2 }))).toBeCloseTo(0.5);
		expect(progressOf(gesture({ dy: COMMIT_DOWN / 2 }))).toBeCloseTo(0.5);
	});

	it('never exceeds one, however hard the card is thrown', () => {
		expect(progressOf(gesture({ dx: 5000 }))).toBe(1);
	});

	it('reports nothing while the gesture is still undecided', () => {
		expect(progressOf(gesture({ dx: 40, dy: 39 }))).toBe(0);
	});
});

describe('how far the card tilts', () => {
	/** How high the far corner rises at a given angle across a given width. */
	const cornerRise = (degrees: number, width: number) =>
		Math.abs(Math.tan((degrees * Math.PI) / 180) * (width / 2));

	it('lifts the far corner by the same amount at any card width', () => {
		// The point of deriving the angle: a fixed angle reads as a throw on a
		// phone card and as a bend on a desktop one.
		expect(cornerRise(tiltFor(1, 360, 1), 360)).toBeCloseTo(CORNER_LIFT, 0);
		expect(cornerRise(tiltFor(1, 1250, 1), 1250)).toBeCloseTo(CORNER_LIFT, 0);
	});

	it('uses a smaller angle on a wider card', () => {
		expect(tiltFor(1, 1250, 1)).toBeLessThan(tiltFor(1, 360, 1));
	});

	it('leans the way the card is thrown', () => {
		expect(tiltFor(50, 400, 1)).toBeGreaterThan(0);
		expect(tiltFor(-50, 400, 1)).toBeLessThan(0);
	});

	it('is flat before the gesture has gone anywhere', () => {
		expect(tiltFor(50, 400, 0)).toBe(0);
	});

	it('is flat when the card has not been measured yet', () => {
		// The first frame of a drag reports a width of 0; dividing by it would
		// produce a NaN transform and drop the card out of the layout.
		expect(tiltFor(50, 0, 1)).toBe(0);
	});
});

describe('where a committed card goes', () => {
	it('leaves in the direction it was thrown', () => {
		expect(exitOffset('keep', 800).x).toBeGreaterThan(0);
		expect(exitOffset('unfollow', 800).x).toBeLessThan(0);
		expect(exitOffset('skip', 800).y).toBeGreaterThan(0);
	});

	it('clears the viewport rather than stopping visibly mid-air', () => {
		expect(Math.abs(exitOffset('unfollow', 1600).x)).toBeGreaterThanOrEqual(1600);
	});
});
