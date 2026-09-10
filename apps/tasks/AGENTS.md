# Tasks Hub — Agent Notes

Personal task/project manager. Vite + TypeScript (vanilla DOM, no framework), with Netlify Functions + Blobs for the production API. See `README.md` and `docs/specs/task-project-manager-hub-spec.md` for product detail.

## Cursor Cloud specific instructions

The environment is a static Vite SPA; `npm install` (run by the startup update script) is all the dependency setup needed. Node 22+ is required (`engines.node >= 22`).

### Services / commands

There is a single frontend service. Standard commands live in `package.json`:

- Run (dev): `npm run dev` — Vite dev server on `http://localhost:5175`. It mounts an in-memory **mock API** at `/api/*` (see `scripts/mock-api.ts`, wired via `mockApiPlugin` in `vite.config.ts`) seeded from `fixtures/seed.json`. No Netlify, Blobs, or real backend is needed for local dev.
- Lint / type-check: `npx tsc -p tsconfig.json --noEmit` — there is **no ESLint**; the TypeScript compiler is the only static check (and is the first step of `npm run build`).
- Test: `npm test` (Vitest, `happy-dom`). Unit tests only, under `tests/unit`.
- Build: `npm run build` (`tsc --noEmit` + `vite build` + SPA 404 fallback copy).

### Non-obvious gotchas

- Local and production sign-in passphrase is `tasks-hub-local` (not `teaching-hub-local`). The mock API checks the literal; Netlify checks the hashed secret. The gate blocks all `/api/*` calls until authenticated.
- If Safari still flags `https://tasks-hub.adam-russell.com` as not secure, sign in at `https://tasks-api.adam-russell.com` (same SPA, same-origin Functions, valid Netlify cert).
- If production sign-in says it cannot reach the API, `curl https://tasks-api.adam-russell.com/api/session`. A `503` body `{ "error": "usage_exceeded" }` means the Netlify team is over quota (Teaching API will be down too). Opening the API host will not help. Add credits on `artasks-hub` / the Netlify team, then retry. Local `npm run dev` still signs in against the mock API.
- Mock API state is **in-memory in the Vite dev process**: created/edited tasks reset when the dev server restarts, and are not shared with the real Netlify Blobs store.
- Board, Today, Backlog, and calendar day add/delete update the current view in place. A full remount (“Loading board…”) only happens on first load, project-scope change, or the Refresh icon.
- UI styling comes from the vendored `design-kit/` (Cotton Glass tokens, Teaching density). Per repo convention, read `design-kit/AGENTS.md` before changing hub UI; use existing tokens rather than new colours/type. List search, project scope filters, and view/range pills use `.hub-search`, `.hub-filter`, `.hub-pills` — not `sign-in__input` or `quick-add__select`.
- `.env` values (`TASKS_HUB_PASSPHRASE_HASH`, `SESSION_SECRET`, etc. from `.env.example`) are only needed for the real Netlify Functions / Blobs deployment, not for `npm run dev`.
- Network **Look with judgment** calls Haiku (`claude-haiku-4-5`) with a compact digest via `POST /api/stress-flags` `{ action: "intuitive_scan" }`. Production needs `ANTHROPIC_API_KEY` on `artasks-hub`. Local `npm run dev` uses a stub judge when that key is missing so the button still raises flags. A Netlify scheduled function (`intuitive-scan`, no public path — `schedule` cannot share a `path`) runs hourly and no-ops unless the Australia/Sydney hour is 6, 8, 10, 1, 3, or 6. Flags only — it never rewrites tasks.
- Chat agents (**Clare, Hammond, Penelope, Vera**) share one Haiku tool loop via `POST /api/clare` `{ action: "dump", agent_slug, recent_thread }`. Tools: clock, timezone, read/update protocol, search, get task/project (incl. `page_blocks`), inbox, maps, `read_repo_file`. Mutations (confirm cards): task/project/page_blocks/map/repo_file via `{ action: "apply_mutations" }`. Repo writes need `AGENT_REPO_TOKEN` (GitHub Contents write) + optional `AGENT_REPO` / `AGENT_REPO_BRANCH`. Protocol Blobs: `agent_protocols/{slug}`. Prefs: `meta/hub_prefs`. Production needs `ANTHROPIC_API_KEY` on `artasks-hub`; without it Clare falls back to heuristics and network agents say the key is missing.
- Clare **Life Hub context** (optional): with `LIFE_HUB_DATA_TOKEN` on `artasks-hub`, dumps and briefings also pull `central-node.md` from `adamrussell91-hash/life-hub-data` (Contents read-only PAT). Defaults: repo `adamrussell91-hash/life-hub-data`, path `central-node.md`, branch `main`. Absent the token, Clare works as before without whole-life context. Clinical/Constraints sections are stripped in `src/domain/life-context.ts` before anything reaches the model.
- The Programs catalogue lives in git at `fixtures/competitions.json`. That file is the only source. Runtime (mock API, Netlify seed, empty-store backfill) reads the fixture. Never import, sync, or fall back to Notion.
- **Understand Anything graph (keep).** Committed under `.ua/` — interactive codebase map used as a reference for project management, whiteboards, and concept mapping (same family as Maps / Universe / Graph). Do not delete `.ua/knowledge-graph.json`. Do not vendor the plugin into the SPA. How to reopen and what to steal: `docs/understand-anything.md`. Local viewer: `npm run understand:dashboard`. Refresh after large moves: `/understand` (incremental) or `/understand --full`.
