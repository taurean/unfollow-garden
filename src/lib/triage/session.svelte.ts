import { SvelteMap, SvelteSet } from 'svelte/reactivity';
import { signIn, type Session } from '$lib/atproto/session';
import { getProfiles, listFollows } from '$lib/atproto/graph';
import {
	loadDecisions,
	loadFollows,
	saveDecision,
	saveFollows,
	undoLast,
	type Decision,
	type DecisionRecord,
	type FollowSnapshot
} from '$lib/storage/db';

export type Phase = 'signed-out' | 'signing-in' | 'loading' | 'triage' | 'done';

/**
 * Where the session token lives.
 *
 * `sessionStorage`, not `localStorage`: in v0 the token is minted from an app
 * password and therefore carries full account access. It should not outlive the
 * tab. Decisions live in IndexedDB and do survive, so closing the tab costs a
 * sign-in and nothing else.
 */
const SESSION_KEY = 'unfollow-garden:session';

function storeSession(session: Session | null) {
	try {
		if (session) sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
		else sessionStorage.removeItem(SESSION_KEY);
	} catch {
		// Private browsing and blocked site data both throw here. Losing the
		// session across a reload is a worse experience, not a broken app.
	}
}

function readSession(): Session | null {
	try {
		const raw = sessionStorage.getItem(SESSION_KEY);
		return raw ? (JSON.parse(raw) as Session) : null;
	} catch {
		return null;
	}
}

/** What the loading screen is currently doing. */
export interface Progress {
	step: string;
	loaded: number;
	total: number | null;
}

export class TriageSession {
	phase = $state<Phase>('signed-out');
	session = $state<Session | null>(null);
	error = $state<string | null>(null);
	progress = $state<Progress>({ step: '', loaded: 0, total: null });

	subjects = $state<FollowSnapshot[]>([]);

	/**
	 * Reactive collections rather than reassigned plain ones.
	 *
	 * A plain Map in `$state` only notifies when the whole Map is replaced, so
	 * every write means copying the collection. At a few thousand subjects that
	 * is a copy per keystroke. `SvelteMap` tracks per-entry (PRD, "Architecture
	 * on suede").
	 */
	decisions = new SvelteMap<string, DecisionRecord>();

	/**
	 * Subjects deferred rather than decided.
	 *
	 * Session-only by design (PRD, "Terms"): a skip means "not now", and
	 * persisting it would quietly turn indecision into a decision that outlives
	 * the sitting it was made in.
	 */
	skipped = new SvelteSet<string>();

	/**
	 * The subject on screen.
	 *
	 * Deliberately state, not a derivation of the queue. If it were derived,
	 * recording a decision would change the queue and the screen would move on
	 * its own — and later, background activity loading would reorder the queue
	 * under the user mid-read. It changes only when a user action or an empty
	 * screen calls `advance`.
	 */
	current = $state<FollowSnapshot | null>(null);

	undecided = $derived(this.subjects.filter((s) => !this.decisions.has(s.subjectDid)));
	remaining = $derived(this.undecided.filter((s) => !this.skipped.has(s.subjectDid)));
	skippedCount = $derived(this.undecided.filter((s) => this.skipped.has(s.subjectDid)).length);
	keptCount = $derived(this.countOf('keep'));
	markedCount = $derived(this.countOf('unfollow'));

	private countOf(decision: Decision): number {
		let total = 0;
		for (const record of this.decisions.values()) if (record.decision === decision) total++;
		return total;
	}

	/** Restore a session left in this tab, if there is one. */
	async restore(): Promise<void> {
		const session = readSession();
		if (!session) return;
		this.session = session;
		await this.loadEverything(session, { refetch: false });
	}

	async signIn(handle: string, appPassword: string): Promise<void> {
		this.error = null;
		this.phase = 'signing-in';
		try {
			const session = await signIn(handle, appPassword);
			this.session = session;
			storeSession(session);
			await this.loadEverything(session, { refetch: true });
		} catch (cause) {
			this.error = cause instanceof Error ? cause.message : String(cause);
			this.phase = 'signed-out';
		}
	}

	signOut(): void {
		storeSession(null);
		this.session = null;
		this.subjects = [];
		this.decisions.clear();
		this.skipped.clear();
		this.current = null;
		this.phase = 'signed-out';
	}

	/**
	 * Fill the screen and the queue.
	 *
	 * `refetch: false` uses the stored snapshot, so reopening a review does not
	 * re-read a few thousand follows to show the same list.
	 */
	private async loadEverything(session: Session, { refetch }: { refetch: boolean }): Promise<void> {
		this.phase = 'loading';
		this.error = null;

		try {
			this.decisions.clear();
			for (const [subjectDid, record] of await loadDecisions(session.did)) {
				this.decisions.set(subjectDid, record);
			}

			let subjects = refetch ? [] : await loadFollows(session.did);

			if (subjects.length === 0) {
				this.progress = { step: 'Reading your follows', loaded: 0, total: null };
				const follows = await listFollows(session, (loaded) => {
					this.progress = { step: 'Reading your follows', loaded, total: null };
				});

				const subjectDids = follows.map((f) => f.subjectDid);
				this.progress = { step: 'Loading profiles', loaded: 0, total: subjectDids.length };
				const profiles = await getProfiles(subjectDids, (loaded) => {
					this.progress = { step: 'Loading profiles', loaded, total: subjectDids.length };
				});

				subjects = await saveFollows(session.did, follows, profiles);
			}

			this.subjects = subjects;
			this.advance();
		} catch (cause) {
			this.error = cause instanceof Error ? cause.message : String(cause);
			this.phase = 'signed-out';
		}
	}

	/**
	 * Put the next undecided subject on screen.
	 *
	 * v0 ordering: subjects with no profile first — they are unavailable
	 * accounts, the easiest calls to make and the ones a flat follow list hides
	 * — then oldest follows first. Ordering by inactivity arrives with activity
	 * loading in slice 2 (PRD, TRI-2).
	 */
	advance(): void {
		const next = [...this.remaining].sort((a, b) => {
			if (!a.profile !== !b.profile) return a.profile ? 1 : -1;
			return (a.followedAt ?? '').localeCompare(b.followedAt ?? '');
		})[0];

		this.current = next ?? null;
		this.phase = next ? 'triage' : 'done';
	}

	/** Defer the subject on screen to the end of this sitting. */
	skip(): void {
		const subject = this.current;
		if (!subject) return;
		this.skipped.add(subject.subjectDid);
		this.advance();
	}

	/** Put the skipped subjects back in the queue. */
	reviewSkipped(): void {
		this.skipped.clear();
		this.advance();
	}

	/**
	 * Record a decision about the subject on screen, then move on.
	 *
	 * The write completes before the next subject appears. If it fails the
	 * subject stays put and the error is shown, because a decision the user
	 * believes was saved and was not is the one failure this app cannot have.
	 */
	async decide(decision: Extract<Decision, 'keep' | 'unfollow'>): Promise<void> {
		const subject = this.current;
		const session = this.session;
		if (!subject || !session) return;

		try {
			const record = await saveDecision(session.did, subject.subjectDid, decision);
			this.decisions.set(subject.subjectDid, record);
			this.error = null;
			this.advance();
		} catch (cause) {
			this.error = `Could not save that decision: ${cause instanceof Error ? cause.message : String(cause)}`;
		}
	}

	/** Take back the last decision and return to that subject. */
	async undo(): Promise<void> {
		const session = this.session;
		if (!session) return;

		const subjectDid = await undoLast(session.did);
		if (!subjectDid) return;

		this.decisions.delete(subjectDid);
		this.skipped.delete(subjectDid);

		this.current = this.subjects.find((s) => s.subjectDid === subjectDid) ?? this.current;
		this.phase = 'triage';
	}
}
