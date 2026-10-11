# Grove continuation — 11 October 2026

> Execution: use the executing-plans skill; complete and verify each item before opening the PR.

**Goal:** Carry the approved history-derived Grove through Day, Week, Term and Year, real terrain/water, and milestone wildlife.

**Architecture:** Keep the pure task-history plan separate from terrain, milestone and rendering modules. Calendar windows use the shared configured school-term resolver. Date-seeded terrain stays independent of completion counts. Broad views instance simplified trees; close views retain MegaKit models and picking. Animal GLBs use independent skeletons and optional local project assets, with public Quaternius deer/fox always available.

**Tech stack:** existing TypeScript/Vite/Three.js WebGL, Vitest, Playwright; no new backend/storage/job.

## Integration
- [x] Branch from freshly fetched main and cherry-pick the scene commit merged into claude/grove-plan by #788. Keep #786 animal hand-off.
- [x] Run existing Grove tests (27 passed before changes).
- [x] Fix standing-tree movement when a later completion introduces a second species; validate calendar dates.

## Calendar and performance
- [x] Add term/year windows and adjacent navigation from actual school dates; holidays remain meadow. A holiday Term selection shows its actual holiday interval. Missing calendar uses the existing provisional NSW terms and is identified in the caption.
- [x] Add route pills/captions; preserve Day/Week/tree cards. Term/Year batch simplified geometry and pick instance-to-task IDs. Phone opens near its anchor at a readable scale and can pan through the forest.

## Terrain and water
- [x] Add a deterministic sampled height field and Priority-Flood basin filling. Preserve original bed heights, compute flat basin surfaces and downstream flow; test bowls, spill levels, acyclic drainage and non-overlap of dry planting.
- [x] Render faceted hills, lake surfaces and connected streams. Place MegaKit vegetation above dry terrain; reeds/lilies use the previously approved Kenney exceptions. Use static water highlights rather than a costly permanent shader loop.

## Wildlife
- [x] Derive fixed recognisable milestones: hare first five-task day; deer first complete Monday–Sunday week; fox first completed school term with completions; squirrel first 25 Teaching completions; robin first 10 Life/Health completions; mallard first 20-completion week. No points UI or guessed book completions. Owl uses explicit Bookshelf completion dates and a credited Poly by Google model with original Grove motion.
- [x] Load available assets, clone independent skeletons, move in-place clips along deterministic dry/water-safe paths, graze/idle, fly the robin, swim the mallard, and add a half-size baby for a repeated hare/deer milestone. No terrain crossing by land animals. Pause when hidden/offscreen or reduced-motion; offer a wildlife pause control.
- [x] Keep restricted originals/GLBs out of public Git. Local installer and ZIP remain Claude's source. Public builds gracefully use only available species; document exact deployment requirement and credits.

## Verification of #790 and delivery
- [x] Real-entry browser checks at 1440/390 for all views, task picking, date navigation, Home embed, reduced motion, wildlife pause, missing optional pack, and unmount cleanup.
- [x] Inspect rendered screenshots against the approved soft faceted style; record deviations here.
- [x] Run Grove tests, Tasks typecheck/build, public model validator, and mandatory root pre-PR gate.
- [ ] Open one main-targeted integration/build PR, attach it, check CI and merge if checks pass (user authorised fixing merges and continuing the build).


## Validation evidence

- Grove unit suite: 45 tests passed. It covers fixed species patches, exact calendar windows/holidays, impossible dates, future completions, bowl spill levels, drainage cycles, continuous streams, dry planting/paths, milestones, and earned foxes across years.
- Real Tasks entry with a fixed 1,415-completion history: all four views at 1440×1000 and 390×844 render terrain, exactly one canvas and eight milestone actors, with no horizontal overflow or page errors. Picking opens the real task link; Escape closes the card. Pause/resume, reduced motion, public-only missing-pack fallback and route cleanup pass. The chromeless Home embed reaches its rendered state.
- `scripts/check-grove.mjs` reproduces the browser run against the local mock server. Screenshots and the JSON report were saved in the Codex thread’s outputs/grove-build-preview directory.
- Full production site build and catalogue generation pass. The installed project-only bundle produces seven model entries. A clean public checkout produces three Quaternius entries; licensing/deployment instructions remain in README.md.
- Tasks `tsc --noEmit` still reports existing errors outside Grove (cross-root imports, Clarify, Gantt, graph/shell types). It reports no errors in Grove’s domain, renderer or embed. The mandatory gate includes the working Tasks test/build path and Professional typecheck; no checks were weakened.
- Public GLB inventory remains 71 models; the validator’s size total includes the new documentation/catalogue. Restricted models retain their separate manifest and motion verification.

## Implementation decisions and limits

- Term/Year use instanced faceted stand-ins, as planned; Day/Week use the purchased MegaKit meshes. Phone broad views frame the anchor clearing and allow panning; desktop fits the whole period. Resize/replant retains the user’s camera. Tiny/offscreen wildlife does not run a permanent animation loop.
- Lakes use Priority-Flood spill levels. Streams follow the explicitly carved low valley as a continuous ribbon; individual short drainage edges are not rendered as disconnected strips. Water is static, with reeds and lily pads, and shares the wet mask used by planting and motion. No ripple shader or ambient audio is added in this slice.
- Trees mature over three real days using the authored mature mesh at smaller scale; unique authored sapling meshes are not required.
- Book/owl and full animal deployment were completed in the follow-up below. Missing model files still fail gracefully; they never become placeholder cubes.
- Main advanced during the build; its unrelated #789 changes were merged cleanly. #788 was recovered from its merged stack branch without discarding #786’s local animal hand-off.
- Delivery happens after committing this verification record. The integration PR’s GitHub state is authoritative for creation and merge status.

## Completion pass — 11 October

- [x] Eight-model bundle packaged with authenticated encryption; GitHub Actions key installed and install round trip verified. The Pages workflow installs before building; no licensed plaintext source or key enters Git.
- [x] Explicit `completed_on` date in existing Bookshelf metadata and Book facts UI; dates survive other edits, clear on rereading, reject impossible/future dates. Grove reads the same signed-in shelf and awards one owl. No new game store/job.
- [x] Owl source/credit recorded; original four-joint rig and four looping clips pass vertex deformation and seam verification.
- [x] Phone Book facts R4 failure reproduced and fixed: independently scrolling fields, docked 44px actions, 16px controls, safe-area padding. Chromium and WebKit Save/reopen/rereading checks pass at desktop and 390px.
- [x] Whole-period framing added; phones can show the full week/term/year and return to the selected clearing.
- [x] Final Chromium and WebKit suites: Day/Week/Term/Year at 1440 and 390px, nine milestone actors, no page errors/overflow; picking/Escape, whole-period framing, pause/reduced motion, public-only fallback, embed and disposal pass. Bookshelf Save/reopen/rereading also pass in both engines at both sizes.
- [x] Signed-in account: 108 year trees, 22 week trees, configured holiday meadow rather than guessed terms; Home iframe renders. A labelled temporary test task grows one oak and its picked link opens the correct task. Reopening removes completion; the test record is retained inactive rather than permanently deleted.
- [x] Graph teardown race reproduced with fake timers and fixed; a rapid Branch→Lines transition remains visible. Home clearing refreshes on the existing task-change event.
- [x] Final mandatory pre-PR gate passes: root 5,615 tests (one existing skip), Tasks 1,178 tests and Professional typecheck. Knowledge's 1,249 tests and all eight models' motion/deformation checks pass. No test checks weakened.
- [x] Production released through [PR #791](https://github.com/adamrussell91-hash/life-hub/pull/791), merge `92d01b94`. [Pages run](https://github.com/adamrussell91-hash/life-hub/actions/runs/38100432730) succeeds, including encrypted installation. All eight live GLBs return 200 and match the verified local build byte-for-byte; the deployment archive returns 404. Netlify publishes the same merge commit for the API. Chromium/WebKit final phone interactions and cleanup pass with zero errors.

The four completion areas are finished. In Bookshelf, open Book facts and set Finished on for a genuinely completed book; that dated event earns the owl. Existing reading progress is never treated as a finished book. The final live-account and local reports stay in the Codex handoff outputs, not in public Git.
- Optional audio, water animation, extra species and dedicated young meshes remain out of this completion pass.
