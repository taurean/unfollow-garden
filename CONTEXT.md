# CONTEXT.md — unfollow-garden

Non-obvious constraints and gotchas specific to this project. Things a
reasonable person would get wrong on first contact, and the reason each one is
the way it is. `PRD.md` owns product behaviour; this file owns the traps.

## The scope is the product's promise, and it is one line

`src/lib/atproto/client-config.ts` holds `SCOPE`, and the whole of the grant is:

    atproto repo:app.bsky.graph.follow?action=create&action=delete

The app may add and remove follow records. It cannot read a message, post, or
touch another collection. That narrowness is most of why this app is
defensible to someone who is not its author — the consent screen states it, and
the user can hold the app to it.

Two things follow, and both are guardrails in `CLAUDE.md`:

- **`transition:generic` is never a fallback.** An authorization server that
  rejects granular scopes fails the sign-in with its own error shown. It does
  not get quietly handed the whole account instead.
- **`create` is there because restore exists.** Re-following the targets of a
  past run is the app's undo (PRD, RESTORE-1). Drop restore and `create` goes
  with it.

The scope string lives in exactly one module because the prerendered client
metadata and the browser sign-in both read it. Two copies would drift, and the
copy that drifts is the one on the consent screen.

## Reads need no grant, and that is what keeps the scope small

`com.atproto.repo.listRecords` is public, so the owner's own follow records are
read unauthenticated like everything else. If that read were authenticated the
scope would have to widen to permit it, for no gain.

`src/lib/atproto/xrpc.ts` therefore has no way to send a credential at all — it
lost its `procedure` helper and its `accessJwt` parameter when OAuth landed.
Authenticated writes do not go through it; they go through the OAuth session's
own DPoP-signing fetch, in `writes.ts`. That is the entire authenticated surface
of the app, and it is deliberately one small file.

## Development has to run on 127.0.0.1, not localhost

RFC 8252 bans the `localhost` hostname in OAuth redirect URIs, so the loopback
flow redirects to `http://127.0.0.1:5173/`. `vite.config.ts` sets
`server: { host: '127.0.0.1' }` for this reason. Open the 127.0.0.1 URL; a
`localhost` tab gets redirected back to an origin nothing is listening on, and
the failure looks like the callback is broken rather than the hostname.

On an `http:` origin the client uses the **loopback `client_id` form** — a
`http://localhost?redirect_uri=…&scope=…` URL that carries its own metadata, so
the authorization server never fetches the metadata document. That is why local
development needs no hostname and no deployment. `createOAuthClient` picks the
form by protocol.

Related: build with `BrowserOAuthClient.load()`, never
`new BrowserOAuthClient({ clientMetadata })`. The constructor validates metadata
inline and rejects any non-HTTPS `client_id`, which makes the loopback form
impossible.

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
HMAC session-cookie step, plus a `hooks.server.ts`, a `+layout.server.ts` auth
guard and a dedicated `/auth/callback` route. **Skip all of it.** Those exist
for apps that keep auth state on a server; this one has no server. Auth state is
the OAuth library's IndexedDB store, and the callback lands on the single route
the app already has, where `client.init()` picks it up.

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

## Deliberately unresolved

Recorded so nobody assumes these were settled and moved on:

- **The production origin.** The code no longer blocks on it: the client
  metadata route prerenders from `PUBLIC_APP_ORIGIN`, so a deploy is
  `PUBLIC_APP_ORIGIN=https://example pnpm build` and nothing else. The
  _hostname_ is still unchosen, and it is not a throwaway decision —
  `client_id` is that URL, authorization servers fetch it, and it appears on
  the consent screen where someone decides whether to trust this app. (PRD
  open question 3.)
- **The favicon.** `src/lib/assets/favicon.svg` is still the stock Svelte logo.
  Replacing it is a visual-contract decision, which the authoring boundaries
  make human-owned.
- **`.env.example`.** Still lists the three `CLOUDFLARE_*` D1 credentials that
  `drizzle.config.ts` read before it was deleted. v0 needs no environment
  variables at all. The file is outside what the agent may read, so a human has
  to clear it.
