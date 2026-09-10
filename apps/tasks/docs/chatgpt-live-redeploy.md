# Tasks Hub — ChatGPT Live redeploy

**How to use:** copy everything below the line into ChatGPT Live. This is **not** a product QA pass. The coding agent already pushed the fixes. Production did not update because that environment cannot dispatch GitHub Actions and has no Netlify token. You have the logged-in browser. Merge, deploy, and prove the live hosts are on the new build.

---

# Prompt — ship the Tasks Hub QA fixes to production

You are a release operator with a real browser. Finish the production redeploy that the cloud coding agent could not run.

**Do not invent tokens. Do not paste secrets into chat, screenshots, or the report.** If you create a Netlify personal access token, put it only in GitHub Secrets, then close that tab.

Work until the success checks in §6 all pass, or until a specific login/permission wall stops you. Then return the report template.

## 1. Why this is blocked

The fixes live on GitHub, not on the live hosts.

| Fact | Detail |
|---|---|
| GitHub repo | `adamrussell91-hash/Tasks-Hub` (git remote also seen as `adamrussell91-hash/tasks-hub`; same repo, GitHub renamed it) |
| Source branch | `cursor/fix-live-qa-defects-8b55` |
| Target branch | `main` |
| PR | **#22** — https://github.com/adamrussell91-hash/Tasks-Hub/pull/22 — title `Fix live-site QA defects from the 2026-08-21 pass` |
| QA-fix / runbook commit SHA | `76b43550dbf3aa58220c4dad1e8997bd061f0306` (branch HEAD when this runbook was written; includes the runbook file itself) |
| Earlier QA-fix commits on the same PR | `5e03c4f5` dates · `8ce114fe` Maps/router · `86b5e86e` error UI · `02c66ef8` delete + SPA · `94d4771e` pass-2 test brief |
| Merge method | **Squash and merge** preferred (one SHA on `main`). **Create a merge commit** is also allowed. Do **not** rebase-and-merge unless squash/merge is unavailable. |
| Required status checks | None are hard-required. PR was `MERGEABLE` / `CLEAN`. Netlify preview `netlify/artasks-hub/deploy-preview` was **SUCCESS** (not a blocker). Do not wait for GitHub Actions Pages/Netlify jobs on the **PR** — those run on **`main` after merge**. |
| Pages workflow | File `.github/workflows/pages.yml` · name **Deploy to GitHub Pages** · trigger `push` to `main` or `workflow_dispatch` · **no inputs**. Job builds `npm ci` + `npm test` + `npm run build` with `VITE_API_BASE_URL=https://tasks-api.adam-russell.com`, then `actions/deploy-pages`. |
| Netlify Actions workflow | File `.github/workflows/netlify.yml` · name **Deploy Netlify Functions** · trigger `push` to `main` or `workflow_dispatch` · **no inputs** (branch picker = `main`). Default `NETLIFY_SITE_ID=c6696619-f478-4ac1-b0cd-1e4cfd3101df`. If secret `NETLIFY_AUTH_TOKEN` is empty the job **exits 0 and skips deploy**. |
| Netlify team | Not stored in this repo. In the Netlify UI, open the site **artasks-hub** from whichever team Adam’s login shows (search **artasks-hub**). Do not guess a team slug. |
| Netlify production site | Name **artasks-hub** · site id **`c6696619-f478-4ac1-b0cd-1e4cfd3101df`** · UI https://app.netlify.com/projects/artasks-hub (fallback https://app.netlify.com/sites/artasks-hub) |
| Netlify preview target | https://deploy-preview-22--artasks-hub.netlify.app · last known preview deploy id `6a8840f4331ceb0008e9da52` |
| Netlify temp hostname | `https://artasks-hub.netlify.app` (same site; prefer the custom API host) |
| GitHub Actions secrets (names only) | **Required for Actions→Netlify:** `NETLIFY_AUTH_TOKEN` (Netlify personal access token). **Optional:** `NETLIFY_SITE_ID` (defaults to `c6696619-f478-4ac1-b0cd-1e4cfd3101df`). Never print secret values. |
| Production frontend (Pages) | `https://tasks-hub.adam-russell.com` — deploys from **`main` only** |
| Production API + should-be SPA | `https://tasks-api.adam-russell.com` |
| Expected post-merge deploy SHA | Whatever **`main` tip** is after merging PR 22. Before merge, source SHA is `76b43550dbf3aa58220c4dad1e8997bd061f0306`. After squash, record the new squash SHA from the merge page and confirm the Netlify/Pages deploy log shows that SHA (or the merge commit). |
| Asset / build identifiers | Pages artifact = Vite `dist/` uploaded by `actions/upload-pages-artifact`. Netlify publish dir **`dist`**, functions **`netlify/functions`**, build `npx vite build && node scripts/copy-spa-fallback.mjs`. Fail if publish dir is `netlify/public`. Preview build id example: `6a8840f4331ceb0008e9da52`. |
| What live API shows **now** | HTML stub: “Tasks Hub API — Functions only. Static app is on GitHub Pages.” |
| What it must show after deploy | The real Tasks Hub sign-in / Board (same SPA as Pages) |
| Cloud agent failure | `gh workflow run` → HTTP 403; no `NETLIFY_AUTH_TOKEN` in that VM |

GitHub Actions on `main`:

- **Deploy to GitHub Pages** (`.github/workflows/pages.yml`) — builds `dist` and publishes Pages.
- **Deploy Netlify Functions** (`.github/workflows/netlify.yml`) — builds the same SPA and `netlify deploy --prod`, but **exits 0 without deploying** if GitHub secret `NETLIFY_AUTH_TOKEN` is missing. Do **not** trust a green Actions tick for Netlify until you read the log.

`netlify.toml` on this branch: build `npx vite build && node scripts/copy-spa-fallback.mjs`, publish `dist`, functions `netlify/functions`, SPA redirect `/* → /index.html`. Older README text that says the Netlify build is a no-op is **stale**.

## 2. Safety

- Merge **only** PR 22 (`Fix live-site QA defects from the 2026-08-21 pass`) into `main`.
- Do not force-push, do not delete `main`, do not change DNS.
- Do not rotate Corey’s share link.
- Do not change the passphrase hash unless a screen tells you auth is broken **and** you stop to report that first.
- Never write a Netlify token or GitHub secret value into the report. Say “set” or “not set”.

## 3. Step A — confirm the preview is the new app

1. Open https://deploy-preview-22--artasks-hub.netlify.app
2. You must see the Tasks Hub **Sign in** card (brand Tasks Hub, field Passphrase, button Sign in), **not** “Functions only.”
3. Sign in with `tasks-hub-local` (Enter).
4. You should land on Board (`#/board`).
5. Click **Maps**. URL `#/maps`, heading Maps / Pathways — **not** Board columns.
6. Open DevTools → Network. Reload Clare (`#/clare`). `GET /api/clare` or templates/session should be 200 JSON `{ ok: true, … }`, not a no-CORS HTML 404.

If the preview is still the stub or Maps is Board, **stop** and report: the branch build is wrong; do not merge.

## 4. Step B — merge PR 22

1. Open https://github.com/adamrussell91-hash/Tasks-Hub/pull/22
2. Confirm base `main`, head `cursor/fix-live-qa-defects-8b55`, mergeable.
3. If it is still **Draft**, click **Ready for review** (or the equivalent), then merge.
4. Merge with **Squash and merge** or **Create a merge commit** — either is fine. Confirm.
5. Wait until GitHub shows the PR **Merged**.
6. Open https://github.com/adamrussell91-hash/Tasks-Hub/actions
7. Wait for **Deploy to GitHub Pages** on `main` to go green. If it fails, open the log, copy the failing step name + last 30 lines.

Pages can take 1–2 minutes after the green job. Then:

8. Hard-reload `https://tasks-hub.adam-russell.com`
9. Sign in if needed. Click **Maps**. Must be Maps, not Board.

If Pages is green but Maps is still Board, the old Pages artifact is cached — wait one minute, hard-reload, try a private window. Still Board → report the Pages job URL and the live hash.

## 5. Step C — production Netlify (this is the real blocker)

The API host is what failed last time (`Failed to fetch` on Clare; Network/Corey hung; stub homepage).

### C1. Netlify UI (do this first — most reliable)

1. Open https://app.netlify.com/projects/artasks-hub  
   If that 404s, use https://app.netlify.com/sites/artasks-hub or search sites for **artasks-hub**.
2. Confirm the production domain includes `tasks-api.adam-russell.com`.
3. **Deploys** → trigger a **production** deploy of branch **`main`** (not the PR preview).  
   Typical path: Deploys → Trigger deploy → Deploy site, or open the latest `main` deploy → **Publish deploy** / **Retry**.
4. Open that deploy log. Build command must be `npx vite build && node scripts/copy-spa-fallback.mjs` (or the Netlify UI equivalent of the repo `netlify.toml`). Publish dir must be **`dist`**, **not** `netlify/public`.
5. Wait until status is **Published** (green).
6. If the build fails:
   - Copy the first error and the last 40 log lines.
   - If it failed because of `tsc` / `npm run build`, the new `netlify.toml` already uses Vite-only. Make sure the deploy used **`main` after the merge**, not an old commit.

### C2. GitHub Actions backup (only if C1 is impossible)

1. Repo → **Settings** → **Secrets and variables** → **Actions**.
2. If `NETLIFY_AUTH_TOKEN` is **missing**:
   - New tab: Netlify → User settings (avatar) → Applications → Personal access tokens → New access token. Name `tasks-hub-github-actions`. Copy once.
   - GitHub → New repository secret → name exactly `NETLIFY_AUTH_TOKEN` → paste → save.
   - Close the Netlify token page. **Do not** put the value in the report.
3. Optional: secret `NETLIFY_SITE_ID` = `c6696619-f478-4ac1-b0cd-1e4cfd3101df` if you want it explicit. The workflow already defaults this id.
4. **Actions** → **Deploy Netlify Functions** → **Run workflow** → branch **`main`** → Run.
5. Open the run. The “Deploy to Netlify” step must **not** say `NETLIFY_AUTH_TOKEN secret missing — skip Functions deploy`. If it skipped, C1 was not optional — go back to the Netlify UI.

## 6. Success checks (all required)

Do these on a hard-reloaded tab. Record HTTP status, UI behaviour, and asset hashes. There is **no** `/api/bootstrap`, `/api/health`, `/api/network`, or `/api/corey` route — do not treat those as missing-deploy evidence. Network UI is `#/stress` → `GET /api/stress-flags`. Corey UI is `#/corey` → `GET /api/capacity`.

### 6.1 Hosts, cache, and build identity

Hard-refresh (bypass cache). If HTML still looks old, use a private window.

| Check | Exact URL | Pass |
|---|---|---|
| API host is the SPA | `https://tasks-api.adam-russell.com/` | HTTP **200**. Sign-in or Board. **Fail** if body contains `Functions only. Static app is on GitHub Pages.` Title `Tasks Hub`. |
| Pages host is the SPA | `https://tasks-hub.adam-russell.com/` | HTTP **200**. Sign-in or Board. |
| API-host assets | view-source `https://tasks-api.adam-russell.com/` | Record exact `/assets/index-<hash>.js` and `/assets/index-<hash>.css`. These are the **API-host build identifiers**. |
| Pages-host assets | view-source `https://tasks-hub.adam-russell.com/` | Record exact `index-*.js` / `index-*.css`. If both hosts built the same merge tree, hashes should match. |
| Expected deploy SHA | `https://github.com/adamrussell91-hash/Tasks-Hub/commits/main` | Tip of `main` after merging PR 22. Pages and Netlify deploy logs must show that SHA (or the squash SHA). Source branch SHA before merge: `76b43550dbf3aa58220c4dad1e8997bd061f0306`. |
| Pages Actions | repo **Actions** → **Deploy to GitHub Pages** on that SHA | Green. Record run URL. |
| Netlify Actions | repo **Actions** → **Deploy Netlify Functions** on that SHA | Green **and** log must **not** end at `NETLIFY_AUTH_TOKEN secret missing — skip Functions deploy`. Record run URL. |
| Netlify production deploy | Netlify UI → **artasks-hub** → Production | Status **Published**. Record **deploy ID**. Publish dir **`dist`**, not `netlify/public`. |
| Do not use preview as prod | `https://deploy-preview-22--artasks-hub.netlify.app/` | Preview only. Last known preview deploy id `6a8840f4331ceb0008e9da52`. |

### 6.2 API endpoints (exact)

Unauthenticated envelope is `{ "ok": false, "error": { "code": "unauthenticated", "message": "Sign in required" } }`.  
Authenticated success envelope is `{ "ok": true, "data": … }`.

| Check | Method + exact URL | Expected |
|---|---|---|
| Session, signed out | `GET https://tasks-api.adam-russell.com/api/session` (no cookie) | HTTP **200** `{ "ok": true, "data": { "authenticated": false } }` — not 401 |
| Maps, signed out | `GET https://tasks-api.adam-russell.com/api/maps` (no cookie) | HTTP **401** unauthenticated |
| Tasks, signed out | `GET https://tasks-api.adam-russell.com/api/tasks` (no cookie) | HTTP **401** unauthenticated |
| Wrong passphrase | `POST https://tasks-api.adam-russell.com/api/auth` `{"passphrase":"wrong"}` | HTTP **401** `{ "ok": false, "error": { "code": "invalid_credentials", "message": "Invalid passphrase" } }` |
| Sign in (UI) | `https://tasks-api.adam-russell.com/` passphrase `tasks-hub-local` (public in `AGENTS.md`; not a GitHub/Netlify secret) | Form dismissed; hub chrome. Empty submit: **Enter your passphrase.** not **Invalid passphrase.** |
| Session, signed in | `GET https://tasks-api.adam-russell.com/api/session` | HTTP **200** `{ "ok": true, "data": { "authenticated": true, "expiresAt": <number> } }` |
| Tasks, signed in | `GET https://tasks-api.adam-russell.com/api/tasks` | HTTP **200** `{ "ok": true, "data": { "tasks": […] } }` |
| Projects, signed in | `GET https://tasks-api.adam-russell.com/api/projects` | HTTP **200** `{ "ok": true, "data": { "projects": […] } }` |
| Maps API | `GET https://tasks-api.adam-russell.com/api/maps` | HTTP **200** `{ "ok": true, "data": { "maps": […] } }` — not HTML 404 |
| Network API | `GET https://tasks-api.adam-russell.com/api/stress-flags` | HTTP **200** `{ "ok": true, "data": { "flags": […] } }` — must not hang |
| Corey API | `GET https://tasks-api.adam-russell.com/api/capacity` | HTTP **200** `{ "ok": true, "data": { "snapshot": …, "share": … } }` — must not hang |
| Stall API | `GET https://tasks-api.adam-russell.com/api/stall` | HTTP **200** `{ "ok": true, "data": { "reviews": […] } }` |
| Clare propose | `POST https://tasks-api.adam-russell.com/api/clare` from `#/clare` | HTTP **200** `{ "ok": true, … }` |

### 6.3 UI routes and behaviour

Prefer the API host so `/api/*` is same-origin.

| Check | Exact URL | Pass |
|---|---|---|
| Maps | `https://tasks-api.adam-russell.com/#/maps` and `https://tasks-hub.adam-russell.com/#/maps` | Heading Maps / Pathways. **Not** Board columns. No infinite load. |
| Network | `https://tasks-api.adam-russell.com/#/stress` | Leaves **Scanning pressure patterns…**. Data or **Retry**. Not an infinite spinner. |
| Corey | `https://tasks-api.adam-russell.com/#/corey` | Leaves **Loading capacity…**. Headlines / grid or **Retry**. |
| Clare | `https://tasks-api.adam-russell.com/#/clare` | Ask Clare on `[LIVE-TEST] deploy check` → proposal, not `Failed to fetch`. |
| Unknown hash | `https://tasks-api.adam-russell.com/#/definitely-missing` | Not-found (**That view isn’t in Tasks Hub** / Back to Board). **Not** Board. |

Discard the Clare confirm after you see a proposal (no need to create a task). If you did create `[LIVE-TEST] deploy check`, Delete it on the Board confirm card.

### 6.4 Do not claim success if

- API `/` still says Functions only.
- Netlify Actions skipped for missing `NETLIFY_AUTH_TOKEN` and no manual `--prod` / UI publish was done.
- Asset hashes on production HTML are from an older commit than the merge.
- `GET /api/maps` or `GET /api/stress-flags` returns HTML 404.
- You cannot state the merge SHA, both Actions run URLs (or the Netlify deploy ID), and both hosts’ `index-*.js` hashes.

## 7. If you are blocked

Say which wall:

- Not logged into GitHub or Netlify (Adam must sign in)
- No permission to merge PR 22
- No permission to trigger Netlify production
- Cannot create a Netlify PAT / GitHub secret
- Build failed (paste log excerpt)

Do not try a second product. Do not “fix” code. This task is merge + deploy + verify only.

## 7b. Rollback (only if production is worse after publish)

1. **Pages:** GitHub → Actions → **Deploy to GitHub Pages** → open the **previous successful `main` run** → Re-run jobs, **or** revert the merge commit on `main` (GitHub PR 22 → Revert) and let Pages deploy the revert.
2. **Netlify:** artasks-hub → Deploys → open the last good **production** deploy from **before** this ship → **Publish deploy**. Do not delete the site.
3. Do not change DNS, custom domains, or passphrase hashes during rollback.
4. Record both the bad deploy URL and the restored deploy URL.

## 8. Report template (return exactly this)

```md
# Tasks Hub redeploy report

- Date:
- Operator: ChatGPT Live
- Repo: adamrussell91-hash/Tasks-Hub
- PR 22 merged? yes/no
- Merge method used: squash / merge-commit / rebase (should not be rebase)
- Merge / main-tip SHA:
- QA-fix source SHA confirmed: 76b43550dbf3aa58220c4dad1e8997bd061f0306 yes/no
- Pages workflow (Deploy to GitHub Pages): URL + green/red
- Netlify workflow (Deploy Netlify Functions): URL + deployed / skipped-no-token / not-run
- Netlify production deploy ID + published yes/no + publish dir observed (must be dist)
- NETLIFY_AUTH_TOKEN GitHub secret: already present / I set it / not set (no value)
- tasks-api index-*.js / index-*.css:
- tasks-hub index-*.js / index-*.css:

## Live checks
| Check | Result | Evidence (status / screenshot note) |
|---|---|---|
| tasks-api is SPA not stub | | |
| tasks-hub Board | | |
| GET /api/session signed out → authenticated false | | |
| GET /api/maps signed out → 401 | | |
| GET /api/session signed in → authenticated true | | |
| GET /api/tasks 200 | | |
| GET /api/maps 200 | | |
| GET /api/stress-flags 200 | | |
| GET /api/capacity 200 | | |
| Maps on API host #/maps | | |
| Maps on Pages #/maps | | |
| POST /api/clare | | |
| #/stress left Loading/Scanning | | |
| #/corey left Loading capacity | | |
| #/definitely-missing not-found | | |

## Rollback (if used)
- Pages restored to:
- Netlify restored deploy ID:

## Blockers
- none, or numbered list (GitHub merge permission / Netlify login / NETLIFY_AUTH_TOKEN not in Actions / build failed)

## What I did not do
- short list
```
