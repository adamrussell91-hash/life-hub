# Credits And References

Lowpoly Tree Generator is original Rand Monster code. The projects and publications below informed the
engineering direction, API boundaries, or terminology. Unless explicitly stated, no source code from a
reference project is copied into this repository.

## Runtime Dependencies

- [Three.js](https://github.com/mrdoob/three.js), MIT License. Geometry, scene graph, skinning, animation,
  GLB interoperability, and WebGL/WebGPU runtime types.
- [three-bvh-csg](https://github.com/gkjohnson/three-bvh-csg), MIT License. Boolean union of temporary
  trunk, root, and branch solids.
- [three-mesh-bvh](https://github.com/gkjohnson/three-mesh-bvh), MIT License. BVH support required by
  `three-bvh-csg`.

The applicable dependency notices are also summarized in `THIRD_PARTY_NOTICES.md`.

## Open-Source Product References

- [SeedThree](https://github.com/SkyeShark/SeedThree), MIT License. Reference for the shape of a
  browser-native Three.js tree tool: deterministic species parameters, LOD thinking, wind preview, and
  glTF export. No SeedThree source is included here.
- [EZ-Tree](https://github.com/dgreenheck/ez-tree), MIT License. Reference for a seed-driven parameter
  model and standalone browser export workflow. No EZ-Tree source is included here.
- [VegetationGeneratorThreeJS](https://github.com/achrefelouafi/VegetationGeneratorThreeJS), MIT License.
  Reference for curve-based stems, surface-attached vegetation, instancing, and wind concepts. The Rand
  Monster implementation was written independently around low-radial polygon sweeps and vertex colors.
- [Three.js SimplifyModifier](https://github.com/mrdoob/three.js/blob/dev/examples/jsm/modifiers/SimplifyModifier.js),
  MIT License. Evaluated as a browser simplification reference; it is not part of the generator core.
- [Blender](https://projects.blender.org/blender/blender), GPL-2.0-or-later. Source and modifier behavior
  were consulted as implementation references. Blender code is not copied or linked into this MIT package.

## Geometry And Tree-Modeling References

- [Houdini Sweep 2.0](https://www.sidefx.com/docs/houdini/nodes/sop/sweep.html). Reference for the
  centerline plus cross-section construction model.
- R. L. Bishop, "There is More than One Way to Frame a Curve" (1975), and the related
  [parallel transport curve-framing notes](https://scholarworks.iu.edu/dspace/bitstreams/23d6fd59-b151-4064-88a7-f7e058b2cc69/download).
  Reference for stable sweep frames that avoid Frenet-frame flips.
- Runions, Lane, and Prusinkiewicz,
  ["Modeling Trees with a Space Colonization Algorithm"](https://algorithmicbotany.org/papers/colonization.egwnp2007.html).
  Reference for separating tree topology and growth rules from surface construction.
- Bloomenthal,
  ["Modeling the Mighty Maple"](https://www.unchainedgeometry.com/JBloom/pdf/SIG85-ModelingMightyMaple.pdf).
  Reference for generalized-cylinder limb models and branch connections.
- Wyvill et al., ["BlobTree Trees"](https://webhome.cs.uvic.ca/~blob/pdf/2004_cgi_tree_modeling.pdf).
  Reference for the limitations of intersecting generalized cylinders at branch junctions.
- Livny et al.,
  ["Generation of Tree Surface Mesh Models from Point Clouds using Skin Surfaces"](https://www.scitepress.org/Papers/2020/89371/89371.pdf).
  Reference for fused surfaces around branching skeletons.

## Cable Simulation Reference

- [Unreal Engine Cable Components](https://dev.epicgames.com/documentation/en-us/unreal-engine/cable-components-in-unreal-engine).
  Reference for the gameplay vine solver's Verlet particles and iterative distance constraints. The static
  vine recipe and mesh generator are original Rand Monster code; no Unreal Engine source code is included.

## Project Direction

Rand Monster contributors designed the semantic parameter system, connected root sockets, CSG fallback
and topology audit, faceted canopy construction, curve editing contract, optional rigging, animation
presets, and controller serialization in this repository.

Commercial art packages and purchased source assets are not distributed with this project. The package
contains no generated textures, third-party models, or proprietary Rand Monster game assets.
