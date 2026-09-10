# Checkpoint 02 — 2026-09-01

## Verdict
PASS

## Diff vs plan
- Done: `plan.md` "Slice 02 — kit remount (this slice)" matches the actual diff. Verified against **GitHub PR [#56](https://github.com/adamrussell91-hash/life-hub/pull/56)** ("Remount design kit to packages/design-kit"), base `main` (tip `f421e46`, PR #55 merged), head `e9e4275` on `cursor/design-kit-remount`. PR is **OPEN, mergeStateStatus=CLEAN, mergeable=MERGEABLE**, 49 files changed (+89/-2318), with a Netlify deploy-preview (`deploy-preview-56--life-hub2`) whose header/redirect/pages-changed checks are `NEUTRAL` and `netlify/life-hub2/deploy-preview` = `SUCCESS`.
  - Repo-root `design-kit/` (34 files: AGENTS.md, tokens.css, rail.css, icons/, js/, snippets/) deleted outright.
  - `scripts/prepare-web.mjs` — both `copyDesignKitStyles()` and `copyDesignKitModules()` now source from `packages/design-kit/` and publish to `dist/packages/design-kit/`.
  - `index.html` and `service-worker.js` (`PRECACHE_URLS`, `CACHE_NAME` bumped `v115`→`v116`) reference `packages/design-kit/*` only.
  - Two app-code import fixes required by the move: `js/app/render-medical.js` and `js/core/time.js` update a relative import from `../../design-kit/js/...` to `../../packages/design-kit/js/...` — mechanical, in scope, not drift.
  - New `tests/unit/design-kit-remount.test.js` (32 lines) asserts root `design-kit/` is gone, `prepare-web.mjs` no longer references it, and `index.html`/`render-medical.js`/`time.js` all resolve to `packages/design-kit/`.
  - `apps/README.md`, `packages/README.md`, `packages/design-kit/README.md` updated to describe the remounted (not "still deferred") state.
  - `plan.md` bumped to v2.6: status banner, Status table (`Kit remount — shipped (this PR)`), Slice 01 "deferred" list has the remount line removed, new "Slice 02" section added, Next-action checkpoint-02 prompt inserted.
  - Independently re-verified rather than trusting the PR body: checked out `origin/cursor/design-kit-remount` into a disposable `git worktree` (main checkout has Adam's unrelated uncommitted work on `cursor/life-protocol-pills-c87b`, left untouched) — `npm ci` → clean; `npm test` → **1596 pass / 0 fail** (matches PR claim exactly); `npm run build` → exit 0, `dist/packages/design-kit/*.css` present, no `dist/design-kit/` anywhere; `dist/index.html` links only `packages/design-kit/*.css`.
  - Grepped the whole tree (excluding `node_modules`/`dist`) for any remaining `design-kit/` reference not under `packages/design-kit/` — only hit is the new test's own string literal describing what it asserts. No drift left behind.
- Drifted: none. The two non-design-kit-directory file touches (`render-medical.js`, `time.js`) are both one-line import-path fixes made necessary by the deletion, not unrelated changes.
- Blocked (correctly, per plan): `apps/life/` move, auth unification, calendar source wiring, Teaching/Knowledge/Tasks fold, `life-hub2` retarget, widgets/proxies migration — none attempted in this slice, matching "Slice 02" scope and the still-open items in `plan.md`.

## Boundary check
- life-hub-data untouched: **yes** — no file in the diff touches `life-hub-data`; the only string occurrences are the pre-existing non-goal line and the checkpoint-02 prompt text in `plan.md`.
- Single Adam session/auth path: **yes** — no diff in `netlify/functions/**`; confirmed via `git diff origin/main...origin/cursor/design-kit-remount -- netlify/` returning empty.
- Public student (or other public) routes: **n/a** — Teaching is not touched in this slice; no public-route code in the diff.
- Secrets / tokens blast radius: **ok** — `git diff origin/main...origin/cursor/design-kit-remount -- netlify.toml` is a **zero-line diff** (confirmed empty), matching PR checklist item "Confirm netlify.toml not in this diff." No env var, `included_files`, or secrets-scan config touched.
- Design kit still single source: **yes — checkpoint-01 Risk 1 is now closed.** Root `design-kit/` no longer exists; `packages/design-kit/` is the only kit tree in the repo, and it is the one actually published (verified in `dist/` above, not just claimed in the PR body).

## Deploy / env
- **Correction to a check I initially got wrong:** I first tried hitting `https://deploy-preview-56--life-hub2.netlify.app/packages/design-kit/tokens.css` expecting 200 — it 404s (so does the old path). This is *expected*, not a defect: `netlify.toml` states plainly "Netlify hosts API Functions only. The site is on GitHub Pages," with `publish = "netlify/public"`. The `life-hub2` Netlify site never serves `dist/`; that's why its deploy-preview checks are `NEUTRAL` (no-op) rather than a real asset-serving test. The actual Pages publish path is `.github/workflows/pages.yml`, which uploads `dist/` (built by `prepare-web.mjs`) via `actions/upload-pages-artifact` — and that workflow file has a **zero-line diff** in this PR. I verified the real claim (Pages will publish `packages/design-kit/`) by running the build locally instead of trusting the Netlify preview URL.
- No env var names, secret strategy, or `SITE_ORIGIN` values changed by this slice.
- PR test-plan has two unchecked boxes: manual sign-in visual check ("confirm glass/tokens still load") and "Confirm `netlify.toml` not in this diff" — I independently confirmed the second (empty diff, see above). The first is a human click-through that automated coverage doesn't fully replace; still open.

## Calendar / cross-domain
- No change in this slice. `js/shell/calendar-sources.js` / `render-calendar-sources.js` from Slice 01 are untouched in this diff.

## Risks
1. **Manual sign-in/visual check still unchecked in PR #56.** `npm test` and `npm run build` are verified (both by the PR and independently here), but nobody has confirmed in a browser that the sign-in card and post-login glass/tokens styling still render correctly from `packages/design-kit/*.css` — a path/casing typo in a `<link>` or CORS-adjacent asset issue wouldn't necessarily fail a build or unit test.
2. **Service-worker cache bump is a single source of truth for the client-side cutover.** `CACHE_NAME` went `v115`→`v116` so old clients holding cached `design-kit/*.css` URLs will fetch-fail once those paths are gone and pick up `v116` on next SW update — expected behavior, but worth Adam confirming a hard-refresh/PWA-reinstall isn't needed for any already-installed client, since this wasn't exercised in an actual browser this checkpoint.
3. **Local `main` on this machine is still behind `origin/main`** (same note as checkpoint-01) and the working tree also has unrelated in-progress, uncommitted work from Adam on `cursor/life-protocol-pills-c87b` — this checkpoint deliberately worked from `origin/main` and `origin/cursor/design-kit-remount` via a disposable `git worktree` rather than the local checkout, and left that uncommitted work untouched. Future checkpoints should keep doing this rather than switching branches in the main checkout.

## Next 3 steps (Cursor only)
1. Do the remaining manual check in PR #56's test plan (sign in locally → confirm sign-in card + post-login glass/tokens render from `packages/design-kit/*.css`, no console 404s for the old `design-kit/` path), check that box, then merge PR #56 into `main` — it's already clean/mergeable, no code changes needed first.
2. After merge, update `plan.md` Status: flip "Kit remount" from "shipped (this PR)" to a merged/dated state (mirroring how checkpoint-01 → PR #55 merge was recorded), and clear the "Next action" banner pointing at this checkpoint.
3. Scope the next slice narrowly from `plan.md`'s remaining deferred list (`apps/life/` move, or auth unification) as its own PR rather than combining either with the other — each should independently keep `life-hub2` deploy-path risk at "none," the pattern both Slice 01 and Slice 02 have held to so far.
