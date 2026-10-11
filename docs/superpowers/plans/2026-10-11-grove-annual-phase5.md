# Grove Phase 5 verification and closure plan

> Execute the authorised fixes continuously using test-driven development and independent reviews. No new approval pause; no push/deployment or secret access. One implementer owns each independent task.

**Goal:** Verify the full annual specification and close newly reproduced local defects before release acceptance.
**Architecture:** Preserve existing year/version geography, task/book stores, milestone dates and model identities. Fix async ownership at each fetch boundary, frame actual geographic cells, and validate/install private assets as a complete catalogue. Native consumer and interaction checks provide acceptance evidence.
**Tech Stack:** Existing TypeScript, Three.js, Vitest, Node tests and Playwright; no new dependency.
**Spec:** apps/life/assets/grove/ANNUAL-WORLD-SPECIFICATION.md and docs/superpowers/specs/2026-10-11-grove-final-expansion-design.md.

## Constraints and review focus

- Preserve deleted/reopened task exclusions and one tree per qualifying completion.
- Default Today follows Sydney midnight; explicitly dated history stays pinned.
- Obsolete task/book reads must not cancel newer world generation or restore stale history.
- Home retains a healthy preview until replacement is ready, including transient network failure.
- Weekly/term overview includes actual region cell extents and explicit New Year ownership notice.
- Context trees stay quieter in authored and silhouette representations; wind phase stays bounded without seam discontinuity.
- Exact private model/clip inventory and clean installed directories prevent partial/stale publication.
- Actual phone and deployed acceptance require real evidence and remain explicit external gates.

## Task 1 — Consumer refresh and dates

Files: apps/tasks/src/views/grove/view.ts, apps/tasks/src/grove-embed/main.ts, regression tests/script.

- [x] Reproduce old book-fetch route race and overlapping same-view task snapshots; assert newest scene/history survives.
- [x] Reproduce implicit Sydney midnight and explicitly dated history; update anchor and navigation only for implicit Today.
- [x] Reproduce failed/slow Home refresh; preserve existing canvas and caption until successful replacement.
- [x] Add production New Year ownership notice derived from plan.boundary; verify at desktop/390.
- [x] Fix minimal async ownership/date/refresh code, run regressions and fresh review.

## Task 2 — Framing and authored vegetation

Files: domain/grove/annual-framing.ts, views/grove/annual-trees.ts, grove-world-preview/renderer.ts and focused tests.

- [x] Red checks for empty Week/Term framing covering all selected region cells, including offsets/boundaries.
- [x] Red checks for long-session bounded wind with equivalent sine phase and quiet nonselected authored materials.
- [x] Implement region extents, continuous wrapped wind phase and selected/context material groups without changing task identity, picking or disposal.
- [x] Run focused checks and fresh review.

## Task 3 — Private asset installation and integrity

Files: tools/grove-previews/animal-bundle-integrity.mjs, install-project-animals.mjs, scripts/lib/grove-authenticated-deployment.mjs, associated Node tests/docs.

- [x] Reproduce pre-existing unlisted target files surviving modern/authenticated installation.
- [x] Reproduce incomplete per-clip motion reports accepted for a declared multi-clip model.
- [x] Implement clean/atomic replacement and exact manifest/report clip matching while retaining authenticated pinned legacy compatibility.
- [x] Verify malformed catalogue handling if an authored library cannot load; correct stale handoff counts/commands.
- [x] Run strict/private fixture tests and fresh independent review; no secret access.

## Task 4 — Phase 5 acceptance and recovery

- [ ] Run native consumer/race/midnight/fallback/rapid-year/motion/picking checks at1440 and390 in Chromium/WebKit, including real Mac GPU interaction timings.
- [ ] Run unchanged required repository gate, then serial production build and baseline full Tasks type comparison.
- [ ] Save fresh clause matrix, reviews, screenshots/raw results and explicit remaining physical-phone/deployment gates.
- [ ] Commit verified changes, refresh both recovery patches/bundle and delivery checksums; verify forward/reverse Git trees and assets.

## Task 5 — Reuse decoded near-tree resources during interaction

Execute this remediation before closing Task4 acceptance/recovery. Native profiling found WebKit weekly clearing worst frames of374–412ms when a changed near-tree set reparsed models and replaced their geometry/textures/material programs. Sorting the ID key prevents order-only reloads but does not solve actual membership changes.

Files: apps/tasks/src/views/grove/annual-trees.ts, apps/tasks/src/grove-world-preview/renderer.ts, focused annual-tree tests (optional separate tree-library module only if responsibility needs it).

- [x] Add a scene-owned decoded tree library, cached by model file for the renderer lifetime. It owns sources, shared geometry/textures, selected/context material clones and a shared bounded wind uniform. At most25 mature model files can be cached; no global cache across disposed renderers.
- [x] Near snapshots reuse library geometry/materials and allocate only bounded instance batches. Snapshot disposal releases its instance buffers, without invalidating borrowed resources. A standalone createAnnualTrees call must retain its old ownership/disposal contract.
- [x] Reuse selected/context materials with their existing colors, textures/roughness and shader program identity. Preserve64 authored cap, generous hit proxies, tree IDs/world offsets/transforms, silhouette fallback, wind/pause semantics and changed-set invalidation.
- [x] Dispose library resources exactly once with renderer disposal; async loads resolving after disposal release their source resources immediately and do not attach stale trees. A failed model remains a silhouette and does not poison other models.
- [x] TDD meaningful repeated-subset reuse, borrowed-versus-owned disposal, shared texture/geometry release, delayed load after disposal, fallback and original cap/style/transform tests. No GPU/full gate/build in implementer; parent runs native weekly interaction/lifecycle profiling, final gate/build/type comparison.
- [x] Independent spec/resource code review clean before final acceptance. Keep the reusable-model cache bounded and report any new public API or material ownership tradeoff.
