import { beforeEach, describe, expect, it } from 'vitest';
import { exportOwner, importOwner, type BackupFile } from './backup';
import { db, loadDecisions, saveDecision } from './db';

/**
 * Cases from PRD.md, BACKUP-1 and BACKUP-2. Export exists because Safari can
 * clear a site's storage after a week away and nothing here is on a server, so
 * the merge rule is the difference between restoring a review and losing it.
 */

const OWNER = 'did:plc:owner';

async function wipe() {
	const database = await db();
	for (const store of ['decisions', 'undo', 'follows', 'runs', 'settings'] as const) {
		await database.clear(store);
	}
}

function backup(overrides: Partial<BackupFile> = {}): string {
	return JSON.stringify({
		formatVersion: 1,
		ownerDid: OWNER,
		exportedAt: '2026-09-01T00:00:00.000Z',
		settings: null,
		decisions: [],
		undo: [],
		runs: [],
		...overrides
	});
}

const decision = (subjectDid: string, decidedAt: string, value: 'keep' | 'unfollow' = 'keep') => ({
	ownerDid: OWNER,
	subjectDid,
	decision: value,
	decidedAt
});

beforeEach(wipe);

describe('export', () => {
	it('carries the owner, the format version, and the decisions', async () => {
		await saveDecision(OWNER, 'did:plc:a', 'unfollow');

		const file = await exportOwner(OWNER);

		expect(file.formatVersion).toBe(1);
		expect(file.ownerDid).toBe(OWNER);
		expect(file.decisions.map((d) => d.subjectDid)).toEqual(['did:plc:a']);
	});

	it('leaves out another owner’s decisions', async () => {
		await saveDecision(OWNER, 'did:plc:a', 'keep');
		await saveDecision('did:plc:someone-else', 'did:plc:b', 'keep');

		const file = await exportOwner(OWNER);

		expect(file.decisions).toHaveLength(1);
	});
});

describe('import', () => {
	it('refuses a file belonging to a different account, naming both', async () => {
		await expect(importOwner(backup({ ownerDid: 'did:plc:other' }), OWNER)).rejects.toThrow(
			/did:plc:other.*did:plc:owner/s
		);
	});

	it('refuses a format version it does not read', async () => {
		await expect(importOwner(backup({ formatVersion: 99 }), OWNER)).rejects.toThrow(/version 99/);
	});

	it('refuses a file that is not JSON at all', async () => {
		await expect(importOwner('not json', OWNER)).rejects.toThrow(/not valid JSON/);
	});

	it('adds decisions the browser does not have', async () => {
		const report = await importOwner(
			backup({ decisions: [decision('did:plc:a', '2026-08-01T00:00:00.000Z')] }),
			OWNER
		);

		expect(report.added).toBe(1);
		expect((await loadDecisions(OWNER)).get('did:plc:a')?.decision).toBe('keep');
	});

	it('lets the later decision win when both sides have one', async () => {
		await saveDecision(OWNER, 'did:plc:a', 'keep');

		const report = await importOwner(
			backup({
				// Dated well ahead of the record just written.
				decisions: [decision('did:plc:a', '2099-01-01T00:00:00.000Z', 'unfollow')]
			}),
			OWNER
		);

		expect(report.updated).toBe(1);
		expect((await loadDecisions(OWNER)).get('did:plc:a')?.decision).toBe('unfollow');
	});

	it('keeps the local decision when the file’s is older', async () => {
		await saveDecision(OWNER, 'did:plc:a', 'unfollow');

		const report = await importOwner(
			backup({ decisions: [decision('did:plc:a', '2000-01-01T00:00:00.000Z', 'keep')] }),
			OWNER
		);

		expect(report.skipped).toBe(1);
		expect((await loadDecisions(OWNER)).get('did:plc:a')?.decision).toBe('unfollow');
	});

	it('round-trips an export without changing anything', async () => {
		await saveDecision(OWNER, 'did:plc:a', 'unfollow');
		await saveDecision(OWNER, 'did:plc:b', 'keep');
		const file = JSON.stringify(await exportOwner(OWNER));

		const report = await importOwner(file, OWNER);

		expect(report).toMatchObject({ added: 0, updated: 0, skipped: 2 });
	});
});
