# Grove annual world Phase 3 implementation plan

> Execute inline using executing-plans and TDD. Independent source review uses requesting-code-review. Adam authorises the complete build.

**Goal:** Terrain-aware weekly ownership and safe stable dated task planting.
**Architecture:** Annual region generation in the existing worker; derived session allocator and activity adapter; shared sampling and diagnostic instancing. No persistence or backend changes.
**Tech stack:** TypeScript, existing Three.js, Vitest and Playwright. No new dependencies.

## Task 1: Geographic ownership

Files: domain/grove/regions.ts, geography.ts, world.ts, world-protocol.ts, tests/unit/grove-regions.test.ts.

- [ ] Add failing tests for clipped Monday intervals including2012 (54), leap day and unique date lookup; annual regions deterministic/connected/capacity>=200 and candidate water/slope/spacing/clearance.
- [ ] Build efficient water/clearance helpers over shared triangle index, connected dry graph, ordered traversal anchors, weighted multi-source region growth and precomputed candidates. Type contract: AnnualRegions{year,owner:Int16Array,weeks:WeeklyRegion[]}; WeeklyRegion{id,index,monday,from,to,anchor:{x,z,cell},cells:number[],sites:PlantingSite[],primaryCount}; PlantingSite{index,cell,x,z,height,slope,shoreDistance}. Export generateRegions(world), calendarWeeks(year), regionForDate(regions,key), validateRegions(world).
- [ ] Integrate generation/transfer/receipt and sampleGeography.regionId. Run focused region and existing hydrology/worker tests, fix any invariants; commit.

## Task 2: Planting and activity adapter

Files: domain/grove/planting.ts, annual-plan.ts, tests/unit/grove-annual-plan.test.ts.

- [ ] Add failing tests for exactly-one ownership, future/invalid/undated filtering, cold determinism and stable survivor positions across history edits; capacity exhaustion must throw. Pin mature spacing and local bed height. Test New Year portions and Sydney DST using actual completion adapter.
- [ ] Implement AnnualPlantingSession.allocate(world,completions,now) using stableID=>region/slot cache and deterministic per-task preference sequences; release removed IDs without moving survivors. Reuse growth/species/variants. Return world-coordinate trees, regionId/slot and elevation. Implement buildAnnualGrovePlan({worlds,tasks,view,anchor,now,terms,books,session}) deriving all placements before filtering and region/day annotations from calendar; preserve milestone semantics.
- [ ] Test200/week and1500/5000/10000 annual stress, ground cover safety, term edits and placement stability. Document cold reconstruction tradeoff; commit.

## Task 3: Diagnostic activity and review

Files: grove-world-preview main/renderer/HTML/CSS, scripts/check-grove-world.mjs and new phase3 browser acceptance script if clearer.

- [ ] Add failing browser checks for region mode, fixture counts, date/view, picking and boundary weeks.
- [ ] Render instanced simplified task trees with instanceID lookup; keep whole annual geography visible, emphasize selected dated history; label fixtures explicitly. Maintain44px controls, no overflow, cancellation/disposal/restoration.
- [ ] Fresh independent spec/code review and red/green regressions for substantive findings.
- [ ] Verify unchanged gate, focused TypeScript, production build, Chromium/WebKit desktop390 and stress timings; commit/package design/plan/report/patch/bundle.
