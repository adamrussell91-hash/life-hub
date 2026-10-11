# Grove Final Expansion Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development, one implementer per task and fresh spec/quality reviews. Adam explicitly authorises continuous execution; no additional plan approval pause.

**Goal:** Integrate the purchased forest pack, animate four selected static GLBs, expand compatible trees and finish all accessible annual Grove acceptance work.
**Architecture:** Existing private asset manifest/catalogue and verified GLB pipeline feed bounded annual actors; pure companion eligibility retains parent milestone dates. Existing worker geography and shared scene clock remain source of truth.
**Tech Stack:** Three.js, glTF Transform, Blender or existing FBX conversion, TypeScript, Vitest, Playwright. No new frontend runtime library.

## Task 1 — Asset preparation

Files: tools/grove-previews/prepare-forest-expansion.*, rig-quadrupeds.*, expansion evidence; ignored project-only models/manifest. Source inputs Downloads/unity/LowWorld_ForestAnimalsKit.unitypackage and four Poly GLBs.

- [x] Inventory FBXs/clip metadata/texture and source meshes, hash originals, read private packaging and verification helpers.
- [x] Extract models without source script execution. Convert eight models, use exact clip ranges and normalize. Create actual quadruped deformation for four static models; record original rig and animation provenance.
- [x] Extend reusable verification to assert all exported clips deform vertices, valid skin weights/bounds, endpoint closure and independent baby skeletons. Run it against actual outputs and fix failures.
- [x] Add verified manifest entries and credits to installed private catalogue, retaining original eight models and hashes. Produce ready bundle and local gallery.
- [x] Commit tooling/provenance only, review spec then quality.

## Task 2 — Tree expansion and companions

Files: domain/grove/assets.ts, companions.ts, annual-animals.ts, annual-trees.ts, shared renderer; unit tests; public tree manifest/models/previews.

- [x] Write failing tests for companion earn dates, future exclusion, deterministic rotation/caps and no invented thresholds. Use earned milestone fixtures, assert skunk needs hare and otter needs mallard; test no eligible milestone means no companions.
- [x] Add exact source tree variants using existing normalize pipeline and preserve existing variant numbers. Test referenced model presence and new variant cardinalities.
- [x] Integrate available companions using shared safe paths, proper locomotion/feed/idle roles, native otter waterline and actor cap11 (nine originals plus two companions); retain original milestone parents and babies.
- [x] Add native trunk-anchored gentle wind tied to shared cosmetic clock; test pause/reduced/quality and picking after authored replacement.
- [x] Run focused tests/browser gallery and source reviews; commit.

## Task 3 — Final annual audit and performance

Files: world-client/protocol/worker validation if measurements justify; diagnostic/browser scripts; tests/unit/grove-world-client.test.ts; annual acceptance report.

- [x] Compare every acceptance clause with implementation/evidence and list concrete gaps.
- [x] Measure main-thread world receipt and scene frame tasks on the local browser before optimizing.
- [x] Add red checks for async corruption rejection, cancelled obsolete validation and no >100ms synchronous generation validation; keep strict canonical receipt validation in a worker.
- [x] Implement measured fixes; verify all existing corruption tests still pass and startup UI stays responsive.
- [x] Run stress/functional browser checks serially, required gate, production build and exact baseline type comparison. Fresh reviews and final source commit.

## Task 4 — Recovery and release preparation

- [x] Export Phase4-base and combined-main patches, Git bundle; forward isolated-index/reverse checks and bundle verification.
- [x] Package private project-use animal models separately with credits/licenses/motion hashes; never include raw licensed assets in public patches.
- [x] Save screenshots, performance/raw logs, acceptance matrix and remaining real-device limitations; hash delivery files and open report/preview.
- [x] Prepare reviewable release artifacts and complete only authorised, available release actions. Do not claim physical-device or deployed acceptance without evidence.

## Acceptance evidence

The unchanged repository gate passes, including all1328 Tasks tests and Professional typecheck. Production Tasks build passes; full Tasks TypeScript remains exactly the existing67 errors with no new errors. Native Chromium/WebKit desktop and390px functional/motion/consumer checks pass. Twenty private animated models and25 mature public tree variants are verified, with Australian animals excluded.

Wide-view vegetation uses global instanced groups below zoom3, retaining region batches and a64 authored-tree cap in close views. Fresh resource/picking review found no actionable issues. All16 default Chromium/WebKit dense cases and eight installed Chrome Metal cases pass bounds/error/resource checks. Apple GPU and Metal/M1 active-scene medians are17ms and16.7ms respectively. Three repeated mounts per viewport maintain stable live geometry/texture allocations. Phone-width results are layout tests, not physical-phone acceptance. Synchronous transfer and metadata freezing peaked at33ms and39ms; canonical generation/validation remains in the worker.

Release limitation: the tracked authenticated animal delivery still contains the original8 models. The verified20-model archive is ready; `scripts/seal-grove-deployment-assets.mjs` requires the matching existing GROVE_ASSET_KEY before replacing ciphertext. No deployment/push or physical-phone acceptance has been claimed.

Final tap acceptance: the added native Year-view test exposed WebKit phone subpixel hit rounding. The renderer now falls back to the closest finite, depth-visible eligible tree within12px desktop or22px phone only after mesh picking misses. Four focused tests and fresh read-only review pass. The unchanged final repository gate passes177 Tasks files/1328 tests plus5618 root tests (six documented skips); production build passes and the TypeScript baseline remains67 errors without additions.
