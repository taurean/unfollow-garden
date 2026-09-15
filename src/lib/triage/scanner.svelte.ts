import { SvelteMap } from 'svelte/reactivity';
import { loadActivity, type SubjectActivity } from '$lib/atproto/activity';
import { onRateLimitWait } from '$lib/atproto/xrpc';
import { loadActivityCache, saveActivityCache, type FollowSnapshot } from '$lib/storage/db';

/**
 * Loads every subject's activity in the background while the user reviews.
 *
 * Activity is the expensive part of this app: three to ten requests per
 * subject, spread across the AppView and a few thousand arbitrary PDSes. It
 * cannot block the first screen, so it runs behind the triage loop and fills
 * subjects in as they arrive.
 */

export type ActivityStatus = 'pending' | 'loading' | 'ready' | 'error';

export interface ActivityState {
	status: ActivityStatus;
	activity: SubjectActivity | null;
	error: string | null;
	/**
	 * The latest event inside the covered window, or null when there was none.
	 *
	 * Precomputed at load rather than derived on read: the queue sorts every
	 * undecided subject by it on each advance, and recomputing from a few
	 * thousand event arrays per keystroke is the difference between instant and
	 * noticeable. It does not depend on the gap threshold, so it stays correct
	 * when that setting moves.
	 */
	lastActive: string | null;
}

const PENDING: ActivityState = {
	status: 'pending',
	activity: null,
	error: null,
	lastActive: null
};

/** How many subjects load at once (PRD, LOAD-2). */
const CONCURRENCY = 4;

/** The newest event the covered window accounts for, or null if it holds none. */
function latestEventInWindow(activity: SubjectActivity): string | null {
	const start = Date.parse(activity.window.start);
	const end = Date.parse(activity.window.end);
	let latest: number | null = null;
	for (const event of activity.events) {
		const at = Date.parse(event.at);
		if (at < start || at > end) continue;
		if (latest === null || at > latest) latest = at;
	}
	return latest === null ? null : new Date(latest).toISOString();
}

export class ActivityScanner {
	/**
	 * Per-subject state in a reactive map rather than one deep-proxied object.
	 *
	 * A plain object holding a few thousand event arrays would be proxied all
	 * the way down and re-read on every write. `SvelteMap` tracks per entry, so
	 * one subject finishing loading touches only the rows that read it.
	 */
	states = new SvelteMap<string, ActivityState>();

	loaded = $state(0);
	total = $state(0);
	running = $state(false);

	/** Set while a request is sleeping off a 429, so the header can say so. */
	waitingOnRateLimit = $state(false);

	constructor() {
		onRateLimitWait((isWaiting) => {
			this.waitingOnRateLimit = isWaiting;
		});
	}

	#queue: string[] = [];
	#urgent: string[] = [];
	// A private lookup read only inside #loadOne, never rendered, so it does not
	// need — or want — the per-entry tracking SvelteMap adds.
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	#createdAt = new Map<string, string | undefined>();
	#lookbackDays = 365;
	#generation = 0;

	get(subjectDid: string): ActivityState {
		return this.states.get(subjectDid) ?? PENDING;
	}

	/** True once every subject has either loaded or failed. */
	get complete(): boolean {
		return this.total > 0 && this.loaded >= this.total;
	}

	/**
	 * Begin (or restart) a scan.
	 *
	 * A restart bumps the generation, so workers from the previous scan stop
	 * writing results the moment they notice — a lookback change must not have
	 * the old window's events landing in the new one's map.
	 */
	start(subjects: FollowSnapshot[], lookbackDays: number): void {
		this.#generation++;
		const generation = this.#generation;

		this.#lookbackDays = lookbackDays;
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		this.#createdAt = new Map(
			subjects.map((subject) => [subject.subjectDid, subject.profile?.createdAt])
		);

		// Subjects with no profile are deleted, deactivated, or suspended. There
		// is no feed to read, and asking costs a failed request each.
		this.#queue = subjects.filter((s) => s.profile).map((s) => s.subjectDid);
		this.#urgent = [];
		this.states.clear();
		this.loaded = 0;
		this.total = this.#queue.length;
		this.running = this.total > 0;

		for (let worker = 0; worker < CONCURRENCY; worker++) {
			void this.#work(generation);
		}
	}

	/**
	 * Load this subject next.
	 *
	 * Called when a subject reaches the screen. Without it the reader waits
	 * behind however much of the queue happens to be in front of them.
	 */
	prioritize(subjectDid: string): void {
		if (this.get(subjectDid).status !== 'pending') return;
		if (this.#urgent.includes(subjectDid)) return;
		this.#urgent.unshift(subjectDid);
	}

	#next(): string | undefined {
		while (this.#urgent.length > 0) {
			const did = this.#urgent.shift();
			if (did && this.get(did).status === 'pending') return did;
		}
		while (this.#queue.length > 0) {
			const did = this.#queue.shift();
			if (did && this.get(did).status === 'pending') return did;
		}
		return undefined;
	}

	async #work(generation: number): Promise<void> {
		for (;;) {
			if (generation !== this.#generation) return;

			const subjectDid = this.#next();
			if (!subjectDid) break;

			this.states.set(subjectDid, {
				status: 'loading',
				activity: null,
				error: null,
				lastActive: null
			});

			try {
				const activity = await this.#loadOne(subjectDid);
				if (generation !== this.#generation) return;
				this.states.set(subjectDid, {
					status: 'ready',
					activity,
					error: null,
					lastActive: latestEventInWindow(activity)
				});
			} catch (cause) {
				if (generation !== this.#generation) return;
				// One subject's PDS being unreachable is that subject's problem.
				// It is shown on their card and the scan carries on (LOAD-2).
				this.states.set(subjectDid, {
					status: 'error',
					activity: null,
					error: cause instanceof Error ? cause.message : String(cause),
					lastActive: null
				});
			}

			this.loaded++;
		}

		if (generation === this.#generation && this.#queue.length === 0 && this.#urgent.length === 0) {
			this.running = false;
		}
	}

	async #loadOne(subjectDid: string): Promise<SubjectActivity> {
		const cached = await loadActivityCache(subjectDid, this.#lookbackDays);
		if (cached) return cached;

		const activity = await loadActivity(subjectDid, {
			lookbackDays: this.#lookbackDays,
			accountCreatedAt: this.#createdAt.get(subjectDid)
		});

		// A cache write failing (quota, private browsing) costs a refetch next
		// time and nothing else, so it must not fail the subject.
		await saveActivityCache(activity).catch(() => {});
		return activity;
	}
}
