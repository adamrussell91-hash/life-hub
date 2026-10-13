# Grove Year look: handoff

Read this first. It replaces the long design conversation of 13 October 2026.

## What this is

**This is now the live Grove page** (`#/grove`, `views/grove/view.ts`). It started as a look
prototype; `/grove-lookdev.html` still mounts the same scene on synthetic history for look rounds.

Files (`apps/tasks/src/views/grove/forest/`): `scene.ts` (`mountForest()`: renderer, camera,
expanding week, picking), `map.ts` (layout, terrain, river, lake, island, path), `planting.ts`
(trees and ground cover), `animals.ts` (earned wildlife), `data.ts` (real completions and
milestones to trees and animals), `history.ts` (types, week numbering), `noise.ts`. The prototype
page is `apps/tasks/src/grove-lookdev/` (synthetic `history.ts`, thin `main.ts`).
Screenshots: `node tools/grove-previews/lookdev-shots.mjs <out-dir>` with the dev server running.

## Decisions Adam has made

- **Target look:** Forest Island (cheerful, bright, low-poly diorama with white cliffs and
  waterfalls) crossed with Age of Empires II maps (dense forest masses, winding rivers, paths).
  Forest landscape, not a game board.
- **One continuous map.** Never separate islands per week or per year.
- **Weeks are jigsaw pieces** of that map, built by completed tasks. Laid in a spiral from the
  centre so week n touches week n + 1; future weeks sit at the rim as meadow.
- **Trees lean towards week borders and corners** so neighbouring weeks' stands join and the
  forest does not look artificial. Clearing centres stay open for a path through each week.
- **Expanding week:** tapping a week in Year eases the camera in, keeps that week bright, mutes
  the rest and shows its dates and tree count.
- No cones or placeholder geometry anywhere. Use the Quaternius models in
  `apps/life/assets/grove/models/`.
- Grove's existing rules still hold (nothing dies, growth follows real dates, same history
  draws the same forest; see `apps/life/assets/grove/README.md`).

## State after round one

Adam's verdict: a huge improvement on the live Grove. Working: jigsaw weeks, border-led planting,
real models, terraced terrain, river with a fall over the cliff, lake, path, shadows, tap to
expand, one-finger pan on phones, camera clamped to the map.

## State after round two (Forest Island colour and atmosphere)

Adam chose colour and atmosphere over denser stands. Changes, all in `main.ts` plus the page sky:

- **Why the trees were near-black:** every Quaternius leaf mesh carries dark baked vertex colour
  (COLOR_0, used as AO), and the leaf textures are flat colour. The old `offsetHSL` "brighten"
  touched only the material tint, which is white, so it did nothing.
- **Foliage shader (`dress`)** on any material named Leaf/Leaves: AO softened to 35%, greens pulled
  towards a light yellow-green (hue about 97°), a 14% albedo fill so crowns turned from the sun stay
  light. Cherry blossom and autumn reds keep their hue and get a small lift.
- **Light:** Neutral tone mapping instead of ACES (ACES pushed greens to olive), exposure 1.05,
  sky-blue hemisphere over a warm sand bounce (a green bounce tinted the cliffs), slightly
  softer warm sun.
- **Ground:** brighter lime grass, lighter forest floor, creamier cliffs and strata, warmer path.
- **Atmosphere:** light linear haze (`Fog`, 420 to 1000) so the far rim and cliff feet fade
  towards the sky; page sky is a clearer blue.

Triangles and draw calls unchanged (3.9M, 103 calls).

## State after round three (phone performance)

- **LOD models** in `apps/life/assets/grove/models/lod/{trees,ground}/`, same file names as the
  originals. Made with `gltf-transform weld`, `simplify --ratio 0.1 --error 0.08`, `meshopt`.
  Seven files collapsed badly at that setting and use `--ratio 0.2 --error 0.04`: tree-late-1/2/4,
  tree-life-2 (all stages), mushroom-2. Ground models under 300 triangles are copied unchanged.
  Material names, COLOR_0 and heights are preserved (checked per file). Tree source triangles
  344k to 69k across the set; the folder is about 4.7 MB.
- **Switching** in `main.ts`: each model has a full and an LOD instanced mesh. An instance uses full
  detail only when it is on screen and a map unit is at least 10 screen pixels (`DETAIL_PX`). The
  split is recomputed 120 ms after the camera settles. A missing LOD file falls back to full.
- **Result** (triangles per frame, shadow pass included):

  | View | Before | After |
  |---|---|---|
  | Desktop Year | 3.9M | 1.08M |
  | Desktop expanded week | 3.8M | 2.25M (on-screen trees full) |
  | Phone Year | 3.9M | 1.08M |
  | Phone expanded week | 3.8M | 1.06M (all LOD, reads the same at that size) |

- `body.dataset` now also exposes `zoom`, `px` (screen pixels per map unit) and `detailed`.
  The screenshot script drives frames after expanding, so the LOD swap is in the shot.

## State after round four (water, bridges, terraces, muting, phone framing)

- **Waterfall:** the cliff fall and the little river steps are now unlit (`MeshBasicMaterial`) with
  vertex colour running from aqua at the lip to white foam at the foot. A lit vertical sheet facing
  away from the sun was what read grey. The cliff fall is a curved, streaked sheet that widens as it
  drops, with three low-poly spray puffs at its foot.
- **Bridges:** `buildBridges()` in `main.ts` finds each place the path crosses the river and builds a
  wooden plank bridge in code: an arched deck, four posts and a rail each side, bank to bank, along
  the path. `models/ground/bridge-1.glb` is not a bridge: it is a round stepping-stone slab: 10.5k
  triangles a stone, 3.5k even in its LOD copy. Bridges share the ground material, so they mute with their week.
  Bank rocks are kept off the path so none sit on a deck.
- **Inner terraces:** the terrain shape is unchanged. Risers inside the map are now tinted a creamy
  earth bank (`C.bank`, slope 0.35 to 0.95), and the white cliff colour starts at slope 1.6 instead
  of 1.25. A sharper terrace profile was tried. It made jagged white stripes across the path, and
  pushed four trees out (442 to 438), so it was dropped.
- **Muting:** every model material now gets one shader hook (`dress`). It applies the ground's mute
  (55% towards grey, then 0.82) to any instance whose `aCell` is not the expanded week. `aCell` is a
  per-instance attribute written in `fill()`; each instanced mesh has its own geometry shell so the
  full and LOD meshes never share it. Trees, ground cover, rocks and bridges all mute.
- **Phone framing:** three.js zooms an orthographic camera about the middle of its frustum, and this
  frustum is offset upward (top 1.06, bottom 0.94). So the further it zoomed, the lower the week sat.
  `expand` now aims the week's stand at the middle of the space under the title, and a phone fits the
  week to a 40-unit span (58 on wider screens).
- **Triangle budget:** at or below round three in every view. To pay for the bridges and falls, the
  river and lake bed is no longer drawn where opaque water covers it (the water was 93% opaque; it is
  now fully opaque). Bridges receive shadows but do not cast them.

  | View | Round three | Round four |
  |---|---|---|
  | Desktop Year | 1,084,346 | 1,084,164 |
  | Desktop expanded week 23 | 2,251,388 | 2,226,830 |
  | Phone Year | 1,084,342 | 1,084,164 |
  | Phone expanded week 23 | 1,055,144 | 1,054,550 |

- The screenshot script now also takes `week23-390` (phone expanded week). `GROVE_ONLY=<shot>`
  takes one shot.

## State after round five (nothing dies)

- **Every finished task has a tree:** 518 of 518 (was 442). `plant()` used to stop once a week's
  piece had no clear spot left and silently drop the rest. Eleven weeks were short; week 21's piece
  is almost all lake, with room for 1 of its 11 trees.
- **Understorey:** after the stands are planted (unchanged: all 442 keep their exact spots), the
  leftover tasks of a crowded week go in from a dense grid over its piece with its own random stream:
  first between the stand's trees (gap 1.3 to 1.1), then the clearing edge, closer to the path and
  water, and steeper banks (gap down to 0.8). A last resort takes the dry spot furthest from any tree,
  so the rule holds by construction. Understorey trees are the species' lightest variant at about
  three quarters height, keep their real growth stage, cast no shadow and always draw at LOD.
- **Island:** a cell whose clearing would sit 4+ units inside the lake gets a small wooded island
  there (`terrain.islands`, radius about 5, folded into `lakeDistance`). Today that is week 21. The
  clearing rule is waived on an island. The extra dry land shifts the grass and flower scatter
  (random, same density); trees do not move.
- **Guard:** `main.ts` counts tasks without a tree and logs a console error; `body.dataset.dropped`
  and `trees` are printed by the screenshot script.
- **Paying for it:** the bush LODs were heavier than most trees (bush-4 LOD 1,438 triangles, 411
  bushes = 362k in Year). Re-simplified bush-1, 2 and 4 LODs (`--ratio 0.4 --error 0.15` for 1 and 2,
  `--ratio 0.1 --error 0.15` for 4: 408, 345 and 846 triangles). Same silhouettes at the sizes they
  draw; material names, COLOR_0 and heights kept.

  | View | Round four (442 trees) | Round five (518 trees) |
  |---|---|---|
  | Desktop Year | 1,084,164 | 1,063,231 |
  | Desktop expanded week 23 | 2,226,830 | 2,281,131 |
  | Phone Year | 1,084,164 | 1,063,231 |
  | Phone expanded week 23 | 1,054,550 | 1,032,533 |

  Desktop expanded week is 2.4% over round four (more full-detail ground cover near week 23 after the
  scatter shift); every phone view and Year is under.

## Round six: live

- **Data:** the page reads finished tasks plus the private 2026 history (`grove_history` in hub
  prefs, already imported: 41 weeks, 636 completions, matching the Notion "Grove 2026 — Weekly
  Backfill Counts" page) through `applyGroveHistory`, then `forestHistory()` turns this year's
  completions into trees. Backfilled history has no recorded deadlines, so it never grows gnarled;
  real board tasks finished late do (gnarled variants 3 and 5 only: 1, 2 and 4 are 3.6k triangles).
- **Animals:** `forestAnimals()` uses Codex's milestone rules (`domain/grove/wildlife.ts`) and
  companions for the year. `animals.ts` gives each a loop: land animals on dry, gentle ground in the
  week they were earned (or the nearest week with room), the mallard/otter on the lake, birds over
  the canopy. Grove's roaming motion drives walk/rest/feed; up to 30 fps while visible, still under
  reduced motion. The 20-model bundle is installed only by the Pages deploy; the dev server has the
  three public models.
- **Shadows** redraw only when the camera moves (animals cast none), so animation is cheap.
- **UI:** the old Day/Week/Term/Year pills, arrows, Today, Import history, water quality, Pause
  motion and framing buttons are gone. One glass title chip, a ‹ Year button inside a week,
  tap a week to step in, tap a tree or animal for a card (a bottom sheet on phones). The forest
  fills the window under the page title; the reminder strip hides on Grove only.
  `#/grove?week=10` opens a week; `?year=2025` a past year.
- **Budget with real data** (639 trees, 11 animals): Year about 1.45M triangles on desktop and
  phone, phone expanded week 1.41M, desktop expanded week 2.7M.

## Known gaps, in order

1. **Phone budget, if real devices still struggle (now 1.45M with real data):** the heaviest LOD trees are tree-late-1/2/4
   (about 3.6k triangles each); impostor cards for Year view are the next step. Untested on a
   real phone so far.
2. The little falls between river tiers still read as white wedges up close; fine at Year zoom.
3. The path runs through week 21's clearing, so it crosses the lake to the island under the water
   (it did before the island too). `buildBridges()` only bridges the river; a lake causeway or two
   short bridges would finish it.
4. Next look round, if Adam wants it: denser Age of Empires stands.

## Live Grove problems found in the review (not yet fixed)

- `views/grove/view.ts` remounts the whole scene every 60 s and on every tab switch.
- `grove-world-preview/renderer.ts` (the live renderer, still labelled "Diagnostic only") never
  sets pan controls, so one finger rotates; no pan clamp.
- Key swatches in `grove.css` do not match far-tree colours in the renderer.
- `scripts/check-grove.mjs` looks for "Pause wildlife"; the button says "Pause motion", so its
  pause and reduced-motion checks never run.
- `views/grove/scene.ts`, `ground.ts`, `animals.ts` are dead apart from type imports.

## Working rhythm that kept costs down

One focused change per round, then one screenshot set (desktop Year, desktop expanded week,
phone Year). Compare against the references and stop when Adam says it is right.
