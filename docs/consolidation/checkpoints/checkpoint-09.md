# Checkpoint 09 — 2026-09-03

## Verdict
PASS

## Diff vs plan
- Done:
  - Slice 09 (Teaching public handlers) landed on branch `cursor/teaching-public-api` (2 commits ahead of `main`: `df7a9bd`, `f6ee4dd`).
  - Only the five public student handlers named in `plan.md` were added: `published-lesson.mjs`, `published-unit.mjs`, `published-class.mjs`, `media-file.mjs`, `html-app-ai.mjs`.
  - Shared gate `_shared/public-student-gate.mjs` (`createPublicStudentHandler`) wraps every one of the five handlers — confirmed by grep, no exceptions.
  - `_shared/teaching-blobs.mjs` and `_shared/teaching-student.mjs` added as support modules (Blobs key helpers, public-outcome shaping); no auth logic in either.
  - `_shared/http.mjs` gained one additive helper (`okResponse`) — 4-line diff, no behavior change to existing responses.
  - Integration + unit tests added (`tests/integration/teaching-public-api.test.js`, `tests/unit/teaching-student.test.js`) and assert the 503/`blobs_unbound` path explicitly for `published-lesson` and `html-app-ai`.
  - `apps/teaching/README.md` and `plan.md` updated to describe the slice truthfully (matches what actually shipped).
- Drifted: none observed.
- Blocked: none — this slice's stated scope is fully shipped; Blobs binding, teacher CRUD, and `arteaching-hub` retirement remain explicitly deferred per plan.

## Boundary check
- **life-hub-data untouched:** yes — no references in the diff outside the pre-existing non-goal note in `plan.md`; no code in this diff touches that repo or its API surface.
- **Single Adam session/auth path:** yes — none of the five new handlers import `Session`, `auth-security.mjs`, `umbrella-auth.mjs`, or any session helper. `createPublicStudentHandler` never touches `auth.mjs`/`session.mjs`.
- **Public student (or other public) routes still unauthenticated by design:** yes — `createPublicStudentHandler` (`_shared/public-student-gate.mjs:13-19`) calls `isPublicStudentApi(request.method, pathname)` as the **first** check after the OPTIONS/preflight short-circuit, before the Blobs store is even loaded. There is no session check anywhere in the call path for these five routes. Route allowlist itself (`public-student-routes.mjs`) predates this slice (from PR #62 / slice 08), unmodified here.
- **Secrets / tokens blast radius:** ok — grepped all new/changed files for `TEACHING_HUB_PASSPHRASE_HASH`, `teaching_hub_session`, and `arteaching-hub`: zero hits. `netlify.toml` has a zero-line diff vs `main`. No env, function-path, or `included_files` changes.
- **Design kit still single source:** n/a for this slice (no design-kit files touched).

## Deploy / env
- `netlify.toml`: unchanged (verified via `git diff origin/main...HEAD -- netlify.toml`, empty).
- No new Netlify functions directory/path changes; the 5 handlers are new files under the existing `netlify/functions/` root, consistent with existing routing.
- Blobs behavior: `defaultGetContentStore()` (`_shared/teaching-blobs.mjs:38-41`) calls `getStore('teaching-hub-content')`; the gate wraps that call in try/catch and returns **503** `blobs_unbound` (not 500) when it throws or returns falsy (`public-student-gate.mjs:21-33`) — matches plan requirement exactly. Both `published-lesson` and `html-app-ai` have integration-test coverage asserting `status === 503` and `error.code === 'blobs_unbound'`.
- `arteaching-hub` (Teaching Netlify site): no retirement, no config changes — confirmed by grep, matches "Fold later" status in `plan.md` deploy inventory.

## Calendar / cross-domain
- No calendar-related files touched in this diff. No progress/regression to report this checkpoint.

## Risks
1. **Teacher-auth handler scope creep (none found, but worth a standing check):** confirmed no teacher/CRUD handler files were added in this diff (only the 5 named public ones). Nothing to flag now — call this out explicitly again at the next Teaching-fold checkpoint once teacher CRUD handlers are proposed, since that's where the session-gate boundary actually gets tested.
2. **Route-table dependency:** the gate's safety hinges entirely on `isPublicStudentApi()` in `public-student-routes.mjs`, which this slice did not modify. That file's correctness was presumably reviewed at checkpoint-08 (slice 08, PR #62) — worth a quick re-read at the next checkpoint if any new public path is ever added to that allowlist, since every future public handler's security depends on that table staying exactly right.

## Next 3 steps (Cursor only)
1. Wire the actual `teaching-hub-content` Blobs binding on the `life-hub2` Netlify site (staging first) so the 503 path can be exercised against a real store, per the "Fold trigger" options in `plan.md` — this is the next unblocking step before teacher CRUD can follow the same pattern.
2. Add teacher CRUD handlers as a **separate** slice/PR (per `plan.md` migrate-order step 5), explicitly behind the existing session gate, so checkpoint-10 can diff it against this slice's public-only baseline.
3. Once Blobs is bound and public handlers are verified against real content in staging, update `plan.md` status table (`Teaching public handlers` row) from "in progress" to "shipped" with the merge PR number, and open the "Netlify retarget" question only after that.
