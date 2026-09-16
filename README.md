# unfollow-garden

> ==warning== slop ahead

Review every Bluesky account you follow, one at a time, and unfollow the ones you're done with.

Follow lists drift. People stop posting, change what they post about, or move on, and the list keeps growing. Bluesky shows who you follow as a flat list with no activity context, so judging one account means opening the profile, scrolling, and guessing how active it is — and likes, which are most of some people's activity, aren't visible on other people's profiles at all. That's a few minutes per account. At 800 follows it doesn't get done.

unfollow-garden puts everything needed for the call on one screen: bio, follow-back status, recent posts, replies, reposts and likes, how often the account acts, and when it last went quiet for a long stretch. You decide with one keystroke and move on.

## How it works

**Decisions stay in your browser.** They're written to IndexedDB, keyed by your account, so a review of a few thousand follows can span many sittings without losing a decision to a reload or a closed tab.

**Nothing changes until you say so.** Marking an account for unfollow doesn't touch your repo. When the review is done, you review the full list, then run it. Every run is recorded, so an interrupted run resumes and a completed run can be reversed.

**No server holds your data.** Reads come from public atproto endpoints. Writes go straight from your browser to your own PDS. There is no backend, no database, and no analytics — there is no server at all.

`PRD.md` is the full specification: user stories, activity-metric definitions, storage schema, and edge cases.

## Status

**Feature-complete, not yet deployed.** The whole loop works: sign in with
atproto OAuth, load your follows, review each account against a year of its
activity, then unfollow the marked ones in a recorded, resumable run you can
reverse afterwards.

Sign-in asks for one permission — to add and remove follow records — and
nothing else. You authenticate on your own server; this app never sees a
password.

It deploys to [unfollow.garden](https://unfollow.garden) on Cloudflare Workers
with static assets. The Worker hands back files and headers and has no routes of
its own, so there is still nothing in the request path that could see a
decision.

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
| Hosting         | Cloudflare Workers with static assets — no routes, no storage bindings           |
| Persistence     | IndexedDB in the browser, via `idb`                                              |
| Auth            | atproto OAuth, public browser client, scoped to follow records                   |
| Tests           | Vitest (+ Playwright browser tests)                                              |
| Component dev   | Storybook                                                                        |
| UI primitives   | Bits UI + [@taurean/stylebase](https://www.npmjs.com/package/@taurean/stylebase) |
| Package manager | pnpm                                                                             |

## Getting started

```bash
pnpm install
pnpm dev
```

Open **`http://127.0.0.1:5173`** — not `localhost:5173`. RFC 8252 bans the
`localhost` hostname in OAuth redirect URIs, so the sign-in redirect comes back
to `127.0.0.1`, and a `localhost` tab has nothing listening at the other end.

Enter your handle and you are sent to your own server to sign in. This app never
receives a password. What it asks for is one permission — create and delete
`app.bsky.graph.follow` records — which you can read on the consent screen
before granting it.

Your decisions live in IndexedDB and survive closing the tab.

## Deploying

```bash
pnpm build:deploy
```

That bakes `https://unfollow.garden` into `oauth-client-metadata.json`, because
a static site has no server to derive the origin from a request. Plain
`pnpm build` leaves it at the loopback default, which is what you want locally.

Cloudflare Pages settings:

|                       |                                        |
| --------------------- | -------------------------------------- |
| Build command         | `pnpm build:deploy`                    |
| Output directory      | `build`                                |
| Environment variables | none — the origin is in `package.json` |

**Clear `.env` before deploying.** Wrangler reads it as Worker variables and
uploads them; it still carries the dead `CLOUDFLARE_*` D1 credentials from
before Drizzle was removed. This Worker needs no variables at all.

Two things that will break sign-in if you skip them:

- **Redirect `www` to the apex.** `client_id` is the URL the metadata is served
  from, and the authorization server checks it matches. A visitor on
  `www.unfollow.garden` gets a `client_id` that points at a document claiming a
  different origin, and is rejected. It looks broken for them and fine for
  everyone else.
- **Keep `_headers` in the project root**, not `static/`. The adapter reads it
  from the root and ignores a copy in `static/` with a warning. It carries
  `frame-ancestors` and the privacy headers; the rest of the
  Content-Security-Policy is generated by SvelteKit into a `<meta>` tag,
  because it has to hash the framework's own inline bootstrap script — see
  `CONTEXT.md` before changing either half.

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
- **The app's entire grant is `atproto repo:app.bsky.graph.follow?action=create&action=delete`** — it can add and remove follows, and cannot read your messages, post as you, or touch anything else in your repo. Your consent screen states it.
- You authenticate on your own server. This app never handles a credential; tokens are DPoP-bound and held by the OAuth library.
- Every account lookup uses public, unauthenticated endpoints. The grant is used only to add and remove follows during runs.
- Decisions and run history never leave your browser except through an export you initiate.

## Working on this project

[`CLAUDE.md`](CLAUDE.md) is the project rulebook — git conventions, the concept-to-merge pipeline, authoring boundaries between human and agent, and the release process. It is the source of truth wherever this README summarizes; when the two disagree, CLAUDE.md wins.

Supporting documents: [`CONTEXT.md`](CONTEXT.md) for non-obvious constraints, [`SYSTEMS_MAP.md`](SYSTEMS_MAP.md) for where things live, and the `deciduous` decision graph in `.deciduous/` for why things are the way they are.

## Lineage

Forked from [suede](https://github.com/taurean/suede) at `2026.7.3.3`, recorded in `package.json#suede.from`. The process layer is suede's, tailored during kickoff; the application is not.
