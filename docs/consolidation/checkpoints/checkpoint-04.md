# Checkpoint 04 — 2026-09-01

## Verdict
PASS

## Diff vs plan
- Done: `plan.md` "Slice 04 — auth call sites (this slice)" matches the actual diff. Verified against **GitHub PR [#58](https://github.com/adamrussell91-hash/life-hub/pull/58)** ("Route remaining Functions through umbrella auth helpers"), base `main` (tip includes PR #57 merged), head `8bb3c29` on `cursor/umbrella-auth-callsites`. PR is **OPEN, mergeStateStatus=CLEAN, mergeable=MERGEABLE**, 14 files changed (+82/-34).
  - `netlify/functions/_shared/http.mjs` adds two helpers — `readUmbrellaSessionCookie(request)` (wraps `readCookie(request, UMBRELLA_SESSION_COOKIE)`) and `umbrellaSessionSecret(env)` (returns `env?.[UMBRELLA_SESSION_SECRET_ENV]`) — both sourced from `umbrella-auth.mjs`'s constants, not new literals.
  - `netlify/functions/_shared/auth-security.mjs` now serializes/expires the cookie via `${UMBRELLA_SESSION_COOKIE}=...` instead of the raw string `life_hub_session`.
  - Nine call-site functions (`chat.mjs`, `chat-confirm.mjs`, `fitness-templates.mjs`, `repo-files.mjs`, `repo-manifest.mjs`, `session.mjs`, `skincare-catalog.mjs`, `skincare-library.mjs`, `skincare-routines.mjs`, `surface-widgets.mjs`) each swap `verify(readCookie(request, 'life_hub_session'), env.SESSION_SECRET, now())` for `verify(readUmbrellaSessionCookie(request), umbrellaSessionSecret(env), now())` — mechanical, uniform, in scope.
  - `session.mjs`'s refresh path also swaps its second `env.SESSION_SECRET` (token re-issue) for `umbrellaSessionSecret(env)` — same helper, not missed.
  - New assertions added to `tests/unit/umbrella-auth.test.js` (this PR extends the file from Slice 03's 46 lines to 65): a drift-guard test walks every `netlify/functions/**/*.mjs` and asserts none but `umbrella-auth.mjs` itself contains the literal `'life_hub_session'` or `env.SESSION_SECRET`; a second new test asserts `http.mjs` exports both helpers and `auth-security.mjs` references `UMBRELLA_SESSION_COOKIE`.
  - `plan.md` bumped to v2.8: status banner, Status table (`Auth call sites — shipped (this PR)`), new "Slice 04" section, Next-action banner replaced with this checkpoint's own paste-prompt (now consumed).
  - Independently re-verified rather than trusting the PR body: worked from the existing `.worktrees/umbrella-seed-slice-01` worktree (already clean, already on `cursor/umbrella-auth-callsites` at `8bb3c29`, confirmed identical to `origin/cursor/umbrella-auth-callsites` after a fresh fetch) rather than the main checkout — main checkout still carries Adam's unrelated uncommitted work on `cursor/life-protocol-pills-c87b` (`index.html`, `render-central-node.js`, `render-chat.js` and their tests), left untouched throughout. `npm test` → **1601 pass / 0 fail** (matches PR claim exactly). Targeted `node --test tests/integration/auth-functions.test.js` → **10/10 pass**, including "auth issues a protected cookie and session validates it" and "session refreshes cookies in the second half of the lifetime." `npm run build` → exit 0.
  - Grepped `netlify/functions/` for the raw literals `'life_hub_session'` and `env.SESSION_SECRET` outside `_shared/umbrella-auth.mjs` — **zero hits**. Also grepped for `env.LIFE_HUB_PASSPHRASE_HASH` — only appears inside `umbrella-auth.mjs` itself (as the constant's value), confirming both secret names are now single-sourced.
- Drifted: none. This closes exactly the gap checkpoint-03 flagged as "partial by design" (Risk 1 there: `SESSION_SECRET` and `life_hub_session` still raw literals in ~10 function files) — Slice 04's own scope was precisely "close that gap," and the diff does only that.
- Blocked (correctly, per plan): secret rotation, cookie-attribute changes, `apps/life/` move, `life-hub2` retarget, Teaching/Knowledge/Tasks fold — none attempted in this slice.

## Boundary check
- life-hub-data untouched: **yes** — no file in the diff touches `life-hub-data`; `git diff origin/main...HEAD --stat` shows only the 14 files listed above.
- Single Adam session/auth path: **yes** — `UMBRELLA_PASSPHRASE_HASH_ENV` / `UMBRELLA_SESSION_SECRET_ENV` / `UMBRELLA_SESSION_COOKIE` still resolve to the same values set in Slice 03 (`LIFE_HUB_PASSPHRASE_HASH`, `SESSION_SECRET`, `life_hub_session`) — confirmed by the new test's exact-string assertions and by `auth.mjs` (unchanged this slice, already using the constants since PR #57). No second passphrase, no second session-secret env, no second cookie name introduced anywhere in `netlify/functions/`.
- Public student (or other public) routes still unauthenticated by design: **n/a** — Teaching is not touched in this slice; no public-route code in the diff.
- Secrets / tokens blast radius: **ok** — `netlify.toml` has a **zero-line diff** vs `origin/main` (confirmed directly, not just via the PR checklist). No new Netlify env var name appears anywhere in the diff. The PR's two unchecked test-plan boxes ("Confirm `netlify.toml` not in this diff", "Confirm no new Netlify env vars required") are both **independently verified true** by this checkpoint, same pattern as checkpoint-03.
- Design kit still single source: **yes / unaffected** — this slice doesn't touch `packages/design-kit/`; checkpoint-02's PASS still holds.

## Deploy / env
- No env var names, secret strategy, or `SITE_ORIGIN` values changed by this slice — this PR is a pure internal-reference refactor (literals → named helpers/constants), not a behavior change. The passing cookie-issue/verify/refresh integration tests back that up.
- No `included_files`, function filenames, or `netlify.toml` build/publish settings touched.
- One process note, not a code risk: the **local main checkout's `docs/consolidation/`** directory on this machine currently holds only `checkpoint-02.md` and is missing `OVERSEER.md`, `plan.md`, and checkpoints 00/01/03 on disk (they exist on `origin/main` and in the `cursor/umbrella-auth-callsites` worktree, which is what this checkpoint actually read from). Worth a `git pull origin main` into the main checkout's untracked `docs/consolidation/` at some point so the two copies don't diverge, but it didn't block this checkpoint since the worktree already carries the correct, verified v2.8 copy.

## Calendar / cross-domain
- No change in this slice. `js/shell/calendar-sources.js` / `render-calendar-sources.js` from Slice 01 are untouched in this diff.

## Risks
1. **Login handler (`auth.mjs`) was already on the constants before this slice (Slice 03) and is unchanged here** — correct, but worth naming: this PR's own drift-guard test only walks `netlify/functions/**` for raw literals going forward, so any *future* new function file that hard-codes `'life_hub_session'` or `env.SESSION_SECRET` will be caught automatically. No action needed now — just confirming the guard is real, not just descriptive prose in `plan.md`.
2. **Two PR test-plan checkboxes are still visually unchecked in GitHub** even though both are independently verified true here (see Boundary check). Low risk, but Cursor should tick them before merge so the PR's own record matches reality, same note as checkpoint-03 left for PR #57.
3. **Local main-checkout `docs/consolidation/` drift** (see Deploy/env above) — cosmetic today, but the next overseer session on this machine should not assume the main checkout's on-disk copy is current; it should keep using a worktree/`origin` for the actual read, as this checkpoint and checkpoint-02/03 have.

## Next 3 steps (Cursor only)
1. Tick the two open test-plan boxes on PR #58 ("Confirm `netlify.toml` not in this diff", "Confirm no new Netlify env vars required") — both are independently confirmed true above — then merge PR #58 into `main`; it's already clean/mergeable, no code changes needed first.
2. After merge, update `plan.md` Status: flip "Auth call sites" from "shipped (this PR)" to a merged/dated state (mirroring checkpoint-01→#55, checkpoint-02→#56, checkpoint-03→#57), and clear the "Next action" banner pointing at this checkpoint.
3. With Slice 03 + Slice 04 together closing the entire auth-literal surface, scope the next slice from `plan.md`'s remaining deferred list (`apps/life/` move is the next natural step per Slice 01's original "deferred" note) as its own PR — keep it isolated from any Netlify retarget or hub-fold work, continuing the one-slice-one-risk-surface pattern every slice so far has held to.
