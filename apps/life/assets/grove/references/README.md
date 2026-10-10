# Grove raw ingredients

**Collected:** 10 October 2026. Source material for the eventual [Grove](../README.md) build, not a running feature.

Together with the earlier [terrain source pack](terrain/README.md), this collection contains **127 source/reference files from 15 distinct public projects**: original code, usage examples, species presets, licences and package metadata. The original two collections contain 127 files; this consolidated folder now also includes 40 files from the two additional projects (167 pinned files total). [manifest.json](manifest.json) pins each source to an exact commit and records SHA-256 hashes and original file URLs. Source filenames are flattened with `__` and suffixed `.txt` so collecting them cannot add executable modules to LifeHub.

## Selected assets

Use [the Grove model manifest](../manifest.json) and contact sheet. Trees and
vegetation use MegaKit Source, animals use Quaternius. Matching one-off assets
from other creators are allowed after visual review; no Kenney or Cube Pets.
The older 375-file Kenney inventory is preserved separately for
[city candidates](../../city-candidates/kenney-nature/README.md).

## Terrain and water

| Ingredient | Saved raw source | Use in Grove |
| --- | --- | --- |
| Seeded hill noise | [simplex-noise source](terrain/simplex-noise.js/simplex-noise.ts.txt) | Sample heights; a broad-noise octave gives gentle hills. |
| Official Three.js terrain example | [webgl_geometry_terrain.html](three.js/examples__webgl_geometry_terrain.html.txt), [ImprovedNoise](three.js/examples__jsm__math__ImprovedNoise.js.txt) | Height field → plane geometry. Its detailed texture treatment is optional; Grove can use flat colour facets. |
| Polygon islands and streams | [Mapgen2 source](terrain/mapgen2/water.js.txt), [Mapgen4 generator](terrain/mapgen4/map.ts.txt) | Water connectivity, drainage and accumulated stream flow. |
| Hollows and spill levels | [Barnes2014 priority-flood source](richdem/include__richdem__depressions__Barnes2014.hpp.txt) | Authoritative algorithm reference for basin filling. C++ and GPLv3; saved for study, not chosen as a browser dependency. |
| Priority queue | [FlatQueue](flatqueue/index.js.txt) | Small heap for a JavaScript priority-flood implementation; ISC. |
| Triangulation | [Delaunator](delaunator/index.js.txt) | Triangulate an irregular height mesh. Depends on `robust-predicates`; ISC. |
| Reflective animated water | [Water](three.js/examples__jsm__objects__Water.js.txt), [Water2](three.js/examples__jsm__objects__Water2.js.txt) | Existing shader-based alternatives for water rendering. They render surfaces; they do not compute streams or fill lakes. |

Start with a cheap flat-colour horizontal water mesh for small Home scenes. Reflection/refraction passes are an optional later choice. Keep original bed heights, drainage heights and lake water levels separate. [Terrain notes](terrain-notes.md) explain the distinction between noise-selected inland water and real basin filling.

## Natural spacing and species patches

| Ingredient | Saved source | Use |
| --- | --- | --- |
| Poisson-disk sampling | [Sampler entry](poisson-disk-sampling/src__poisson-disk-sampling.js.txt), [fixed density](poisson-disk-sampling/src__implementations__fixed-density.js.txt), [variable density](poisson-disk-sampling/src__implementations__variable-density.js.txt) | Minimum-distance placement without a visible grid. Both implementations and their local helpers are saved. |
| Usage and injected randomness | [Sampler README](poisson-disk-sampling/README.md.txt) | Shows bounds, distances, seeding through an RNG argument and density controls. Depends on `moore`. |
| Repeatable randomness | [seedrandom implementation](seedrandom/seedrandom.js.txt), [usage](seedrandom/README.md.txt) | Create local seeded RNGs, not global `Math.random` replacement. The MIT notice is embedded in the implementation. |

Spacing alone does not produce same-species groves. Use separate deterministic patch masks or centres per species and a shared minimum-distance check across their edges. Reject water and unusable slopes. Derive seeds from stable record IDs and calendar keys; sort input records consistently. One sequential random stream across all tasks makes every later placement sensitive to input order. A future build should choose an explicit deterministic collision rule, not promise that a generic sampler automatically keeps every neighbour fixed when history changes.

## Tree shapes, saplings and appearance

| Ingredient | Saved source | Fit |
| --- | --- | --- |
| Lowpoly Tree Generator | [Core](lowpoly-tree-generator/src__index.js.txt), [basic example](lowpoly-tree-generator/examples__basic.js.txt), [README](lowpoly-tree-generator/README.md.txt) | Closest faceted style; complete `src` snapshot plus credits and notices. Generate/copy a few variants rather than perform CSG every frame. |
| EZ-Tree | [Tree generator](ez-tree/src__lib__tree.js.txt), [options](ez-tree/src__lib__options.js.txt), [preset entry](ez-tree/src__lib__presets__index.js.txt) | Alternative with oak, pine, aspen, ash and bush presets. All saved presets are in the manifest. More detailed appearance needs simplifying for Grove. |
| Three.js tree generator | [TreeGenerator](three.js/examples__jsm__generators__TreeGenerator.js.txt) | Seeded procedural trunk/branch geometry from the engine's own examples; an alternative to importing another package. |
| Wobble easing | [Tween.js easing](terrain/tween.js/src__Easing.ts.txt) | `Back.Out` is a good first candidate for a small arrival overshoot. |

Task `completed_at` is the planting timestamp. Derive tree age and scale from it and the current clock; do not save planting dates, positions or growth progress as a new game state. Use a ground-anchored parent for growth and a child for the brief wobble. Track only temporary arrival animation state in memory, or derive it from recent event time. Reload should not replay old completions as new rewards. Scaling alone satisfies the requested sapling growth; topology growth, tree combat animations and procedural wind rigs are optional source references.

## Animals: loading, animation, wandering and babies

| Ingredient | Saved raw source | Use |
| --- | --- | --- |
| glTF loading | [GLTFLoader](three.js/examples__jsm__loaders__GLTFLoader.js.txt) | Load the existing GLB models and their clips. |
| Independent cloned animal rigs | [SkeletonUtils](three.js/examples__jsm__utils__SkeletonUtils.js.txt), [multiple animated models example](three.js/examples__webgl_animation_multiple.html.txt) | Clone skinned models while preserving bone mappings. Important for several animals and parent/baby pairs. |
| Idle/walk/eat transitions | [Animation blending example](three.js/examples__webgl_animation_skinning_blending.html.txt) | AnimationMixer actions, weights and crossfades. Match actual model clip names. |
| Wander, arrive and follow | [Yuka Wander](yuka/src__steering__behaviors__WanderBehavior.js.txt), [Arrive](yuka/src__steering__behaviors__ArriveBehavior.js.txt), [FollowPath](yuka/src__steering__behaviors__FollowPathBehavior.js.txt), [wander demo](yuka/examples__steering__wander__index.html.txt) | Ready-made steering behaviours. Arrive is useful for a baby catching up without overshooting its parent. |
| Keeping animals apart | [Yuka Separation](yuka/src__steering__behaviors__SeparationBehavior.js.txt) | Avoid coincident animals; not a substitute for shoreline constraints. |
| Walk/idle/graze state selection | [Yuka StateMachine](yuka/src__fsm__StateMachine.js.txt), [State](yuka/src__fsm__State.js.txt) | Compact behaviour-state pattern. No persistence required for cosmetic motion. |
| Dry-ground grid paths | [EasyStar](easystarjs/src__easystar.js.txt), [README](easystarjs/README.md.txt) | Mark water unwalkable. Entire `src` snapshot included. Disable corner-cutting that could cross a shoreline. Depends on `heap`. |
| Navigation-mesh alternative | [three-pathfinding](three-pathfinding/src__Pathfinding.js.txt), [README](three-pathfinding/README.md.txt) | Restrict movement to a dry-land mesh. All library `src` files are saved. |

Choose grid routing **or** navmesh routing first; these are alternatives. Wander only among legal destinations, then follow legal paths. Parent following must also respect shorelines: a direct straight-line pursuit can lead the baby through a lake. Yuka's wandering behaviour uses random variation; it does not itself guarantee a repeatable historical scene. Derive animal eligibility from history, and decide separately whether cosmetic motion needs deterministic seeding/time.

## Angled camera, picking and a whole year's forest

| Ingredient | Saved example | Use |
| --- | --- | --- |
| Orthographic camera | [Camera comparison](three.js/examples__webgl_camera.html.txt) | Angled view with consistent object sizes; frame clearings without strong perspective distortion. |
| Pan/zoom/touch | [OrbitControls](three.js/examples__jsm__controls__OrbitControls.js.txt) | Bound zoom and polar angles; lock rotation if the chosen view should stay fixed. |
| Many trees cheaply | [Dynamic instancing](three.js/examples__webgl_instancing_dynamic.html.txt) | Per-instance transforms for repeated static meshes, including independent growth scales. |
| Picking an instanced tree | [Instancing raycast](three.js/examples__webgl_instancing_raycast.html.txt) | Map an instance ID back to its completion record. |
| Geometry combination | [BufferGeometryUtils](three.js/examples__jsm__utils__BufferGeometryUtils.js.txt) | Merge compatible static geometry where instancing is unsuitable. |
| Detail at different distances | [LOD example](three.js/examples__webgl_lod.html.txt) | Simplify distant vegetation for Term and Year. |
| Shadow-cost reference | [Shadow performance example](three.js/examples__webgl_shadowmap_performance.html.txt) | Compare shadow work before enabling shadows on every tree. |

Plain InstancedMesh is useful for trees and rocks; it does not automatically solve independently animated skinned animals. Keep the animal count small initially. Day/Week/Term/Year need Grove's date-to-clearing mapping in addition to camera movement. Pause cosmetic updates in hidden tabs and dispose textures, geometry, mixers and controls on teardown.

## More assets and live examples

- [Quaternius Ultimate Animated Animals](https://quaternius.com/packs/ultimateanimatedanimals.html): specific pack page lists 12 animated animals and CC0. Its general [current licence page](https://quaternius.com/license.html) also describes QAL for assets released under that licence. Record the exact downloaded pack licence rather than applying one blanket label to every Quaternius pack. No additional animal archive was downloaded for this collection.
- [Poly Pizza](https://poly.pizza/): extra model selection later. Save the individual model's creator and licence, since the library contains mixed terms. Birch and owl are useful targets.
- [EZ-Tree editor](https://www.eztree.dev/), [low-poly tree editor](https://rand.monster/editor/trees), [Yuka demos](https://mugen87.github.io/yuka/examples/), [Three.js examples](https://threejs.org/examples/), [Mapgen2](https://www.redblobgames.com/maps/mapgen2/) and [Mapgen4](https://www.redblobgames.com/maps/mapgen4/) make the ingredients easier to inspect visually.

## How to use this collection

1. Find the feature above and read the saved example and its package manifest.
2. Follow its exact-commit URL in the manifest. Get the complete upstream checkout if you want to run a demo; HTML examples here reference sibling engine files/models not copied into this pack.
3. Select the smallest needed ingredient. A collected option is not a decision to install all the libraries.
4. Match the chosen Three.js version and dependencies. The collected engine snapshot is 0.186.0; the low-poly generator's README identifies its tested Three.js range. Compatibility across these candidates has not been demonstrated.
5. Keep its original licence/notices and add a small Grove adapter when the build slice is authorised.

No upstream dependencies were installed, no live app changed, and no device performance benchmark was run. Source hashes, local links and the existing GLB inventory are verified separately. Future work still needs the task-history selector, species mapping, milestone rules, date-based layout, shallow-water exclusion, growth clock and Home integration.

## History

- **2026-10-10:** Collected broader raw ingredients for Grove, indexed existing GLB assets and animation clips, and separated the Three.js/history-derived concept from Life City.

## Additional terrain and stylized water code

- **THREE.Terrain (MIT):** full `src` snapshot, generator/filter/scattering code, README and metadata. Broad terrain toolkit; evaluate its older API conventions against the chosen Three.js version before adopting. No Grove integration or compatibility test is claimed.
- **three-stylized-water (MIT):** `src/water` snapshot with shallow/deep colour, shore fade, animated shoreline waves, intersection/surface foam, caustics, refraction and Gerstner waves. Built for Three.js r185 WebGPU/TSL; it is an optional visual reference, not a drop-in WebGL water replacement. Textures and scene assets are not downloaded.

Both additions retain licence notices and commit/hash provenance in
[additional-manifest.json](additional-manifest.json). Three.js Water/Water2
remain simpler renderer references; Mapgen and Priority-Flood cover drainage
and lake formation separately. Code licences are independent of the CC0 model
licences. The GPL RichDEM excerpt is for algorithm study, not selected runtime.
