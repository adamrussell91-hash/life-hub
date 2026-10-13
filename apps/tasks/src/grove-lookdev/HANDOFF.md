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

## Known gaps, in order

1. **Phone budget, if real devices still struggle:** the heaviest LOD trees are tree-late-1/2/4
   (about 3.6k triangles each); impostor cards for Year view are the next step. Untested on a
   real phone so far.
2. Waterfall sheet looks grey; no bridges where the path crosses the river; inner terraces faint.
3. Expanded week mutes only the ground; trees in other weeks stay full colour.
4. On a phone the expanded week sits low on screen with a lot of sky above it.
5. Next look round, if Adam wants it: denser Age of Empires stands.

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
