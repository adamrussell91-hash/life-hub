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

## Known gaps, in order

1. **Phone performance.** About 3.9M triangles for a full year. Needs distant-tree LOD before it
   goes live: `gltf-transform weld` then `simplify --ratio 0.1 --error 0.08` cut one tree from
   6,257 to 2,310 triangles; impostor cards are the next step if that is not enough.
2. Waterfall sheet looks grey; no bridges where the path crosses the river; inner terraces faint.
3. Expanded week mutes only the ground; trees in other weeks stay full colour.
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
