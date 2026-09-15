import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import TimelineStrip from './TimelineStrip.svelte';
import type { CoveredWindow } from '$lib/atproto/activity';

/**
 * The month labels along the top of the strip.
 *
 * `monthTicks` puts one on the first of every month inside the window, so where
 * the window *ends* decides how close the last label sits to the right edge.
 * Left-anchored it ran past the track and was clipped to a fragment —
 * "Septem" — which reads as a rendering fault rather than as a date.
 *
 * Two things this file has to get right, both of which made an earlier version
 * of it pass against the very bug it was written for:
 *
 *  - **The width is set explicitly.** `.strip` is an inline-size container, and
 *    under 30rem its own container query hides every second label. At the test
 *    runner's default body width the offending label was simply `display:
 *    none`, so an assertion that skipped hidden labels skipped the only one
 *    that mattered.
 *  - **The window ends mid-month.** A window ending on the 1st puts that
 *    month's tick at the *start*. It takes an end date well into the month for
 *    the final tick to land near 1.0, which is the case that clipped.
 *
 * Props go through an explicit `props:` object because this component's
 * `window` prop shares a name with one of the testing library's mount options.
 */

/** Wide enough that the strip's own container query hides nothing. */
const WIDE = '1200px';

beforeEach(() => {
	document.body.style.inlineSize = WIDE;
});

afterEach(() => {
	document.body.style.inlineSize = '';
});

function windowEnding(end: string): CoveredWindow {
	return {
		start: new Date(Date.parse(end) - 365 * 86_400_000).toISOString(),
		end,
		reason: 'lookback',
		truncated: false
	};
}

function strip(end: string) {
	const screen = render(TimelineStrip, {
		props: { events: [], lookbackDays: 365, window: windowEnding(end) }
	});
	return screen.baseElement as HTMLElement;
}

/** Every visible label whose box escapes the track it is labelling. */
function labelsOutsideTrack(root: HTMLElement) {
	const track = root.querySelector('.track')!.getBoundingClientRect();
	return [...root.querySelectorAll('.month')]
		.filter((el) => getComputedStyle(el).display !== 'none')
		.map((el) => ({ text: el.textContent?.trim(), box: el.getBoundingClientRect() }))
		.filter(({ box }) => box.right > track.right + 1 || box.left < track.left - 1)
		.map(({ text }) => text);
}

function visibleLabels(root: HTMLElement) {
	return [...root.querySelectorAll('.month')]
		.filter((el) => getComputedStyle(el).display !== 'none')
		.map((el) => el.textContent?.trim());
}

describe('the month labels', () => {
	it('keeps the last label inside the track when its month lands near the end', () => {
		// Mid-September: the final tick sits at about 0.96 of the track, which
		// is the case that clipped "September" to "Septem".
		const root = strip('2026-09-14T12:00:00Z');

		expect(labelsOutsideTrack(root)).toEqual([]);
	});

	it('keeps them inside for a window whose last month lands at the start too', () => {
		const root = strip('2026-09-01T06:00:00Z');

		expect(labelsOutsideTrack(root)).toEqual([]);
	});

	it('still shows the most recent month rather than dropping it', () => {
		// The cheap way to stop a label overflowing is to stop drawing it, and
		// the most recent month is the one the reader most wants.
		const root = strip('2026-09-14T12:00:00Z');

		expect(visibleLabels(root)).toContain('September');
	});
});
