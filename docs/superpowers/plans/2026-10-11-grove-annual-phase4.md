# Annual Grove Phase 4 implementation plan

> Execute bounded tasks using subagent-driven-development and fresh reviews using requesting-code-review. Continue the authorised build without another approval pause.

**Goal:** Animated annual water and safe authored wildlife with geometry prerequisites and annual consumers.
**Architecture:** Pure worker mesh payload; native shader/effect renderer; shared cosmetic clock; annual wildlife adapters; consumers reuse calendar/history.
**Tech stack:** Existing TypeScript, Three.js, Vitest, Playwright. No new dependencies.

## Task 1 — Worker mesh and waterfall prerequisites

Files: domain/grove/world-meshes.ts, world-protocol.ts, world-client tests, tests/unit/grove-world-meshes.test.ts.

- [ ] Add red tests for buildWorldMeshes(world): spatial terrain 32-cell chunks, final-bed edges, clipped water area conservation, channel coordinates, level lakes, valid sheet joins and synthetic drop rejection.
- [ ] Implement typed arrays and stable chunk IDs. Clip water at chunk planes with interpolated flow coordinates; preserve triangle masks. Worker adds mesh payload and transfers each unique buffer once. Recipient validates required shapes/finite bounds/ownership.
- [ ] Run focused Vitest, commit, then fresh spec and quality review.

## Task 2 — Shared motion, shader and wildlife

Files: domain/grove/motion.ts, annual-wildlife.ts; views/grove/waterRenderer.ts, annual-animals.ts; tests/unit/grove-motion.test.ts and grove-annual-wildlife.test.ts.

- [ ] Add red tests for freeze/resume/no catch-up and long-period continuity; wet/slope/obstacle rejection, connected swim and sampled waterline.
- [ ] Implement original static-position lake/stream/fall GLSL, bounded instanced spray and receiving foam with low/medium/high uniforms/budgets. Record evaluated revision and rationale.
- [ ] Implement annual paths and existing authored animal/mixer lifecycle using sampled heights; bound actors, retain milestone/baby eligibility and honest missing assets.
- [ ] Run focused checks and fresh source reviews; commit.

## Task 3 — Scene, diagnostic and annual consumers

Files: grove-world-preview renderer/main/HTML, views/grove/annual-scene.ts, view.ts, Home preview consumer; scripts/check-grove-phase4.mjs.

- [ ] Add red browser checks for advancing phase, pause/resume/reduced/hidden/offscreen, quality, prototype falls, safe duck and shader errors.
- [ ] Integrate worker chunks, original shaders and annual actors with one clock. Render on demand when suspended; dispose effects/listeners. Preserve Phase 3 counts/picking/boundary checks.
- [ ] Migrate local Grove/Home consumers preserving calendar/task routes/refresh/cards and fallback. Near authored models and distant silhouettes share task-ID picking.
- [ ] Fresh reviews, unchanged gate, production build, baseline typecheck comparison, browser acceptance and packaged verified patches/bundle.
