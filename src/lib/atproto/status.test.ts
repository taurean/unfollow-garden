import { describe, expect, it } from 'vitest';
import { reduceAudit } from './status';

/** One PLC audit entry, shaped the way the directory serves them. */
function entry(at: string, handle?: string, endpoint?: string) {
	return {
		createdAt: at,
		operation: {
			...(handle ? { alsoKnownAs: [`at://${handle}`] } : {}),
			...(endpoint ? { services: { atproto_pds: { endpoint } } } : {})
		}
	};
}

describe('reduceAudit', () => {
	it('returns the handles an account held, newest first', () => {
		const history = reduceAudit([
			entry('2022-01-01T00:00:00Z', 'first.test'),
			entry('2023-06-01T00:00:00Z', 'second.test'),
			entry('2024-09-01T00:00:00Z', 'third.test')
		]);

		expect(history.handles.map((h) => h.handle)).toEqual([
			'third.test',
			'second.test',
			'first.test'
		]);
	});

	it('ignores operations that did not change the handle', () => {
		// Most entries in a real log are key rotations carrying the same
		// handle. Listing them would report six renames that never happened.
		const history = reduceAudit([
			entry('2022-01-01T00:00:00Z', 'alice.test'),
			entry('2022-02-01T00:00:00Z', 'alice.test'),
			entry('2022-03-01T00:00:00Z', 'alice.test')
		]);

		expect(history.handles).toHaveLength(1);
	});

	it('records a move between hosts as a bare host, not a full origin', () => {
		const history = reduceAudit([
			entry('2022-01-01T00:00:00Z', 'alice.test', 'https://old.host.example'),
			entry('2024-01-01T00:00:00Z', 'alice.test', 'https://new.host.example')
		]);

		expect(history.hosts.map((h) => h.host)).toEqual(['new.host.example', 'old.host.example']);
	});

	it('keeps the date each name was taken, which is the part that dates the account', () => {
		const history = reduceAudit([
			entry('2022-01-01T00:00:00Z', 'before.test'),
			entry('2024-09-01T00:00:00Z', 'after.test')
		]);

		expect(history.handles[0]).toEqual({ handle: 'after.test', at: '2024-09-01T00:00:00Z' });
	});

	it('skips an entry with no timestamp rather than placing it arbitrarily', () => {
		const history = reduceAudit([
			{ operation: { alsoKnownAs: ['at://undated.test'] } },
			entry('2024-01-01T00:00:00Z', 'dated.test')
		]);

		expect(history.handles.map((h) => h.handle)).toEqual(['dated.test']);
	});

	it('tolerates an unparseable endpoint without losing the handle beside it', () => {
		const history = reduceAudit([entry('2022-01-01T00:00:00Z', 'alice.test', 'not a url')]);

		expect({ handles: history.handles.length, hosts: history.hosts.length }).toEqual({
			handles: 1,
			hosts: 0
		});
	});

	it('reports a log it did read as available, so an empty one means no changes', () => {
		expect(reduceAudit([]).unavailable).toBe(false);
	});
});
