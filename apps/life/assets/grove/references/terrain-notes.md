# Grove: terrain, water and growing trees

**Status:** Researched code references, 10 October 2026. Not a build brief.
**Concept:** [Grove](../README.md). **Broader collection:** [Raw ingredients](README.md).
**Request:** Code-generated hills, streams following low ground, lakes filling hollows, and trees scaling from saplings over a few days with a small arrival wobble.
**Visual direction:** Adam's Forest Island screenshot: cheerful faceted land, rounded clustered tree crowns, turquoise water, soft lighting and readable silhouettes. Use this as a style reference for original Grove scenery.

## Start here

| Need | Best starting point | Actual code saved here | What it supplies |
| --- | --- | --- | --- |
| Noise for hills | [simplex-noise.js](https://github.com/jwagner/simplex-noise.js), MIT; [interactive explanation](https://www.redblobgames.com/maps/terrain-from-noise/) | [Noise implementation](terrain/simplex-noise.js/simplex-noise.ts.txt) | Seedable 2D noise to sample into terrain heights. Multiple frequencies give broad hills plus small variation. |
| Island shape and inland water | [Mapgen2 demo](https://www.redblobgames.com/maps/mapgen2/), Apache 2.0 | [Water](terrain/mapgen2/water.js.txt), [elevation](terrain/mapgen2/elevation.js.txt), [rivers](terrain/mapgen2/rivers.js.txt), [noise helpers](terrain/mapgen2/util.js.txt) | Noise-based water mask, ocean connectivity, elevation and accumulated river flow over a polygon mesh. |
| More developed terrain and river routing | [Mapgen4 demo](https://www.redblobgames.com/maps/mapgen4/), Apache 2.0 | [Generator](terrain/mapgen4/map.ts.txt) | Height generation, rainfall, priority-based drainage and flow accumulation. Read `assignDownslope` and `assignFlow`. |
| Faceted tree shapes | [Lowpoly Tree Generator](https://github.com/pajama-studio/lowpoly-tree-generator), MIT; [live editor](https://rand.monster/editor/trees) | [Basic Three.js example](terrain/lowpoly-tree-generator/examples__basic.js.txt) | A parameterised tree with clustered crowns, vertex colours and a 500-triangle budget in the example. |
| Small arrival wobble | [Tween.js guide](https://github.com/tweenjs/tween.js/blob/main/docs/user_guide.md), MIT | [Easing functions](terrain/tween.js/src__Easing.ts.txt) | `Back.Out` for a restrained overshoot; `Elastic.Out` for a more springy option. Scale and rotation can be animated together. |

These are upstream source snapshots, not newly implemented Life Hub features. The `.txt` suffix keeps them out of runtime module discovery. Each folder includes its original licence and package manifest. [manifest.json](terrain/manifest.json) records exact commits, original file paths, permanent source links and SHA-256 hashes. Dependencies are not bundled, so the saved files are reading/extraction references rather than standalone runnable projects. Run complete upstream projects using their own READMEs and pinned commits.

## Lakes filling hollows: the missing piece

Mapgen2 chooses water from noise, then distinguishes the ocean through connectivity. It is useful for stylised islands, but this is different from finding the spill level of an arbitrary depression in an existing height field. Mapgen4 routes drainage and can lower terrain along flow paths; do not describe it as a complete basin-filling model either.

For genuine hollows, use **Priority-Flood** to compute a drainage surface while retaining the original bed heights. The difference between the original bed and the basin's spill surface identifies potential standing water. Connected cells belonging to one basin need a common horizontal lake surface and a defined outlet; drainage epsilon must not visibly tilt that surface.

- [Barnes, Lehman and Mulla's paper](https://arxiv.org/abs/1511.04463) explains the algorithm and supplies pseudocode.
- [Author's reference implementation](https://github.com/r-barnes/Barnes2013-Depressions) and [RichDEM's Barnes2014 implementation](https://github.com/r-barnes/richdem/blob/master/include/richdem/depressions/Barnes2014.hpp) are authoritative code references. RichDEM's repository licence is GPLv3; it is an algorithm-study option rather than the selected runtime dependency.
- [Gridlands](https://github.com/Syntaxswine/gridlands) is an unusually close JavaScript example: noise hills, depression filling, flat lakes, river accumulation and tree placement. Inspect `js/hydrology.js`, `js/heightmap.js`, and `tools/check.mjs`. Its README gives local run instructions and describes invariant checks. No root licence file was found during this research, so its source is linked for inspection and has not been copied into this pack. Resolve reuse terms before selecting it as a dependency.

Suggested pipeline: fixed geographic constraints → seeded height field → basin/spill analysis → ocean and lake masks → acyclic drainage → accumulated stream flow → dry-ground tree placement → renderer. Keep the original terrain separate from the drainage surface so the algorithm cannot erase the hollows that should hold lakes. Filling to spill assumes enough water; partial rainfall-driven filling would be a separate simulation and is unnecessary for the requested decorative scene.

## Tree growth over days, with an arrival wobble

The geometry generator makes tree shapes. Tween.js supplies short interpolation and easing. Neither owns the task-history adapter. Grove derives the lifecycle from existing task completion timestamps and the current clock; it needs no new stored game state.

For each tree, derive its identity and variation from the task ID, its planting timestamp from `completed_at`, and its ground position from a deterministic layout. Maturation duration is a shared rule, not saved per-tree progress. A three-day duration is an evaluation suggestion, not a final product rule. At any render time:

1. Age is the elapsed time since planting, clamped at zero.
2. Growth progress is age divided by maturation duration, clamped between zero and one.
3. Interpolate from a visible sapling scale to mature scale using a monotonic curve. Compute this from timestamps, so closing the browser overnight does not stop growth.
4. Apply a separate, brief arrival multiplier and small rotation around the tree's base. Start by evaluating `Back.Out` over about half a second; use a ground-anchored parent for growth and a child for wobble.
5. Derive arrival from a recent completion event, or track it only in temporary session memory, so rerenders and reloads do not continually restart old rewards. Reduced motion skips the wobble while retaining the correct growth size.

For this request, scale one cached tree mesh or sprite. Branch-by-branch biological growth and skeletal animation are unnecessary. The tree generator's optional wind/rig subsystem is an alternative for future hero trees, not a requirement for sapling scaling. Its README specifies a particular Three.js compatibility range and CSG dependencies; check that before adopting it. The saved example needs the full upstream generator, not just its one file.

## Fit with LifeHub

There are already usable pieces in this repository:

- [Professional miniworld terrain](../../../../../apps/professional/src/components/miniworld/terrain.ts): Canvas ground, shores, clustered crowns and shared lighting conventions.
- [Knowledge atlas terrain](../../../../../apps/knowledge/src/shelf/atlasTerrain.ts) and [island shape](../../../../../apps/knowledge/src/shelf/islandShape.ts): existing geography code to inspect before adding a second island abstraction.
- [Selected Grove models](../manifest.json): MegaKit Source trees can grow through scale; Kenney candidates are retained separately for Life City.
Grove uses an angled orthographic Three.js view, as specified by Adam. These Canvas implementations are internal references for colour and shoreline treatment, not a recommendation to switch Grove to PixiJS. Grove does not inherit Life City's southern harbour, eastern river, districts or transit layout. Use MegaKit Source models for Grove. Procedural tree generators are reference options, not a replacement for the chosen art family.

The suggested art treatment is a design judgement: restrained terrain relief, broad colour facets, chunky rounded crowns, diffuse light, simple shore bands and horizontal water. Derive seeds from stable IDs and calendar keys using versioned code rules. No new terrain, planting or growth state is stored. The same input history and reference time must reconstruct the same forest.

## Evaluation cases for a future build slice

- Same seed and generator version give the same terrain; input ordering does not arbitrarily reshuffle placements.
- A deliberately enclosed bowl produces a level lake with the expected spill outlet; edge-connected water is ocean.
- A stream reaches a lake or the scene outlet through an acyclic route, with no uphill segment on the drainage surface. The visible bed/water geometry agrees with that route.
- Trees are planted on dry usable ground and stay anchored while scaling.
- A timestamp fixture at planting, halfway and maturity gives the expected scale, including after reload and an overnight absence.
- Arrival wobble runs once for its event, settles fully, and is suppressed with reduced motion.
- Inspect the small scene at desktop and 390px before selecting geometry density or effect settings. No device performance claim has been established by this research.

## History

- **2026-10-10:** Added researched terrain/water/growth references and commit-pinned upstream source snapshots for Adam's Forest Island-style scenery request. Originally catalogued with Life City before Grove was clarified.

- **2026-10-10:** Reframed for Adam's Grove concept: Three.js, history-derived planting/growth, no game-state store, and no inherited city geography. Broader ingredients are indexed separately.
