# Water implementation selection

Evaluated boona13/threejs-grass-water-shaders at 97fb7ea3135362dbb1ba80cdfa8fb27ec8d0b159, particularly src/water/waterShader.glsl.ts (retrieved 11/10/26).
https://github.com/boona13/threejs-grass-water-shaders/blob/97fb7ea3135362dbb1ba80cdfa8fb27ec8d0b159/src/water/waterShader.glsl.ts

The candidate is MIT. Its vertex pipeline samples a painted water mask and additive terrain heightmap; fragment flow uses world axes/octave directions and a noise LUT. Adoption requires replacing mask/height/flow assumptions and removing surplus interaction/reflection parameters. Grove already owns exact multi-height lake triangles and curved channel flow descriptors.

Selected original native GLSL: unchanged vertices, stable lake world coordinates, interpolated channel distance/transverse coordinates, bounded periodic highlighting and three quality tiers. No third-party source is copied or adapted and no texture assets are required. Upstream retains its own MIT licence; there is no upstream code distribution in this change.

Native instanced spray has a fixed 24-instance allocation per effect with at most 4 active fall emitters; low 0, medium 8 and high 24 particles per emitter. This fits the small required effect without a general emitter library. Three.quarks (https://github.com/Alchemist0823/three.quarks) offers batched authored effects but is not adopted; no benefit was established for this bounded effect. The WebGPU-only physical fluid candidate remains outside agreed scope.

Native shading sacrifices realistic reflections and interactive ripples for predictable mask agreement, low dependency cost and the existing faceted art. Browser shader compilation, motion suspension, geometry continuity and measured effect budgets are acceptance evidence; emulator results do not establish real phone frame rates.
