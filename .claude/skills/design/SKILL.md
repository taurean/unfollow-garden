---
name: design
description: >
  Visual judgment for new UI in a stylebase + Bits UI project — hierarchy,
  spacing, colour meaning, elevation, and the defaults that make an interface
  read as generated rather than designed. Use when designing or building a
  screen, a component's appearance, or any UI where the question is what it
  should look like rather than where the rule goes.
paths:
  - '**/*.svelte'
  - 'src/lib/styles/**'
---

# Design

RFC 2119 applies. MUST and MUST NOT are absolute; SHOULD and SHOULD NOT are
strong defaults that need a stated reason to depart from; MAY is optional.

`writing-css` owns **where a rule goes** — which cascade layer, which token,
which primitive. This file owns **what the design should be**. When a decision
needs both, this one comes first: decide what the screen should look like, then
express it in the right layer.

Each rule has an ID. Cite it when flagging a violation.

---

## Reach for what exists

**[TOKEN-1]** Semantic surface tokens MUST be preferred over primitives.
`--hue-z0-bg`, `--hue-z0-fg`, `--hue-z0-divider`, `--hue-z1-bg`. Dark mode works
by remapping these; a component that reaches past them to `--hue-neutral-50`
looks identical in light mode and wrong in dark mode.

**[TOKEN-2]** A primitive MUST be used only where no semantic token expresses
the meaning. Accent colours, status colours, and brand surfaces are the usual
legitimate cases.

**[TOKEN-3]** A new token or utility MUST be modelled on an existing one — its
naming, its scale position, its layer. If stylebase has a fluid spacing scale, a
new spacing value is a new stop on that scale, not a one-off `1.375rem`. New
tokens are the human's call ([STOP-2]); propose the shape, don't add it.

**[TOKEN-4]** Layout MUST use the existing primitives before any bespoke CSS —
`l:grid`, `l:root`, `l:waterfall`, `l:river`, `l:repel`, `l:ui-list`. Most
layout problems are one of these with a different gap value.

**[TOKEN-5]** Semantic HTML MUST come before any class. stylebase styles raw
elements, so an unclassed `<article>`, `<h2>`, or `<table>` already looks
right. Reaching for a class to restate what the element already says is work
that produces nothing.

---

## Elevation and depth

**[ELEV-1]** Depth MUST NOT be simulated. No drop shadows standing in for
physical light, no bevels, no gradients implying a curved surface, no textures
imitating a material. The interface is a flat surface with layers, not a
photograph of objects.

**[ELEV-2]** Elevation MUST be expressed through the z-layer tokens. z0 is the
base surface; z1 is elevated. An elevated surface is a background change, not a
shadow.

**[ELEV-3]** A shadow MAY be used where it carries information rather than
imitating physics — a focus ring, a drag state. It MUST NOT be decoration, and
it MUST NOT appear on a resting element.

---

## Containers

**[BOX-1]** Whitespace MUST be tried before a container. Proximity already
groups things; a border, panel, or card that only says "these belong together"
is saying what the spacing said, louder.

**[BOX-2]** A container MUST have a reason beyond grouping: it's independently
scrollable, it's selectable or actionable as a unit, it sits on a different
surface layer, or several of them repeat and need a visible boundary between
instances.

**[BOX-3]** Containers MUST NOT nest without a reason at each level. A card
inside a panel inside a section is three boundaries doing one job. This is the
single most reliable tell of generated UI.

**[BOX-4]** Where a boundary is genuinely needed, the lightest thing that works
MUST be preferred: whitespace, then a divider, then a background shift, then a
border. Not all four at once.

---

## Hierarchy

**[HIER-1]** Each screen or section MUST have exactly one primary element. If
two things are competing for first, neither is winning.

**[HIER-2]** Emphasis SHOULD be created by de-emphasizing everything else
rather than by enlarging the important thing. A screen where one element is
loud reads as emphasis; a screen where three are loud reads as noise.

**[HIER-3]** Weight and colour SHOULD be reached for before size. Size is the
blunt instrument and it compounds badly — every step up forces the surrounding
scale to move.

**[HIER-4]** Secondary and tertiary content SHOULD be quieted by lowering
contrast, not by shrinking. Text that's too small is unreadable; text that's
lower contrast is legible and recedes.

---

## Spacing

**[SPACE-1]** Spacing MUST NOT be uniform across a layout. Uniform gaps say
everything is equally related, which means nothing is grouped.

**[SPACE-2]** The gap within a group MUST be smaller than the gap between
groups. A label sits closer to its field than two fields sit to each other.
This is the whole of grouping.

**[SPACE-3]** Start with more space than feels right and remove it. Too tight
is much harder to see than too loose, and the fluid scale makes generosity
cheap.

**[SPACE-4]** Rhythm SHOULD come from the flow primitives (`l:waterfall`,
`l:river`) with an overridden gap, rather than from per-element margins.

---

## Colour

**[COLOR-1]** An interface SHOULD use far fewer colours than it feels like it
needs. One accent hue plus the neutral scale covers most of it. Every
additional hue has to earn its meaning.

**[COLOR-2]** A hue MUST mean one thing consistently. If blue is the primary
action, blue is not also an informational background.

**[COLOR-3]** Colour MUST NOT be the only carrier of meaning. Status, state,
and validation need a second signal.

**[COLOR-4]** Contrast SHOULD be reasoned about using the OKLCH scale, which is
perceptually uniform — the distance between shade numbers corresponds to
perceived lightness. This makes contrast predictable rather than a guess, and
means it can be checked without a tool.

**[COLOR-5]** Dividers and borders MUST use `--hue-z0-divider`, which mixes
against `currentColor` and is therefore correct in both themes.

---

## Typography

**[TYPE-1]** Sizes MUST come from the fluid scale (`u:fs-*`, `--fs-*`). The
scale is viewport-interpolated, so a size chosen from it is already responsive.

**[TYPE-2]** A screen SHOULD use three or four sizes at most. More is almost
always hierarchy that should have been expressed with weight or colour
([HIER-3]).

**[TYPE-3]** Line height MUST be chosen for the role: tight for UI labels and
headings, looser for body copy. `--lh-ui` through `--lh-loose` name the range.

**[TYPE-4]** Body copy MUST NOT be centered. Headings and short labels MAY be.

**[TYPE-5]** Line length for reading SHOULD sit in the 60–75 character range.
`l:root` handles this at the page level; a narrower column inside it usually
doesn't need its own constraint.

---

## Tells

These are the defaults that make UI read as generated. Each is a
SHOULD NOT — there are legitimate exceptions, but the exception needs a reason.

**[TELL-1]** Purple or indigo as the default accent, chosen because it's the
default rather than because it means something.

**[TELL-2]** Text gradients.

**[TELL-3]** Everything in a rounded card. See [BOX-3].

**[TELL-4]** Drop shadows on resting elements. See [ELEV-1].

**[TELL-5]** Emoji standing in for icons.

**[TELL-6]** Uniform spacing throughout. See [SPACE-1].

**[TELL-7]** Border and shadow and background shift all applied to the same
element, each doing the job the others already did.

**[TELL-8]** Centered body copy. See [TYPE-4].

**[TELL-9]** Pure black on pure white. The neutral scale exists.

**[TELL-10]** An icon at the same visual weight as the text beside it. Icons
accompany; they rarely lead.

**[TELL-11]** A hero section, a three-column feature grid, and a call to action,
in that order, because that's what a landing page looks like.

---

## Before calling it done

**[DONE-1]** Interaction states MUST be designed, not defaulted: hover, focus
(`:focus-visible`, using a token), active, disabled, loading, error, and empty.
Empty and error are the ones most often skipped and most often seen.

**[DONE-2]** The result MUST be checked at narrow and wide viewports. The fluid
scales handle most of it; what they don't handle is layout that stops making
sense, which only shows up by looking.

**[DONE-3]** Both colour schemes MUST be checked. If [TOKEN-1] was followed
this is a formality; if it wasn't, this is where it surfaces.

**[DONE-4]** When a decision needed judgment this file doesn't cover, say so
rather than picking something and moving on. An unstated design decision is
harder to find later than an unanswered question.
