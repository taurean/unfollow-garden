# CONTEXT.md — unfollow-garden

Non-obvious constraints and gotchas specific to this project. Things a
reasonable person would get wrong on first contact, and the reason each one is
the way it is. `PRD.md` owns product behaviour; this file owns the traps.

## This is v0, and it is not the app the PRD describes

v0 signs in with an **app password** and runs **only on your machine**. The
PRD's Authentication and Architecture sections describe v1 and are not what is
built. `PRD.md`, "Version 0" is the reconciliation; read it before implementing
anything from those sections.

## An app password is a full-access credential

`com.atproto.server.createSession` with an app password returns a token that can
read direct messages, post, and delete anything in the repo. This app uses none
of that — but the credential permits it, which is why:

- v0 is for your own account on your own machine, and is not deployed.
- The app password is used once at sign-in and never stored.
- Session tokens go in `sessionStorage`, not `localStorage`, so they die with
  the tab. Decisions live in IndexedDB and survive, so closing the tab costs a
  sign-in and nothing more.

The narrow OAuth scope in v1 is what makes this app defensible to anyone who is
not its author. Until then, treat the deployment question as closed.

## Bluesky accounts do not log in at their own PDS

A Bluesky-hosted account's DID document names a PDS like
`shiitake.us-east.host.bsky.network`. Those hosts store the repo but
authenticate nobody — `createSession` has to go to `https://bsky.social`, which
issues tokens the PDS then accepts.

Send credentials to the PDS host instead and it fails as an authentication
error, which reads exactly like a mistyped app password. Self-hosted PDSes
authenticate for themselves and are used as-is.

`pdsForLogin` in `src/lib/atproto/identity.ts` is the whole of it, and it is
unit tested. OAuth removes the distinction, so this function is deleted rather
than carried forward when v1 lands.

## There is no Content-Security-Policy right now

The CSP was a response header, and a static local build has no server to send
one. It returns with the deployment.

When it does: `connect-src` cannot be an allowlist. Subjects' PDSes are
arbitrary hosts discovered at runtime from DID documents, so it has to allow
`https:` broadly, with every other directive kept tight to compensate.
Narrowing it to known Bluesky hosts silently breaks every self-hosted account.

## There is no server, and adding one is a product decision

D1 and Drizzle were removed at kickoff, and Cloudflare went with them in v0.
Persistence is IndexedDB in the browser; `pnpm build` produces static files.

This is not a stack preference that can be revisited for convenience. "No user
data on a server" is PRD goal 4 and the reason the app can be honest about what
it does with a list of people you plan to unfollow. A server-side session store,
a sync backend, or an analytics call each re-open that decision.

Note that the `atprotocol-oauth` global skill's guide includes a server-side
HMAC session-cookie step. **Skip it.** That step exists for apps that keep auth
state on a server; this one does not. The rest of that skill applies when v1 lands.

## Unlayered CSS beats every cascade layer

stylebase declares the layer order
`webfont, stylebase-token, token, stylebase-default, default, stylebase-utility, utility, stylebase-layout, layout`.
Project CSS goes in `token` (semantic colours) or `layout` (block styles).

The trap is that a Svelte `<style>` block is **unlayered by default**, and
unlayered CSS wins over every layer regardless of specificity. `Button.svelte`
sets `:global(.button)` styles; while those sat outside a layer, every
`@layer layout` override of a button variant in a consuming component silently
lost, and the keep and unfollow buttons rendered in the base blue with no error
anywhere. `Button`'s styles now sit in `@layer default` for exactly this reason.

Any new component whose `:global` styles are meant to be overridable has to
declare a layer.

## Colour meanings live in one file

`src/lib/styles/tokens.css` names every project colour — quiet ink, the two
strip states, the keep and unfollow pair — in the `token` layer, each resolving
to a stylebase primitive. Components reference the semantic name, not the
primitive, so dark mode is one block rather than a `prefers-color-scheme` rule
in every component.

Two values deliberately depart from `static/mockup.png`, which is otherwise the
visual contract: quiet ink is `--hue-slate-600` rather than the mockup's lighter
blue-grey, and keep is `--hue-green-700` rather than `600`. Both are for the
PRD's WCAG AA floor. Changing them back is a two-line edit and a knowing choice.

## Svelte proxies cannot be structured-cloned

Anything written to IndexedDB must be a plain object — captured before it enters
reactive state, or passed through `$state.snapshot`. A `$state` proxy throws
`DataCloneError` on write. Carried from the prototype (PRD, "Architecture on
suede").

This has bitten once for real: `RunController.resume` reads its run out of
`$state` and wrote it back with `saveRun(run)`, which threw mid-resume and left
the run stuck in place. Every run write now goes through `$state.snapshot`. The
storage layer cannot defend against this itself — `$state.snapshot` is a
compiler rune and `db.ts` is a plain `.ts` file — so it is a call-site
discipline, and the resume test is what holds it.

## Reads are public; the session is for writes only

Every account lookup uses public, unauthenticated endpoints on the AppView,
`plc.directory`, and subjects' PDSes. The OAuth session is used solely for
`applyWrites` against the owner's repo during runs. An authenticated read would
widen the scope the app has to request, for no gain.

## Deliberately unresolved

Recorded so nobody assumes these were settled and moved on:

- **The production origin.** Not blocking while v0 is local-only, but it
  blocks the v1 deploy: `client_id` is a URL authorization servers fetch, and it
  appears on the consent screen. (PRD open question 3.)
- **The favicon.** `src/lib/assets/favicon.svg` is still the stock Svelte logo.
  Replacing it is a visual-contract decision, which the authoring boundaries
  make human-owned.
- **`.env.example`.** Still lists the three `CLOUDFLARE_*` D1 credentials that
  `drizzle.config.ts` read before it was deleted. v0 needs no environment
  variables at all. The file is outside what the agent may read, so a human has
  to clear it.
