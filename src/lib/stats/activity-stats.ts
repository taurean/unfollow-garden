import type { ActivityEvent, CoveredWindow, EventKind } from '$lib/atproto/activity';

/**
 * The activity metric definitions from PRD.md, "Activity metrics".
 *
 * Pure functions over an event list and a covered window, with no knowledge of
 * how anything is fetched or drawn. That is the point: these definitions decide
 * which accounts a person unfollows, so they are tested against the PRD
 * directly rather than through the screen that happens to render them.
 */

const DAY_MS = 86_400_000;

/** A stretch of time with no events in it. */
export interface Gap {
	start: string;
	end: string;
	days: number;
	/** True when the gap runs to load time — the subject is quiet right now. */
	ongoing: boolean;
	/**
	 * True when the gap is a lower bound rather than a measurement.
	 *
	 * A gap that starts at the lookback boundary was already running when the
	 * window opened, so its real length is unknown and "at least 90 days" is the
	 * honest claim.
	 */
	atLeast: boolean;
}

export interface ActivityStats {
	/** The latest event time, or null when the window holds no events. */
	lastActive: string | null;
	/** Median days between consecutive events. Null below two events. */
	medianGapDays: number | null;
	/** Mean days between consecutive events, shown beside the median. */
	meanGapDays: number | null;
	/** Every stretch at or over the threshold, oldest first. */
	longGaps: Gap[];
	/** The most recent long gap, which is the one the screen leads with. */
	latestLongGap: Gap | null;
	counts: Record<EventKind, number>;
	totalEvents: number;
}

const NO_COUNTS = (): Record<EventKind, number> => ({ post: 0, reply: 0, repost: 0, like: 0 });

/** Days between two instants, rounded to one decimal so short gaps stay legible. */
function daysBetween(fromMs: number, toMs: number): number {
	return Math.round(((toMs - fromMs) / DAY_MS) * 10) / 10;
}

function median(sorted: number[]): number {
	const middle = Math.floor(sorted.length / 2);
	return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** Only events inside the covered window count toward any metric. */
export function eventsInWindow(
	events: readonly ActivityEvent[],
	window: CoveredWindow
): ActivityEvent[] {
	const start = Date.parse(window.start);
	const end = Date.parse(window.end);
	return events
		.filter((event) => {
			const at = Date.parse(event.at);
			return at >= start && at <= end;
		})
		.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

/**
 * Every metric the account view shows, for one subject.
 *
 * `thresholdDays` can change without refetching, because it only decides which
 * stretches are long enough to name. Changing the lookback invalidates the
 * cache instead, since it changes which events exist at all.
 */
export function computeStats(
	events: readonly ActivityEvent[],
	window: CoveredWindow,
	thresholdDays: number
): ActivityStats {
	const inWindow = eventsInWindow(events, window);
	const windowStart = Date.parse(window.start);
	const windowEnd = Date.parse(window.end);

	const counts = NO_COUNTS();
	for (const event of inWindow) counts[event.kind]++;

	/**
	 * A window with no events is one unbroken gap.
	 *
	 * Reached only when neither source hit its page cap — a source that did had
	 * at least five hundred items — so the window really is as wide as the
	 * lookback or the account's age, and the whole of it was quiet.
	 */
	if (inWindow.length === 0) {
		const gap: Gap = {
			start: window.start,
			end: window.end,
			days: daysBetween(windowStart, windowEnd),
			ongoing: true,
			atLeast: !window.truncated && window.reason === 'lookback'
		};
		const longGaps = gap.days >= thresholdDays ? [gap] : [];
		return {
			lastActive: null,
			medianGapDays: null,
			meanGapDays: null,
			longGaps,
			latestLongGap: longGaps.at(-1) ?? null,
			counts,
			totalEvents: 0
		};
	}

	const times = inWindow.map((event) => Date.parse(event.at));
	const first = times[0];
	const last = times[times.length - 1];

	const intervals: number[] = [];
	for (let i = 1; i < times.length; i++) intervals.push(times[i] - times[i - 1]);

	const gaps: Gap[] = [];

	/*
	 * The leading stretch is only claimed when the window is whole. A truncated
	 * window begins wherever the fetch limit landed, which says nothing about
	 * whether the subject was quiet before the first event we happen to have.
	 */
	if (!window.truncated && first > windowStart) {
		gaps.push({
			start: window.start,
			end: inWindow[0].at,
			days: daysBetween(windowStart, first),
			ongoing: false,
			atLeast: window.reason === 'lookback'
		});
	}

	for (let i = 1; i < times.length; i++) {
		gaps.push({
			start: inWindow[i - 1].at,
			end: inWindow[i].at,
			days: daysBetween(times[i - 1], times[i]),
			ongoing: false,
			atLeast: false
		});
	}

	gaps.push({
		start: inWindow[inWindow.length - 1].at,
		end: window.end,
		days: daysBetween(last, windowEnd),
		ongoing: true,
		atLeast: false
	});

	const longGaps = gaps.filter((gap) => gap.days >= thresholdDays);

	return {
		lastActive: new Date(last).toISOString(),
		// The median leads because one long absence drags the mean somewhere no
		// real interval ever was.
		medianGapDays:
			intervals.length > 0
				? Math.round((median([...intervals].sort((a, b) => a - b)) / DAY_MS) * 10) / 10
				: null,
		meanGapDays:
			intervals.length > 0
				? Math.round(
						(intervals.reduce((sum, value) => sum + value, 0) / intervals.length / DAY_MS) * 10
					) / 10
				: null,
		longGaps,
		latestLongGap: longGaps.at(-1) ?? null,
		counts,
		totalEvents: inWindow.length
	};
}

/** One column of the timeline strip: a slice of time and what happened in it. */
export interface Bucket {
	start: number;
	end: number;
	count: number;
	/** True when this slice falls outside the covered window. */
	uncovered: boolean;
}

/**
 * Collapse one kind's events into fixed slices across the full lookback.
 *
 * The strip spans the whole lookback rather than the covered window, so the
 * part that was never loaded stays visible as a hatched region instead of
 * silently rescaling the chart and hiding that anything is missing.
 */
export function bucketEvents(
	events: readonly ActivityEvent[],
	kind: EventKind,
	window: CoveredWindow,
	lookbackDays: number,
	bucketCount: number
): Bucket[] {
	const end = Date.parse(window.end);
	const start = end - lookbackDays * DAY_MS;
	const width = (end - start) / bucketCount;
	const coveredStart = Date.parse(window.start);

	const buckets: Bucket[] = Array.from({ length: bucketCount }, (_, index) => {
		const bucketStart = start + index * width;
		return {
			start: bucketStart,
			end: bucketStart + width,
			count: 0,
			uncovered: bucketStart + width <= coveredStart
		};
	});

	for (const event of events) {
		if (event.kind !== kind) continue;
		const at = Date.parse(event.at);
		if (at < coveredStart || at > end) continue;
		// The final instant belongs to the last bucket rather than to one past it.
		const index = Math.min(bucketCount - 1, Math.floor((at - start) / width));
		if (index >= 0) buckets[index].count++;
	}

	return buckets;
}

/** Month boundaries across the strip, as fractions of its width, for labelling. */
/**
 * Past this point along the track, a left-anchored label runs off the end and
 * is clipped to a fragment — "Septem" — which reads as a rendering fault
 * rather than as a date. Such a label is anchored by its right edge instead.
 */
const ANCHOR_END_AFTER = 0.9;

/**
 * Roughly how much of the track a month's name takes up, as a fraction.
 *
 * An approximation, because the real width depends on the font, the container,
 * and the length of the word — none of which a pure function over dates can
 * see. It is deliberately a little generous: a dropped label costs a reader one
 * date they can infer from its neighbours, and an overlapping pair costs them
 * both.
 */
const LABEL_ROOM = 0.12;

export interface MonthTick {
	label: string;
	offset: number;
	/** Which edge of the label sits at `offset`. */
	anchor: 'start' | 'end';
}

export function monthTicks(window: CoveredWindow, lookbackDays: number): MonthTick[] {
	const end = Date.parse(window.end);
	const start = end - lookbackDays * DAY_MS;
	const span = end - start;
	const ticks: MonthTick[] = [];

	const cursor = new Date(start);
	cursor.setDate(1);
	cursor.setHours(0, 0, 0, 0);
	// The first of the month containing the start is usually before it; step on.
	if (cursor.getTime() < start) cursor.setMonth(cursor.getMonth() + 1);

	while (cursor.getTime() < end) {
		const offset = (cursor.getTime() - start) / span;
		ticks.push({
			label: cursor.toLocaleDateString(undefined, { month: 'long' }),
			offset,
			anchor: offset > ANCHOR_END_AFTER ? 'end' : 'start'
		});
		cursor.setMonth(cursor.getMonth() + 1);
	}

	/*
	 * An end-anchored label grows leftwards from the track's edge, back across
	 * whatever sits before it — "August" and "September" ran together at every
	 * width, because consecutive months are about a twelfth of the track apart
	 * and a month's name is wider than that once it is pushed back from the
	 * end.
	 *
	 * At a year's lookback this always happens: the first of the current month
	 * is at most 31 days from the end, so the last label is never far enough
	 * inside the track to hang from its left edge.
	 *
	 * Everything within a label's room of the last one goes. The most recent
	 * month is the one kept, because it is what a reader is looking for when
	 * they are deciding whether someone has only just gone quiet.
	 */
	const last = ticks.at(-1);
	if (last?.anchor === 'end') {
		return ticks.filter((tick) => tick === last || tick.offset <= last.offset - LABEL_ROOM);
	}

	return ticks;
}
