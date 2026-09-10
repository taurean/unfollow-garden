---
name: suede-kickoff
description: Use when starting a new project forked from suede — the working tree is a fresh suede clone, git history belongs to suede, and the human wants a standalone project. Triggers include "fork suede", "start a new project from this template", "bootstrap a new app", "I'm cloning suede for a new thing".
disable-model-invocation: true
---

# Suede kickoff

Reset a fresh suede clone into a standalone project. The working tree IS the new
project — do not work on a copy.

This skill runs once and deletes itself. Everything it does before Step 2 is
recoverable; nothing after it is. Read [REV-1] and treat this whole process
accordingly.

**Preconditions:** `git status` clean. `pnpm install` has been run. Selvage is
installed — `engineering-discipline` and `poke-holes` are assumed available.

## Step 0: Verify external dependencies

Suede's process layer depends on tools outside the `pnpm install` boundary.
Verify each before any destructive operation. If anything required is missing,
**stop and tell the human** — do not install it yourself and do not continue.

```bash
command -v deciduous >/dev/null 2>&1 && echo "OK: deciduous"      || echo "MISSING: deciduous"
command -v git        >/dev/null 2>&1 && echo "OK: git"           || echo "MISSING: git"
command -v pnpm       >/dev/null 2>&1 && echo "OK: pnpm"          || echo "MISSING: pnpm"
command -v node       >/dev/null 2>&1 && echo "OK: node"          || echo "MISSING: node"
command -v gh         >/dev/null 2>&1 && echo "OK: gh (optional)" || echo "MISSING: gh (optional)"
```

**Required:** `deciduous` (decision-graph CLI), `git`, `pnpm`, `node`.

**Optional:** `gh` — Step 9 uses it to create the remote and open the follow-up
PR. Without it, the follow-up content parks in the worktree until a remote
exists.

If `git`, `pnpm`, or `node` is missing, stop. Those are environment problems,
not kickoff's to solve.

If only `deciduous` is missing, say so and offer to install it:

```bash
brew tap notactuallytreyanastasio/tap && brew install deciduous
```

Wait for a yes before running it — this changes global state on the human's
machine, and Step 2 is one step away. If they decline, stop; the fork needs the
graph from Step 6 onward and proceeding without it produces a project whose
process layer is half-wired.

If `cargo` is present and Homebrew isn't, `cargo install deciduous` is the
equivalent.

## Step 1: Capture the lineage marker

BEFORE any destructive operation. The `.git` history is the only ground truth,
and Step 2 destroys it.

```bash
git describe --tags --abbrev=0   # the chronver tag, e.g. 2026.6.4
git rev-parse HEAD               # the exact commit hash
```

`suede.from` is the **tag**, not `package.json#version` — they can differ. Keep
both: the tag goes in `package.json` at Step 6, the commit hash goes in the
follow-up PR description as the audit trail.

## Step 2: Delete `.git`

```bash
rm -rf .git
```

Irreversible. Everything from here is a new project.

## Step 3: Grill

The working tree is now a fresh fork. Interview the human per `/poke-holes` —
one question per message, each with a one-line recommended answer — across two
threads.

**Do not write any code in this step.** The grill produces a plan; Step 9 turns
the plan into a diff. Capture the answers; don't act on them.

### Thread A — the project

1. **Project name** — for `package.json#name` and the repo.
2. **One-sentence purpose** — plain English, not a marketing line.
3. **Primary user** — internal, end consumer, dev tool, something else.
4. **Project shape** — full-stack web app / content site / backend service or
   API or MCP / other. This decides which runtime defaults apply (SvelteKit +
   bits-ui vs Hono + zod vs MCP stdio vs custom). Capture the human's call;
   don't enforce one.
5. **First version** — `YYYY.M.D[.N]` for chronver, no leading zeros
   (`pnpm version` normalizes them). Nothing is released yet; the release
   process gets designed when the project is close to releasing.
6. **Anything else load-bearing** — deadlines, author identity, audience,
   deployment target.

### Thread B — process-layer customizations

The pipeline is constant across every fork: goal alignment → cut plan
(`/project-plan`, multi-PR work only) → build (`/task`) → `/review` → release.
What varies is the details. Grill on each axis that might differ here.

7. **Tooling keep/rip** — Cloudflare, D1 + Drizzle, Storybook, bits-ui,
   stylebase, Vitest, Playwright, SvelteKit. **Default: keep all.**
   - Ripping Storybook triggers the Storybook-discipline override: the
     follow-up rewrites `CLAUDE.md` and `.claude/skills/task/` to match.
   - Ripping SvelteKit means the project is a backend, a CLI, or another
     non-web shape. Capture which, and the follow-up rewrites the parts of
     `CLAUDE.md` that assume a SvelteKit context — notably the Stack section
     and verification.
   - Ripping SvelteKit also means `stylebase` and `bits-ui` go; they're
     stack-bound.

8. **Version scheme** — **chronver** by default, suede's apps-and-templates
   convention. Override to **semver** if this fork is a library with
   dependents. A fork that picks semver rewrites the `CLAUDE.md` Releases
   section in the follow-up.

9. **Branch and commit naming** — the canonical conventional-commits types are
   in `CLAUDE.md`. Most forks inherit them as-is. Capture an override if this
   one needs an extra type (`i18n` for a content-heavy project) or wants to
   drop one (`perf`, for a backend with no measurable perf budget).

10. **Pipeline compression** — for a short-lived prototype you might collapse
    the plan stage into the PR description: no plan issue, no tracker. The
    stages still happen; the artifacts don't.

11. **Which skills apply** — a backend has no use for Storybook discipline; a
    CLI has no use for `stylebase`. You may subtract. Selvage skills
    (`engineering-discipline`, `poke-holes`) apply everywhere and aren't up for
    subtraction.

12. **Anything else the human knows about this project that you can't infer.**

Forks currently run no automated CI review. Don't ask about it and don't set
one up; review happens through `/review` on the branch. This is a deliberate
deferral, not an omission.

## Step 4: Initialize fresh git

```bash
git init
git checkout -b main 2>/dev/null || git branch -m main
```

Do NOT add a remote yet.

## Step 5: Edit `package.json`

- `name` ← Q1
- `version` ← Q5, via `pnpm version <v> --no-git-tag-version`
- `suede: { from: "<tag>" }` ← the **tag** from Step 1
- `description` ← Q2, if it fits

## Step 6: Reset and re-init deciduous

```bash
rm -rf .deciduous/
deciduous init
```

Carrying suede's graph into the new project makes the first `pulse` and
`narratives` lie, so the reset is not optional.

`deciduous init` also writes the Claude Code integration — `.claude/commands/`,
its own skills, `.claude/hooks/`, and a Decision Graph Workflow section in
`CLAUDE.md`. Run it rather than relying on auto-reinit, which only creates the
database.

Note for the follow-up: house conventions for the graph go in the `CLAUDE.md`
section around the generated content. `deciduous update` preserves custom
content there.

## Step 7: Commit the bootstrap

Stage explicit files only. Never `git add .`, `-A`, `-am`, or globs — `.env`,
`node_modules/`, `.deciduous/`, and `tmp/` are all candidates.

```bash
git add package.json
git commit -m "chore: bootstrap forked project from suede <tag>

Co-authored-by: <the agent, per CLAUDE.md Git workflow>"
```

The human is the commit author. A brand-new repo's first commit lands on `main`
— the documented exception to "the agent never pushes to main."

## Step 8: Branch the first real task

```bash
git checkout -b chore/suede-kickoff
```

## Step 9: Capture the follow-up

Step 4 created no remote. Ask the human whether they want one now.

**If yes:** create it (`gh repo create`, confirming visibility with them) and
open a draft PR with the content below as its description. Creating a public
repo is irreversible in the ways that matter — [REV-3] applies, so confirm
visibility explicitly rather than assuming.

**If no:** write the same content to `tmp/KICKOFF-FOLLOWUP.md` (gitignored) and
open the PR from it when a remote lands.

Either way, capture:

- **The human's answers verbatim** from both threads.
- **The commit hash** from Step 1 — the audit trail.
- **Process-layer edits**, as the lead section. A file-by-file list of what has
  to change in `CLAUDE.md` and `.claude/skills/` to match the Thread B answers.
  This is the substantive follow-up work.
- **Runtime-layer edits.** Auth strategy, deploy target, design system scope,
  per-tooling changes from Q7, the wrangler/D1/Storybook string sweep, README
  rewrite, config renames (`wrangler.jsonc`, `drizzle.config.ts`,
  `.storybook/`), and a post-fork `pnpm lint` / `pnpm check` / `pnpm test`
  re-verification.
- **`/run-skill-generator`**, as an unchecked item. It records how to build and
  launch this app so `/verify` stops guessing — but run it *after* the runtime
  edits land, not now. A recipe recorded against suede's demo app describes an
  app this fork is about to replace.
- **Final action of the follow-up:** delete `.claude/skills/suede-kickoff/`.
  The skill is consumed once.

## Verification before handing back

- `git log --oneline` shows one commit on `main`.
- `git branch` shows `main` and `chore/suede-kickoff`.
- `package.json` has `suede.from` set to the Step 1 tag.
- `.deciduous/` exists and is freshly initialized.
- `CLAUDE.md` has a Decision Graph Workflow section.
- The follow-up PR is open on `chore/suede-kickoff` with the process-layer
  edits list, or `tmp/KICKOFF-FOLLOWUP.md` holds it.
- `pnpm install` succeeds.

## Handing back

End with a short message, not a recap. The human just answered a dozen
questions; don't make them read their own answers back.

State three things:

1. The project is bootstrapped and the follow-up branch is open — where the
   follow-up content lives.
2. The next action is the follow-up task, which turns the captured answers into
   edits.
3. **Once the runtime edits land, run `/run-skill-generator`.** Say it here as
   well as in the PR checklist. It's the step that stops `/verify` from
   guessing at how to build and launch the app, and it's easy to skip because
   nothing breaks visibly without it — `/verify` just quietly gets less
   reliable on a Cloudflare and D1 project it has to infer.

## What this skill refuses to do

| Shortcut | Why not |
| --- | --- |
| Capture the tag after `rm -rf .git` | The history is gone. Step 1 precedes Step 2 for this reason alone. |
| Treat `package.json#version` as the tag | They can differ. `suede.from` is the tag. |
| Decide the tooling for the human | A wrong Cloudflare/D1/Drizzle call costs them days to undo. Q7 is theirs. |
| Skip the `.deciduous/` reset | Suede's graph carries into the new project and every narrative becomes a lie. |
| Decide the process tweaks for the human | The process is theirs. You don't pick the issue tracker, the version scheme, or which skills load. |
| `git add .` because the tree looks clean | Staging rules. `.env` and friends are always candidates. |
| Work on a copy to be safe | The working tree IS the project. A copy delays the same operations. |
| Start editing files during Step 3 | The grill produces a plan, not a diff. Step 9 turns it into one. |
| Fold the follow-up into the bootstrap commit | Deep tooling decisions are a separate concern, branch, and PR. |
