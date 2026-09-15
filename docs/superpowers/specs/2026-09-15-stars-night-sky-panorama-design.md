# Stars: night-sky panorama design

Date: 2026-09-15
Status: proposed
Related code: `apps/knowledge/src/stars/*`

## Problem

The current "Stars" graph (`apps/knowledge/src/stars/view.ts` + `canvas.ts`) renders the entire night sky flat, all at once, inside a fixed-height canvas. It's functional but not pretty, and it can't grow gracefully: every saved constellation and (potentially) every one of 4,000+ archive notes would need to be visible and interactive simultaneously.

## Concept

Reframe "Night sky" as a place you stand inside, not a diagram you look down on — a horizontal panorama, like standing in a field at night. You can never see the whole sky at once; you look around (pan left/right) to find different parts of it. This is explicitly a **horizontal panorama** (a cylinder you spin around), not a full 3D sphere — no looking up/down, no 3D engine. That gets the "can't see it all, must go looking" feeling and the visual richness (Milky Way, galaxy-cluster glow, shooting stars) without the complexity or load time of true 3D.

## 1. Positioning model

Every star-bearing thing — saved constellations *and* individual unconnected notes — gets its **horizontal position from its creation date**, mapped continuously along an unbounded timeline (month + year → azimuth), the same axis the existing horizon scrubber already exposes, just extended indefinitely rather than looping within one calendar year. This mirrors real astronomy: what's "up" depends on the time of year, and a constellation's place in the sky is fixed by when it was formed.

**Vertical position is purely decorative random scatter**, seeded from the item's id (the same hashing trick the current `stablePoint` helper uses), so it's stable across reloads rather than re-randomizing on every render. It carries no meaning.

## 2. Rendering: three layers, virtualized by distance from the viewer

- **Backdrop** (always cheap, never interactive): Milky Way band, galaxy-cluster glows, shooting stars — painted once per view, independent of data. This is atmosphere, not information.
- **Haze** (cheap, represents "notes exist here" without resolving them): for months outside the current view + a small buffer, render a density glow sized/brightened by how many notes live in that month. No hit-testing, no per-note DOM/canvas objects. This *is* the Milky-Way-density effect — a busy month glows brighter from a distance.
- **Resolved** (canvas-drawn, interactive): only for months inside the view + buffer.
  - Unconnected notes render as small faint points; hovering shows a ghost tooltip with the note's title.
  - Saved constellations render as their **actual glyph** — the same symbol (`eye`/`bridge`/`cycle`/`spiral`/`tree`/`compass`) shown in the detail view today, scaled down for the panorama — not a generic dot. This keeps a constellation recognizable at a glance, consistent with how it looks once opened.

As the user pans, months cross the buffer boundary and swap between haze and resolved — that's the "resolving into focus" moment. This bounds rendering/hit-testing cost regardless of total archive size, because only a handful of months are ever "real" objects at once.

Rendering itself should move from per-star SVG/DOM nodes (current approach) to canvas draw calls for the resolved layer, since DOM node count was the original scaling risk with 4,000+ notes.

## 3. Interaction

- **Pan**: drag left/right with inertia (a flick keeps drifting and decelerates), like a real panning gesture.
- **Scrubber sync**: the horizon scrubber at the bottom and the drag gesture drive the *same* position value — dragging the sky moves the scrubber's dot, dragging the scrubber's dot pans the sky. They are one control surface with two input methods, not two independent mechanisms.
- **Hover**: a resolved unconnected note shows a ghost-title tooltip.
- **Click**: a resolved constellation glyph opens the existing detail view, unchanged, with a new breadcrumb back to its sky position (see §7).
- **Default landing position**: on opening the Stars view, center on the real-world current month ("tonight") — like opening a planetarium app and seeing what's up right now — rather than always starting at January or an arbitrary position.

## 4. Visual chrome

- The sky becomes full-bleed, filling ~85-90% of the viewport rather than a fixed-height rectangle boxed in by page chrome.
- Title/search and the horizon scrubber become floating translucent glass HUD elements over the sky (dark glass, matching the sky's own palette), replacing today's solid light-colored toolbar and scrubber bars, which currently break the immersion by cutting a bright strip through the scene.
- An optional true-fullscreen toggle remains available for edge-to-edge viewing (building on the existing fullscreen behavior).
- Visual density (number of background stars, Milky Way prominence, shooting star frequency) should be tuned generously in implementation — the agreed direction is "rich and atmospheric," with exact counts/opacities left to visual polish during build rather than fixed here.

## 5. Data model changes

`SavedConstellation.sky` (in `apps/knowledge/src/stars/schema.ts`) currently stores an arbitrary `{x, y, rotation, scale}` used to place the constellation within one fixed-size screen.

- `x` is no longer stored — horizontal position is *derived* from `createdAt` on every render (per §1), not persisted.
- `y` (altitude) stays as stored, random-but-stable data (per §1).
- `rotation` and `scale` stay, but now describe the constellation glyph's own orientation/size as an artwork, not its placement in the sky.

This is a breaking change to the schema's meaning (not necessarily its shape) — existing saved constellations' stored `x` values become unused; `y` continues to apply as-is.

## 6. Unchanged

The Clementine search → propose → review → save flow, the glyph templates (`templates.ts`), and the synthesis/claims panel in the detail view are unaffected by this redesign. This is a re-skin of the sky surface itself, not the authoring flow.

## 7. Detail view polish (follow-on, same spec)

While reviewing a live example of the detail view (the glyph + "Selected note" panel + Clementine's synthesis), the following improvements were identified. These are lower priority than the panorama itself but belong in the same effort since they touch the same visual system:

- **Link synthesis citations to the glyph**: clicking a numbered source citation in a claim (e.g. "③") should highlight/pulse the corresponding star in the glyph above and scroll the note panel to it, so the diagram and the synthesis read as one connected explanation rather than two separate widgets.
- **Encode relation type into line style**: the glyph currently draws a mix of solid and dashed connector lines (at least one dashed line was observed) without an explained meaning. Line style should be driven by `StarsRelation.type` (`supports`/`complicates`/`extends`/`applies`/`contrasts`/`builds_on`), with a legend or hover tooltip on the line so the shape itself communicates the relationship.
- **Shared ambient backdrop**: the detail view's dark canvas around the glyph is currently empty space. Reuse the panorama's ambient backdrop layer (faint stars, subtle Milky Way) behind the glyph so the emptiness reads as depth/atmosphere rather than unused space.
- **Breadcrumb back to sky position**: replace or augment the generic "back" affordance with something like "← Night sky · March 2026", reinforcing that opening a constellation is zooming into a specific point in the sky, not navigating to an unrelated page.
- **Responsive claims grid**: the synthesis section's claim cards are laid out in a fixed multi-column row that wraps awkwardly (an observed 5th claim broke onto its own uneven row). Needs a responsive fallback (e.g. 2-column) below some viewport width.

## Out of scope

- True 3D/spherical sky (explicitly rejected in favor of a horizontal panorama).
- Any change to how Clementine researches, proposes, or validates constellations.
- Meaningful (non-decorative) vertical placement.
