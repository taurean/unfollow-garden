/**
 * Shared formatting for the numbers and dates on the account view.
 *
 * Kept in one place because the screen puts these side by side — a date in the
 * stat row and a relative time in the recent columns describe the same instant,
 * and they should not disagree about what a month is.
 */

/** `21K`, `1.5K`, `408`. Used where a figure is context rather than a quantity to read. */
export function compact(value: number | undefined | null): string {
	if (value === undefined || value === null) return '—';
	return new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(
		value
	);
}

/** `1,284`. Used where the exact figure is the point, as in "312 to review". */
export function exact(value: number): string {
	return value.toLocaleString();
}

/** `February 21, 2015`. */
export function longDate(iso: string | null | undefined): string {
	if (!iso) return '—';
	const ms = Date.parse(iso);
	if (Number.isNaN(ms)) return '—';
	return new Date(ms).toLocaleDateString(undefined, {
		year: 'numeric',
		month: 'long',
		day: 'numeric'
	});
}

const DAY_MS = 86_400_000;

/**
 * `14 days`, `3 months`, `2 years`.
 *
 * A duration, not a point in time: this is what the gap figures are measured
 * in, so it has to read as a length.
 */
export function duration(days: number | null | undefined): string {
	if (days === null || days === undefined) return '—';
	if (days < 1) return 'under a day';
	if (days < 45) return `${Math.round(days)} day${Math.round(days) === 1 ? '' : 's'}`;
	const months = Math.round(days / 30.44);
	if (months < 24) return `${months} month${months === 1 ? '' : 's'}`;
	return `${Math.round((days / 365.25) * 10) / 10} years`;
}

/** `5 months ago`. Null when the timestamp cannot be placed. */
export function relative(iso: string | null | undefined): string {
	if (!iso) return '—';
	const ms = Date.parse(iso);
	if (Number.isNaN(ms)) return '—';
	const days = (Date.now() - ms) / DAY_MS;
	if (days < 1) return 'today';
	if (days < 2) return 'yesterday';
	return `${duration(days)} ago`;
}

/**
 * The four counts as one sentence.
 *
 * A sentence rather than four labelled figures because it is a summary of the
 * strip directly below it, and the strip already labels its own rows.
 */
export function countsSentence(counts: Record<string, number>): string {
	const parts = [
		[counts.post, 'post', 'posts'],
		[counts.reply, 'reply', 'replies'],
		[counts.repost, 'repost', 'reposts'],
		[counts.like, 'like', 'likes']
	] as Array<[number, string, string]>;

	const phrases = parts.map(
		([count, one, many]) => `${compact(count)} ${count === 1 ? one : many}`
	);
	return `${phrases.slice(0, -1).join(', ')}, and ${phrases[phrases.length - 1]}`;
}
