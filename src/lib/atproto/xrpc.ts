/**
 * The thinnest possible XRPC client.
 *
 * v0 talks to atproto with `fetch` and no SDK. The surface the app needs is
 * four endpoints and a rate-limit rule, and an SDK would bring session
 * management this version deliberately keeps in one place.
 */

/** A request that reached a server and came back as a failure. */
export class XrpcError extends Error {
	constructor(
		readonly status: number,
		readonly endpoint: string,
		message: string
	) {
		super(message);
		this.name = 'XrpcError';
	}
}

/** How long to wait when a server asks us to slow down, in milliseconds. */
function retryDelay(response: Response): number {
	const reset = response.headers.get('RateLimit-Reset');
	if (reset) {
		// The header is a unix timestamp in seconds, not a duration.
		const waitMs = Number(reset) * 1000 - Date.now();
		if (Number.isFinite(waitMs) && waitMs > 0) return Math.min(waitMs, 60_000);
	}
	// Browsers cannot always read the header cross-origin. 30s is the PRD's
	// documented fallback — long enough to be polite, short enough to finish.
	return 30_000;
}

const MAX_RETRIES = 4;

/**
 * Whether any request is currently sleeping off a rate limit.
 *
 * A scan that hits the AppView's limit simply stops producing results, which
 * from the outside is indistinguishable from a hang. The loading indicator has
 * to be able to say "waiting", and this is the only place that knows.
 */
type RateLimitListener = (waiting: boolean) => void;

const rateLimitListeners = new Set<RateLimitListener>();
let waiting = 0;

export function onRateLimitWait(listener: RateLimitListener): () => void {
	rateLimitListeners.add(listener);
	listener(waiting > 0);
	return () => rateLimitListeners.delete(listener);
}

function notifyWaiting(): void {
	for (const listener of rateLimitListeners) listener(waiting > 0);
}

/** Sleep out a rate limit, telling anyone watching that we are stalled. */
async function waitOutRateLimit(response: Response): Promise<void> {
	waiting++;
	if (waiting === 1) notifyWaiting();
	try {
		await new Promise((resolve) => setTimeout(resolve, retryDelay(response)));
	} finally {
		waiting--;
		if (waiting === 0) notifyWaiting();
	}
}

async function request(url: string, init: RequestInit, endpoint: string): Promise<unknown> {
	for (let attempt = 0; ; attempt++) {
		let response: Response;
		try {
			response = await fetch(url, init);
		} catch (cause) {
			// A network-level failure, which for a third-party PDS usually means
			// it is down or sends no CORS headers. Say which host, because the
			// browser's own message does not.
			throw new XrpcError(0, endpoint, `could not reach ${new URL(url).host}: ${String(cause)}`);
		}

		if (response.status === 429 && attempt < MAX_RETRIES) {
			await waitOutRateLimit(response);
			continue;
		}

		if (!response.ok) {
			const body = await response.text().catch(() => '');
			throw new XrpcError(
				response.status,
				endpoint,
				`${endpoint} failed with ${response.status}${body ? `: ${body.slice(0, 200)}` : ''}`
			);
		}

		return response.json();
	}
}

/** A GET against an XRPC endpoint. `service` is an origin, e.g. https://bsky.social */
export async function query<T>(
	service: string,
	endpoint: string,
	params: Record<string, string | string[] | undefined> = {},
	accessJwt?: string
): Promise<T> {
	const url = new URL(`/xrpc/${endpoint}`, service);
	for (const [key, value] of Object.entries(params)) {
		if (value === undefined) continue;
		// Repeated keys are how XRPC takes arrays, e.g. actors=a&actors=b.
		for (const item of Array.isArray(value) ? value : [value]) url.searchParams.append(key, item);
	}
	const headers: Record<string, string> = {};
	if (accessJwt) headers.Authorization = `Bearer ${accessJwt}`;
	return request(url.toString(), { headers }, endpoint) as Promise<T>;
}

/** A POST against an XRPC endpoint. */
export async function procedure<T>(
	service: string,
	endpoint: string,
	body: unknown,
	accessJwt?: string
): Promise<T> {
	const headers: Record<string, string> = { 'Content-Type': 'application/json' };
	if (accessJwt) headers.Authorization = `Bearer ${accessJwt}`;
	return request(
		new URL(`/xrpc/${endpoint}`, service).toString(),
		{ method: 'POST', headers, body: JSON.stringify(body) },
		endpoint
	) as Promise<T>;
}
