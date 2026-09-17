import { describe, expect, it } from 'vitest';
import { costLines, costOf, formatCost, formatRate, RATES, RATES_AS_OF } from './x-rates';

const NOTHING = { follows: 0, profiles: 0, relationships: 0, posts: 0, likes: 0 };

describe('costOf', () => {
	it('is nothing before anything has been fetched', () => {
		expect(costOf(NOTHING)).toBe(0);
	});

	it('prices each resource at the published rate', () => {
		// One of each, so a wrong rate shows up as the wrong total rather than
		// hiding behind a larger one.
		expect(costOf({ follows: 1, profiles: 1, relationships: 1, posts: 1, likes: 1 })).toBeCloseTo(
			0.001 + 0.01 + 0.01 + 0.005 + 0.001,
			10
		);
	});

	it('prices a thousand posts at the five dollars the rate card quotes', () => {
		// The cross-check against the second source: "$5 per 1,000 posts" and
		// "$0.005 per resource" have to be the same number.
		expect(costOf({ ...NOTHING, posts: 1000 })).toBeCloseTo(5, 10);
	});

	it('prices a thousand profiles at ten dollars', () => {
		expect(costOf({ ...NOTHING, profiles: 1000 })).toBeCloseTo(10, 10);
	});

	it('prices reading your own follow list a tenth of reading a stranger’s profile', () => {
		// X charges less for your own data, and the owner's follow list is the
		// one thing here that is the owner's own.
		expect(RATES.follows * 10).toBeCloseTo(RATES.profiles, 10);
	});

	it('adds up a review-sized set of counts', () => {
		const counts = {
			follows: 1204,
			profiles: 1204,
			relationships: 1204,
			posts: 28400,
			likes: 16920
		};

		expect(costOf(counts)).toBeCloseTo(1.204 + 12.04 + 12.04 + 142 + 16.92, 6);
	});
});

describe('formatCost', () => {
	it('writes the bill as money, to the cent', () => {
		expect(formatCost(184.2)).toBe('$184.20');
	});

	it('rounds a fraction of a cent rather than showing it', () => {
		expect(formatCost(0.005)).toBe('$0.01');
	});
});

describe('the rate card', () => {
	it('carries the date it was checked, because these prices have changed before', () => {
		// X replaced monthly tiers with pay-per-resource. A figure quoting
		// someone else's prices needs to say when it was last true.
		expect(RATES_AS_OF).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	});
});

/**
 * The breakdown.
 *
 * The figure is a public claim about another company's prices, so the thing
 * that makes it trustworthy is that a reader can add it up themselves. These
 * check the arithmetic the screen shows is the arithmetic `costOf` does.
 */
describe('costLines', () => {
	const counts = { follows: 641, profiles: 641, relationships: 641, posts: 256000, likes: 192000 };

	it('adds up to the same total the sentence quotes', () => {
		const lines = costLines(counts);

		expect(lines.reduce((sum, line) => sum + line.subtotal, 0)).toBeCloseTo(costOf(counts), 6);
	});

	it('puts the largest cost first, because that is what a reader is checking', () => {
		const subtotals = costLines(counts).map((line) => line.subtotal);

		expect([...subtotals].sort((a, b) => b - a)).toEqual(subtotals);
	});

	it('leaves out a resource that was never fetched', () => {
		const lines = costLines({ ...counts, likes: 0 });

		expect(lines.map((line) => line.kind)).not.toContain('likes');
	});

	it('names the endpoint each line came from, so it can be checked against the code', () => {
		expect(costLines(counts).every((line) => line.source.length > 0)).toBe(true);
	});

	it('prices a review the size of a real follow list in the hundreds, not the millions', () => {
		// A sanity floor and ceiling. Each account contributes at most 500 feed
		// items and 500 likes, so a thousand-account review cannot plausibly
		// leave this range — a figure outside it means the counting is wrong,
		// not that the prices are surprising.
		const thousand = {
			follows: 1000,
			profiles: 1000,
			relationships: 1000,
			posts: 1000 * 500,
			likes: 1000 * 500
		};

		expect(costOf(thousand)).toBeLessThan(5000);
		expect(costOf(thousand)).toBeGreaterThan(100);
	});
});

describe('formatRate', () => {
	it('shows a tenth of a cent, which three of the five rates need', () => {
		expect(formatRate(0.001)).toBe('$0.001');
	});
});
