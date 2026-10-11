# Grove Annual World Phase 2 Implementation Plan

> Use superpowers:executing-plans inline with TDD and a fresh final review. Adam's instruction to action Phase 2 authorises design, plan and build in this session.

**Goal:** Complete annual drainage, lake/channel descriptors and shared geographic sampling.
**Architecture:** Pure Priority Flood and topological area accumulation on the full annual bed, one bounded carving pass, explicit basin outlets/shore loops and continuous channel graph; worker-owned typed arrays and a diagnostic consumer.
**Tech Stack:** Existing TypeScript, Three.js, Vitest, Vite and Playwright.
**Spec:** `docs/superpowers/specs/2026-10-11-grove-annual-phase2-design.md`.

## Global constraints

896 m / 257 × 257 grid. Year policy unchanged. Original bed immutable. Hydrology recipe 1. No activity/backend writes. Area threshold 160 cells, at most three preparation passes raising reserve/island terrain by at most 6 m, a gentle 0.5 m meadow crown, 0.35 m maximum carving, one incision recomputation, three deterministic attempts then verified fallback. No new dependency or asset.

## Review focus

Equal-height flats must route without displayed epsilon slopes; basin islands must remain holes; wet intermediate path points must reject land travel; mismatched/partial transferred graphs must reject before mounting; changed year and restored history must retain only the current scene.

## Task 1: Drainage and water graph

Create `src/domain/grove/hydrology.ts`, `water.ts`, `tests/unit/grove-hydrology.test.ts` in Tasks.

- [x] Write synthetic bowl/flat/malformed tests for `analyseDrainage`, hand-derived spill level, area conservation and cycle-free boundary termination. Run and confirm missing API failure.
- [x] Implement stable full-grid Priority Flood and topological accumulation, preserving bed.
- [x] Write lake/island/single-outlet and channel-join/carve-budget tests. Run red.
- [x] Implement `generateHydrology`, clipped triangle shoreline loops, single outlet basin routing, thresholded channel chains, optional falls and one carving recomputation. Run green.
- [x] Commit tested drainage unit.

## Task 2: Annual orchestration, transport and sampler

Modify `heightfield.ts`, `world.ts`, `world-protocol.ts`, existing world/client tests. Create `geography.ts`, `tests/unit/grove-geography.test.ts`.

- [x] Add annual invariants/independent reconstruction, bounded attempt/fallback and transferable graph tests. Confirm red.
- [x] Extend world orchestration; transfer all buffers and validate received graph/descriptors. Preserve original Phase 1 attempt-0 bed.
- [x] Write sampler tests for lake edges/island/stream direction, finite normals, out-of-bounds, and dry endpoints crossing wet ground. Confirm red.
- [x] Implement shared bilinear sampler, exact polygon/corridor classification and continuous path checks. Run new and existing Grove tests green.
- [x] Commit tested world integration.

## Task 3: Diagnostic and delivery

Modify `grove-world-preview.html`, preview renderer/main/CSS and `scripts/check-grove-world.mjs`.

- [x] Extend browser acceptance for hydrology counts and all diagnostic layers. Confirm missing-layer failure.
- [x] Render solved lakes/connected channels and diagnostic layers; preserve current scene lifecycle and responsive controls.
- [x] Run Chromium/WebKit at desktop/390; save screenshots, metrics and browser evidence.
- [x] Run all Grove tests, full Tasks/root suites, production build, focused TypeScript and unchanged mandatory gate.
- [x] Fresh source review; address substantive findings with red/green regressions.
- [x] Commit, package patch/design/plan/report under chat outputs and report limits.

## Final evidence

Final unchanged pre-PR gate passed: 5,615 root tests (one skipped), 1,257 Tasks tests, Professional typecheck. Grove accounts for 127 passing tests. Production Tasks build and focused TypeScript passed. Chromium/WebKit at 1440/390 passed current worker, layers, rapid years, invalid-year recovery and lifecycle checks. Independent review produced three geometry/path transport fixes, each reproduced red and verified green. Full Tasks typecheck has existing errors outside the Phase 2 source; report baseline comparison separately.
