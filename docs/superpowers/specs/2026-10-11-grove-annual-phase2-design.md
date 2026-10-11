# Grove annual world Phase 2 design

Adam authorised actioning Phase 2 on 11 October 2026. This extends committed Phase 1 (5876bcc7) under the existing integrated five-phase plan. Implement annual drainage and the shared geographic sampling contract before regional planting and animated water.

## Decisions and scope

Keep the 896 m, 257 × 257 original Phase 1 bed and year/version identity. Add hydrology recipe version 1. Original `world.bed` is preserved; `world.hydrology.bed` is the final bed after one bounded channel carving pass. No activity, terms, clock, account ID or rendering setting enters generation. The existing task Grove stays authoritative until Phase 3 integration. No shader or asset downloads are needed.

Use full-grid Priority Flood with every perimeter sample listed as an explicit world outlet. Interior visual chunks have no role. Resolve ties by cell ID and assign receivers to settled cells. Filled levels remain exact horizontal spill elevations, with no epsilon slope. Accumulate contributing cells in a topological traversal; every path ends at a perimeter outlet. Reject non-finite and malformed grids.

Label filled connected basins, recording original/final bed cell IDs, level, a spill outlet cell and downstream receiver. Route each basin's cells through a deterministic spanning tree to one spill outlet, then recompute topology and accumulation. Extract shore loops from clipped terrain triangles, including island holes. Water meshes and the sampler consume the same descriptors. Keep small ponds rather than hiding drainage water; substantial-lake acceptance requires at least 64 wet samples.

Select stream edges at contributing area ≥160 cells (1,960 m²). Split continuous polylines only at confluences, lakes and explicit boundary outlets. A lake inflow terminates at its clipped shoreline; a lake outflow starts at its spill shore. Shared junction positions and elevations must agree. Record width (1.4–5 m), contributing area, surface elevation and distance along each channel. Channel surfaces never rise downstream. Detect optional routed falls with ≥2 m descent within 14 m and a receiving segment; no fall is required if terrain supplies none. Animation and waterfall sheets remain later work.

Carve selected dry channel centres by at most 0.35 m, leaving meadow interiors and perimeter margins intact. Recompute the entire annual drainage once. This is exactly one iteration, with finite/acyclic/level-lake/non-rising-channel quality as convergence criteria; never loop carving/filling. Descriptors come exclusively from the final analysis.

Quality: at least one substantial lake, channels covering at least 50 m, and >70% dry samples. Try original attempt 0, then deterministic attempt namespaces 1 and 2. If all fail, use the verified 2026 attempt-0 layout as a documented fallback while retaining the requested WorldKey. Record attempt and fallback in output. Failure of fallback is an explicit error. All representative years must pass without uncontrolled retries. Default attempt 0 retains Phase 1 original bed exactly.

## Interfaces and files

`hydrology.ts`: `analyseDrainage(bed:Float32Array,size:number):Drainage` returns Float32 levels, Int32 receivers/order/outlets and Uint32 contributing counts; immutable original input. `generateHydrology(field):Hydrology` owns final carved bed, lakes, channels, optional fall descriptors, shore distance and quality metrics. `water.ts` contains lake/channel descriptors and shoreline construction helpers.

`world.ts`: orchestration, bounded attempts/fallback, immutable descriptors. Worker response transfers every typed buffer exactly once. Receipt validation checks dimensions, types, bounds, finite values, topology, horizontal basin membership, descriptor indices and monotone channels before mounting.

`geography.ts`: `sampleGeography(world,x,z)` returns final bed elevation (bilinear), unit normal, slope, lake/stream/dry type, local water elevation/depth, downstream unit X/Z direction, signed shore distance, lake/channel IDs and `regionId:null`. Region ownership is populated only in Phase 3. Shore tolerance is 0.02 m depth. `isLandPathSafe(world,points,maxSlope)` checks all segments with sample spacing ≤grid.step/4, including intermediate points, rejecting wet/excessive-slope segments. Out-of-map inputs fail clearly. Shore distances derive from actual loops/corridors; no separate approximate wet masks.

Preview: use solved lakes, channels and outlets. Add a compact labelled diagnostic select for elevation, lake IDs, receivers, accumulation and outlets. Preserve 44 px controls and responsive layout (L5/R4/V7); render on demand and retain page lifecycle restoration. Expose generation and descriptor counts for browser checks. This is diagnostic evidence, not production rendering/performance acceptance.

## Acceptance and review focus

Hand-derived synthetic bowls/flat grids pin spill levels, stable routing, original-bed preservation, contributing totals, single outlets, shoreline holes and malformed-grid rejection. Representative annual years pin graph termination, dry capacity, substantial lakes, shoreline/channel joins, no uphill surfaces, final carve budget and deterministic reconstruction. Transfer and receipt tests cover all buffers, malformed topology, NaNs and detached fields. Sampler checks actual polygon boundaries, island dry cells, normal/slope, channel flow and segment safety (a safe destination cannot legitimise crossing a lake).

Browser checks run real worker generation in Chromium/WebKit at 1440/390, diagnostic switching, rapid year changes, invalid-year recovery, disposal/restoration and no overflow/errors. Run focused checks, full Tasks/root suites, production build, focused TypeScript and mandatory pre-PR gate. Report existing full Tasks type errors separately. Commit locally and deliver patch, design, plan, screenshots and timings. No deployment or production merge is part of this instruction.

## Builder review rulings

Flood routing uses four cardinal neighbours; basin membership additionally follows the fixed terrain triangle diagonal (+X,-Z) when equal-level wet triangles connect. Pick the lowest flood-settlement-rank member with an exterior receiver as outlet. Its exterior receiver has rank below every member; every basin tree points to that outlet. Rebuild a topological order after rerouting and fail explicitly on a cycle. This prevents exterior paths returning to the contracted basin. Adjacent equal-spill and nested bowls are synthetic regression cases.

Join construction clips the wet-to-dry receiver edge against the actual lake polygon/shore. Store the intersection point and exact lake level at both channel/lake ends. Dry plateaus remain routing flats with exact levels, and lake holes remain dry.

The existing terrain diagonal is (bottom-left,top-left,bottom-right) / (bottom-right,top-left,top-right). Water polygons clipped against those triangle planes own wet classification. The requested bilinear bed sample is for planting elevation/normal; reported depth is clamped non-negative where the two interpolation conventions differ in a saddle. Conservative wet classification forbids planting there. The 0.02 m shoreline depth tolerance is applied in triangle clipping, not as a second sampler mask.

Channels carry linear per-segment surface heights and continuous mitered ribbon polygons, with common positions/heights at junctions. Clip water ribbons against final terrain triangle planes; never display a full-width surface through a bank. Lake water takes overlap precedence, then the lowest channel ID. Sampler and renderer use the resulting shared triangles. Shore distance is conservative clearance to exposed descriptor edges; overlapping corridor edges may reduce clearance, never permit unsafe placement. Phase 3 can optimise the union boundary without altering wet classification.
