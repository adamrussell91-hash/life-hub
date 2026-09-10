# Checkpoint 10 — 2026-09-04 — post-fold audit

## Verdict
PASS WITH NITS

## Method
- cwd: repo not present on this machine ("its on github NOT my coputer" — Adam, this session). Cloned fresh, read-only, to `/private/tmp/claude-501/.../scratchpad/life-hub` via `gh repo clone adamrussell91-hash/life-hub` instead of the usual `~/Projects/life-hub`. No edits made; nothing pushed. `npm install` was run in this scratch clone only, to make `npm test` runnable (dependency install, not a product edit).
- `origin/main` SHA: `f6c66bb` (Merge PR #94, `cursor/post-fold-audit-spec`) — includes Hammond #91, Jobs 6+8 #92, widgets-stay #93, and the audit spec itself (#94).
- `npm test`: **1767 pass / 0 fail / 0 skipped** (`node --test tests/unit/*.test.js tests/integration/*.test.js`, 5.45s)
- Live HTTP: yes — all Netlify/Pages checks below ran against production over the network (read-only GET/OPTIONS/POST-without-secret only).

## Diff vs plan
- Done (confirmed still true):
  - Hub API fold complete on `life-hub2`; three old Function sites (`arteaching-hub`, `artasks-hub`, Netlify `knowledge-hub-archive`) are gone — connections refuse/TLS-detach (curl `000`), old hostnames do not serve.
  - Widgets stay on `jade-melomakarona-ea20fe`, CORS hardened (live-verified).
  - `GITHUB_TOKEN` rotation still parked (`2026-12-02`), not treated as work.
- Drifted:
  - Cosmetic only: Slice 27 ("Clementine, capture, attachments") and Slice 28 ("Tidy, curator, podcast, lesson-alchemist") headers in `plan.md` still read "(this slice)" instead of "(shipped, PR #NN)", even though the corresponding functions exist in `netlify/functions/` (`knowledge-clementine-*.mjs`, `knowledge-capture.mjs`, `knowledge-tidy.mjs`, `knowledge-curator.mjs`, `knowledge-podcast*.mjs`, `lesson-alchemist.mjs`) and `git log` shows merged PRs #84 (`cursor/knowledge-clementine-fold`) and #85 (`cursor/knowledge-leftovers-fold`) covering this work. Doc lag only — behavior matches the plan's intent; no invariant affected.
- Known leftovers (not fold work):
  - Teaching lessons library filters `status === 'active'` (`apps/teaching/src/teacher/lesson-list.ts:27`) — can show 0 for records lacking that field. Confirmed present.
  - `GET/POST /api/ai/jobs` has no background runner (no `runner`/`cron`/`background` code in `ai-job.mjs` / `ai-jobs.mjs`). Confirmed present.
  - Dead code: `apps/knowledge/src/api/config.ts` exports `LEFTOVER_API_BASE` / `resolveLegacyApiBase()` defaulting to `https://knowledge-api.adam-russell.com` — grepped for consumers; nothing else in `apps/knowledge/src` imports it. Not a live routing risk (unused export), but worth deleting at the next Knowledge touch since that host is now gone.

## Boundary check
- life-hub-data untouched / Life-only: yes — `GITHUB_REPOSITORY` is read only in `netlify/functions/_shared/github-client.mjs` (Life chat / Central Node path); no Knowledge function reads it.
- Knowledge writes knowledge-hub-data: yes — `_shared/knowledge-data.mjs` hardcodes `DEFAULT_KNOWLEDGE_DATA_REPO = 'adamrussell91-hash/knowledge-hub-data'` behind its own `KNOWLEDGE_GITHUB_REPOSITORY` env; `GITHUB_REPOSITORY` never appears in that file.
- Single Adam session (`life_hub_session`): yes — `knowledge-auth-login/-session/-logout.mjs` are thin wrappers around the shared `createAuthHandler`/`createSessionHandler`/`createLogoutHandler` (same as Life); no second passphrase constant found live. (`TEACHING_HUB_PASSPHRASE_HASH`, `TASKS_HUB_PASSPHRASE_HASH`, `kh_session`, `teaching_hub_session` hits are all confined to the carried-over `apps/teaching/`, `apps/knowledge/`, `apps/tasks/` source trees — old tests, docs, and a Cloudflare Worker source file, none of which are wired into `netlify/functions/` or `netlify.toml`.)
- Public student routes unauthenticated: yes — `isPublicStudentApi()` allowlist matches exactly the 5 routes in the spec; `createOperatorHandler` explicitly 404s any request matching that allowlist (defense in depth) and `createPublicStudentHandler` 404s anything not in it. Live: `/api/published/lessons/anything` → `404` (not `401`) with no cookie. `/api/curriculum`, `/api/tasks`, `/api/knowledge/pages`, `/api/trash` → `401` with no cookie, as expected.
- No Netlify R2 bind: yes — no `[[r2]]` or `knowledge-hub-archive` in `netlify.toml`; attachments/tidy use `_shared/knowledge-r2.mjs` (S3-compatible `R2_*` client); research calls go through `_shared/knowledge-kernel.mjs` using `RESEARCH_KERNEL_URL` over HTTPS.
- Design kit single source + symlinks: yes — `apps/{teaching,knowledge,tasks}/design-kit` are real symlinks to `../../packages/design-kit` (verified with `ls -la`); no second committed kit tree found; `packages/design-kit/AGENTS.md` exists; Tasks imports the flat `design-kit/tokens.css` and `design-kit/calendar.css`.
- Secrets in git: none — grepped for scrypt hash literals, hardcoded `sk-`/`gho_`/`ghp_` tokens, and long base64-looking secret assignments across `.mjs/.js/.ts/.toml`; no tracked `.env`. `SECRETS_SCAN_OMIT_KEYS` still lists the public-URL-shaped keys (`GITHUB_BRANCH,GITHUB_REPOSITORY,RESEARCH_KERNEL_URL,R2_BUCKET`).
- Deleted Function sites still gone: yes — `https://teaching-api.adam-russell.com/`, `https://tasks-api.adam-russell.com/`, `https://knowledge-api.adam-russell.com/` all returned curl exit code `000` (connection/TLS failure) just now, live.
- Widgets stay on jade (not recommended to fold): yes — `plan.md` "Open questions" marks this closed 2026-09-04; no next-action tells Cursor to migrate widgets or delete R2.

## Check results
| ID | Result | Evidence |
|----|--------|----------|
| 0 git | PASS | `git log -1 --oneline origin/main` = `f6c66bb` (PR #94), includes #91/#92/#93; clean working tree. Note: checkout is a fresh scratch clone, not `~/Projects/life-hub` — repo isn't present on this machine per Adam. |
| 1 tests | PASS | `npm test` → 1767 pass, 0 fail. All 4 required test files present (`public-student-routes.test.js`, `design-kit-source.test.js`, `hub-agent-context.test.js`, `tasks-list.test.js`). |
| 2 auth | PASS | No live `TEACHING_HUB_PASSPHRASE_HASH`/`TASKS_HUB_PASSPHRASE_HASH` reads, no `kh_session`/`teaching_hub_session` cookie, outside dead `apps/*` source trees. `operator-gate.mjs` reads `life_hub_session`/`umbrellaSessionSecret`. `lesson-alchemist.mjs` gates on `x-alchemist-secret` only and is not in `isPublicStudentApi`. |
| 3 public student | PASS | `_shared/public-student-routes.mjs` lists exactly the 5 spec routes. Live: published-lesson 404 (not 401) with no cookie; curriculum/tasks/knowledge-pages/trash all 401. Draft routes go through `createOperatorHandler` (session-gated). Could not render one specific real lesson ID end-to-end (no Blobs credentials from this audit seat); router regex `^/s/lessons/([^/]+)$` confirmed requires an id, so the `/teaching/s/lessons/` (no id) 404 seen live is the SPA's own "not found" view, not an auth wall — confirmed via network trace (loads `/teaching/` shell + assets, 200; the 401 in console is a background session probe for the header, unrelated to the lesson fetch). |
| 4 knowledge boundary | PASS | `knowledge-data.mjs`: `KNOWLEDGE_GITHUB_REPOSITORY` env, hardcoded default `adamrussell91-hash/knowledge-hub-data`; `GITHUB_REPOSITORY` only in `github-client.mjs` (Life). No R2/Cloudflare bind in `netlify.toml`. Attachments/kernel via `R2_*` / `RESEARCH_KERNEL_URL`. |
| 5 stale hosts | PASS | No default API origin of `teaching-api`/`tasks-api`/`knowledge-api` in `apps/*/src`. Knowledge/Tasks `config.ts` default to `api.adam-russell.com`. Old-host strings that do exist (`LEGACY_API_BASE` in Knowledge, allowlist entries in Tasks) are unused/inert, not live defaults. Rail (`hub-sections.js`) uses `/teaching/`, `/knowledge/`, `/tasks/` only. Live: `api.adam-russell.com/` → 200; `teaching-api`/`tasks-api`/`knowledge-api` → connection refused (000); `/teaching/`, `/knowledge/`, `/tasks/` on `life-hub.adam-russell.com` → 200. |
| 6 API surface | PASS | All 34 listed Teaching/Tasks/Knowledge/Life paths + `lesson-alchemist` returned 401/405 live, none 404. Full table captured this run. |
| 7 tasks shape | PASS | No `summarizeTask` in `tasks.mjs` or `_shared/`; test suite includes `tests/integration/tasks-list.test.js` asserting full records (part of the passing 1767). |
| 8 kit | PASS | Symlinks verified; no second kit tree; `AGENTS.md` present; Tasks imports flat kit paths. Did not spot-check every new CSS file for invented tokens (out of scope per spec — "do not FAIL pre-existing app chrome"). |
| 9 Hammond | PASS | `hub-agent-context.mjs` fail-open via `safeList()` (catches, returns `[]`). `persona.mjs` gates `hammondBlocks` / hub context on `slug === 'hammond'`. `chat.mjs` only builds `hubContextPromise` when `needsHammondTools = slug === 'hammond'`. No "Knowledge" string anywhere in `hub-agent-context.mjs` — titles correctly omitted. |
| 10 widgets CORS | PASS | `_lib/cors.js` (proxies repo): no `*`, default allowlist `https://adamrussell91-hash.github.io`, `ALLOWED_MODELS` set + `MAX_TOKENS_CAP = 2000`. Live OPTIONS from `https://evil.example.com` → `403` (not 204/`*`). `generate.js` reuses the same `resolveCors`. |
| 11 secrets scan | PASS | No secret-shaped literals in tracked source; no tracked `.env`; `SECRETS_SCAN_OMIT_KEYS` unchanged and still lists only public-URL-shaped keys. No rotation performed or requested. |
| 12 calendar/rail | PASS | `calendar-sources.js`: 4 sources (`life`, `teaching`, `knowledge`, `tasks`), all `status: 'live'`, no per-hub API host strings. `hub-sections.js` origins are `/teaching/`, `/knowledge/`, `/tasks/`. |
| 13 smoke leftovers | PASS (filed as nits, not FAILs) | Lessons-library `status === 'active'` filter confirmed present; no AI-jobs background runner confirmed; did not re-test old Pages custom domains or Reflection Writing Coach `/api/openai` (out of scope for this pass, network time). |
| 14 plan drift | PASS WITH NITS | Status table's terminal rows and "Next action" correctly say fold complete / widgets keep / token rotation parked. Slices 27–28 headers not updated to "(shipped, PR #NN)" despite code + git history showing them shipped (PRs #84, #85) — doc-only drift, see above. |

## Deploy / env
- Notes only, no values: production key **names** on `life-hub2` per `plan.md` Slice 34 remain internally consistent with what the code reads (`ALCHEMIST_SHARED_SECRET`, `GITHUB_WORKFLOW_TOKEN`, `KNOWLEDGE_ALCHEMIST_URL`, `R2_*`, `TEACHING_BLOBS_SITE_ID`, `TASKS_BLOBS_SITE_ID`, etc.) — not independently re-verified against the live Netlify dashboard from this seat (no dashboard access in this session).
- All three retired Function sites are unreachable (TLS-detached) rather than merely 404 — slightly stronger evidence of deletion than the spec required.

## Risks
1. Doc drift on Slices 27–28 (see above) — low risk, but if it compounds it makes `plan.md` a less reliable source of truth for the next fold-adjacent change; a one-line "(shipped, PR #84)" / "(shipped, PR #85)" edit would close it.
2. This audit ran from a throwaway clone under `/private/tmp/...scratchpad`, not Adam's usual `~/Projects/life-hub` checkout — purely a location note since "its on github NOT my coputer" this session; nothing in the audit depended on local uncommitted state, and nothing was pushed back.
3. Public-student end-to-end render (check 3) was verified by code + a no-id URL + live 401/404 status codes, not by loading one real published lesson end-to-end with a genuine ID (no Blobs read credentials available from this seat). Low risk given the router-level and function-level evidence agrees, but flagging the gap.

## Next 3 steps (Cursor only — no patches in this report)
1. Update `plan.md` Slice 27 and Slice 28 headers to "(shipped, PR #84)" / "(shipped, PR #85)" so the plan's own status table stays the single source of truth.
2. Delete the unused `LEFTOVER_API_BASE` / `resolveLegacyApiBase()` / `DEFAULT_LEGACY_API_BASE` export in `apps/knowledge/src/api/config.ts` next time that file is touched — it points at a host that no longer exists and has no callers.
3. If/when convenient, do one real end-to-end student-lesson load test (an actual published lesson id against `https://life-hub.adam-russell.com/teaching/s/lessons/<id>`) to close the small gap noted in Risk 3 — this needs Blobs-backed data, not just code inspection.
