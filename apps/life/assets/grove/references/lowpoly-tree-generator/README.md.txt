# Lowpoly Tree Generator

A parameter-driven Three.js generator for faceted trunks, grounded buttress roots, primary and secondary branch forks, and clustered low-poly canopies. Wood solids are CSG-welded, canopy clusters are appended without boolean work, and the result is one indexed vertex-color geometry.

This is the open-source geometry, animation, and controller core behind
[Rand Monster Tree Forge](https://rand.monster/editor/trees). The live editor is the quickest way to
inspect parameters and export a GLB; this package is the reusable scene-independent implementation.

Source: [github.com/rand-monster/lowpoly-tree-generator](https://github.com/rand-monster/lowpoly-tree-generator)

## Install

```sh
npm install github:rand-monster/lowpoly-tree-generator three
```

The package is prepared for the public npm scope `@rand-monster/lowpoly-tree-generator`; until that
release is published, install it directly from GitHub as shown above. The tested compatibility range is
Three.js 0.185.x, `three-bvh-csg` 0.0.18, and `three-mesh-bvh` 0.9.7.

## API

```js
import {
  buildLowpolyTreeGeometry,
  buildLowpolyTreePreviewGeometry,
  createLowpolyTreeRecipe,
} from '@rand-monster/lowpoly-tree-generator'

const recipe = createLowpolyTreeRecipe({
  bendX: 0.25,
  profileTwistTurns: 0.65,
  rootCount: 5,
  rootLength: 0.9,
  branchCount: 2,
  secondaryBranchCount: 2,
  secondaryBranchSplitAngle: 0.72,
  canopyClusterCount: 4,
  canopyRadius: 0.68,
})

const preview = buildLowpolyTreePreviewGeometry(recipe)
const { geometry, stats } = buildLowpolyTreeGeometry(recipe, {
  triangleBudget: 500,
  resolutionHint: null,
})
```

The package exports:

- `LOWPOLY_TREE_PARAMETER_DEFAULTS`
- `createLowpolyTreeRecipe(params, metadata)`
- `buildLowpolyTreeGeometry(recipe, options)`
- `buildLowpolyTreePreviewGeometry(recipe)`
- `buildLowpolyCanopyGeometry(canopyRecipe, options)`
- `buildSweepTubeGeometry(options)`
- `countLowpolyTreeTriangles(geometry)`
- `countLowpolyTreeConnectedComponents(geometry, tolerance)`
- `auditLowpolyTreeGeometry(geometry)`

## Archetypes

Six production-oriented silhouettes are available from the independent `./archetypes` entrypoint:
`ancientGuardian`, `windCrownedSentinel`, `weepingLantern`, `forkedShrine`, `stormClaw`, and
`groveBloom`. An archetype is only a named parameter object, so it remains fully editable.

```js
import { createLowpolyTreeArchetypeParams } from '@rand-monster/lowpoly-tree-generator/archetypes'

const params = createLowpolyTreeArchetypeParams('weepingLantern', {
  canopySeed: 104,
  vineCount: 9,
})
const recipe = createLowpolyTreeRecipe(params)
```

## Optional Vines

Vines are disabled by default. Enabling `vineEnabled` adds a deterministic, serializable `vines` recipe
to the tree recipe. It describes semantic primary/secondary branch-tip anchors, dual-anchor slack,
free-hanging length, faceted cable resolution, side branches, leaves, palette, and runtime physics values.

```js
import {
  buildLowpolyTreeVineGeometry,
  createLowpolyTreeVineRecipe,
} from '@rand-monster/lowpoly-tree-generator/vines'

const tree = createLowpolyTreeRecipe({
  vineEnabled: true,
  vineCount: 6,
  vineDualAnchorCount: 3,
  vineBranchCount: 2,
  vineLeavesPerBranch: 2,
})
const { geometry: vineGeometry, stats } = buildLowpolyTreeVineGeometry(tree.vines)
```

`buildLowpolyTreeVineGeometry` creates a static vertex-color mesh suitable for editing and GLB export.
The optional gameplay solver can interpret the same semantic anchors against a rig and animate them with
Verlet integration. Static tree generation does not import that solver.

`buildLowpolyTreeGeometry` owns no scene state and creates no material. The caller owns and must dispose the returned `BufferGeometry`.

The final geometry includes a `color` attribute. Use a material with `vertexColors: true`; bark and the canopy's top/side/bottom planes share one material and one primitive.

For the intended faceted style, start with `MeshLambertMaterial` or another diffuse-only material. If a
PBR material is required, use full roughness, zero metalness, and low environment-map intensity to avoid
plastic specular highlights on bark and canopy planes.

`curvePointOffsets` is a serializable array of `[x, y, z]` offsets sampled along the trunk centerline. Editors can use it for direct control-point manipulation without replacing the semantic bend parameters. Roots and branch anchors are regenerated from the edited centerline. Primary, secondary, and root curves expose corresponding point-offset arrays; their first attachment point remains locked. Root points may rise vertically but are clamped to the ground plane when moved downward.

`profileTwistTurns` and `profileTwistPhase` rotate polygon sweep rings around their transported centerline frame. This produces real faceted trunk twist without adding triangles. `twistRadius`, `twistTurns`, and `twistPhase` remain the separate centerline-spiral controls.

`buildLowpolyTreePreviewGeometry` skips CSG and returns overlapping trunk/root/branch parts as one temporary geometry. Use it while dragging controls, then replace it with `buildLowpolyTreeGeometry` on release. A previous `stats.resolutionLevel` can be passed back as `resolutionHint` to avoid retrying known-over-budget sampling levels.

Canopy clusters are closed faceted polyhedra anchored to the trunk and terminal branch tips, preferring secondary tips over their primary parents. `canopyAnchorSpread` and `canopyVerticalSpread` form a coherent crown, while an attachment constraint keeps each assigned tip inside its cluster. `canopyShoulder`, non-uniform scale, deterministic irregularity, and per-plane colors define the silhouette. Canopies do not run through CSG. Normal clusters cost 20 triangles each; extreme recipes can fall back to closed 8-triangle clusters without deleting canopy anchors.

## Optional Animation

Animation is a separate entrypoint. Static tree generation never imports rigging, keyframe baking, or
animation presets, so scatter-only consumers do not include those features in their module graph.

`createLowpolyTreeRig` replaces the named tree mesh inside a supplied `Object3D` with a `SkinnedMesh`.
It derives a skeleton from the recipe's trunk, root, primary, and secondary curves and writes normalized
`skinIndex`/`skinWeight` attributes without changing topology. Vertices receive two-bone weights from their
closest semantic curve segment, so the root mesh can work as a set of articulated feet.

```js
import {
  createLowpolyTreePresetClips,
  createLowpolyTreeRig,
  updateLowpolyTreePresetRig,
} from '@rand-monster/lowpoly-tree-generator/animation'

const rig = createLowpolyTreeRig(treeGroup, recipe)
updateLowpolyTreePresetRig(rig, 'walk', elapsedSeconds, {
  windStrength: 1,
  windTimeSeconds: elapsedSeconds,
})
const clips = createLowpolyTreePresetClips(rig)
```

The rig is deliberately opt-in. Runtime scatter trees can keep the static single-mesh path, while hero
trees can preview procedural presets or author pose keys. Clip helpers sample these motions into `TreeIdle`,
`TreeWind`, `TreeWalk`, `TreeRun`, `TreeStomp`, `TreeAttack`, and optional `TreeCustom` clips for GLB export.

The animation entrypoint exports rig creation, pose capture/application, procedural preset preview, custom
keyframe interpolation, and clip baking. It does not import the CSG generator.

## Optional Controller

Controller generation is isolated from both Three.js geometry and the editor. It accepts clip names or
`AnimationClip` objects and returns serializable JSON describing states, parameters, transitions, and the
additive wind layer.

```js
import { createLowpolyTreeAnimationController } from '@rand-monster/lowpoly-tree-generator/controller'

const controller = createLowpolyTreeAnimationController({ clips })
```

This module can be replaced by a game's own animation state machine without changing generation or baking.

## Live Animation Profiles

The independent `./profile` entrypoint provides bounded, serializable motion settings and a small live
store. Games can patch idle, walk, run, attack, and stomp duration/strength/wind values, plus body,
branch, and root response, without rebuilding geometry or baking a new clip.

```js
import { createLowpolyTreeLiveAnimationProfile } from '@rand-monster/lowpoly-tree-generator/profile'

const profile = createLowpolyTreeLiveAnimationProfile()
profile.patchMotion('run', { duration: 0.42, strength: 2.4 })
profile.patchTuning({ branches: 1.6 })
profile.subscribe((value) => updateRuntimeAnimator(value))
```

## Geometry Contract

- CSG inputs are temporary watertight trunk, root, primary-branch, and secondary-branch solids.
- Every root CSG input receives a hidden core socket inside the trunk base. This keeps root/trunk volume overlap independent of polygon profile rotation without adding an editor control point or changing the visible root silhouette.
- Root/trunk, branch/trunk, and secondary/primary intersections are cut and welded with `ADDITION` union.
- Canopy clusters remain closed shells and are merged after wood CSG, so canopy count does not multiply boolean cost.
- Only triangles fully on the hidden `y=0` ground plane are removed.
- Small above-ground numerical holes are repaired only when they form a closed boundary with a perimeter below 0.2 units.
- The final geometry is indexed, vertex-welded, and has no above-ground boundary or non-manifold edges for the bundled parameter range.
- Canopy triangles are reserved first, then CSG sampling is reduced until the complete tree fits the requested triangle budget without removing roots, branches, or canopy anchors.
- CSG passes use a balanced merge tree, process only position attributes, and recompute normals once on the welded result. A topology-defective balanced result is retried with trunk-first sequential union and retained only when its audit score improves.
- Connected, manifold resolution candidates rank ahead of lower-triangle defective results; `stats.junctionGuaranteed`, `stats.woodConnectedComponents`, and `stats.woodTopology` expose that audit.

## Tests

```sh
npm test
```

Tests cover module boundaries, grounding, vertically shaped roots, both branch levels, direct curve offsets,
profile twist, canopy attachments, fast preview, CSG topology, the 500-triangle fallback, rootless recipes,
normalized semantic rig weights, procedural presets, live animation profiles, editable archetypes,
deterministic vine anchors/foliage, static vine geometry, custom keyframes, and controller serialization.

## License And Credits

The package is released under the [MIT License](./LICENSE). Runtime dependency notices are in
[THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md). Design and algorithm references, including SeedThree,
EZ-Tree, VegetationGeneratorThreeJS, Houdini Sweep, and the curve-framing/tree-modeling papers that
informed the implementation, are listed in [CREDITS.md](./CREDITS.md).

Those references are credited as research and product-shape influences. Their source code is not copied
into this package unless a future contribution explicitly says otherwise and preserves the applicable
license notice.
