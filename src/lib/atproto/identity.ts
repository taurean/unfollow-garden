import { XrpcError, query } from './xrpc';

/** The public AppView. Every read in this app goes through it or a PDS. */
export const APPVIEW = 'https://public.api.bsky.app';

/** Where Bluesky's own PDSes live. See `pdsForLogin` for why this matters. */
const BSKY_PDS_SUFFIX = '.host.bsky.network';

/** The entryway that fronts every Bluesky-hosted PDS for authentication. */
const BSKY_ENTRYWAY = 'https://bsky.social';

interface DidDocument {
	service?: Array<{ id: string; type: string; serviceEndpoint: string }>;
}

/** Turn a handle like `alice.bsky.social` into a DID. */
export async function resolveHandle(handle: string): Promise<string> {
	const { did } = await query<{ did: string }>(APPVIEW, 'com.atproto.identity.resolveHandle', {
		handle
	});
	return did;
}

/** Fetch an account's DID document from wherever that identity method keeps it. */
async function fetchDidDocument(did: string): Promise<DidDocument> {
	const url = did.startsWith('did:web:')
		? `https://${decodeURIComponent(did.slice('did:web:'.length))}/.well-known/did.json`
		: `https://plc.directory/${encodeURIComponent(did)}`;

	const response = await fetch(url).catch((cause) => {
		throw new XrpcError(
			0,
			'did-document',
			`could not reach ${new URL(url).host}: ${String(cause)}`
		);
	});
	if (!response.ok) {
		throw new XrpcError(response.status, 'did-document', `no DID document for ${did}`);
	}
	return (await response.json()) as DidDocument;
}

/**
 * The origin of the PDS that actually stores this account's repo.
 *
 * This is where records are read from and written to.
 */
export async function pdsForDid(did: string): Promise<string> {
	const doc = await fetchDidDocument(did);
	const pds = doc.service?.find(
		(entry) => entry.id === '#atproto_pds' || entry.type === 'AtprotoPersonalDataServer'
	);
	if (!pds) throw new XrpcError(0, 'did-document', `${did} has no PDS in its DID document`);
	return pds.serviceEndpoint.replace(/\/$/, '');
}

/**
 * Where to send `createSession` for an account, which is not always its PDS.
 *
 * Bluesky-hosted accounts have a PDS like `shiitake.us-east.host.bsky.network`
 * in their DID document, but those hosts do not authenticate anyone — logins go
 * to the `bsky.social` entryway instead, which issues tokens the PDS accepts.
 * Sending credentials straight to the PDS host fails with an authentication
 * error that reads as a wrong password.
 *
 * Self-hosted PDSes authenticate for themselves, so they are used as-is.
 *
 * OAuth removes this distinction entirely, which is one of the reasons v1 moves
 * to it. See CONTEXT.md.
 */
export function pdsForLogin(pds: string): string {
	return new URL(pds).host.endsWith(BSKY_PDS_SUFFIX) ? BSKY_ENTRYWAY : pds;
}
