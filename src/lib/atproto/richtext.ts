/**
 * Links and mentions inside a profile bio.
 *
 * Unlike a post, a profile description carries no facets — the record holds
 * plain text and nothing marks where a link or a handle starts. Bluesky's own
 * client detects them from the text at render time, and so does this. That
 * means the rules here are a judgement about what looks like a link rather
 * than a reading of what the author marked as one.
 *
 * Erring towards under-detection on purpose: a missed link is text that could
 * have been clickable, while a wrong one sends a reader somewhere the author
 * never wrote.
 */

import { profileUrl } from './clients';

export type BioSegment =
	| { kind: 'text'; text: string }
	| { kind: 'link'; text: string; href: string }
	| { kind: 'mention'; text: string; href: string };

/**
 * A handle, as atproto defines one: dot-separated labels, at least two, with a
 * final label that starts with a letter so a version number or a decimal is
 * not mistaken for a domain.
 */
const HANDLE = String.raw`[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?)*\.[a-zA-Z][a-zA-Z0-9-]*`;

/** A bare domain needs a plausible ending, or every "e.g" becomes a link. */
const URL_PATTERN = String.raw`https?:\/\/[^\s<>()\[\]]+|(?:www\.)[^\s<>()\[\]]+`;

/*
 * The `@` of a mention must not have a word character before it, or the domain
 * half of `me@example.com` reads as a handle and the reader is sent to a
 * profile the author never named.
 */
const PATTERN = new RegExp(`(${URL_PATTERN})|((?<![\\w.-])@${HANDLE})`, 'g');

/**
 * Trailing punctuation belongs to the sentence, not the link.
 *
 * A bio ends a line with "see example.com." far more often than a domain
 * genuinely ends in a full stop, and the same holds for the brackets and commas
 * that wrap a URL in prose.
 */
function trimTrailing(match: string): { kept: string; trailing: string } {
	const trailed = /[.,;:!?)\]}'"]+$/.exec(match);
	if (!trailed) return { kept: match, trailing: '' };
	return { kept: match.slice(0, trailed.index), trailing: match.slice(trailed.index) };
}

/**
 * Split a bio into text, links, and mentions.
 *
 * Returns one plain-text segment for a bio with nothing in it, so a caller
 * never has to special-case the ordinary case.
 */
export function parseBio(
	description: string,
	clientId?: string,
	/**
	 * A handle's DID, when one is known.
	 *
	 * A bio carries no facets, so the handle is all the text gives. A client
	 * that addresses accounts by DID needs this to link a mention at all; one
	 * that takes handles ignores it.
	 */
	didFor?: (handle: string) => string | undefined
): BioSegment[] {
	const segments: BioSegment[] = [];
	let cursor = 0;

	const pushText = (text: string) => {
		if (!text) return;
		const last = segments.at(-1);
		// Merged rather than appended, so trailing punctuation does not leave a
		// run of one-character segments behind every link.
		if (last?.kind === 'text') last.text += text;
		else segments.push({ kind: 'text', text });
	};

	for (const match of description.matchAll(PATTERN)) {
		const index = match.index ?? 0;
		pushText(description.slice(cursor, index));
		cursor = index + match[0].length;

		const { kept, trailing } = trimTrailing(match[0]);
		if (!kept) {
			pushText(match[0]);
			continue;
		}

		if (match[1] !== undefined) {
			pushText('');
			segments.push({
				kind: 'link',
				text: kept,
				href: kept.startsWith('http') ? kept : `https://${kept}`
			});
		} else {
			segments.push({
				kind: 'mention',
				text: kept,
				href: profileUrl({ handle: kept.slice(1), did: didFor?.(kept.slice(1)) }, clientId)
			});
		}
		pushText(trailing);
	}

	pushText(description.slice(cursor));
	return segments.length > 0 ? segments : [{ kind: 'text', text: description }];
}
