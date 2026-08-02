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
- `npm test`: 255 unit and integration tests passed, 0 failed.
- `npm run test:browser`: 12 of 14 Chromium acceptance tests passed, covering routed chat replies, record-proposal confirmation and discard, and Chat/Home navigation (all 3 new Chat tests pass). Two pre-existing Home tests — `offline reload is limited to the authenticated tab before expiry` and `offline logout survives reload and clears the server cookie on reconnect` — time out on `context.setOffline()` + service-worker interaction in this sandboxed verification environment. This was reproduced identically running `home.spec.mjs` alone against the pre-Phase-4 branch tip, so it is a pre-existing, environment-specific limitation rather than a regression from this phase's work; it needs verification in a non-sandboxed environment before being considered resolved.
- `npm run validate:fixtures`: 4 valid files, 0 invalid files.
- `npm audit --audit-level=high`: 0 vulnerabilities.
- Routing is deterministic per message (not pinned across a whole conversation); Dr Vera Lenz and General Hammond are conversational-only pending a record type for psychology/life-coaching domains.
- Persona system prompts are assembled from `config/agents.yml`, `config/targets.yml`, and the live `central-node.md` Constraints section — not a verbatim migration of Notion-authored agent instructions, which remains a follow-up once Notion access is available.

Production credentials (including `ANTHROPIC_API_KEY`) remain deliberately absent from this repository; local verification against the live Anthropic API uses a gitignored `.env.local`.

## Next Phase: Day One diary delivery
