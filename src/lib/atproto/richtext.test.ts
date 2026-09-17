import { describe, expect, it } from 'vitest';
import { parseBio } from './richtext';

/** Just the linked parts, which is what every case here is really about. */
const linksIn = (text: string) =>
	parseBio(text)
		.filter((s) => s.kind !== 'text')
		.map((s) => ({ kind: s.kind, text: s.text, href: s.href }));

/** The visible text, which must survive whatever the parser did to it. */
const textOf = (text: string) =>
	parseBio(text)
		.map((s) => s.text)
		.join('');

describe('parseBio', () => {
	it('leaves a bio with nothing in it as one piece of text', () => {
		expect(parseBio('Writes about typography and old maps.')).toEqual([
			{ kind: 'text', text: 'Writes about typography and old maps.' }
		]);
	});

	it('links an http URL', () => {
		expect(linksIn('site: https://example.com/about')).toEqual([
			{ kind: 'link', text: 'https://example.com/about', href: 'https://example.com/about' }
		]);
	});

	it('gives a bare www address a scheme, since an href without one is relative', () => {
		expect(linksIn('www.example.com')).toEqual([
			{ kind: 'link', text: 'www.example.com', href: 'https://www.example.com' }
		]);
	});

	it('links a mention to the profile it names', () => {
		expect(linksIn('Founded by @wang.social')).toEqual([
			{ kind: 'mention', text: '@wang.social', href: 'https://bsky.app/profile/wang.social' }
		]);
	});

	it('finds several things in one bio', () => {
		expect(linksIn('@alice.test and @bob.example.com, see https://example.com')).toHaveLength(3);
	});

	it('leaves the full stop that ends the sentence out of the link', () => {
		// Bios end lines with "see example.com." far more often than a domain
		// genuinely ends in a stop.
		expect(linksIn('see https://example.com.')).toEqual([
			{ kind: 'link', text: 'https://example.com', href: 'https://example.com' }
		]);
	});

	it('leaves a closing bracket out of a link it wraps', () => {
		expect(linksIn('(https://example.com)')).toEqual([
			{ kind: 'link', text: 'https://example.com', href: 'https://example.com' }
		]);
	});

	it('keeps a trailing comma out of a mention but on the screen', () => {
		expect({
			links: linksIn('@alice.test, @bob.test'),
			text: textOf('@alice.test, @bob.test')
		}).toEqual({
			links: [
				{ kind: 'mention', text: '@alice.test', href: 'https://bsky.app/profile/alice.test' },
				{ kind: 'mention', text: '@bob.test', href: 'https://bsky.app/profile/bob.test' }
			],
			text: '@alice.test, @bob.test'
		});
	});

	it('never loses or invents a character of the bio', () => {
		// The parser splits text for display; anything it drops is text the
		// author wrote and the reader never sees.
		const bio = 'Hi @alice.test!\n\nSee https://example.com/x?y=1 (or www.other.org), thanks.';

		expect(textOf(bio)).toBe(bio);
	});

	it('does not treat an email address as a mention', () => {
		// "@example.com" inside an address is not a handle, and linking it
		// would send a reader to a profile that is not the author's.
		expect(linksIn('me@example.com')).toEqual([]);
	});

	it('does not link a bare word with no dot', () => {
		expect(linksIn('@alice')).toEqual([]);
	});

	it('does not link a decimal or a version number', () => {
		expect(linksIn('v2.0 and 3.5 stars')).toEqual([]);
	});

	it('keeps line breaks, which a bio uses deliberately', () => {
		expect(textOf('one\n\ntwo')).toBe('one\n\ntwo');
	});
});

describe('mentions and the chosen client', () => {
	it('opens a mention in the client the user picked', () => {
		const segments = parseBio('Founded by @wang.social', 'mu');

		expect(segments.find((s) => s.kind === 'mention')?.href).toBe(
			'https://mu.social/profile/wang.social'
		);
	});
});
