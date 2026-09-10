# CONTEXT.md — unfollow-garden

Non-obvious constraints and gotchas specific to this project. Things a
reasonable person would get wrong on first contact, and the reason each one is
the way it is. `PRD.md` owns product behaviour; this file owns the traps.

## Open the dev server at `127.0.0.1`, never `localhost`

`pnpm dev` binds to `127.0.0.1` (set in `vite.config.ts`). You must also _open_
the app there.

In development the app authenticates as an atproto **loopback** OAuth client,
whose `client_id` embeds a `redirect_uri` on `http://127.0.0.1:<port>`. An
authorization server treats `127.0.0.1` and `localhost` as different origins
even though they resolve to the same machine, so opening the app at `localhost`
produces a redirect-URI mismatch. The failure surfaces as an authorization
error from a server you don't control, which reads like a scope or metadata
problem rather than a hostname one.

## The OAuth scope string exists in exactly one place

`src/lib/atproto/client-config.ts` exports `OAUTH_SCOPE`. Both the metadata
document at `/oauth-client-metadata.json` and the `BrowserOAuthClient` read it
from there.

They must agree. The authorization server compares the scope it was asked for
against the scope in the metadata it fetched, and if the two drift the failure
names neither file. Two string literals that "obviously" match is how that drift
starts.

The scope is
`atproto repo:app.bsky.graph.follow?action=create&action=delete` and nothing
more. `transition:generic` grants full account write access; it is never a
fallback when an authorization server rejects granular scopes. That failure is
shown to the user (PRD, "Risks").

## `client_id` is a URL, and it is the app's public identity

The metadata route derives `client_id` and `redirect_uris` from the live request
origin, so no hostname is baked into the build. Two consequences:

- The route **cannot be prerendered**. It has to know the origin it is being
  served from.
- The production origin appears on the consent screen, at the moment a user
  grants permission to delete their follow records. Choosing it is a
  user-facing decision, not a deployment detail. (PRD open question 3.)

## `connect-src` cannot be an allowlist

Subjects' PDSes are arbitrary hosts, discovered at runtime from DID documents.
The CSP in `svelte.config.js` therefore allows `https:` broadly on `connect-src`
and `img-src`. That is deliberate and load-bearing — narrowing it to known
Bluesky hosts silently breaks every self-hosted account. Every other directive
is kept tight to compensate.

## There is no server, and adding one is a product decision

D1 and Drizzle were removed at kickoff. Persistence is IndexedDB in the browser;
the Cloudflare deployment serves static assets plus the one metadata route.

This is not a stack preference that can be revisited for convenience. "No user
data on a server" is PRD goal 4 and the reason the app can be honest about what
it does with a list of people you plan to unfollow. A server-side session store,
a sync backend, or an analytics call each re-open that decision.

Note that the `atprotocol-oauth` global skill's guide includes a server-side
HMAC session-cookie step. **Skip it.** That step exists for apps that keep auth
state on a server; this one does not.

## Svelte proxies cannot be structured-cloned

Anything written to IndexedDB must be a plain object — captured before it enters
reactive state, or passed through `$state.snapshot`. A `$state` proxy throws
`DataCloneError` on write. Carried from the prototype (PRD, "Architecture on
suede").

## Reads are public; the session is for writes only

Every account lookup uses public, unauthenticated endpoints on the AppView,
`plc.directory`, and subjects' PDSes. The OAuth session is used solely for
`applyWrites` against the owner's repo during runs. An authenticated read would
widen the scope the app has to request, for no gain.

## Deliberately unresolved

Recorded so nobody assumes these were settled and moved on:

- **The production origin.** Blocking for slice 1; see `client_id` above.
- **The favicon.** `src/lib/assets/favicon.svg` is still the stock Svelte logo.
  Replacing it is a visual-contract decision, which the authoring boundaries
  make human-owned.
- **`.env.example`.** May still list the three `CLOUDFLARE_*` D1 credentials
  that `drizzle.config.ts` read before it was deleted. The file is outside what
  the agent may read, so a human has to clear it.
