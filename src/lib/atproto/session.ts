import { procedure } from './xrpc';
import { pdsForDid, pdsForLogin, resolveHandle } from './identity';

/**
 * An authenticated session against the owner's PDS.
 *
 * `pds` is where the repo lives and every read and write is addressed.
 * `loginService` is where tokens are issued and refreshed, which for
 * Bluesky-hosted accounts is a different host — see `pdsForLogin`.
 */
export interface Session {
	did: string;
	handle: string;
	pds: string;
	loginService: string;
	accessJwt: string;
	refreshJwt: string;
}

interface CreateSessionResponse {
	did: string;
	handle: string;
	accessJwt: string;
	refreshJwt: string;
}

/**
 * Sign in with a handle and an app password.
 *
 * v0 uses app passwords because it runs locally against the developer's own
 * account and needs no hosted client identity. This is a real trade, not a
 * simplification: an app password grants full account access, where the OAuth
 * scope planned for v1 grants only the right to create and delete follow
 * records. Nothing in this app uses more than that — but the credential allows
 * it, so the credential should not outlive v0.
 *
 * The app password is used once, here, and never stored. Only the returned
 * tokens are kept.
 */
export async function signIn(handle: string, appPassword: string): Promise<Session> {
	const cleanHandle = handle.trim().replace(/^@/, '').toLowerCase();
	if (!cleanHandle) throw new Error('Enter your handle, for example alice.bsky.social');
	if (!appPassword.trim()) throw new Error('Enter an app password');

	const did = await resolveHandle(cleanHandle);
	const pds = await pdsForDid(did);
	const loginService = pdsForLogin(pds);

	const response = await procedure<CreateSessionResponse>(
		loginService,
		'com.atproto.server.createSession',
		{ identifier: cleanHandle, password: appPassword.trim() }
	);

	return {
		did: response.did,
		handle: response.handle,
		pds,
		loginService,
		accessJwt: response.accessJwt,
		refreshJwt: response.refreshJwt
	};
}

/**
 * Exchange a refresh token for a fresh session.
 *
 * Access tokens are short-lived, and a scan of a few thousand follows outlives
 * one. The refresh token is the credential here, so it goes in the header.
 */
export async function refreshSession(session: Session): Promise<Session> {
	const response = await procedure<CreateSessionResponse>(
		session.loginService,
		'com.atproto.server.refreshSession',
		{},
		session.refreshJwt
	);
	return { ...session, ...response };
}
