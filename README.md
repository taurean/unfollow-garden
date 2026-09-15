# unfollow-garden

Review every Bluesky account you follow, one at a time, and unfollow the ones you're done with.

Follow lists drift. People stop posting, change what they post about, or move on, and the list keeps growing. Bluesky shows who you follow as a flat list with no activity context, so judging one account means opening the profile, scrolling, and guessing how active it is — and likes, which are most of some people's activity, aren't visible on other people's profiles at all. That's a few minutes per account. At 800 follows it doesn't get done.

unfollow-garden puts everything needed for the call on one screen: bio, follow-back status, recent posts, replies, reposts and likes, how often the account acts, and when it last went quiet for a long stretch. You decide with one keystroke and move on.

## How it works

**Decisions stay in your browser.** They're written to IndexedDB, keyed by your account, so a review of a few thousand follows can span many sittings without losing a decision to a reload or a closed tab.

**Nothing changes until you say so.** Marking an account for unfollow doesn't touch your repo. When the review is done, you review the full list, then run it. Every run is recorded, so an interrupted run resumes and a completed run can be reversed.

**No server holds your data.** Reads come from public atproto endpoints. Writes go straight from your browser to your own PDS. There is no backend, no database, and no analytics — in v0 there is no server at all.

`PRD.md` is the full specification: user stories, activity-metric definitions, storage schema, and edge cases.

## Status

**v0, local only.** It signs in with an app password and runs on your machine;
it is not deployed and should not be. The triage loop works end to end: sign in,
load your follows, decide one account at a time, decisions saved as you go.

Unfollow runs do not exist yet, so nothing can currently be unfollowed.

v1 replaces app passwords with atproto OAuth scoped to follow records, and adds
a deployment. `PRD.md`, "Version 0" records exactly what differs and why.

Building toward v1 in five slices:

1. OAuth sign-in, loading follows and profiles, a basic account view, decisions in IndexedDB
2. Activity loading, stats, the timeline strip, recent items, the activity cache
3. Queue ordering, undo persistence, skip, storage persistence status
4. Review, unfollow runs with resume, run list download
5. Restore from runs, export and import, delete all data

## Stack

| Concern         | Choice                                                                           |
| --------------- | -------------------------------------------------------------------------------- |
| Framework       | SvelteKit (Svelte 5), client-rendered — routes set `ssr = false`                 |
| Hosting         | None in v0; static build, run locally                                            |
| Persistence     | IndexedDB in the browser, via `idb`                                              |
| Auth            | App password in v0; atproto OAuth in v1                                          |
| Tests           | Vitest (+ Playwright browser tests)                                              |
| Component dev   | Storybook                                                                        |
| UI primitives   | Bits UI + [@taurean/stylebase](https://www.npmjs.com/package/@taurean/stylebase) |
| Package manager | pnpm                                                                             |

## Getting started

```bash
pnpm install
pnpm dev
```

Then open the URL it prints and sign in with your handle and an **app password** — not your account password. Create one in the Bluesky app under Settings → Privacy and security → App passwords.

The app password is used once to sign in and is never stored. Only the resulting session token is kept, in `sessionStorage`, so it is gone when you close the tab. Your decisions live in IndexedDB and survive.

**An app password grants full account access**, which is far more than this app uses. That is the v0 trade: no hosted client identity, no deployment, in exchange for a credential broader than the task. It is why v0 is for your own account on your own machine, and why v1 moves to OAuth scoped to follow records and nothing else.

Day-to-day scripts:

| Command          | What it does                      |
| ---------------- | --------------------------------- |
| `pnpm dev`       | Vite dev server                   |
| `pnpm build`     | Static build into `build/`        |
| `pnpm preview`   | Serve the static build locally    |
| `pnpm check`     | Type-check (svelte-check)         |
| `pnpm lint`      | Prettier check + ESLint           |
| `pnpm format`    | Prettier write                    |
| `pnpm test`      | Vitest, single run                |
| `pnpm storybook` | Storybook dev server on port 6006 |

The quality gate before any task is called done: `pnpm check`, `pnpm lint`, and `pnpm test` if tests changed — with command and result captured as evidence in the PR description.

## Privacy

- No analytics, telemetry, or third-party scripts.
- Data leaves the browser only as requests to the Bluesky AppView, `plc.directory`, subjects' PDSes, and your own PDS and authorization server.
- **In v0, the app password you sign in with grants full account access.** The app only ever reads follows and profiles, but the credential permits more. v1 replaces it with an OAuth scope of `atproto repo:app.bsky.graph.follow?action=create&action=delete`, which permits creating and deleting follow records and nothing else.
- The app password is used once and never stored; the session token it returns lives in `sessionStorage` and dies with the tab.
- Decisions and run history never leave your browser except through an export you initiate.

## Working on this project

[`CLAUDE.md`](CLAUDE.md) is the project rulebook — git conventions, the concept-to-merge pipeline, authoring boundaries between human and agent, and the release process. It is the source of truth wherever this README summarizes; when the two disagree, CLAUDE.md wins.

Supporting documents: [`CONTEXT.md`](CONTEXT.md) for non-obvious constraints, [`SYSTEMS_MAP.md`](SYSTEMS_MAP.md) for where things live, and the `deciduous` decision graph in `.deciduous/` for why things are the way they are.

## Lineage

Forked from [suede](https://github.com/taurean/suede) at `2026.7.3.3`, recorded in `package.json#suede.from`. The process layer is suede's, tailored during kickoff; the application is not.
