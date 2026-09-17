import { describe, expect, it } from 'vitest';
import { costOf, formatCost, RATES, RATES_AS_OF } from './x-rates';

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
