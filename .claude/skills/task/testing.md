# Testing

Companion to the `task` skill. Owns test quality and what runs when.

## The one rule

**Test the seam, not the surface area.** A seam is a place where you can alter
behaviour without editing in that place. Bugs concentrate there, because each
side was fine in isolation and the failure was in how they met.

Coverage is not the goal. A suite that exercises every branch of a pure function
and never crosses a boundary is a suite that will be green on the day the app
breaks.

## Shape of a story test

One user story, one test. The story's "Done when" line is the assertion; the
test is that line made executable.

- **Drive from the same place a caller does.** If the story is about triage
  order, call the queue the way the screen calls it — not the sort helper it
  happens to use today.
- **Name the test after the behaviour**, not the function. `keeps the subject on
screen while activity loads in the background`, not `test getNext`.
- **One assertion of consequence.** Setup can be long; the claim should be
  short.
- **No mocks of the thing under test.** Mock the network, the clock, and the
  PDS. Never mock the module whose behaviour the story describes.
- `requireAssertions` is on — a test with no assertion fails rather than
  silently passing.

Story tests are written by `story-test-writer` from the story alone, with no
sight of the implementation. That separation is the point: a test generated from
the same context as the code shares its blind spots and confirms consistency
rather than correctness.

## What runs when

`vite.config.ts` carries three Vitest projects. Which one a test lands in is
decided by its filename, not by configuration.

| Tier        | Filename                  | Runs in           | For                                                                                                                                             |
| ----------- | ------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `server`    | `*.{test,spec}.ts`        | node              | Pure logic with no DOM. The activity-metric definitions in `PRD.md` live here — they are specified independently of the UI and tested that way. |
| `client`    | `*.svelte.{test,spec}.ts` | headless chromium | Anything touching the DOM, IndexedDB, Web Locks, or component behaviour.                                                                        |
| `storybook` | `*.stories.svelte`        | headless chromium | Every story renders and passes its a11y checks. Free with the story you already owed.                                                           |

**Per slice:** run the tier the slice touched. **Before review:** `pnpm test`
runs all three. **On a release branch:** the full Playwright journey suite as
well, before the version bump.

## What this project tests carefully

Three areas earn more than the usual attention, because each fails quietly.

- **Activity metrics.** The covered-window rules exist so a subject who likes
  300 posts a day doesn't read as inactive. Truncated windows, accounts younger
  than the lookback, and zero-event windows are the cases that produce a
  plausible wrong number rather than an error.
- **Storage migrations.** Every schema change is a numbered migration with a
  test that opens a database at the previous version holding fixture data and
  checks the result. A migration may transform `decisions` and `runs`; it may
  never drop them.
- **Run resumption.** A run interrupted mid-batch, resumed against a repo that
  changed underneath it. The bug here costs a user follows they meant to keep.

## What not to test

- Bits UI's behaviour. It is a dependency with its own suite.
- Getters, wrappers, and re-exports.
- The same seam from four directions because it felt important.

Delete a test that no longer describes a behaviour anyone relies on. A test kept
for its coverage number is a test nobody will read when it fails.
