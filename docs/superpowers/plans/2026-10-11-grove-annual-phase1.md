# Grove annual world Phase 1 implementation plan

> Execute inline with the executing-plans and test-driven-development skills. Adam explicitly authorised writing this design/plan and then building Phase 1 in the same request.

**Goal:** Implement audit items 1, 2, 3, 4 and 27 as a reproducible annual geographic model, cancellable worker client and inspectable diagnostic.

**Architecture:** Pure versioned terrain generation produces original bed plus constrained feature metadata. A worker transfers its buffer to a client with explicit cancellation and lifecycle ownership. An isolated preview consumes this API; task planting and production Grove migration remain later phases.

**Tech stack:** Existing TypeScript, Vite, Three.js 0.180, Vitest and Playwright. No dependency or asset acquisition.

## 1. Identity and annual height field

Create `apps/tasks/src/domain/grove/world-key.ts`, `heightfield.ts`, `world.ts` and `apps/tasks/tests/unit/grove-world.test.ts`.

- [x] Write tests for invalid keys, pinned/default versions, deterministic independent buffers, different years, finite/expected grid and extents, minimum relief and descriptors.
- [x] Run `cd apps/tasks && node node_modules/vitest/vitest.mjs run tests/unit/grove-world.test.ts`; confirm the new API is missing before implementation.
- [x] Implement recipe v1 (896 metres/257 vertices), seed namespaces, broad noise/ridges/valley, meadow flattening, basin/rim/notch/island shaping and generation summary.
- [x] Add parameterised representative-year tests for connected dry ground, depressed basin beds, elevated islands and gentle meadow interior slopes. Inspect generated geometry, not only descriptor existence.
- [x] Rerun the focused tests and resolve failing geographic constraints without weakening them.

## 2. Worker protocol and request ownership

Create `apps/tasks/src/domain/grove/world-worker.ts`, `world-client.ts` and `apps/tasks/tests/unit/grove-world-client.test.ts`.

- [x] Write lifecycle tests with a controlled Worker transport: success/key matching, transferred data, supersession termination, stale callbacks, runtime/message errors, malformed results, post/setup failures, disposal and unsupported workers.
- [x] Run the focused client test to demonstrate the missing client contract.
- [x] Implement a fresh module worker per generation and a shared typed protocol. Worker success transfers `[world.bed.buffer]`; worker failure serialises an error message. The client rejects stale/invalid output and freezes received metadata.
- [x] Rerun client/world tests; verify existing Grove domain tests still pass.

## 3. Diagnostic consumer and browser evidence

Create `apps/tasks/grove-world-preview.html`, `src/grove-world-preview/main.ts`, `preview.css` and `scripts/check-grove-world.mjs`. Modify only `apps/tasks/vite.config.ts` to add the preview build input.

- [x] Build a standalone diagnostic with shared kit buttons, year controls and explicit provisional-basin labeling. Consume AnnualWorldClient, not direct synchronous generation.
- [x] Build a faceted bed mesh with sampled elevation colours and illustrative clipped basin overlays. Keep rendering on demand; dispose geometry/materials/renderer/client on exit.
- [x] Run the dev server on a free local port. Check actual worker results in Chromium and WebKit at 1440/390, including rapid changes ending in a known year. Assert current key, finite sample count, transferred buffer size, visible rendered geometry, controls, errors and overflow.
- [x] Save representative screenshots and generation timing evidence to the chat outputs. Record WebGL limitations explicitly if an engine cannot render.

## 4. Verification and handoff

- [x] Run focused Phase 1 tests and all existing Grove tests.
- [x] Run the entire Tasks Vitest suite and `npm run build` in Tasks; confirm the worker chunk exists in the built preview.
- [x] Run a focused TypeScript check covering all new modules/preview; also run the full Tasks typecheck and classify pre-existing errors without suppressing them.
- [x] Run root `node scripts/pre-pr-check.mjs` unchanged. If red, fix introduced issues; do not open/update a PR until exit 0.
- [x] Review the final diff for activity coupling, accidental task writes, unsupported version drift, transferable buffer ownership, resource disposal and scope creep.
- [x] Commit the design, plan, code and validation evidence on `codex/grove-annual-phase1`. Provide a reviewable patch and report; any PR creation must pass the mandatory gate and be attached to this chat.

## Failure modes and future integration

Worker cancellation must terminate compute, and late output must not replace a newer selection. Reserve/basin constraints are tested against the generated bed; descriptor-only tests are insufficient. Phase 1 provisional spill levels are never presented as solved annual hydrology. Generation happens once per request, never per frame. UI checks cover L5 (phone toolbar), R4 (44 px accessible actions where applicable) and V7 (newer selection survives repaint). Full task-history rendering remains on the established route until Phases 2–3 supply valid annual ownership and stable planting.
