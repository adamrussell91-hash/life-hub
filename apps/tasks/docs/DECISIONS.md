# Tasks Hub — locked decisions (from sibling hubs + build brief)

Answers to Open Questions in `docs/specs/task-project-manager-hub-spec.md`.

## Persistence

**Netlify Blobs JSON store** named `tasks-hub-content`, same pattern as Teaching Hub (`teaching-hub-content`).

- Life Hub’s GitHub Markdown commits are too slow/conflict-prone for high-write task trees.
- Knowledge Hub’s GitHub/R2 store is read-mostly archive, not a task DB.
- Optional later: scheduled GitHub backup snapshots (Teaching pattern), not write-through GitHub.

## Cross-hub communication

**Server-side HTTP + shared-secret headers** (Knowledge ↔ Teaching pattern). No webhooks exist in the sibling family today.

- Browser never holds cross-hub secrets.
- Session cookies stay hub-local (`tasks_hub_session`).
- Planned secret: `TASKS_HUB_SHARED_SECRET` for machine callers (Teaching/Life/Clare tools) once those call sites exist.
- StressFlag routing writes Blobs records and optionally POSTs to Life Hub when that API exists.
- **Life Hub context (implemented):** Tasks Hub reads `life-hub-data`'s `central-node.md` directly via the GitHub Contents API — same pattern Life Hub itself uses for its own data, not a new shared-secret handshake. `LIFE_HUB_DATA_TOKEN` is a fine-grained PAT scoped only to that repo, read-only. `src/domain/life-context.ts` extracts only Today's Status (minus its Health line), This Week, This Month, and Cross-Agent lines routed to/from Clare — the Constraints & Priorities and health-trajectory sections never leave the parser, by construction, not by prompt instruction. Feature is fully optional: absent the token, Clare runs exactly as before.

## Hosting

| Surface | Host | Hostname |
|---------|------|----------|
| Static SPA | GitHub Pages | `tasks-hub.adam-russell.com` |
| API | Netlify Functions | `tasks-api.adam-russell.com` (site `artasks-hub`, temp `https://artasks-hub.netlify.app`) |

Netlify env (already bootstrapped): `TASKS_HUB_PASSPHRASE_HASH` (SHA-256 of `tasks-hub-local`, Knowledge convention), `SESSION_SECRET`, `SITE_ORIGIN=https://tasks-hub.adam-russell.com`. Pages and `https://tasks-api.adam-russell.com` are always allowed origins. Session cookie is `SameSite=Lax` (same-site subdomains). Auth verifier accepts **both** SHA-256 hex and Teaching-style `scrypt$v1$…`.

Blobs seed: Functions `getTasksStore()` runs `seedIfEmpty` on first touch (`meta/seeded`). Manual: `NETLIFY_SITE_ID` + `NETLIFY_AUTH_TOKEN` → `npm run seed:blobs` (`FORCE_SEED=1` clears the marker).

AI chat: Anthropic via Netlify Functions (Teaching pattern). Spec’s `jade-melomakarona` openai-proxy is **not** present in sibling repos; do not hard-depend on it. Optional OpenAI key only if a later feature needs embeddings/completions.

## Chrome (design-kit)

Canonical copy on `main` (`3d8668f`). Load: Inter → `css/tokens.css` → `overlays.css` → `chrome.css` → `sign-in.css` → hub CSS.

- `html[data-hub="tasks"]` — Teaching clone. See `design-kit/TASKS.md`.
- Board home; Graph / Gantt / stretch Orbit·Branch·Sky; Clare / Network / Corey rail pages.
- Page header: eyebrow → title → supporting → actions.
- Sign-in from `snippets/sign-in.html`.
- Agent writes: propose → **confirm card** → apply.

## Framework Library seed

Ship seed JSON in `fixtures/seed.json` (Eat the Frog, timeboxing, Eisenhower). Editable via Templates UI. Clare calibration grows from accept / actual-duration samples.

## Programs catalogue

**Git file `fixtures/competitions.json` is the source of truth.** 290 rows live in this repo. Dev mock, Netlify seed, and empty-store backfill all read that fixture. Runtime writes (add/edit/delete) go to Blobs / the in-memory mock, same as other hub records.

There is no Notion import, URL, sync, or fallback. Do not add one. The old Notion database is not a source and will be deleted.

## StressFlag routing timing

**Write-on-create** into Blobs (`stress_flags/:id` + agent inbox). Hammond / Penelope / Vera consumers poll or fetch later — no sync fan-out until Life Hub exposes an authenticated inbox.

Rule detectors (overlap, dense pinch, missed deadlines) stay deterministic. A Haiku judgment pass (`pattern_kind: intuitive`) reads a compact digest six times a local day (06:00, 08:00, 10:00, 13:00, 15:00, 18:00 Australia/Sydney) and raises flags only — it never rewrites due dates or priority.

## Reminders

**In-app first** (due-soon / pinch strips on Day and Week). Push / email deferred until a hub-wide notification channel exists.

## Spec open questions — closed

| Question | Decision |
|----------|----------|
| Persistence for higher-write trees | Netlify Blobs `tasks-hub-content` |
| Cross-hub pattern | Server HTTP + shared-secret headers; browser never holds secrets |
| Framework Library home | `fixtures/seed.json` → Blobs; Templates UI for edits |
| StressFlag sync vs batch | Write-on-create; consumers poll |
| Reminder delivery | In-app only for v1 |

**Clare dump authority:** when an Anthropic judge is configured, she reads the raw dump and is authoritative on split/kind/domain/due date. The regex parser is the offline / no-key fallback only. A successful judge response with an empty item list means no cards — do not resurrect heuristic proposals.

## Understand Anything graph

**Keep the committed graph in `.ua/`.** It is a local / agent tool and a design seed for Maps, Universe, Graph, whiteboards, and concept mapping — not a production rail tab.

- Source of truth: `.ua/knowledge-graph.json` + `docs/understand-anything.md`.
- Do not vendor Understand-Anything into the SPA. Do not make Pages or Functions depend on it.
- Do not store the graph in Notion or iCloud. Git only, same as Programs.

Deferred (not blockers): Teaching Day Book feed, Life Hub bloods → CapacitySignal, push/email channel.
