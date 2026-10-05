# Shared islands: one coastline per book, bridges and shared land for links

Date: 2026-10-05 · Status: approved direction (option 1), awaiting spec review

## Why

- A book's island on the **Archipelago** (Bookshelf → Islands) and its land in the
  **book view** (the Atlas) are drawn by two unrelated generators, so they never match.
  - Archipelago: `archipelagoLayout.ts` gives each book one province with a random
    `stretch` of 1–2.3× plus `coastline()` peninsulas (stretched 1.8–3.4×). This is why
    every island reads as a sausage.
  - Book view: `buildAtlas()` in `atlasLayout.ts` lays one province per chapter (or theme)
    in a row from west to east, which also reads as a long strip.
- Links between books only show as faint sea routes. Adam wants close, well-linked books
  to visibly connect.

A mockup of the target was agreed in session (rounder islands, the same outline in both
views, bridges for 1 and 2 links, shared land with a border and road for 3+ links, faint
dotted lines for far links, and the neighbouring country visible in the book view).

## Decisions

| Topic | Decision |
|---|---|
| Island shape | One deterministic shape per book key, shared by both views. Near-round: stretch capped at 1.3, more and shorter headlands, an optional bay, 0–2 islets. |
| Layout | Option C: notebooks stay as seas. Inside a sea, linked books are pulled together. |
| 1 link (same sea, neighbours) | Rope bridge. |
| 2 links (same sea, neighbours) | Stone bridge. |
| 3+ links (same sea) | The two islands join into one landmass: a neck of land, each half in its own book's colour, a dotted border across it and a road over the border. |
| Far or cross-notebook links | No bridge, no joining. A faint dotted line, brightened with its count when either book is in focus (today's route behaviour, restyled). |
| Link count | Per book pair, counted once per linked note pair, the same as `passagesFor()` today. |
| Book view neighbours | Option A: joined neighbours appear faded at the edge with the road running into them; clicking one opens that book. Bridged neighbours show the bridge leaving the coast, labelled with the book's name. |
| Night sky | Out of scope (Adam: not needed). |

## Architecture

The terrain renderer stays. Land is still a heightfield of soft hills (`atlasTerrain.ts`),
with the coast at `SEA = 0.42`. The change is *where the coastline comes from* and making
it independent of scale and note count.

### 1. `src/shelf/islandShape.ts` (new)

The single source of truth for a book's outline.

```ts
export type ShapeSource = { x: number; y: number; amp: number; sigma: number; stretch?: number; angle?: number };
export type IslandShape = { base: ShapeSource[]; islets: ShapeSource[] };

/** In island units: centre (0, 0), radius 1. Deterministic per key. */
export function islandShape(key: string): IslandShape;
/** Place a shape in world space at (x, y) with radius r. */
export function placeShape(shape: IslandShape, x: number, y: number, r: number): IslandShape;
/** Where the coast faces a bearing, in island units (for bridge ends, roads, labels). */
export function shoreAt(shape: IslandShape, angle: number): { x: number; y: number };
/** Rough outline radius at a bearing, for clamping towns and regions inside the coast. */
export function reachAt(shape: IslandShape, angle: number): number;
```

- `base` is a main body (stretch ≤ 1.3) plus 3–5 headlands with stretch ≤ 1.8, and an
  optional bay (negative amp).
- `islets` sit just offshore, at about 1.2–1.4 in island units. In the book view, loose
  notes (no page yet) settle on the largest islet instead of today's separate south-east island.
- This replaces `coastline()` and the province `stretch` and `angle` rolls in `archipelagoLayout.ts`.

### 2. `atlasTerrain.ts`: base vs relief, island-relative noise

Today towns are hills that also push the coast outward, and the warp noise is in world
units. So the same sources at a different scale, or with more notes, give a different coast.
Changes:

- **Two kinds of source.**
  - `base` (shape) sources alone decide the coastline.
  - `relief` sources (towns, debate peaks) add height only inland:
    `e = base + relief × smoothstep(SEA, SEA + 0.15, base)`.
  - Adding notes then raises hills but never moves the shore.
- **Voting.** Region (colour) is decided by the nearest *voting* source.
  - Base sources vote for their island's region in the Archipelago.
  - In the book view, chapter seeds vote and base sources don't, so chapters can carve the
    island into regions.
- **`unit` option.** `renderTerrain(atlas, resolution, seed, unit = 1)` samples the warp
  noise at `(x / unit, y / unit)` and scales the warp by `unit`. The book view renders the
  island at `k ×` its Archipelago size and passes `unit = k`, so the coastline is the same
  shape scaled.
- **Testable core.** The elevation computation is pulled into a pure exported
  `elevationAt(sources, x, y, opts)`, plus a grid helper, so tests can check shores
  without a canvas (jsdom has none).
- The existing region-border rendering (navy dashes where the region changes) already
  draws the country border on a joined neck. No new border code is needed in the renderer.

### 3. `archipelagoLayout.ts`: option C layout, tiers and necks

- **Tiers.** `crossingsFor(passages, islands)` returns, per pair in the same sea, one of
  `"rope" | "stone" | "joined"` (counts 1, 2, 3+), or `"far"` when they're in different
  seas or not neighbours after layout.
- **Layout.**
  - `packCircles` still seeds positions.
  - Then a deterministic relaxation (a fixed number of iterations, no randomness) runs
    inside each sea. Linked pairs spring towards a target gap: about 12 units for
    `joined`, about 60 for bridges.
  - Every pair keeps a minimum gap: `ISLAND_GAP` for unlinked books in the same sea, the
    target gap for linked ones.
  - Seas are then packed as today, from their new extents.
- **Necks.** A `joined` pair gets two elongated base sources from shore to shore, each
  voting for its own book. The heightfield then merges the two coasts into one, and the
  region border falls in the middle of the neck.
- **Safety.** Unrelated islands must never merge.
  - Tests check that elevation at the midpoint between every non-joined pair is below `SEA`.
  - Bridged pairs keep a real strait, so the bridge has water to span.
- `ArchipelagoModel` gains `crossings: Crossing[]`, with
  `{ from, to, count, kind, a: {x, y}, b: {x, y} }` and shore points for drawing.

### 4. `archipelagoView.ts`: drawing crossings

- The routes SVG layer draws by kind:
  - `rope`: twin sagging lines with planks.
  - `stone`: a parchment deck with small arches.
  - `joined`: a road from inland across the border, with a dot at each end.
  - `far`: today's route curve, restyled as a faint dotted line that brightens, with its
    count, on focus.
- These are SVG in the existing route layer, so they follow pan, zoom and the
  day/night ink tokens (`--sl-ink`, `--sl-paper`).
- Count buttons keep today's rule: only for the island in focus.
- `seaLife` ships only work `far` passages. A ship sailing between two joined countries
  makes no sense.

### 5. `atlasLayout.ts` + `atlasView.ts`: the book view inside the shared coast

- `buildAtlas(book, now, context?)` takes an optional `context` from the Archipelago: this
  book's island (position and radius) and its neighbours with crossing kinds.
  `view.ts:873` passes it in. Without context (tests, or a single book) it falls back to
  the book's own shape alone at the origin.
- **Coordinates.** World space is the Archipelago's space around the book, scaled by
  `k = 900 / (2.6 × r)`, so the island fills the view. The renderer gets `unit = k`.
- **Chapters as regions.**
  - Chapters (or themes, as today) become wedges around the island centre, in reading
    order clockwise from the north-west.
  - Each wedge's angle is proportional to its note count, with a minimum share so empty
    chapters still appear (unexplored colour, fogged as today).
  - Each wedge places one voting chapter seed at 0.55 × `reachAt` on its middle bearing.
  - The `MAX_PROVINCES` grouping still applies.
- **Towns.**
  - The sunflower spiral now runs within each wedge, clamped to 0.8 × `reachAt(bearing)`,
    then `relax()` as today.
  - Relief sources come from towns (peaks for debate notes).
  - Loose notes go on the largest islet.
- **Neighbours.**
  - Joined neighbours' base sources are included with a faded colour (their book colour
    mixed 60% towards `UNEXPLORED`), so the shared coast and border show.
  - Their label is a button that opens that book.
  - The road runs from the joined town (the note with most links to it) across the border.
  - Bridged neighbours draw the bridge from this coast, ending in a labelled stub
    ("→ Neuroscience (Purves) · 2 links").
  - Far books keep today's sea-route markers (`AtlasRoute`).
- **Fog.** Fog questions drift just off the shore nearest their town, using `shoreAt`,
  rather than south of a row of provinces.

## Data flow

```
books ──► buildArchipelago ──► islands (positions, r) + crossings ─┬─► archipelagoView (terrain + crossings SVG)
                     ▲                                            │
           islandShape(key) ◄─────────────────────────────────────┴─► buildAtlas(book, context) ─► atlasView
```

`islandShape` is pure and keyed by book key, so a book keeps its outline even when its
notes change. Only its size (`islandRadius(noteCount)`) and its neighbours move it.

## Edge cases

- **A book with 0 notes:** it still gets its shape at the minimum radius ("the island is
  still sand", as today).
- **Chains** (A joined to B, B joined to C): each neck is independent, so you get a
  three-country landmass. In the book view for B, both A and C appear faded at the edges.
- **A pair that ends up apart after relaxation** (a crowded sea): it falls back to `far`
  rather than drawing an overlong bridge. The rule is a maximum bridge length of about 90
  world units.
- **The same pair linked in both directions:** already counted once by `passagesFor()`.
- **Terrain cache key** (`terrainKey` in `atlasView.ts`) must include the neighbour set
  and the crossing kinds, or a book's map won't refresh when it becomes joined.

## Testing

- **`islandShape.test.ts`:**
  - Deterministic per key.
  - Stretch ≤ 1.3.
  - Every headland is within 1.15 in island units.
  - `placeShape` round-trips.
- **`atlasTerrain` (pure elevation):**
  - The shoreline sampled on a ring of bearings is the same, within 1%, with and without
    relief sources. This is the coast-independent-of-notes guarantee.
  - The coast is identical, up to scale, at `unit = 1` and `unit = k`.
  - Non-voting sources never set a region.
- **`archipelagoLayout.test.ts`:**
  - Tiers 1 → rope, 2 → stone, 3+ → joined.
  - Different seas → far.
  - Over-long gap → far.
  - Joined pairs have land at the neck midpoint.
  - Every other pair has water at the midpoint.
  - The layout is deterministic.
- **`atlasLayout.test.ts`:**
  - The book-view island's normalised base sources equal its archipelago ones.
  - Every town is inside the coast.
  - Wedges cover 360° in reading order.
  - Loose notes are on an islet.
  - Joined neighbours are included and marked faded.
- **Browser check:**
  - In the dev server with a fixture that has cross-book links (local data has none),
    the same island appears in both views, with bridges and joined land as in the mockup.
  - Day and night both look right.
  - Then confirm on the live site after deploy, since live data has real links.

## Out of scope

- The night sky or sea restyle.
- New sea life.
- Changes to the Universe or Show All graphs.
- Changing the notebooks-as-seas grouping.
