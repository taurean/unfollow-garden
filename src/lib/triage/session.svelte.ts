import { SvelteMap, SvelteSet } from 'svelte/reactivity';
import { signIn, type Session } from '$lib/atproto/session';
import { getFollowsOwner, getProfiles, listFollows } from '$lib/atproto/graph';
import {
	exportOwner,
	importOwner,
	requestPersistence,
	type ImportReport
} from '$lib/storage/backup';
import {
	DEFAULT_SETTINGS,
	deleteOwnerData,
	loadRuns,
	type RunRecord,
	loadDecisions,
	loadFollows,
	loadSettings,
	saveDecision,
	saveFollows,
	saveSettings,
	undoLast,
	type Decision,
	type DecisionRecord,
	type FollowSnapshot,
	type Settings
} from '$lib/storage/db';
import { ActivityScanner } from './scanner.svelte';
import { RunController } from './runs.svelte';

export type Phase =
	| 'signed-out'
	| 'signing-in'
	| 'loading'
	| 'triage'
	| 'done'
	/** Reviewing the marked list before anything is deleted (PRD, RUN-1). */
	| 'review'
	/** A run is in flight, or has just finished. */
	| 'running'
	/** Settings, past runs, backup, and delete-all. */
	| 'settings';

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

	/** Lookback and gap threshold, stored per owner. */
	settings = $state<Settings>({ ownerDid: '', ...DEFAULT_SETTINGS });

	/**
	 * Activity loading, which runs behind the triage loop.
	 *
	 * Owned by the session rather than the screen so a subject's activity
	 * survives the screen being swapped out from under it, and so the queue can
	 * read what has loaded when it decides who is next.
	 */
	scanner = new ActivityScanner();

	/** Unfollow runs. Separate from triage because a run outlives the queue. */
	runs = new RunController();

	/** Past runs, loaded when the settings screen opens. */
	pastRuns = $state<RunRecord[]>([]);

	/**
	 * Whether the browser has promised not to evict this origin's storage.
	 *
	 * Null means the browser does not offer the guarantee at all, which is a
	 * different answer from "no" and is the case export exists for (STORE-2).
	 */
	persisted = $state<boolean | null>(null);

	/** What the last import did, so the user is told rather than left guessing. */
	importReport = $state<ImportReport | null>(null);

	/** The phase to return to when settings closes. */
	private phaseBeforeSettings: Phase = 'triage';

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

	/**
	 * The subjects a run would act on.
	 *
	 * Read from the decision map rather than kept as its own list, so a keep
	 * recorded on the review screen removes the subject here without a second
	 * place to forget to update.
	 */
	marked = $derived(
		this.subjects.filter((s) => this.decisions.get(s.subjectDid)?.decision === 'unfollow')
	);

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

	/**
	 * Change the lookback or the gap threshold.
	 *
	 * A new lookback restarts the scan, because it changes which events exist.
	 * A new threshold does not, because it only decides which stretches are
	 * long enough to name (PRD, "Metrics").
	 */
	async updateSettings(next: Partial<Omit<Settings, 'ownerDid'>>): Promise<void> {
		const session = this.session;
		if (!session) return;

		const previous = this.settings;
		this.settings = { ...previous, ...next, ownerDid: session.did };
		await saveSettings($state.snapshot(this.settings));

		if (this.settings.lookbackDays !== previous.lookbackDays) {
			this.scanner.start(this.subjects, this.settings.lookbackDays);
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
			this.settings = await loadSettings(session.did);

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

				this.progress = {
					step: 'Checking who follows you back',
					loaded: 0,
					total: subjectDids.length
				};
				// Follow-back status is a nice-to-have on the card, not a reason
				// to fail a load that already has every profile.
				const followsOwner = await getFollowsOwner(session.did, subjectDids, (loaded) => {
					this.progress = {
						step: 'Checking who follows you back',
						loaded,
						total: subjectDids.length
					};
					// An empty result is passed straight to saveFollows and never
					// held in reactive state.
					// eslint-disable-next-line svelte/prefer-svelte-reactivity
				}).catch(() => new Map<string, boolean>());

				subjects = await saveFollows(session.did, follows, profiles, followsOwner);
			}

			this.subjects = subjects;
			this.scanner.start(subjects, this.settings.lookbackDays);

			// An unfinished run outranks the queue: it already deleted records,
			// and leaving it half-done is the one state the user cannot see.
			await this.runs.findUnfinished(session.did);

			this.advance();
		} catch (cause) {
			this.error = cause instanceof Error ? cause.message : String(cause);
			this.phase = 'signed-out';
		}
	}

	/**
	 * Where a subject sits in the queue, lowest first (PRD, TRI-2).
	 *
	 * 0 — unavailable, or activity failed to load. The easiest calls to make,
	 *     and the ones a flat follow list buries.
	 * 1 — loaded, and silent for the whole covered window.
	 * 2 — loaded and active; ordered among themselves by how long ago.
	 * 3 — not loaded yet. "Next" is chosen from what has loaded, so a subject
	 *     the scan has not reached waits rather than jumping the queue on the
	 *     strength of knowing nothing about them.
	 */
	private rank(subject: FollowSnapshot): number {
		if (!subject.profile) return 0;
		const state = this.scanner.get(subject.subjectDid);
		if (state.status === 'error') return 0;
		if (state.status !== 'ready') return 3;
		return state.lastActive === null ? 1 : 2;
	}

	/** Put the next undecided subject on screen, least recently active first. */
	advance(): void {
		const next = [...this.remaining].sort((a, b) => {
			const byRank = this.rank(a) - this.rank(b);
			if (byRank !== 0) return byRank;

			const aLast = this.scanner.get(a.subjectDid).lastActive;
			const bLast = this.scanner.get(b.subjectDid).lastActive;
			if (aLast && bLast) return aLast.localeCompare(bLast);

			// Within a rank where neither has a last-active date, the oldest
			// follow goes first: it is the one most likely to have drifted.
			return (a.followedAt ?? '').localeCompare(b.followedAt ?? '');
		})[0];

		this.current = next ?? null;
		this.phase = next ? 'triage' : 'done';
		if (next) this.scanner.prioritize(next.subjectDid);
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

	async openSettings(): Promise<void> {
		const session = this.session;
		if (!session) return;
		this.phaseBeforeSettings = this.phase === 'settings' ? 'triage' : this.phase;
		this.phase = 'settings';
		this.pastRuns = await loadRuns(session.did);
		this.persisted = await requestPersistence();
	}

	closeSettings(): void {
		this.error = null;
		this.importReport = null;
		this.phase = this.phaseBeforeSettings;
	}

	/** The backup file's contents, for the user to save wherever they keep things. */
	async exportData(): Promise<string> {
		const session = this.session;
		if (!session) return '';
		return JSON.stringify(await exportOwner(session.did), null, 2);
	}

	/** Merge a backup back in, then reload what the screens read. */
	async importData(json: string): Promise<void> {
		const session = this.session;
		if (!session) return;
		this.error = null;
		this.importReport = null;
		try {
			this.importReport = await importOwner(json, session.did);
			await this.refreshDecisions();
			this.pastRuns = await loadRuns(session.did);
		} catch (cause) {
			this.error = cause instanceof Error ? cause.message : String(cause);
		}
	}

	/**
	 * Delete everything stored for this owner and start over.
	 *
	 * The caller confirms first (STORE-4). Nothing here is recoverable and none
	 * of it exists anywhere else, which is the whole point of the app.
	 */
	async deleteAllData(): Promise<void> {
		const session = this.session;
		if (!session) return;
		await deleteOwnerData(session.did);
		this.decisions.clear();
		this.skipped.clear();
		this.pastRuns = [];
		this.runs.unfinished = null;
		this.settings = { ownerDid: session.did, ...DEFAULT_SETTINGS };
		this.advance();
	}

	/** Follow every account a past run unfollowed (PRD, RESTORE-1). */
	async restoreRun(run: RunRecord): Promise<void> {
		const session = this.session;
		if (!session) return;

		const subjectDids = run.targets.map((target) => target.subjectDid);
		await this.runs.restore(session, run, subjectDids, (next) => {
			this.session = next;
			storeSession(next);
		});
		await this.refreshDecisions();
	}

	/** Show the marked list, which is the last stop before anything is deleted. */
	review(): void {
		this.phase = 'review';
	}

	/** Leave the review screen for whatever is left to decide. */
	backToTriage(): void {
		this.advance();
	}

	/**
	 * Take a subject off the unfollow list from the review screen.
	 *
	 * The full undo stack is not involved: this is a correction made while
	 * looking at the list, not a decision being walked back one at a time.
	 */
	async keepInstead(subjectDid: string): Promise<void> {
		const session = this.session;
		if (!session) return;
		const record = await saveDecision(session.did, subjectDid, 'keep');
		this.decisions.set(subjectDid, record);
	}

	/** Delete the follow records for every marked subject. */
	async startRun(): Promise<void> {
		const session = this.session;
		if (!session) return;

		this.phase = 'running';
		await this.runs.startUnfollow(session, $state.snapshot(this.marked), (next) => {
			this.session = next;
			storeSession(next);
		});
		await this.refreshDecisions();
	}

	/** Pick up a run that was interrupted by a closed tab or a dead network. */
	async resumeRun(): Promise<void> {
		const session = this.session;
		if (!session) return;

		this.phase = 'running';
		await this.runs.resume(session, (next) => {
			this.session = next;
			storeSession(next);
		});
		await this.refreshDecisions();
	}

	/** Re-read decisions after a run has written `unfollowed` behind the UI's back. */
	private async refreshDecisions(): Promise<void> {
		const session = this.session;
		if (!session) return;
		this.decisions.clear();
		for (const [subjectDid, record] of await loadDecisions(session.did)) {
			this.decisions.set(subjectDid, record);
		}
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

			// Asked once, after the first decision: before that there is nothing
			// to lose, and a permission prompt with nothing behind it is noise.
			if (this.persisted === null && this.decisions.size === 1) {
				this.persisted = await requestPersistence();
			}

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
