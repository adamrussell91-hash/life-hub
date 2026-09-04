# Post-fold audit spec (Claude Code)

Thorough check of the finished hub consolidation. Find issues that can bite now — stale hosts, leaked auth, public routes gated, Knowledge writing the wrong repo, missing APIs, kit drift — before they show up as a broken class, chat, or deploy.

This is **not** a new fold. Hub API consolidation is complete (`plan.md` v4.27). Widgets stay on `jade-melomakarona-ea20fe`. `GITHUB_TOKEN` rotation is parked.

## How to run

Claude Code cwd = **`life-hub` repo root** (same folder as root `CLAUDE.md`). Prefer `~/Projects/life-hub/.worktrees/umbrella-seed-slice-01` if that is the overseer checkout; otherwise `~/Projects/life-hub` on `main`. `git pull origin main` first.

**Observe-only.** Do not edit application code, move files, rotate secrets, delete Netlify/Cloudflare resources, commit, or open PRs. Write exactly one report:

`docs/consolidation/checkpoints/checkpoint-10.md`

(If `checkpoint-10.md` already exists, use the next unused `NN`.)

Never print secret values. Never ask Adam for the Life passphrase. Env **names** and public URLs only.

---

## Paste this into Claude Code

```text
You are the consolidation overseer running the post-fold audit.

Read and obey, in this order:
  docs/consolidation/OVERSEER.md
  docs/consolidation/plan.md
  docs/consolidation/POST-FOLD-AUDIT.md

Hard rules:
- Observe-only. Do not edit application code, configs, or design-kit files.
- Do not git add / commit / push / open PRs / delete sites / rotate tokens.
- Do not print secret values or ask for the Life passphrase.
- Do not treat widgets migration or GITHUB_TOKEN rotation as work to do.
- You MAY create exactly one report: docs/consolidation/checkpoints/checkpoint-10.md
  (next unused NN if 10 exists).

Task: run every check in POST-FOLD-AUDIT.md against origin/main (pull first).
For each check record PASS / FAIL / SKIP with evidence (command + output snippet, or file:line).
A known product leftover is not a consolidation FAIL unless it breaks an invariant.

Write the checkpoint using the template at the bottom of POST-FOLD-AUDIT.md.
If auth, life-hub-data, Knowledge-repo targeting, or public student URL safety is wrong, verdict is DO NOT MERGE YET even though consolidation already shipped — that means “do not treat production as safe; Cursor must fix.”
```

---

## Locked facts (fail the check if the code disagrees)

| Fact | Expected |
|------|----------|
| Umbrella API | `https://api.adam-russell.com` (`life-hub2`, `5771ee5c-0cb2-4858-b03d-2637f092050e`) |
| Umbrella Pages | `https://life-hub.adam-russell.com` — Life at `/`, Teaching `/teaching/`, Knowledge `/knowledge/`, Tasks `/tasks/` |
| Auth | `LIFE_HUB_PASSPHRASE_HASH`, `SESSION_SECRET`, cookie `life_hub_session` only |
| Forbidden auth | `TEACHING_HUB_PASSPHRASE_HASH`, `TASKS_HUB_PASSPHRASE_HASH`, `kh_session`, `teaching_hub_session` as the live gate |
| Data repos | Life → `life-hub-data`. Knowledge → `knowledge-hub-data`. Never `GITHUB_REPOSITORY` for Knowledge writes |
| Blobs | Teaching `teaching-hub-content`, Tasks `tasks-hub-content`, remounted on `life-hub2` (`TEACHING_BLOBS_SITE_ID` / `TASKS_BLOBS_SITE_ID` = `local`) |
| Knowledge binaries | S3-compatible R2 via `R2_*` env. **No** Netlify R2 bind. Worker `knowledge-hub-research` + bucket `knowledge-hub-archive` stay on Cloudflare |
| Deleted Netlify sites | `arteaching-hub`, `artasks-hub`, Netlify `knowledge-hub-archive` — IDs must stay absent |
| Keep | `life-hub2`, `jade-melomakarona-ea20fe`, R2 bucket, research Worker |
| Widgets | Stay on `https://jade-melomakarona-ea20fe.netlify.app` |
| Public student | `GET /api/published/lessons/:id`, `/units/:id`, `/classes/:id`, `GET /api/media/:id/file`, `POST /api/html-app-ai`; SPA `/teaching/s/…` |
| Kit | `packages/design-kit` only. `apps/{teaching,knowledge,tasks}/design-kit` are symlinks |

---

## Checks

Run all of them. `SKIP` only when a tool or network is unavailable — say what you could not run.

### 0. Workspace and git

- [ ] Cwd is a `life-hub` checkout, not `~/Documents` or `~/Desktop`.
- [ ] `git fetch origin main && git checkout main && git pull` (or report if you must stay on a worktree that already tracks `main`).
- [ ] `git log -1 --oneline origin/main` includes Hammond (#91) and Jobs 6+8 (#92) and widgets-stay (#93) or later.
- [ ] No uncommitted product edits in this checkout (docs report only is fine).

### 1. Repo tests

- [ ] `npm test` (or `node --test tests/unit/*.test.js tests/integration/*.test.js`) — record pass/fail counts.
- [ ] Confirm these files exist and still assert the invariant:
  - `tests/unit/public-student-routes.test.js`
  - `tests/unit/design-kit-source.test.js`
  - `tests/unit/hub-agent-context.test.js`
  - `tests/integration/tasks-list.test.js` (full records, not summaries)

### 2. Auth boundary (code)

Search `netlify/functions` and `apps/*/`:

- [ ] No live read of `TEACHING_HUB_PASSPHRASE_HASH` or `TASKS_HUB_PASSPHRASE_HASH`.
- [ ] No `kh_session` or `teaching_hub_session` cookie as the operator gate.
- [ ] Operator handlers use `life_hub_session` / `LIFE_HUB_PASSPHRASE_HASH` / `SESSION_SECRET`.
- [ ] Knowledge `auth-login` / `auth-session` / `auth-logout` are Life-session wrappers, not a second passphrase.
- [ ] `POST /api/lesson-alchemist` is **not** session-gated (shared secret `x-alchemist-secret` only) — and is **not** a public student route.
- [ ] `isPublicStudentApi` still returns false for `/api/knowledge/*`, `/api/clare`, `/api/alchemy-lab`, `/api/trash`, `/api/export`, `/api/ai/jobs`, `/api/lessons` (draft), `/api/curriculum`.

### 3. Public student safety (code + live)

- [ ] `netlify/functions/_shared/public-student-routes.mjs` still lists only published lesson/unit/class, media file, and `html-app-ai`.
- [ ] Draft `/api/lessons/:id` and `/api/lessons/:id/publish` require session.
- [ ] Live, no cookie:
  - `GET https://api.adam-russell.com/api/published/lessons/<known-id-or-any>` — not `401` (200 or 404 is fine).
  - `GET https://api.adam-russell.com/api/curriculum` — `401`.
  - `GET https://api.adam-russell.com/api/tasks` — `401`.
  - `GET https://api.adam-russell.com/api/knowledge/pages` — `401`.
  - `GET https://api.adam-russell.com/api/trash` — `401`.
- [ ] SPA student path loads without login: `https://life-hub.adam-russell.com/teaching/s/lessons/` (HTML 200; a 401/redirect-to-sign-in is FAIL).

### 4. Knowledge data boundary

- [ ] Knowledge Functions that talk to GitHub target `knowledge-hub-data` (hardcoded or dedicated env), **not** `process.env.GITHUB_REPOSITORY` / `life-hub-data`.
- [ ] Life chat / Central Node still use `life-hub-data` only.
- [ ] No Netlify R2 / Cloudflare bind in `netlify.toml` (no `[[r2]]`, no `knowledge-hub-archive` as a Netlify resource).
- [ ] Attachments use `R2_*` S3-compatible client only.
- [ ] Clementine / capture / podcast still call Worker `knowledge-hub-research` over HTTPS (`RESEARCH_KERNEL_URL`), they do not assume a Netlify bind.

### 5. Stale hosts in remounted apps

Search `apps/teaching`, `apps/knowledge`, `apps/tasks`, `apps/life` (and Life `js/`):

- [ ] No default API origin of `teaching-api.adam-russell.com`, `tasks-api.adam-russell.com`, or `knowledge-api.adam-russell.com`.
- [ ] Production API default is `https://api.adam-russell.com` (Knowledge clients may use `/api/knowledge` prefix on that host).
- [ ] Rail / shell links open same-origin `/teaching/`, `/knowledge/`, `/tasks/` — not the old Pages hosts as the primary href.
- [ ] Mentions of old hosts in comments/docs are labelled historical, not live config.

Live:

- [ ] `https://api.adam-russell.com/` → 200 (or a known Functions/public 200).
- [ ] `https://teaching-api.adam-russell.com/` → 404 (or TLS-detached diagnostic). Same for `tasks-api` and `knowledge-api`.
- [ ] `https://life-hub.adam-russell.com/teaching/` , `/knowledge/` , `/tasks/` → 200 HTML for the remounted SPAs.

Old Pages hosts (`teaching-hub.adam-russell.com` etc.) may still 200 until DNS flips. Record what they serve; do **not** FAIL consolidation solely because they still resolve. FAIL if the remounted umbrella paths 404 or still boot the old API host.

### 6. Folded API surface still mounted on `life-hub2`

For each path: unauthenticated `GET`/`OPTIONS` should not be `404` from a missing function (401/405/204 is success for “handler exists”).

Teaching (session): `/api/curriculum`, `/api/lessons`, `/api/classes`, `/api/scheduled-lessons`, `/api/search`, `/api/compositions`, `/api/trash`, `/api/scope-sequences`, `/api/export`, `/api/ai/jobs`, `/api/alchemy-lab`, `/api/media`, `/api/outcomes`.

Tasks: `/api/tasks`, `/api/projects`, `/api/areas`, `/api/goals`, `/api/maps`, `/api/programs`, `/api/clare`, `/api/templates`, `/api/stall`.

Knowledge (prefix `/api/knowledge`): `/pages`, `/search`, `/quiz`, `/tidy`, `/curator`, `/podcast`, `/clementine-chat`, `/clementine-coach`, `/capture`, `/attachments-sign`.

Life: `/api/chat`, `/api/session` (or current session path), `/api/auth`.

Alchemist: `POST /api/lesson-alchemist` exists (401/403/400 without secret — not 404).

Record any **404** as FAIL (handler missing after site delete).

### 7. Tasks record shape

- [ ] `netlify/functions/tasks.mjs` list path returns stored Blobs records (no `summarizeTask` / stripped `milestones`).
- [ ] Collection handler list path returns stored records, not summaries.
- [ ] Integration tests still expect full records.

### 8. Design kit

- [ ] `apps/teaching/design-kit`, `apps/knowledge/design-kit`, `apps/tasks/design-kit` are symlinks to `packages/design-kit`.
- [ ] No second committed kit tree under `apps/*/design-kit/` (files, not links).
- [ ] Tasks CSS imports `design-kit/tokens.css` (flat), not `design-kit/css/tokens.css`.
- [ ] `packages/design-kit/AGENTS.md` exists. No invented tokens in remounted app CSS that duplicate kit colours (spot-check new files only; do not FAIL pre-existing app chrome).

### 9. Hammond across hubs

- [ ] `netlify/functions/_shared/hub-agent-context.mjs` exists; fail-open on store errors.
- [ ] `buildSystemPrompt` includes `hubContext` for `slug === 'hammond'` only.
- [ ] `createChatHandler` loads the digest only for Hammond.
- [ ] Knowledge titles are **not** required in this digest (Clementine owns notes). Do not FAIL that omission.

### 10. Widgets proxy (keep — audit only)

If `~/Projects/proxies` exists (or `gh` can read `adamrussell91-hash/proxies` `main`):

- [ ] `ai.js` / `generate.js` do **not** send `Access-Control-Allow-Origin: *`.
- [ ] Default allowlist includes `https://adamrussell91-hash.github.io`.
- [ ] `ai` caps `max_tokens` and allowlists models.
- [ ] Live OPTIONS from a random origin to `https://jade-melomakarona-ea20fe.netlify.app/.netlify/functions/ai` is 403, not 204 with `*`.

Do not recommend folding this onto `life-hub2`.

### 11. Secrets and scan hygiene

- [ ] No passphrase hashes, `SESSION_SECRET` values, `ALCHEMIST_SHARED_SECRET`, `GITHUB_TOKEN`, or `R2_SECRET_ACCESS_KEY` in git (`rg` the repo; ignore `.env` if untracked).
- [ ] `netlify.toml` `[build.environment]` does not set real secrets.
- [ ] Public URLs (`SITE_ORIGIN`, `KNOWLEDGE_ALCHEMIST_URL`, `RESEARCH_KERNEL_URL`, `TEACHING_HUB_ORIGIN`) are not treated as secrets in committed examples.
- [ ] `SECRETS_SCAN_OMIT_KEYS` still lists public URL keys that must stay un-secret.

Do not rotate anything. `GITHUB_TOKEN` expiry `2026-12-02` is parked.

### 12. Calendar / rail

- [ ] Life calendar sources do not point at `teaching-api` / `tasks-api` / `knowledge-api`.
- [ ] Teaching / Knowledge / Tasks calendar sources marked live use same-origin or `api.adam-russell.com`.
- [ ] Life rail entries for Teaching/Knowledge/Tasks are `/teaching/`, `/knowledge/`, `/tasks/`.

### 13. Known smoke leftovers (report, do not treat as fold failures)

Confirm whether still true; file as **nits** unless an invariant breaks:

- Teaching lessons library can show 0 when records lack `status === 'active'`.
- Teaching `GET/POST /api/ai/jobs` has no background runner.
- Old Pages custom domains may still serve pre-remount deploys.
- Old API hostnames have detached TLS + 404 (expected after Job 6).
- Reflection Writing Coach calls `/api/openai` on the widgets proxy (may 404; widgets stay).

### 14. Plan drift

- [ ] `plan.md` Status / Next action match reality: fold complete, widgets keep, token rotation parked.
- [ ] Inventory still says the three Function sites are **deleted**, R2 + Worker **kept**.
- [ ] No leftover “Next action” that tells Cursor to migrate widgets or delete R2.

---

## Verdict rules

| Verdict | When |
|---------|------|
| **PASS** | Invariants hold. Only nits / known leftovers. |
| **PASS WITH NITS** | Invariants hold. Fixable product bugs (library filter, missing job runner, stale Pages DNS). |
| **DO NOT TREAT PRODUCTION AS SAFE** | Any FAIL in auth, public student gating, Knowledge→`life-hub-data`, secret in git, missing folded handler (404), or remounted SPA still calling a deleted API host. |

(Do not use “DO NOT MERGE YET” as if a PR is open — consolidation already shipped. The production-safety wording is the gate.)

---

## Report template

Save as `docs/consolidation/checkpoints/checkpoint-10.md`:

```markdown
# Checkpoint 10 — YYYY-MM-DD — post-fold audit

## Verdict
PASS | PASS WITH NITS | DO NOT TREAT PRODUCTION AS SAFE

## Method
- cwd:
- `origin/main` SHA:
- `npm test`:
- Live HTTP: yes/partial/no

## Diff vs plan
- Done (confirmed still true):
- Drifted:
- Known leftovers (not fold work):

## Boundary check
- life-hub-data untouched / Life-only: yes/no
- Knowledge writes knowledge-hub-data: yes/no
- Single Adam session (`life_hub_session`): yes/no
- Public student routes unauthenticated: yes/no
- No Netlify R2 bind: yes/no
- Design kit single source + symlinks: yes/no
- Secrets in git: none/FOUND
- Deleted Function sites still gone: yes/no/unverified
- Widgets stay on jade (not recommended to fold): yes/no

## Check results
| ID | Result | Evidence |
|----|--------|----------|
| 0 git | | |
| 1 tests | | |
| 2 auth | | |
| 3 public student | | |
| 4 knowledge boundary | | |
| 5 stale hosts | | |
| 6 API surface | | |
| 7 tasks shape | | |
| 8 kit | | |
| 9 Hammond | | |
| 10 widgets CORS | | |
| 11 secrets scan | | |
| 12 calendar/rail | | |
| 13 smoke leftovers | | |
| 14 plan drift | | |

## Deploy / env
- Notes only. No secret values.

## Risks
1.

## Next 3 steps (Cursor only — no patches in this report)
1.
2.
3.
```
