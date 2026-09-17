import { describe, expect, it } from 'vitest';
import { identityLink, INVALID_HANDLE } from './links';

const DID = 'did:plc:tft77e5qkblxtneeib4lp3zk';

describe('identityLink', () => {
	it('names an account by its handle and points at its profile', () => {
		expect(identityLink({ did: DID, handle: 'alice.test' }, DID)).toEqual({
			href: 'https://bsky.app/profile/alice.test',
			label: '@alice.test',
			kind: 'handle'
		});
	});

	it('falls back to the DID when the handle did not verify', () => {
		// `handle.invalid` is a real string, so it renders and links like any
		// other handle unless it is spotted here.
		expect(identityLink({ did: DID, handle: INVALID_HANDLE }, DID)).toEqual({
			href: `https://atproto.at//${DID}`,
			label: DID,
			kind: 'did'
		});
	});

	it('falls back to the DID when there is no profile at all', () => {
		expect(identityLink(null, DID)).toEqual({
			href: `https://atproto.at//${DID}`,
			label: DID,
			kind: 'did'
		});
	});

	it('links a did:web account the same way, since the browser takes both', () => {
		const web = 'did:web:example.com';

		expect(identityLink(null, web).href).toBe(`https://atproto.at//${web}`);
	});
});

describe('identityLink and the chosen client', () => {
	it('opens a handle in the client the user picked', () => {
		expect(identityLink({ did: DID, handle: 'alice.test' }, DID, 'blacksky').href).toBe(
			'https://blacksky.app/profile/alice.test'
		);
	});

	it('still sends a DID to the DID browser, which has no per-client version', () => {
		// A DID browser is not a feed reader; there is no Blacksky equivalent
		// to send someone to.
		expect(identityLink(null, DID, 'blacksky').href).toBe(`https://atproto.at//${DID}`);
	});
});
