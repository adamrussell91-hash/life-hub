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

## Next Phase: Central Node tab
