import type { MeterCounts } from '$lib/storage/db';

/**
 * What this review would have cost on X, priced against X's published rate
 * card.
 *
 * Every read this app makes is free: the AppView, PLC, and subjects' PDSes all
 * answer public requests without a bill. That is easy to say and hard to feel,
 * so the same work is priced against somewhere it is not free.
 *
 * The figure is a claim about another company's prices on a page other people
 * will read, so it is dated, sourced, and derived only from resources that
 * actually crossed the network. Nothing here is fetched at runtime — these are
 * constants, and the app never talks to x.com.
 *
 * Source: https://docs.x.com/x-api/getting-started/pricing
 * Inspired by https://xbill.bisks.net, which prices a Bluesky repo the same way.
 */

/**
 * When these rates were last checked against the source.
 *
 * Load-bearing rather than decorative: X has already replaced one pricing
 * model with another — monthly tiers became pay-per-resource — so these will
 * go stale, and a stale figure with a date on it is a different thing from a
 * stale figure without one.
 */
export const RATES_AS_OF = '2026-09-17';

/**
 * Dollars per resource read.
 *
 * X prices a read of your own data lower than a read of someone else's, which
 * is why the owner's follow list is a tenth of what a profile costs. The two
 * sources agree on these: the docs quote them per resource, and xbill's "$5
 * per 1,000 posts, $10 per 1,000 user profiles" is the same rate per thousand.
 */
export const RATES = {
	/** `listFollows` on the owner's own repo — X's "owned read" price. */
	follows: 0.001,
	/** `getProfiles`, one per subject. */
	profiles: 0.01,
	/** `getRelationships`, priced as the follower/following resource it is. */
	relationships: 0.01,
	/** Author-feed items: posts, replies, and reposts alike. */
	posts: 0.005,
	/** Like records. */
	likes: 0.001
} as const satisfies Record<keyof Omit<MeterCounts, 'ownerDid'>, number>;

/**
 * The bill for a set of counts, in dollars.
 *
 * Pure, so the rate card can be checked against a fixture without a browser,
 * a database, or a network.
 */
export function costOf(counts: Omit<MeterCounts, 'ownerDid'>): number {
	return (
		counts.follows * RATES.follows +
		counts.profiles * RATES.profiles +
		counts.relationships * RATES.relationships +
		counts.posts * RATES.posts +
		counts.likes * RATES.likes
	);
}

/**
 * The bill as money.
 *
 * Rounded to the cent because that is how a price is written, and a review of a
 * few thousand accounts lands in the hundreds of dollars rather than anywhere
 * fractions of a cent would matter.
 */
export function formatCost(dollars: number): string {
	return dollars.toLocaleString('en-US', {
		style: 'currency',
		currency: 'USD',
		maximumFractionDigits: 2
	});
}
