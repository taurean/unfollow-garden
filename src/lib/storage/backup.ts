import { db } from './db';
import type { DecisionRecord, RunRecord, Settings } from './db';

/**
 * Export and import, so a review is not trapped in one browser profile.
 *
 * Safari can clear script-written storage for a site not visited in seven days,
 * and there is no server copy by design. A file the user holds is the only
 * backstop, which is why the format is plain, versioned, and inspectable.
 */

/** Bumped when the shape changes. Import refuses a version it does not know. */
export const FORMAT_VERSION = 1;

export interface BackupFile {
	formatVersion: number;
	ownerDid: string;
	exportedAt: string;
	settings: Settings | null;
	decisions: DecisionRecord[];
	undo: string[];
	runs: RunRecord[];
}

/** Everything about one owner except the activity cache, which is refetchable. */
export async function exportOwner(ownerDid: string): Promise<BackupFile> {
	const database = await db();
	const decisions = (await database.getAll('decisions')).filter((d) => d.ownerDid === ownerDid);

	return {
		formatVersion: FORMAT_VERSION,
		ownerDid,
		exportedAt: new Date().toISOString(),
		settings: (await database.get('settings', ownerDid)) ?? null,
		decisions,
		undo: (await database.get('undo', ownerDid))?.subjectDids ?? [],
		runs: await database.getAllFromIndex('runs', 'byOwner', ownerDid)
	};
}

export interface ImportReport {
	added: number;
	updated: number;
	skipped: number;
	runsAdded: number;
}

/** Everything wrong with a file, said before anything is written. */
function validate(parsed: unknown, ownerDid: string): BackupFile {
	if (!parsed || typeof parsed !== 'object') {
		throw new Error('That file is not a backup: it does not contain a JSON object.');
	}
	const file = parsed as Partial<BackupFile>;

	if (file.formatVersion !== FORMAT_VERSION) {
		throw new Error(
			`That backup is format version ${String(file.formatVersion)}, and this app reads version ${FORMAT_VERSION}.`
		);
	}
	if (file.ownerDid !== ownerDid) {
		// Naming both DIDs, because "wrong account" is useless when someone has
		// two and cannot tell which file is which.
		throw new Error(
			`That backup belongs to ${String(file.ownerDid)}, and you are signed in as ${ownerDid}.`
		);
	}
	if (!Array.isArray(file.decisions)) {
		throw new Error('That backup has no decisions list.');
	}
	return file as BackupFile;
}

/**
 * Merge a backup into the signed-in owner's data.
 *
 * Where both sides know about a subject, the later `decidedAt` wins. That rule
 * makes import idempotent and makes the direction of the merge not matter,
 * which is what someone restoring after a browser wipe actually needs.
 */
export async function importOwner(json: string, ownerDid: string): Promise<ImportReport> {
	let parsed: unknown;
	try {
		parsed = JSON.parse(json);
	} catch (cause) {
		throw new Error(`That file is not valid JSON: ${String(cause)}`, { cause });
	}

	const file = validate(parsed, ownerDid);
	const report: ImportReport = { added: 0, updated: 0, skipped: 0, runsAdded: 0 };

	const database = await db();
	const tx = database.transaction(['decisions', 'undo', 'runs', 'settings'], 'readwrite');
	const decisions = tx.objectStore('decisions');

	for (const incoming of file.decisions) {
		if (incoming.ownerDid !== ownerDid) {
			report.skipped++;
			continue;
		}
		const existing = await decisions.get([ownerDid, incoming.subjectDid]);
		if (!existing) {
			await decisions.put(incoming);
			report.added++;
		} else if (Date.parse(incoming.decidedAt) > Date.parse(existing.decidedAt)) {
			await decisions.put(incoming);
			report.updated++;
		} else {
			report.skipped++;
		}
	}

	const runs = tx.objectStore('runs');
	for (const run of file.runs ?? []) {
		if (run.ownerDid !== ownerDid) continue;
		if (await runs.get(run.id)) continue;
		await runs.put(run);
		report.runsAdded++;
	}

	if (file.settings) await tx.objectStore('settings').put({ ...file.settings, ownerDid });
	if (file.undo?.length) await tx.objectStore('undo').put({ ownerDid, subjectDids: file.undo });

	await tx.done;
	return report;
}

/**
 * Ask the browser not to evict this origin's storage.
 *
 * Chromium grants it by heuristic, Firefox asks, and Safari does not offer it
 * at all. The answer is shown in settings rather than assumed, because the
 * difference decides whether export is optional or the only safe habit.
 */
export async function requestPersistence(): Promise<boolean | null> {
	if (!navigator.storage?.persist) return null;
	try {
		return (await navigator.storage.persisted()) || (await navigator.storage.persist());
	} catch {
		return null;
	}
}
