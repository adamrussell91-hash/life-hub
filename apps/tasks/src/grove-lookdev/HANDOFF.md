# Grove Year look: handoff

Read this first. It replaces the long design conversation of 13 October 2026.

## What this is

A standalone look prototype for Grove's Year view, served by the Tasks dev server at
`/grove-lookdev.html`. Synthetic history only. Nothing in the live Grove uses it yet.

Files: `map.ts` (layout, terrain, river, lake, path), `planting.ts` (trees and ground cover),
`history.ts` (synthetic tasks), `main.ts` (renderer, camera, expanding week), `noise.ts`.
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

## Known gaps, in order

1. **Phone budget, if real devices still struggle:** the heaviest LOD trees are tree-late-1/2/4
   (about 3.6k triangles each); impostor cards for Year view are the next step. Untested on a
   real phone so far.
2. **Trees are capped by space, not by history.** The synthetic history has 518 finished tasks,
   but only 442 trees are drawn. `plant()` stops placing trees once a week's piece has no clear spot
   left (spacing down to 1.4), and silently drops the other 76. That breaks Grove's "nothing dies"
   rule. Planting all 76 with touching crowns was tried in round four. It added about 200k
   triangles in Year view (shadow pass included), so it needs its own round: smaller saplings for crowded weeks, a denser
   AoE-style stand, or a count on the week label.
3. The little falls between river tiers still read as white wedges up close; fine at Year zoom.
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
