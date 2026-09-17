import { describe, expect, it } from 'vitest';
import type { ActivityEvent, CoveredWindow } from '$lib/atproto/activity';
import { bucketEvents, computeStats, eventsInWindow, monthTicks } from './activity-stats';

/**
 * These cases are read from PRD.md, "Activity metrics", not from the
 * implementation. The metric definitions decide which accounts a person
 * unfollows, so the spec is the thing under test.
 */

const DAY = 86_400_000;

/** A fixed "now", so a test never depends on the day it runs. */
const NOW = Date.parse('2026-09-14T12:00:00.000Z');

/** `daysAgo(30)` is the instant 30 days before the fixed now. */
const daysAgo = (days: number) => new Date(NOW - days * DAY).toISOString();

function event(kind: ActivityEvent['kind'], days: number): ActivityEvent {
	return { kind, at: daysAgo(days) };
}

function window(overrides: Partial<CoveredWindow> & { startDaysAgo?: number } = {}): CoveredWindow {
	const { startDaysAgo = 365, ...rest } = overrides;
	return {
		start: daysAgo(startDaysAgo),
		end: new Date(NOW).toISOString(),
		reason: 'lookback',
		truncated: false,
		...rest
	};
}

describe('eventsInWindow', () => {
	it('drops events outside the covered window and sorts the rest oldest first', () => {
		const events = [event('post', 400), event('post', 10), event('like', 200)];

		const kept = eventsInWindow(events, window({ startDaysAgo: 365 }));

		expect(kept.map((e) => e.at)).toEqual([daysAgo(200), daysAgo(10)]);
	});
});

describe('computeStats — last active', () => {
	it('is the latest event time', () => {
		const stats = computeStats([event('post', 40), event('like', 3)], window(), 30);

		expect(stats.lastActive).toBe(daysAgo(3));
	});

	it('is null when the window holds no events', () => {
		const stats = computeStats([], window(), 30);

		expect(stats.lastActive).toBeNull();
	});

	it('ignores events the window excludes, even recent-looking ones', () => {
		// Truncated at 30 days: everything older is unknown, not absent.
		const stats = computeStats(
			[event('post', 90), event('post', 200)],
			window({ startDaysAgo: 30, truncated: true, reason: 'fetch-limit' }),
			30
		);

		expect(stats.lastActive).toBeNull();
		expect(stats.totalEvents).toBe(0);
	});
});

describe('computeStats — typical gap', () => {
	it('reports the median and the mean of the intervals between events', () => {
		// Intervals: 10, 10, 100 days. Median 10, mean 40.
		const stats = computeStats(
			[event('post', 120), event('post', 20), event('post', 10), event('post', 0)],
			window(),
			30
		);

		expect(stats.medianGapDays).toBe(10);
		expect(stats.meanGapDays).toBe(40);
	});

	it('averages the middle two intervals when there is an even number of them', () => {
		// Intervals: 10, 20 days.
		const stats = computeStats(
			[event('post', 40), event('post', 30), event('post', 10)],
			window(),
			30
		);

		expect(stats.medianGapDays).toBe(15);
	});

	it('is null below two events, which is where an interval first exists', () => {
		const stats = computeStats([event('post', 10)], window(), 30);

		expect(stats.medianGapDays).toBeNull();
		expect(stats.meanGapDays).toBeNull();
	});
});

describe('computeStats — long gaps', () => {
	it('includes the stretch from the last event to load time, marked ongoing', () => {
		const stats = computeStats([event('post', 90)], window(), 30);

		const ongoing = stats.longGaps.filter((gap) => gap.ongoing);
		expect(ongoing).toHaveLength(1);
		expect(ongoing[0].days).toBe(90);
	});

	it('excludes stretches shorter than the threshold', () => {
		// The window opens on the first event, so the only stretches are one
		// 293-day interior gap, a 5-day interior gap, and a 2-day tail.
		const stats = computeStats(
			[event('post', 7), event('post', 2), event('post', 300)],
			window({ startDaysAgo: 300 }),
			30
		);

		expect(stats.longGaps.map((gap) => gap.days)).toEqual([293]);
	});

	it('counts the stretch from the window start to the first event', () => {
		const stats = computeStats([event('post', 100)], window({ startDaysAgo: 365 }), 30);

		const leading = stats.longGaps.find((gap) => gap.start === daysAgo(365));
		expect(leading?.days).toBe(265);
	});

	it('marks the leading stretch "at least" when the window starts at the lookback boundary', () => {
		const stats = computeStats([event('post', 100)], window({ reason: 'lookback' }), 30);

		expect(stats.longGaps[0].atLeast).toBe(true);
	});

	it('reports the leading stretch exactly when the window starts at account creation', () => {
		const stats = computeStats(
			[event('post', 100)],
			window({ startDaysAgo: 200, reason: 'account-created' }),
			30
		);

		expect(stats.longGaps[0].atLeast).toBe(false);
		expect(stats.longGaps[0].days).toBe(100);
	});

	it('omits the leading stretch entirely when the window is truncated', () => {
		// The window begins where the fetch limit landed, which says nothing
		// about whether the subject was quiet before it.
		const stats = computeStats(
			[event('post', 100)],
			window({ startDaysAgo: 365, truncated: true, reason: 'fetch-limit' }),
			30
		);

		expect(stats.longGaps.every((gap) => gap.start !== daysAgo(365))).toBe(true);
	});

	it('reports the most recent long gap as the latest', () => {
		const stats = computeStats(
			[event('post', 300), event('post', 200), event('post', 60)],
			window(),
			30
		);

		expect(stats.latestLongGap?.ongoing).toBe(true);
		expect(stats.latestLongGap?.days).toBe(60);
	});

	it('treats a window with no events at all as one unbroken ongoing gap', () => {
		const stats = computeStats([], window({ startDaysAgo: 365 }), 30);

		expect(stats.longGaps).toHaveLength(1);
		expect(stats.longGaps[0].ongoing).toBe(true);
		expect(stats.longGaps[0].atLeast).toBe(true);
		expect(stats.longGaps[0].days).toBe(365);
	});
});

describe('computeStats — counts', () => {
	it('counts events per kind inside the covered window', () => {
		const stats = computeStats(
			[
				event('post', 10),
				event('post', 20),
				event('reply', 30),
				event('repost', 40),
				event('like', 50),
				event('like', 500)
			],
			window({ startDaysAgo: 365 }),
			30
		);

		expect(stats.counts).toEqual({ post: 2, reply: 1, repost: 1, like: 1 });
		expect(stats.totalEvents).toBe(5);
	});
});

describe('bucketEvents', () => {
	it('spans the full lookback rather than the covered window', () => {
		const buckets = bucketEvents([], 'post', window({ startDaysAgo: 30 }), 365, 73);

		expect(buckets).toHaveLength(73);
		expect(buckets[0].start).toBe(NOW - 365 * DAY);
	});

	it('marks the part of the lookback the window never covered', () => {
		// Covered only the last 30 of 365 days: the first buckets are unknown.
		const buckets = bucketEvents(
			[],
			'post',
			window({ startDaysAgo: 30, truncated: true, reason: 'fetch-limit' }),
			365,
			73
		);

		expect(buckets[0].uncovered).toBe(true);
		expect(buckets[72].uncovered).toBe(false);
	});

	it('counts only events of the requested kind', () => {
		const buckets = bucketEvents(
			[event('post', 10), event('like', 10), event('post', 10)],
			'post',
			window(),
			365,
			73
		);

		expect(buckets.reduce((sum, bucket) => sum + bucket.count, 0)).toBe(2);
	});

	it('places an event at the very end of the window in the last bucket', () => {
		const buckets = bucketEvents([event('post', 0)], 'post', window(), 365, 73);

		expect(buckets[72].count).toBe(1);
	});
});

describe('monthTicks', () => {
	it('returns a tick per month boundary inside the strip, less the one dropped for room', () => {
		// Eleven, not twelve: at a year's lookback the final label always hangs
		// from the right edge, and the month before it is dropped so the two do
		// not print on top of each other. See "month label placement" below.
		const ticks = monthTicks(window(), 365);

		expect(ticks).toHaveLength(11);
		expect(ticks.every((tick) => tick.offset >= 0 && tick.offset < 1)).toBe(true);
	});

	it('places ticks in ascending order across the strip', () => {
		const offsets = monthTicks(window(), 365).map((tick) => tick.offset);

		expect([...offsets].sort((a, b) => a - b)).toEqual(offsets);
	});
});

/**
 * Where a month's name sits on the track.
 *
 * Two rules that are really one: a label too near the end hangs from its right
 * edge so it is not clipped to "Septem", and the label it then grows back
 * across is dropped. Splitting them between the strip and this module is what
 * let "August" and "September" print on top of each other at every width.
 */
describe('month label placement', () => {
	const windowEnding = (end: string): CoveredWindow => ({
		start: new Date(Date.parse(end) - 365 * 86_400_000).toISOString(),
		end,
		reason: 'lookback',
		truncated: false
	});

	it('anchors a label near the end by its right edge', () => {
		const ticks = monthTicks(windowEnding('2026-09-28T00:00:00Z'), 365);

		expect(ticks.at(-1)?.anchor).toBe('end');
	});

	it('anchors every other label by its left edge', () => {
		const ticks = monthTicks(windowEnding('2026-09-28T00:00:00Z'), 365);

		expect(ticks.slice(0, -1).every((tick) => tick.anchor === 'start')).toBe(true);
	});

	it('drops the month an end-anchored label would grow back across', () => {
		// The bug this exists for: September pinned to the right edge printed
		// over August, which was left-anchored a twelfth of a track earlier.
		const ticks = monthTicks(windowEnding('2026-09-28T00:00:00Z'), 365);
		const labels = ticks.map((t) => t.label);

		expect(labels.filter((l) => l === 'August')).toHaveLength(0);
	});

	it('keeps the most recent month, which is the one being looked for', () => {
		const ticks = monthTicks(windowEnding('2026-09-28T00:00:00Z'), 365);

		expect(ticks.at(-1)?.label).toBe('September');
	});

	it('drops nothing when the last label sits clear of the end', () => {
		// A shorter lookback spreads the months out: over 90 days the first of
		// the current month is a sixth of the way in from the end, which is
		// room enough to hang it from its left edge and keep its neighbour.
		const ticks = monthTicks(windowEnding('2026-09-14T00:00:00Z'), 90);

		expect({ anchor: ticks.at(-1)?.anchor, last: ticks.at(-1)?.label }).toEqual({
			anchor: 'start',
			last: 'September'
		});
	});

	it('keeps the month before the last one when there is room for both', () => {
		const labels = monthTicks(windowEnding('2026-09-14T00:00:00Z'), 90).map((t) => t.label);

		expect(labels).toContain('August');
	});
});
