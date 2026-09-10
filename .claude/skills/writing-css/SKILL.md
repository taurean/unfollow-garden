---
name: writing-css
description: >
  Write CSS and component markup for projects built on stylebase + Bits UI
  using the CUBE CSS methodology. Reach for layout utilities for rhythm,
  token-backed utility classes for typography, scoped `<style>` blocks for
  block-level visuals, and Bits UI primitives for any interactive element.
  Use when writing or editing `.svelte` markup, `<style>` blocks, files in
  `src/lib/styles/`, classes, data attributes, or any task involving styling,
  layout, or component composition in a stylebase-based project.
paths:
  - "**/*.svelte"
  - "src/lib/styles/**"
  - "**/*.css"
---

# Writing CSS in a stylebase + Bits UI project

stylebase is a CUBE CSS implementation. The cascade layers are declared in the
order CUBE expects — `token → default → utility → layout` — so the methodology
is enforced by the cascade, not by convention. Lean into that. Every line of CSS
in this stack should fall into one of the four CUBE layers, and most lines
should land in the layers stylebase already provides.

## The four layers

**Composition (stylebase `layout` layer).** Page-level layout, rhythm, and flow.
Reach for these utilities before writing any layout CSS of your own:

- `l:grid` — 12-column responsive grid. Pair with
  `[data-grid-columns="quarter|third|half|full"]` on children for span variants
  (this is the Exception pattern, see below).
- `l:root` — single centred container with max-width and gutter.
- `l:waterfall > *` — vertical rhythm; every direct child gets
  `margin-block-start: var(--waterfall-gap, 2em)`.
- `l:river > *` — horizontal flow; every direct child gets
  `margin-inline-start: var(--river-gap, 1em)`.
- `l:repel` — flexbox row with `justify-content: space-between` for the "logo on
  the left, actions on the right" pattern.
- `l:ui-list` — inline horizontal list with bullets removed.

Override the `--river-gap` and `--waterfall-gap` custom properties on the parent
when the default rhythm is wrong; don't reach for a new utility.

**Utility (stylebase `utility` layer).** One job, one class. Currently exposed:
`u:fs-0` through `u:fs-10` (fluid font sizes, mapped to `--fs-*`) and
`u:lh-ui|...|loose` (line heights, mapped to `--lh-*`). Use these for typography
that varies per element rather than per block — e.g. `<h1 class="u:fs-7">`. If a
property needs a utility and stylebase doesn't ship one, add it to a
project-local CSS file in `src/lib/styles/` rather than hardcoding it. The
utility layer's job is to extend tokens, never to redefine them.

**Block (project's `<style>` block + scoped styles in `src/lib/styles/`).** This
is the layer stylebase deliberately hands off to the project. By the time you
reach a block, composition, utilities, and globals have done most of the work —
the block CSS should be **a handful of rules** that only apply in that context.
Hard cap at around 80 lines of CSS per block; if it's growing, the block is
solving more than one contextual problem and should split.

Block CSS draws from stylebase custom properties (`--hue-*`, `--space-*`,
`--ff-*`, `--fs-*`, `--lh-*`). It never hardcodes a colour, a spacing value, or
a font stack. The exception is shorthand that resolves through tokens
immediately: `color: white` on a saturated `--hue-blue-500` background is fine
because the contrast is what's being captured, not a colour value.

Custom CSS goes in the project's `layout` cascade layer (or higher) so it
overrides stylebase. If you find yourself adding `!important`, you're either in
the wrong layer or fighting the cascade — stop and check.

**Exception (data attributes).** Variations of a block — `reversed`,
`inactive`, `expanded` — use **data attributes, not modifier classes**. The
attribute hooks both CSS and JS cleanly:

```svelte
<article class="card" data-state="reversed">…</article>
```

```css
.card[data-state='reversed'] {
	flex-direction: column-reverse;
}
```

If a "variation" makes the component unrecognisable, that's a new block, not an
exception. Stop and split. Exception is for state changes and minor
rearrangements, not for a second design.

## Bits UI is the source of interactive primitives

The interactive vocabulary comes from Bits UI. Any interactive element — button,
dialog, dropdown, tabs, accordion, tooltip, combobox, switch — uses its Bits UI
primitive as the wrapper. The SuedeButton example is the shape:

```svelte
<script lang="ts">
	import { Button, type ButtonRootProps } from 'bits-ui';
	let { href, children, class: className, ...rest }: Props = $props();
</script>

<Button.Root {href} {...rest} class={`suede-button u:fs-1${className ? ` ${className}` : ''}`}>
	{@render children?.()}
</Button.Root>
```

The wrapper exists for three reasons: it gives the project's block a name
(`suede-button`), it stacks utility classes onto the rendered element, and it
lets the project's `<style>` block target a single class for all block-level
visuals. Reach for `<button>` directly only inside the wrapper; never in
user-facing markup. Bits UI's accessibility behaviour — keyboard handling, ARIA
wiring, focus management — is the point of wrapping it.

**A new interactive primitive is a human-shaped decision.** A new wrapper around
a new Bits UI headless component shapes the visual contract and ships with a
Storybook story (`CLAUDE.md`, "Storybook discipline"). Introducing one is
boundary movement — [STOP-2] applies. Stop and ask; don't add it because the
task happened to need it.

## Markup patterns

Group classes with the CUBE bracket convention, in this order — main block
first, additional blocks second, utilities last:

```svelte
<article class="[ card ] [ section box ] [ u:fs-2 ]" data-state="reversed"></article>
```

This isn't decoration — it tells the next reader which layer each class is doing
work in. A class list that mixes blocks and utilities without separation is
harder to refactor.

Inside a block, prefer letting HTML elements inherit rather than classing them.
If `.card` already styles headings via element selectors, don't add a class to
the `<h2>`. CUBE's whole point is that global + composition + utility have done
most of the work before the block ever loads.

## Tokens, in practice

- **Colour.** Two layers, and the order matters.

  **Semantic surface tokens first** — `--hue-z0-bg`, `--hue-z0-fg`,
  `--hue-z0-divider`, `--hue-z1-bg` and the rest of the z-layer set. Dark mode
  works by remapping these under `prefers-color-scheme: dark`, so a component
  built on them adapts for free. A component that reaches past them to a
  primitive renders identically in both themes — that's the bug, and it won't
  show up until someone switches.

  **Primitives second**, when no semantic token fits:
  `--hue-{name}-{50..950}`. Names: `red`, `orange`, `amber`, `yellow`, `lime`,
  `green`, `emerald`, `teal`, `cyan`, `lightBlue`, `blue`, `indigo`, `violet`,
  `purple`, `fuschia`, `pink`, `rose`, `slate`, `gray`, `zinc`, `neutral`,
  `stone`, `sand`, `olive`, `mauve`. The scale is OKLCH and perceptually
  uniform — lightness runs from about 98% at `50` to 19% at `950`, so the
  distance between two shades is predictable rather than a guess. `500` is the
  base vibrant shade. Never `color: #abc123`.

  **Dividers and borders** use `--hue-z0-divider`, which is `color-mix` against
  `currentColor` — always correct against whatever text colour is in play, in
  either theme. Reaching for a gray primitive instead is more work and worse.
- **Spacing.** `--space-5xs` through `--space-5xl`, with `sm` and `medium`
  slotted between `xs` and `lg` (the stops are `5xs, 4xs, 3xs, 2xs, xs, sm,
  medium, lg, xl, 2xl, 3xl, 4xl, 5xl`). Fluid via `clamp()` — viewport-aware
  without media queries. Apply via `padding`, `margin`, or `gap`; never via
  width/height where it would clip the fluid scaling.
- **Typography.** `--fs-0..10` for size,
  `--lh-{ui,snug,condensed,standard,expanded,loose}` for line-height, and
  `--ff-{system,sans,serif,ui,content,heading,old-style,rounded-sans-display,...}`
  for family. The `--ff-ui`, `--ff-content`, `--ff-heading`, `--ff-sans`,
  `--ff-serif` aliases are usually what you want.
- **Grid.** `--grid-max-width`, `--grid-gutter`, `--grid-columns`. Override on
  the parent when a section needs a different ceiling.
- **Flow gaps.** `--waterfall-gap`, `--river-gap`. Defaulted on the utility;
  override per-instance rather than redefining the utility.

If a token doesn't fit, flag it for the human to add at the source — stylebase,
or a project-local `--token-name` in the `token` cascade layer. Adding a token
changes a shared surface every other component reads, so it is boundary
movement: [STOP-2] applies. Don't redefine locally; the next reader will assume
the wrong source of truth.

## Scoped `<style>` block recipe

When a block needs scoped CSS — colours, sizing, a hover state — the recipe is:

1. Wrap a Bits UI primitive (or a semantic HTML element if no primitive fits).
2. Apply a single block class plus any token-backed utilities (`u:fs-*`,
   `u:lh-*`).
3. In the scoped `<style>`, use `:global(.your-block)` because the wrapper class
   lives on a child component's rendered element. Reference tokens by name. Stay
   under ~80 lines.

A working example is `src/lib/components/ui/SuedeButton.svelte` in any
suede-family project. The `:global` wrapper, the `--hue-blue-500` →
`--hue-blue-600` hover transition, the `[href]` exception for the link variant,
the `:focus-visible` outline using a token — that's the shape.

## Common mistakes

- **Reaching for raw HTML where a Bits UI primitive exists.** `<button>` instead
  of `Button.Root`, `<dialog>` instead of `Dialog.Root`. The accessibility is
  the point.
- **Reaching past a semantic token to a primitive.** `background:
var(--hue-neutral-50)` where `var(--hue-z0-bg)` exists. It looks identical in
  light mode and is wrong in dark mode, which is why it survives review.
- **Hardcoding colours, spacing, or font stacks.** A `#hex` value, a `1rem`
  padding, a `font-family: Inter, sans-serif` declaration. Every one of these
  should be a token reference.
- **Adding `!important`.** Wrong cascade layer or specificity war. Move the rule
  to the `layout` layer or restructure the selector.
- **Modifier classes for state.** `.card--reversed`, `.card.is-active`. The data
  attribute is the Exception layer's hook for a reason — it works in JS too.
- **Block CSS growing past ~80 lines.** The block is solving two problems;
  split it.
- **Defining a design token in a scoped `<style>` block.** Tokens live in
  stylebase or in the `token` cascade layer. A `--my-color` declared inside a
  component is invisible to every other component.
- **Wrapping content with `l:grid` and then writing grid-column CSS.** The grid
  spans are data attributes: `[data-grid-columns="third"]`. The grid utility
  handles the rest.
- **Skipping the cascade layer declaration.** Custom CSS that doesn't declare
  `@layer layout { … }` (or whatever layer) lands unlayered and wins by
  accident, not by intent. Declare the layer.

## What this skill doesn't cover

This file governs **where a rule goes** — which layer, which token, which
primitive. It does not govern **what the design should be**: which shade carries
which meaning, how much space a hierarchy needs, when a thing should be quieter
than the thing next to it. Those are visual-judgment questions and belong in a
separate skill. If a task needs that judgment and it isn't available, say so
rather than picking a token and calling it a decision.
