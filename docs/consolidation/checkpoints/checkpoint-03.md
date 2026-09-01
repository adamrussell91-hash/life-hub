# Checkpoint 03 — 2026-09-01

## Verdict
PASS

## Diff vs plan
- Done: `plan.md` "Slice 03 — auth lock (this slice)" matches the actual diff. Verified against **GitHub PR [#57](https://github.com/adamrussell91-hash/life-hub/pull/57)** ("Lock umbrella auth to retained Life Hub secrets"), base `main`, head `cursor/umbrella-auth-invariants`. PR is **OPEN, mergeStateStatus=CLEAN, mergeable=MERGEABLE**, 5 files changed (+87/-14).
  - New `netlify/functions/_shared/umbrella-auth.mjs` names the retained keys once: `UMBRELLA_PASSPHRASE_HASH_ENV = 'LIFE_HUB_PASSPHRASE_HASH'`, `UMBRELLA_SESSION_SECRET_ENV = 'SESSION_SECRET'`, `UMBRELLA_SESSION_COOKIE = 'life_hub_session'`.
  - `http.mjs`'s `isConfigured()` and `auth.mjs`'s login handler now read `env[UMBRELLA_PASSPHRASE_HASH_ENV]` / `env[UMBRELLA_SESSION_SECRET_ENV]` instead of the literal `env.LIFE_HUB_PASSPHRASE_HASH` / `env.SESSION_SECRET` — same values, indirected through the named constants.
  - New `tests/unit/umbrella-auth.test.js` (46 lines): asserts the three constants' values; greps every `netlify/functions/**/*.mjs` for `TEACHING_HUB_PASSPHRASE_HASH`, `process.env.UMBRELLA_PASSPHRASE`, and `teaching_hub_session` and fails if any appear; asserts `http.mjs` and `auth.mjs` reference the new constants.
  - `plan.md` bumped to v2.7: status banner, Status table ("Auth lock — shipped (this PR)"), new "Slice 03" section, Next-action banner replaced with the checkpoint-04-equivalent... actually replaced with this checkpoint's own paste-prompt (now consumed).
  - Independently re-verified rather than trusting the PR body: worked from the existing `.worktrees/umbrella-seed-slice-01` worktree (already clean, already on `cursor/umbrella-auth-invariants`, up to date with its remote) rather than the main checkout — main checkout still carries Adam's unrelated uncommitted work on `cursor/life-protocol-pills-c87b` (render-central-node.js / render-chat.js), left untouched. `npm test` → **1599 pass / 0 fail** (matches PR claim exactly). Targeted `node --test tests/integration/auth-functions.test.js` → **10/10 pass**, including "issues a protected cookie and session validates it" and "logout ... expires the session cookie." `npm run build` → exit 0.
  - Grepped `netlify/functions/` for raw `LIFE_HUB_PASSPHRASE_HASH` outside the three touched files — no hits; the passphrase-hash env name is now only referenced through the constant.
- Drifted: none against Slice 03's stated scope. One thing worth naming explicitly (not a plan violation, see Risks #1): the lock is **partial by design** — `SESSION_SECRET` is still read as a raw literal (`env.SESSION_SECRET`) in the ~10 other function files (`chat.mjs`, `session.mjs`, `repo-files.mjs`, etc.) and the cookie name `life_hub_session` is still a raw string literal in `auth-security.mjs` and every function that calls `readCookie(request, 'life_hub_session')`. Slice 03's own text only promises "Name the retained Life env keys once" plus a drift-guard test, not a full call-site migration — so this matches plan.md, but it means `UMBRELLA_SESSION_COOKIE` / `UMBRELLA_SESSION_SECRET_ENV` are not yet true single sources of truth for every reader.
- Blocked (correctly, per plan): secret rotation, cookie-attribute changes, `apps/life/` move, `life-hub2` retarget, Teaching/Knowledge/Tasks fold — none attempted in this slice.

## Boundary check
- life-hub-data untouched: **yes** — no file in the diff touches `life-hub-data`; only string occurrence is the pre-existing non-goal line in `plan.md`.
- Single Adam session/auth path: **yes** — no new passphrase env, no new session-secret env, no second cookie name introduced. `UMBRELLA_PASSPHRASE_HASH_ENV`/`UMBRELLA_SESSION_SECRET_ENV` resolve to the exact same env var names as before (`LIFE_HUB_PASSPHRASE_HASH`, `SESSION_SECRET`); this is a naming/indirection change, not a behavior change — confirmed by the passing integration cookie/session tests.
- Public student (or other public) routes: **n/a** — Teaching is not touched in this slice; no public-route code in the diff.
- Secrets / tokens blast radius: **ok** — `netlify.toml` does not appear in the PR's file list (confirmed via `gh pr view --json files` and a direct `git diff origin/main...HEAD -- netlify.toml`, both empty). No new Netlify env var is required — the two unchecked PR test-plan boxes ("Confirm `netlify.toml` not in this diff", "Confirm no new Netlify env vars required") are both **independently verified true** by this checkpoint, just not yet ticked in the PR UI.
- Design kit still single source: **yes / unaffected** — this slice doesn't touch `packages/design-kit/`; Slice 02's checkpoint-02 PASS still holds.

## Deploy / env
- No env var **names** changed — `LIFE_HUB_PASSPHRASE_HASH` and `SESSION_SECRET` are exactly what's still configured on the `life-hub2` Netlify site; this PR only adds a named-constant layer in code that resolves to those same strings.
- Cookie name unchanged: `life_hub_session` (asserted by the new test, and still what's actually set/read across every function — see Diff vs plan drift note on partial migration).
- No cookie attribute change: `auth-security.mjs`'s `Max-Age` / `SESSION_COOKIE_ATTRIBUTES` construction is untouched by this diff.
- `netlify.toml` unchanged (verified above).

## Calendar / cross-domain
- No change in this slice.

## Risks
1. **The auth-name lock is real but only reaches two of the ~12 call sites.** `http.mjs` (`isConfigured`) and `auth.mjs` (login) now go through `UMBRELLA_PASSPHRASE_HASH_ENV`/`UMBRELLA_SESSION_SECRET_ENV`; `UMBRELLA_SESSION_COOKIE` isn't imported or used anywhere outside its own test file. If a future edit changes the cookie name in `auth-security.mjs` or one function's `readCookie(..., 'life_hub_session')` call without touching `umbrella-auth.mjs`, nothing catches the mismatch except the drift-guard test's fixed string checks (which guard against *Teaching* names appearing, not against the Life name diverging internally). Not a blocker for this slice — matches its stated narrow scope — but worth deciding whether full call-site migration happens before or during the Teaching fold, when a second cookie name (`teaching_hub_session`, today) will actually need reconciling against this one.
2. **Two PR test-plan checkboxes are unticked** (`netlify.toml` not in diff; no new env vars required) even though both are true. Low risk — this checkpoint independently confirmed both — but Cursor should tick them before merge so the PR's own record matches reality.

## Next 3 steps (Cursor only)
1. Tick the two verified-true checkboxes in PR #57's test plan, then merge into `main` — it's already clean/mergeable, no code changes needed first.
2. After merge, update `plan.md` Status: flip "Auth lock" from "shipped (this PR)" to a merged/dated state (mirroring checkpoint-01 → #55 and checkpoint-02 → #56), and clear the Next-action banner that currently points at this checkpoint's now-consumed paste-prompt.
3. Scope the next slice narrowly from `plan.md`'s remaining deferred list (`apps/life/` move, or extending `UMBRELLA_SESSION_COOKIE`/`UMBRELLA_SESSION_SECRET_ENV` to the other ~10 function files for a genuine single source of truth) as its own PR — do this call-site migration, if picked, before the Teaching fold introduces `teaching_hub_session` as a real second cookie name to compare against.
