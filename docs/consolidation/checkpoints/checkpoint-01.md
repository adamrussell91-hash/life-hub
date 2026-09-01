# Checkpoint 01 — 2026-09-01

## Verdict
PASS

## Diff vs plan
- Done: Slice 01 as described in `plan.md` ("what shipped") matches the actual diff exactly. Verified `git diff origin/main...origin/cursor/umbrella-seed-slice-01` (47 files, +2482/-15) against **GitHub PR [#55](https://github.com/adamrussell91-hash/life-hub/pull/55)** ("Umbrella seed: freeze design-kit and stub shared calendar sources"), which is **OPEN, mergeStateStatus=CLEAN, mergeable=MERGEABLE**, base `main`, with a green Netlify deploy-preview (`deploy-preview-55--life-hub2`) and no failing checks.
  - `packages/design-kit/` — frozen copy of repo-root `design-kit/` (AGENTS.md, tokens.css, rail.css, icons, snippets, etc.) — new, unwired.
  - `apps/README.md` — documents why `apps/life/` is deferred.
  - `js/shell/calendar-sources.js` (empty `CALENDAR_SOURCES` registry) + `js/shell/render-calendar-sources.js`, wired into `js/app/render-calendar.js` and a new `#calendar-source-registry` placeholder card in `index.html`.
  - `plan.md` bumped to v2.5, Status table updated, Next action points at this checkpoint.
  - Independently re-ran verification rather than trusting the PR body: `npm test` → **1593 pass / 0 fail** (matches PR claim exactly); `npm run build` (`scripts/prepare-web.mjs`) → exit 0, and `dist/index.html` still links `design-kit/*.css` (root kit), not `packages/design-kit` — confirms Pages build is untouched by the freeze.
- Drifted: none inside the Slice 01 diff itself. One process note: comparing against **local** `main` (stale, behind `origin/main` by normal fetch lag) initially showed ~250 unrelated files — that's pre-existing history not yet on `main`, not something this slice touched. The correct base for this PR is `origin/main` (tip `91ffd1d`, i.e. PR #54 merged), and against that base the diff is clean and scoped.
- Blocked (correctly, per plan): kit remount, `apps/life/` move, auth unification, calendar source wiring, Teaching/Knowledge/Tasks fold, `life-hub2` retarget, widgets/proxies migration — none attempted in this slice, matching "Slice 01 — deferred" in `plan.md`.

## Boundary check
- life-hub-data untouched: **yes** — no file in the diff touches `life-hub-data`; the only occurrences of the string are the existing non-goal line in `plan.md` and the new checkpoint-01 prompt text.
- Single Adam session/auth path: **yes** — no changes to `netlify/functions/session.mjs`, `netlify/functions/_shared/auth-security.mjs`, or any env var name/value. `netlify.toml` has a **zero-line diff** against `origin/main` — confirmed empty.
- Public student (or other public) routes: **n/a** — Teaching is not touched in this slice; no public-route code exists in the diff.
- Secrets / tokens blast radius: **ok** — no `netlify.toml`, function, or env changes; PR's own checklist item "Netlify function paths unchanged" is consistent with the diff.
- Design kit still single source: **yes, with a tracked interim caveat** — `plan.md` and the PR body both explicitly call out that this is a deliberate **temporary dual-copy** state: root `design-kit/` remains the live Pages source (confirmed via build output above), `packages/design-kit/` is a frozen, currently-unreferenced snapshot. This is documented, not accidental, but see Risk 1.

## Deploy / env
- Netlify: PR #55 triggered a `life-hub2` deploy preview; header/redirect/pages-changed checks all `NEUTRAL` (no-op, expected for a non-deploy-config change), `netlify/life-hub2/deploy-preview` = `SUCCESS`.
- `plan.md` Deploy inventory is now **filled** with real Netlify site IDs/URLs (was "AWAITING ADAM" as of checkpoint-00b) — good state improvement, not part of this slice's code but worth noting as resolved since last checkpoint.
- No env var names, secret strategy, or `SITE_ORIGIN` values changed by this slice.

## Calendar / cross-domain
- Progress: **partial**, as intended. Empty `CALENDAR_SOURCES` registry (`js/shell/calendar-sources.js`) renders a "Shared sources" empty-state card on the Calendar dashboard via `renderCalendarSources()`. No live feeds, no Teaching/Knowledge/Tasks API calls exist in the diff. Life's existing `loadLiveEvents` day/week/month path (`js/app/load-live-events.js`) is not part of this diff — unchanged, confirmed.

## Risks
1. **Dual design-kit copies can silently drift.** Nothing in the repo enforces that `packages/design-kit/` stays byte-identical to root `design-kit/` between now and the remount slice — a future edit to one and not the other would ship inconsistently. Not a defect today (both are currently identical per the freeze commit), just a gap worth closing before it's forgotten.
2. **PR #55's own manual test-plan item is unchecked.** `npm test` and `npm run build` are verified (by both the PR and independently here), but the human click-through ("Sign in locally → Calendar → confirm 'Shared sources' empty card; existing week/month grid still works") is still an open checkbox in the PR body — automated coverage doesn't fully substitute for it before merge.
3. **Local `main` on this machine is stale vs `origin/main`.** Not a slice-01 problem, but flagging so the next diff/review isn't done against the wrong base again (see Diff vs plan note above).

## Next 3 steps (Cursor only)
1. Do the manual click-through in PR #55's test plan (sign in → Calendar → "Shared sources" empty card renders, week/month grid unaffected), check that box, then merge PR #55 into `main` — no code changes needed first, it's already clean/mergeable.
2. After merge, update `plan.md` Status: flip "Umbrella seed" to shipped (non-partial) and remove the now-stale "Waiting on Claude checkpoint-01" line from the v2.5 status banner.
3. Scope the *next* slice narrowly from `plan.md`'s "deferred" list — pick one (e.g. the design-kit remount: stop publishing root `design-kit/`, point `prepare-web.mjs` + JS imports at `packages/design-kit/`) rather than combining it with `apps/life/` move or auth unification in the same PR, to keep each slice's `life-hub2` deploy-path risk at "none" like this one.
