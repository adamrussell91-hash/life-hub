# Annual Grove Phase 4 design

Adam authorises implementation of integrated Phase 4 items 22–26: animated water and annual wildlife. Base fb39f56a. Complete deferred spatial terrain/water chunks and valid waterfall geometry as prerequisites, then use the resulting annual scene for the local Grove route and Home consumer. Phase 5 remains final measured device/performance and deployment acceptance. No source-record writes or publication.

## Chosen implementation

Compare the MIT stylised-water candidate at boona13/threejs-grass-water-shaders revision 97fb7ea3135362dbb1ba80cdfa8fb27ec8d0b159 with an original native ShaderMaterial. Its painted mask/full-plane wrapper and LUT pipeline require replacement to follow existing explicit lake/channel geometry. Select a compact original native shader using shared-clock phase, per-channel along/transverse coordinates and level lake coordinates. No upstream source is incorporated, no textures/downloaded runtime dependencies. Document evaluation and source links. Native bounded instanced spray avoids an additional particle dependency; three.quarks remains an evaluated optional alternative, not an installed library.

Worker generates spatial terrain chunks from final bed and clipped water triangles, including terrain normals and water flow coordinates. Chunk edges reuse the same samples/triangle diagonal; rendering never alters hydrology. Terrain faceting is deliberate. Lakes retain exact level geometry; streams use monotone channel distance and stable local transverse coordinates. Vertex shader leaves positions unchanged: only lighting/highlights move, so shoreline classification and duck elevation remain exact. Shared spatial coordinates survive clipping, and chunking must conserve water area.

Falls are drawn only from validated positive-drop descriptors. Sheet endpoints join upstream and receiving surface; receiving foam uses existing wet triangles. Current annual seeds may have no qualifying falls; a clearly labelled synthetic routed-drop fixture exercises fall geometry/effects without changing annual geography. Do not invent a fall in every year. Low keeps static foam and scrolling highlights, medium adds lake shading and bounded spray, high adds richer highlights and spray under a fixed budget.

## Motion and wildlife

One elapsed-time clock advances only while motion is enabled, document visible and scene intersecting viewport. Pause freezes water AND wildlife, reduced-motion overrides resume, and hidden/offscreen states cancel RAF. Resume resets delta without catch-up. Bounded periodic shader phases use integral temporal frequencies so wrap is continuous. Quality changes uniforms/budgets without rebuilding geography. Animation never regenerates geometry or allocates new meshes each frame. Own and dispose RAF, observers, media listeners, model resources/mixers, geometry and materials.

Adapt wildlife paths to AnnualWorld sampleGeography and continuous land-path checks, with slope and tree-obstacle checks. Ducks use continuous connected wet segments and sampled water elevation minus authored asset waterline; do not put an earned duck on invented water. Retain milestone thresholds, babies and dated-book rules. Bound visible actors near focus; absent assets or no safe path produce honest unavailability, not unearned or unsafe proxies. Static actors remain visible when paused/reduced-motion.

## Consumers and compatibility

Keep diagnostic synthetic labels, region layer, counts/picking and New Year ownership. Add low/medium/high quality, a single Pause motion control, actual render statistics and an explicit labelled water prototype option. Existing assets supply authored animals; near tree rendering reuses authored models and distant silhouettes remain instanced. Annual scene exposes framing, picking, motion, camera state and disposal for Grove and Home. Preserve date routes, task cards, Escape and task refresh; no storage mutation. Phone controls stay 44px and within 390px width. Existing fallback text handles unavailable WebGL/worker.

## Evidence

Red/green unit checks cover shared terrain edges, water-area conservation, clipped flow coordinate interpolation, fall joins and invalid drops, bounded clock continuity/suspension, continuous land/swim safety, slopes/duck waterline and quality invariance. Chromium/WebKit at 1440/390 cover animation, frozen time on pause/reduced/hidden/offscreen, quality switching, prototype falls/spray, wildlife loading, stress/picking, annual route/Home, lifecycle cleanup and shader errors. Run unchanged pre-PR gate and production build, compare Tasks TypeScript against 67 existing diagnostics, record draw calls/triangles and frame percentiles with hardware limitations. Save design/plan/report/patch/bundle/evidence, commit locally.
