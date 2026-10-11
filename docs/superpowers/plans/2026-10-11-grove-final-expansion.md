# Grove Final Expansion Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development, one implementer per task and fresh spec/quality reviews. Adam explicitly authorises continuous execution; no additional plan approval pause.

**Goal:** Integrate the purchased forest pack, animate four selected static GLBs, expand compatible trees and finish all accessible annual Grove acceptance work.
**Architecture:** Existing private asset manifest/catalogue and verified GLB pipeline feed bounded annual actors; pure companion eligibility retains parent milestone dates. Existing worker geography and shared scene clock remain source of truth.
**Tech Stack:** Three.js, glTF Transform, Blender or existing FBX conversion, TypeScript, Vitest, Playwright. No new frontend runtime library.

## Task 1 — Asset preparation

Files: tools/grove-previews/prepare-forest-expansion.*, rig-quadrupeds.*, expansion evidence; ignored project-only models/manifest. Source inputs Downloads/unity/LowWorld_ForestAnimalsKit.unitypackage and four Poly GLBs.

- [ ] Inventory FBXs/clip metadata/texture and source meshes, hash originals, read private packaging and verification helpers.
- [ ] Extract models without source script execution. Convert eight models, use exact clip ranges and normalize. Create actual quadruped deformation for four static models; record original rig and animation provenance.
- [ ] Extend reusable verification to assert all exported clips deform vertices, valid skin weights/bounds, endpoint closure and independent baby skeletons. Run it against actual outputs and fix failures.
- [ ] Add verified manifest entries and credits to installed private catalogue, retaining original eight models and hashes. Produce ready bundle and local gallery.
- [ ] Commit tooling/provenance only, review spec then quality.

## Task 2 — Tree expansion and companions

Files: domain/grove/assets.ts, forest-companions.ts, annual-animals.ts, annual-trees.ts, shared renderer; unit tests; public tree manifest/models/previews.

- [ ] Write failing tests for companion earn dates, future exclusion, deterministic rotation/caps and no invented thresholds. Use earned milestone fixtures, assert skunk needs hare and otter needs mallard; test no eligible milestone means no companions.
- [ ] Add exact source tree variants using existing normalize pipeline and preserve existing variant numbers. Test referenced model presence and new variant cardinalities.
- [ ] Integrate available companions using shared safe paths, proper locomotion/feed/idle roles, native otter waterline and actor cap9; retain original milestone parents and babies where slots permit.
- [ ] Add native trunk-anchored gentle wind tied to shared cosmetic clock; test pause/reduced/quality and picking after authored replacement.
- [ ] Run focused tests/browser gallery and source reviews; commit.

## Task 3 — Final annual audit and performance

Files: world-client/protocol/worker validation if measurements justify; diagnostic/browser scripts; tests/unit/grove-world-client.test.ts; annual acceptance report.

- [ ] Compare every acceptance clause with implementation/evidence and list concrete gaps.
- [ ] Measure main-thread world receipt and scene frame tasks on the local browser before optimizing.
- [ ] Add red checks for async corruption rejection, cancelled obsolete validation and no >100ms synchronous generation validation; keep strict canonical receipt validation in a worker.
- [ ] Implement measured fixes; verify all existing corruption tests still pass and startup UI stays responsive.
- [ ] Run stress/functional browser checks serially, required gate, production build and exact baseline type comparison. Fresh reviews and final source commit.

## Task 4 — Recovery and release preparation

- [ ] Export Phase4-base and combined-main patches, Git bundle; forward isolated-index/reverse checks and bundle verification.
- [ ] Package private project-use animal models separately with credits/licenses/motion hashes; never include raw licensed assets in public patches.
- [ ] Save screenshots, performance/raw logs, acceptance matrix and remaining real-device limitations; hash delivery files and open report/preview.
- [ ] Prepare reviewable release artifacts and complete only authorised, available release actions. Do not claim physical-device or deployed acceptance without evidence.
