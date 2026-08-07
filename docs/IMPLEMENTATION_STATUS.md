# Implementation Status

## Phase 1: Data Foundation — Complete

Verified on 2026-07-31:

- `npm test` (`node --test`): 64 tests, 64 passed, 0 failed.
- `npm run validate:fixtures` (`node scripts/validate-fixtures.mjs`):
  `{"files":4,"valid":4,"invalid":0,"home":{"calories":1130,"protein_g":80,"fat_g":27,"day_type":"workout_30","workout_streak":1}}`
- Exact `js-yaml` 4.3.0 is installed and `npm audit` reports 0 vulnerabilities.

Production providers are intentionally disconnected.

## Phase 2: Read-only Home PWA — Complete

Verified on 2026-08-01:

- The Home view renders the approved fixture values through the production core modules: 1,130 calories, 80 g protein, 27 g fat, a 30-minute workout, workout streak 1, and 3 of 5 logging categories complete.
- The semantic Clinical Glass shell provides desktop rail navigation and a 390 px mobile bottom bar without horizontal overflow.
- The application manifest and local raster icons support installation; the service worker keeps the shell and last successful fixture view readable offline.
- `npm test`: 78 unit and integration tests passed, 0 failed.
- `npm run test:browser`: 3 browser acceptance tests passed at desktop and 390 px, including cached offline reload.
- `npm run validate:fixtures`: 4 valid files, 0 invalid files.

Production providers remain intentionally disconnected.

## Phase 3: Authenticated GitHub Sync — Complete

Verified on 2026-08-01:

- A single-user passphrase gate issues an eight-hour secure session, rejects cross-origin and oversized authentication requests, and declares a Netlify rate limit of five attempts per 60 seconds by IP and domain.
- The browser is served only from an allowlisted `dist/` artifact; repository Markdown, configuration, tests, scripts, dotfiles, and Function source remain outside both the local and Netlify publish roots.
- Same-origin functions expose only allowlisted, date-bounded repository manifests and exact changed blobs. They reject foreign Origin and browser fetch-metadata requests before authentication or provider work. GitHub tokens, passphrase verifiers, session secrets, raw provider errors, and unrestricted repository access never reach browser responses or assets.
- Known session expiry fails closed at the exact deadline online or offline. Explicit logout clears local private state immediately, persists a retry tombstone until the HttpOnly cookie is cleared, and prevents delayed logout from racing a new sign-in.
- Exact-range private snapshots preserve long streaks offline. Invalid-file provenance and warnings survive confirmed unchanged and offline loads; fallback data remains visibly stale and never advances the last-confirmed sync time.
- `npm ci --ignore-scripts`: clean install, 5 packages added and 6 packages audited.
- `npm test`: 195 unit and integration tests passed, 0 failed.
- `npm run test:browser`: 11 Chromium acceptance tests passed, 0 failed, covering the publish allowlist, rejected and successful sign-in, desktop and 390-pixel Home, incremental refresh, durable sign-out, online/offline exact session expiry, deterministic response secret checks, and offline gating.
- `npm run validate:fixtures`: 4 valid files, 0 invalid files; approved Home totals remain 1,130 calories, 80 g protein, 27 g fat, a 30-minute workout, and workout streak 1.
- `npm audit --audit-level=high`: 0 vulnerabilities.
- Tracked-source, generated-asset, test-output, and branch-diff secret scans found no production credential material.

Production credentials remain deliberately absent and providers remain disconnected until deployment review.

## Phase 4: Agent Chat and Write Loop — Complete

Verified on 2026-08-02:

- `npm ci --ignore-scripts`: clean install, 5 packages added and 6 packages audited.
- `npm test`: 257 unit and integration tests passed, 0 failed (includes regression coverage added after final branch review for `chat-controller.js`'s field-edit coercion and write-conflict retry paths).
- `npm run test:browser`: 14 Chromium acceptance tests passed, 0 failed, covering routed chat replies, record-proposal confirmation and discard, and Chat/Home navigation. Two offline Home tests (`offline reload is limited to the authenticated tab before expiry`, `offline logout survives reload and clears the server cookie on reconnect`) initially failed during this phase's verification: `service-worker.js`'s `PRECACHE_URLS` had not been updated for the `chat-api.js`, `chat-controller.js`, and `render-chat.js` modules `main.js` now imports, so the precached shell's module graph failed to resolve offline. Fixed by adding the three modules to `PRECACHE_URLS` and bumping `CACHE_NAME` to `life-hub-shell-v4`; all 14 tests pass cleanly afterward.
- `npm run validate:fixtures`: 4 valid files, 0 invalid files.
- `npm audit --audit-level=high`: 0 vulnerabilities.
- Routing is deterministic per message (not pinned across a whole conversation); Dr Vera Lenz and General Hammond are conversational-only pending a record type for psychology/life-coaching domains.
- Persona system prompts are assembled from `config/agents.yml`, `config/targets.yml`, and the live `central-node.md` Constraints section — not a verbatim migration of Notion-authored agent instructions, which remains a follow-up once Notion access is available.

Production credentials (including `ANTHROPIC_API_KEY`) remain deliberately absent from this repository; local verification against the live Anthropic API uses a gitignored `.env.local`.

## Phase 5: Nutrition/Central Node Shared Infrastructure — Complete

Verified on 2026-08-04, on branch `nutrition-central-node-infra` (not yet merged to `main`):

- `npm test`: 306 unit and integration tests passed, 0 failed (up from the Phase 4 baseline of 287).
- `npm run validate:fixtures`: 4 valid files, 0 invalid files.
- `npm audit --audit-level=high`: 0 vulnerabilities.
- `central-node.md` and `config/agents.yml`'s parsed content now flow through the same manifest+blob sync and private cache Home already uses (`agentsConfig`, `centralNodeMarkdown` on the `loadLiveEvents` result) — no new Netlify function, no new sync cadence, no Anthropic cost impact.
- Markdown-section extraction (`extractConstraints`, `extractTodaysStatus`, `extractCrossAgentCoordination`, `extractRecentAgentActions`, plus new `extractThisWeek`/`extractThisMonth`) moved from a server-only module to `js/core/constraints.js` so the browser can share it with the server.
- A per-agent `agentColour` lookup and a standalone `chat-panel.js` DOM-reparenting module are built and fully tested, but **not yet wired into any UI** — `index.html`, `app-controller.js`, `main.js`, and `service-worker.js` are all untouched by this phase. `js/app/chat-panel.js` requires an `id="chat-view-home"` element that does not exist yet in `index.html`; the next phase must add it.
- `config/agents.yml`'s Hammond entry is confirmed (`#3A3A42`, sourced from his Notion page cover) in this repo's local fixture only — the production `config/agents.yml` lives in the private data repo and still needs the same manual update there.
- No warning is emitted when `config/agents.yml` or `central-node.md` is absent from a sync (unlike `config/targets.yml`'s `missing_targets` warning) — harmless today since nothing renders these fields yet, but the next phase should design explicitly for `agentsConfig`/`centralNodeMarkdown` being `null` on first load or GitHub outage.

Full design: `docs/superpowers/specs/2026-08-03-nutrition-central-node-design.md`. Full plan: `docs/superpowers/plans/2026-08-03-nutrition-central-node-infrastructure.md`.

## Phase 6: Nutrition Tab — Complete

Verified on 2026-08-04, on branch `nutrition-tab` (not yet merged to `main`):

- `npm test`: 324 unit and integration tests passed, 0 failed (up from the Phase 5 baseline of 306).
- `npm run validate:fixtures`: 4 valid files, 0 invalid files.
- `npm audit --audit-level=high`: 0 vulnerabilities.
- `npm run test:browser`: 16 Chromium acceptance tests passed, 0 failed (14 from Phase 4/5's Home and Chat coverage plus 2 new, covering the Nutrition dashboard rendering real fixture values and the floating chat button opening the shared panel themed in Brisket's colour).
- Built `nutrition-model.js`/`render-nutrition.js` as a second model/render pair fed from Home's already-loaded `events`/`targetsConfig` (no new fetch), plus a hand-rolled SVG line-chart geometry builder (`nutrition-charts.js`) to keep the app's zero-runtime-dependency, offline-safe architecture intact. Wired Phase 5's previously-unused `chat-panel.js`/`agent-colour.js` building blocks into real markup for the first time — the embedded chat panel opens themed in Brisket's colour and defaults to him when nothing else is already sticky.
- **Deviation from the design spec's mockup (intentional):** the 7-day protein trend chart drops the dashed target-line overlay described in the spec. `getDayTargets` returns a day-type-dependent protein target, so a single flat dashed line across a 7-day span spanning mixed day types would misrepresent the actual target on several of those days. The separate hit/miss strip and 30-day heatmap carry per-day target-consistency instead. Relevant for whoever builds the Central Node tab next, since it reuses this same trend-chart component.
- A real regression surfaced during this phase's own browser-test verification (not present on `main`): `nutrition-model.js` newly imports `js/core/trends.js`, a pre-existing core module nothing on `main` had imported directly, so it had never been added to `service-worker.js`'s precache list. Invisible on a normal online load (the browser just fetches it), but it broke the entire ES module graph on an offline reload once made a live dependency. Root-caused via direct reproduction (not guesswork) and fixed by adding it to `SHELL_FILES` and bumping `CACHE_NAME` to `life-hub-shell-v16`; all 16 browser tests pass cleanly afterward. A full independent trace of `main.js`'s transitive import graph against `SHELL_FILES` during the branch's final review found no further gaps.
- Known v1 simplification, unchanged from the plan: the chat panel is reparented into `#nutrition-dashboard` itself as its slot, so navigating away from Nutrition visually hides an open panel along with the section it's nested in (the conversation itself is unaffected; reopening from Nutrition shows the same ongoing exchange). The panel does not yet float over other tabs.

Full design: `docs/superpowers/specs/2026-08-03-nutrition-central-node-design.md` (see the dashed-target-line note added there). Full plan: `docs/superpowers/plans/2026-08-04-nutrition-tab.md`.

## Phase 7: Central Node Tab — Complete

Verified on 2026-08-04, on branch `central-node-tab` (not yet merged to `main`):

- `npm test`: 349 unit and integration tests passed, 0 failed (up from the Phase 6 baseline of 324).
- `npm run validate:fixtures`: 4 valid files, 0 invalid files.
- `npm audit --audit-level=high`: 0 vulnerabilities.
- `npm run test:browser`: 18 Chromium acceptance tests passed, 0 failed (16 from Phase 4-6's Home, Chat, and Nutrition coverage plus 2 new, covering the Central Node dashboard rendering real fixture values and the floating chat button opening the shared panel themed in Hammond's colour).
- Built `central-node-model.js`/`render-central-node.js` as a third model/render pair fed from Home's already-loaded `events`/`targetsConfig`/`centralNodeMarkdown`/`agentsConfig` (no new fetch), plus a small SVG donut-ring geometry builder (`central-node-charts.js`) for the one genuinely new chart shape. Everything else — the week sparkline and all three 30-day heatmaps — reuses Nutrition's existing `buildProteinLineChart` and `.heatmap-tile` components directly rather than duplicating chart code. Added `extractLongTermTrends` to `js/core/constraints.js`, the one Central Node section that module didn't already cover.
- **Deviations from the design spec's mockup (intentional, documented in the plan before implementation):** all seven card bodies render through `renderInlineMarkdown` (not just Constraints), so `**bold**` markers actually render instead of showing literal asterisks; the Long-Term Trends section renders as one shared caption above both its heatmaps rather than two separately-parsed captions "under each"; the This Month logging-density heatmap and the two Long-Term Trends heatmaps all reuse the existing binary `heatmap-tile[data-hit]` component rather than the mockup's colour-intensity gradient.
- **A real backward-compatibility bug was caught and fixed before it ever reached `main`:** extending `render-chat.js`'s `renderInlineMarkdown` with multi-line/bullet-list support initially rested on a claim — restated from the plan — that `chat-controller.js` never passes it text containing embedded `\n` characters. A spec-compliance review disproved this by reading `chat-controller.js`'s actual paragraph-splitting logic (`PARAGRAPH_BREAK = /\n{2,}/` only splits on *double*-or-more newlines, so a single streamed paragraph can still contain single `\n`s, e.g. one list item per line) and demonstrated the new multi-line branch really could fire on live chat bubbles. Fixed by making multi-line parsing an explicit `{ multiline: true }` opt-in — with no options passed, the function is now provably byte-for-byte identical to its pre-change form regardless of what's in the text, so every existing chat call site is unaffected without needing to reason about what real model output might contain. The same fix also corrected a genuine bug: a blank line between two bullet points was splitting one list into two.
- Applying Phase 6's lesson directly: `central-node-model.js` newly imports `js/core/constraints.js` client-side for the first time (previously server-only, like `js/core/trends.js` was for Nutrition). This time the service-worker precache task was written with the full dependency-graph check built in up front, and a dedicated review independently re-walked every transitive import (including second-order imports of already-precached files) before merge — zero precache gaps found, no offline-reload regression.

Full design: `docs/superpowers/specs/2026-08-03-nutrition-central-node-design.md`. Full plan: `docs/superpowers/plans/2026-08-04-central-node-tab.md`.

## Phase 8: Soft-Medical Charts & Dashboard Density — Complete

Verified on 2026-08-04, on branch `soft-medical-charts` (local only — do not push unless asked):

- `npm test`: 360 unit and integration tests passed, 0 failed.
- `npm run test:browser`: 18 Chromium acceptance tests passed, 0 failed.
- Shared `js/app/chart-kit/` (ring, area-line, columns, animate, apply-ring) powers Home macro rings, Nutrition six macro rings + maximal monitor charts, and Central Node completion/week charts.
- Protein trend and Central Node week sparkline no longer render an end-circle marker; area charts fill-on-load (respecting `prefers-reduced-motion`).
- Central Node Today’s Status is a hybrid live checklist/snapshot + agent prose panel.
- **Deferred:** Brisket/persona confirm rewriting Today’s Status prose in `central-node.md` (meal file writes already work; live Status side updates from events).

Full design: `docs/superpowers/specs/2026-08-04-soft-medical-charts-design.md`. Full plan: `docs/superpowers/plans/2026-08-04-soft-medical-charts.md`.

## Phase 9: Central Node write-on-confirm — Complete

Verified on 2026-08-04, on branch `central-node-log-writes` (local only — do not push unless asked):

- Confirming a chat log still writes the canonical event file, then best-effort syncs `central-node.md`.
- Meal confirms (Brisket) append Recent Agent Actions **and** refresh Today's Status with dated heading + **Nutrition** totals (sums same-day sibling meals when present in the tree).
- Workout / diary / weight / skincare confirms refresh the matching Status field and Recent Actions.
- Pure markdown transforms live in `js/core/central-node-write.js` (unit-tested); `chat-confirm.mjs` wires GitHub read/write.
- Confirm still succeeds if the Central Node sync fails after the record write.

Full helpers: `js/core/central-node-write.js`. Confirm path: `netlify/functions/chat-confirm.mjs`.

## Phase 10: Fitness Tab — Complete

Verified on 2026-08-05, on branch `fitness-tab` (local only — do not push unless asked):

- Fitness dashboard: streak strip, session hero (today completed → today planned → last completed), 7-day volume columns, focus hits, vs-last / e1RM PRs (Epley), 30-day consistency heatmap.
- Floating Chadwick chat themed `#2E7BD6`; default agent on Fitness is `chadwick`.
- Completed workout confirms append an idempotent Chadwick→Brisket Day Type line under Cross-Agent Coordination.
- Soft-medical visual language + `chart-kit` columns; shell cache bumped to `life-hub-shell-v19`.

Full design: `docs/superpowers/specs/2026-08-04-fitness-tab-design.md`. Full plan: `docs/superpowers/plans/2026-08-05-fitness-tab.md`.

## Phase 11: Chadwick Protocol + Rich Workout Schema — Complete

Verified on 2026-08-05, on branch `chadwick-protocol-schema` (local only — do not push unless asked):

- `config/chadwick-protocol.md` injected into Chadwick prompts (voice stays in `agent-directory.mjs`).
- Rich workout schema: required `title` / `session_kind`; per-set `cable_type`; optional bench angle, duration, HR, calories, distance; kind-aware validation.
- Planned + completed Life Hub writes (no mid-session); workout templates under `data/fitness/templates/` create/overwrite on completed confirm only.
- Central Node: read before design; on finish keep Status + Recent Actions + Day Type writes.
- Fitness hero and chat confirm cards show weight×reps, cable type, and bench angle (shared `format-exercise.js`).
- Shell cache bumped to `life-hub-shell-v20`.
- **Slice 2 (next):** Exercise Library import/search.

Full design: `docs/superpowers/specs/2026-08-05-chadwick-protocol-schema-design.md`. Full plan: `docs/superpowers/plans/2026-08-05-chadwick-protocol-schema.md`.

## Phase 12: Chadwick Exercise Library (Slice 2) — Complete

Verified on 2026-08-05, on branch `exercise-library` (local only — do not push unless asked):

- Chat-direct `data/exercise-library.json` (private data repo; not client sync).
- Chadwick prompt highlights (~20: `in_rotation` first, then recent `last_performed`).
- Tools: `search_exercise_library` (tool-result continuation) + `save_exercise_library_entry` (GitHub upsert).
- Import script: `scripts/import-exercise-library.mjs` from Notion CSV (~277–279 moves).
- No Fitness library UI; workout confirm does not mutate the library.
- Seed production by importing into the private data repo when ready.

Full design: `docs/superpowers/specs/2026-08-05-exercise-library-design.md`. Full plan: `docs/superpowers/plans/2026-08-05-exercise-library.md`.

## Phase 13: Planned workout on Fitness — Complete

Verified on 2026-08-05 (local only — do not push unless asked):

- Chadwick may propose `status: planned` when Adam asks to build today’s session; confirm lands it on Fitness.
- Hero order: today completed → today planned → last completed; empty copy asks Chadwick to plan.
- Rail footer shows live sync / offline cache (no hardcoded “Fixture mode”).
- Shell cache bumped to `life-hub-shell-v22`.

Full design: `docs/superpowers/specs/2026-08-05-planned-workout-fitness-design.md`.

## Phase 14: Bug pack (CN / refresh / chat / accents / week chart) — Complete

Verified on 2026-08-05 (local only — do not push unless asked):

- Seeded `central-node.md` into private data repo; confirm creates it from app seed if missing.
- Manual refresh always advances Last synced (with seconds) and status copy on confirmed fetch.
- Chat shows “On it…” until real stream content; bubbles use `--agent-accent` from `agents.yml`.
- Central Node week chart labelled **Protein this week** with label gutter / meet aspect ratio.
- Shell cache bumped to `life-hub-shell-v23`.

Full design: `docs/superpowers/specs/2026-08-05-bug-pack-cn-refresh-chat-design.md`.

## Phase 15: Editable Fitness session (core logger) — Complete

Verified on 2026-08-05 (local only — do not push unless asked):

- Today’s `planned` hero is an editable StrengthLog-style logger (sets, cable, bench, notes, timer).
- Local-first draft in `localStorage`; debounced planned autosave (~45s / tab hide) via confirm overwrite.
- Finish CTA (“Pump finished” / “Session finished”) writes `completed`; Chadwick chat finish still works.
- Shell cache bumped to `life-hub-shell-v24`.

Full design: `docs/superpowers/specs/2026-08-05-editable-fitness-session-design.md`.

## Phase 16: Skincare tab + Hyaluronica — Complete

Verified on 2026-08-05 (local only — do not push unless asked):

- Skincare dashboard with AM + PM one-tap cards (preloaded routines, toner/seal toggles, extras, note chips).
- Direct confirm save via Hyaluronica slug; Other/procedure card for laser/clinic-style logs.
- `config/skincare-routines.yml` + client data module; `config/hyaluronica-protocol.md` injected into Hyaluronica prompts.
- Shell cache bumped to `life-hub-shell-v25`.

Full design: `docs/superpowers/specs/2026-08-05-skincare-tab-design.md`.

## Phase 17: Calendar tab (read-only) — Complete

Verified on 2026-08-05 (local only — do not push unless asked):

- Calendar nav opens week strip + month grid over existing events (`buildCalendarMarkers`).
- Tap a day for event detail list; prev/next month; no writes / search / appointments in v1.
- Shell cache bumped to `life-hub-shell-v26` (motion polish later bumped shell further).

Full design: `docs/superpowers/specs/2026-08-05-calendar-tab-design.md`.

## Phase 18: Body tab (Scale · Composition · Tape) — Complete

Verified on 2026-08-05 (local only — do not push unless asked):

- Stacked Scale / Composition / Tape with Weekly · Monthly · 6M ranges.
- Line charts, primary range growth %, secondary vs-previous trend arrows.
- Quick-log fields via direct confirm; floating Dr Sara Tonin chat.
- Shell cache bumped to `life-hub-shell-v28`.

Full design: `docs/superpowers/specs/2026-08-05-body-tab-design.md`.

## Phase 19: Mind tab + chat avatars — Complete

Verified on 2026-08-05 (local only — do not push unless asked):

- Mind dashboard: mood score line, entries-by-mood columns, recurring themes; Weekly/Monthly/6M.
- Penelope + Vera protocols injected; Mind opens chat pinned to either.
- Global avatar rail (Brisket→Sara); click pins sticky agent; assistant bubbles show avatar.
- Shell cache bumped to `life-hub-shell-v29`.

Full design: `docs/superpowers/specs/2026-08-05-mind-tab-avatars-design.md`.

## Phase 20: Fitness muscle maps + template library — Complete

Verified on 2026-08-07 (local only — do not push unless asked):

- Muscle highlight assets under `assets/fitness/muscles/` with client resolver (`muscle-maps.js`) using exercise-library fine tokens + coarse focus fallback.
- Authenticated `GET /api/fitness/templates` returns templates + compact library index (templates stay out of dated event manifest).
- Fitness hero shows icon-strip maps; horizontal Templates rail under hero; detail sheet with **Use today** → planned confirm via existing chat-confirm path.
- Shell cache bumped to `life-hub-shell-v41`.
- Standing product rule: no Notion sync.

Full design: `docs/superpowers/specs/2026-08-07-fitness-muscle-maps-templates-design.md`.

## Next Phase: sleep·heart on Body / polish
