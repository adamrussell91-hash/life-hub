# Universal Links — repository map (Slice 0)

> Status: reconnaissance only. No runtime behaviour changed.
>
> Produced for the PR #304 "Universal Links, unified identity, and Professional Hub" implementation programme
> (`docs/universal-links/implementation-programme.md`, read from `origin/claude/comms-hub-github-integration-g33itw`
> — not yet merged to `main`). This is Slice 0 of that programme: confirm real repository facts before any
> product code exists. Nothing below is a proposal; every claim cites a real file at the SHA below.

## 1. Current `main` SHA

`9d41dc376e612b679dfb3d36440396eec8e79748` (`origin/main`, 2026-09-11 15:44:55 +1000). This branch (`claude/universal-links-slice-0-repository-map`) was created from that commit and contains no other changes.

## 2. Existing app mounts and build process

One GitHub Pages deployment serves four SPAs from one build:

| App | Mount | Source | Notes |
| --- | --- | --- | --- |
| Life | `/` | `apps/life` (plain JS) | Shell, calendar, rail; hosts the hub switcher |
| Teaching | `/teaching/` | `apps/teaching` (Vite + TS) | History router strips `/teaching` |
| Knowledge | `/knowledge/` | `apps/knowledge` (Vite + TS) | |
| Tasks | `/tasks/` | `apps/tasks` (Vite + TS) | |

Confirmed in `docs/consolidation/plan.md` Slice 30 ("Remount Teaching, Knowledge, and Tasks SPAs") and by each app's own `package.json`/`vite.config.ts` existing at the paths above.

Build pipeline (root `package.json`):

```text
npm run build → build:apps (build:teaching && build:knowledge && build:tasks) → scripts/prepare-web.mjs
```

Each `build:<hub>` runs `node scripts/build-spa.mjs <hub>`, which shells into `apps/<hub>` and runs that app's own `vite build`. **Each app is an independent npm package with its own `node_modules`** (own `package.json`, own lockfile) — root `npm install` does **not** install `apps/teaching`, `apps/knowledge`, or `apps/tasks` dependencies. See §9 (baseline build result) for the concrete failure this caused until each app was installed separately.

`scripts/prepare-web.mjs` then copies build output plus `packages/design-kit/` into `dist/`, appends `dist/404.html` for deep-link fallback, and remounts kit CSS/JS/icons under `dist/packages/design-kit/`.

Deployment: root `netlify.toml` — Netlify hosts **Functions only** (`[build] command = "true", publish = "netlify/public"`), the actual SPA is served by GitHub Pages. `directory = "netlify/functions"`, `external_node_modules = ["@netlify/blobs", "@aws-sdk/client-s3", "@aws-sdk/s3-request-presigner"]`. This is the **only** Functions deployment config in the repo — confirms programme fact "Root `netlify.toml` remains the only Functions deployment configuration."

## 3. API, authentication, and storage boundaries

**API**: single Netlify site `life-hub2` (`api.adam-russell.com`), Functions under root `netlify/functions/*.mjs` (ESM, untyped), one file per resource plus a large `_shared/` helper folder. No per-hub Netlify sites remain — `docs/consolidation/plan.md` records `arteaching-hub`, `artasks-hub`, and Netlify `knowledge-hub-archive` all **deleted** 2026-09-04 (Job 6); only `life-hub2` and the unrelated widgets proxy `jade-melomakarona-ea20fe` remain.

**Auth**: one operator, one session.
- `netlify/functions/_shared/operator-gate.mjs` exports `createOperatorHandler` and `createSessionOriginHandler`. Every private handler wraps its logic in one of these.
- `createOperatorHandler` (read in full this session): checks CORS origin (`guardRequestOrigin`), verifies config, reads `readUmbrellaSessionCookie(request)` and verifies it via `verifySessionToken` from `_shared/auth-security.mjs` against `umbrellaSessionSecret(env)`. Returns `401 unauthenticated` if invalid. Optionally loads a Blobs store and 503s (`blobs_unbound`) if unbound.
- Env vars: `LIFE_HUB_PASSPHRASE_HASH`, `SESSION_SECRET`; cookie `life_hub_session`. `docs/consolidation/plan.md` §"Auth (step 2)" and §"Slice 03 — auth lock" confirm these are the **only** retained secrets — no second passphrase, cookie, or auth flow exists. This matches programme fact #7–9 exactly.
- There is **no multi-tenant access model** — `AccessContext` in the programme (§"Authorisation model") would formalise workflow scope on top of this single-operator gate, not replace it.

**Storage — no SQL database, no ORM anywhere in the repo** (confirmed: no `.sql` files, no Prisma/Drizzle/Supabase config). Three storage mechanisms coexist:

| Domain | Mechanism | Store / location | Key helper |
| --- | --- | --- | --- |
| Tasks | Netlify Blobs | `tasks-hub-content` | `netlify/functions/_shared/tasks-blobs.mjs` |
| Teaching | Netlify Blobs | `teaching-hub-content` | `netlify/functions/_shared/teaching-blobs.mjs` |
| Knowledge | GitHub Contents API (commits JSON to a data repo) | `knowledge-hub-data` (via `GITHUB_REPOSITORY`/`GITHUB_TOKEN`) | `netlify/functions/_shared/github-client.mjs`, `_shared/knowledge-data.mjs` |
| Life | Netlify Blobs (own stores) | umbrella site `life-hub2` | not inventoried further — out of programme scope |

Blobs site-id pattern (read `tasks-blobs.mjs` and `teaching-blobs.mjs` in full): each store exports a hardcoded legacy `*_SITE_ID` (from the pre-fold per-hub Netlify site, e.g. Teaching's old `arteaching-hub` = `899b0fd3-53b3-45a0-bbfb-0238264d9246`), an env override (`TEACHING_BLOBS_SITE_ID`/`TASKS_BLOBS_SITE_ID`), and a shared `NETLIFY_BLOBS_TOKEN`. `isUmbrellaBlobsHome(siteID)` returns true when the configured site id is `'local'` or the umbrella site id `5771ee5c-0cb2-4858-b03d-2637f092050e`, in which case the store resolves to a plain store name on the *current* (umbrella) site — no remote site id/token needed. Per `docs/consolidation/plan.md` Slice 29, `TEACHING_BLOBS_SITE_ID`/`TASKS_BLOBS_SITE_ID` are now set to `local` in production, i.e. both stores already live on `life-hub2` itself.

**Conflict/deviation note**: the implementation programme's storage layout (`_shared/universal-link-blobs.mjs`, store `universal-link-content`) does not mention this site-id/token indirection. Because Universal Links, Person/Organisation, and Communication are **new** stores with no pre-fold legacy site, the simplest correct implementation is to open them directly on the umbrella site (`getStore(STORE_NAME)`, no site id/token branching at all) rather than reproducing the legacy-site fallback pattern. Slice 1/2 should confirm this with Adam rather than copying the fallback shape verbatim.

Knowledge's GitHub-as-datastore (`github-client.mjs`) uses SHA-based optimistic concurrency (409 retry) — visibly different from the Blobs stores and orthogonal to Universal Links; Slice 7 (Knowledge migration) is the only slice expected to touch it.

## 4. Current identity and linking mechanisms

No `Person`, `Organisation`, `Contact`, or student data entity exists anywhere in the repo. Grepped repo-wide; the only `Student*` hits are `apps/teaching/src/student/` — a **UI view mode** (student-facing lesson rendering), not a data entity. This is genuinely greenfield.

The one existing cross-hub link mechanism, which the programme's Slice 7 migrates away from:

- **`netlify/functions/_shared/hub-ref.mjs`** (read in full): a closed registry `HUB_REF_KINDS = { knowledge: ['page'], teaching: ['unit'], tasks: ['project'], life: ['decision'] }`. Refs are strings — `hub:kind:id` (e.g. `teaching:unit:unit_x`), or a bare id for Knowledge pages (`page_x`). Exposes `parseHubRef`/`formatHubRef`/`normalizeConnected`/`hrefForHubRef`/`labelForHubRef`. Tests: `tests/unit/hub-ref.test.js`.
- **`netlify/functions/_shared/inverse-links.mjs`** (read in full): computes backlinks by **linear scan** — `collectInverseLinks(entries, targetId)` iterates every Knowledge page's `connected: string[]` array looking for one that points at the target. `collectDecisionBacklinks` does the same, grouped by Life `decision` refs. This is explicitly the brute-force behaviour Universal Links' indexed lookup (`by-source`/`by-target` membership keys) is meant to replace. Tests: `tests/unit/inverse-links.test.js`.
- Each Knowledge page stores its own `connected: string[]` field, set in `saveKnowledgePage` (`_shared/knowledge-data.mjs`) and mirrored into `manifest.json`.
- Client-side mirrors: `apps/knowledge/src/domain/hub-ref.ts`, `apps/knowledge/src/wiki/connectedHtml.ts` (both confirmed present).

Task "contexts" (`kind: 'person'`) are free-text labels, not identity references — confirmed via `apps/tasks/src/schemas/task.ts` and `netlify/functions/_shared/task-shape.mjs`; no `person_id`-shaped field exists.

## 5. Files Slices 1–6 would touch (per the programme's own inventory) — existence check only, no code added

All confirmed **not present** on `main` (expected — this is greenfield):

```text
netlify/functions/_shared/entity-ref.mjs
netlify/functions/_shared/identity-schema.mjs
netlify/functions/_shared/relationship-registry.mjs
netlify/functions/_shared/universal-link-schema.mjs
netlify/functions/_shared/universal-link-blobs.mjs
netlify/functions/_shared/universal-link-repository.mjs
netlify/functions/_shared/entity-resolvers.mjs
netlify/functions/_shared/entity-access.mjs
netlify/functions/_shared/entity-overview.mjs
netlify/functions/_shared/professional-blobs.mjs
netlify/functions/_shared/communication-schema.mjs
netlify/functions/entities.mjs
netlify/functions/entity-search.mjs
netlify/functions/universal-links.mjs
netlify/functions/universal-links-admin.mjs
netlify/functions/entity-overview.mjs
netlify/functions/communications.mjs
apps/professional/**  (whole new app)
packages/design-kit/js/entity-picker.js
packages/design-kit/js/entity-chips.js
packages/design-kit/js/relationship-timeline.js
packages/design-kit/entity-links.css
packages/design-kit/relationship-timeline.css
tests/unit/entity-ref.test.js
tests/unit/relationship-registry.test.js
```

Files the programme says Slice 6 (Tasks integration) will **edit**, all confirmed present on `main` at the exact paths named (verified with a direct existence check this session):

```text
apps/tasks/src/schemas/task.ts
apps/tasks/src/views/task-editor.ts
apps/tasks/src/views/page-editor.ts
apps/tasks/src/services/client-api.ts
netlify/functions/tasks.mjs
netlify/functions/_shared/tasks-blobs.mjs
tests/integration/tasks-list.test.js
```

Files the programme's Professional Hub scaffolding step says to **update** (existence check for the update target, not creation of the new files under it), all confirmed present:

```text
package.json
scripts/build-spa.mjs
scripts/prepare-web.mjs
scripts/pages-spa-fallback.html
packages/hub-switcher.js
apps/life/js/shell/hub-sections.js
apps/life/index.html
tests/unit/apps-spa-remount.test.js
```

## 6. Existing helpers to reuse

- **`_shared/tasks-blobs.mjs`** — `getJSON`/`setJSON`/`listJSON`/`deleteKey` over a Netlify Blobs store, plus a hand-maintained `_index` array key (`readIndex`/`writeIndex`) and `newRecordId(prefix)` (`` `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}` ``). The programme instead specifies **one membership Blob per link** (`universal-links/by-source/<hash>/<link_id>`) rather than a shared index array, specifically to avoid concurrent-writer clobbering — a deliberate deviation from this existing pattern, not an oversight; Slice 1/2 should not copy the `_index` array approach for Universal Links.
- **`_shared/task-shape.mjs`** — `coerceStringArray`, `normalizeTaskRecord`: a small, reusable normalization pattern worth mirroring for Person/Organisation/Communication record coercion.
- **`_shared/hub-ref.mjs`** — parse/format/validate pattern for canonical string refs. The programme explicitly calls this the **legacy adapter**, not to be extended (`entity-ref.mjs` is a new, separate implementation) — confirmed instruction, not a suggestion to reconcile.
- **`_shared/operator-gate.mjs`** — the only auth wrapper; every new handler in Slices 2+ must use `createOperatorHandler`/`createSessionOriginHandler`, not a new gate.
- **`packages/design-kit/AGENTS.md`** — read in full this session. Confirms `js/hub-entity-search.js` (MiniSearch-backed) and `js/hub-command-search.js` as the closest existing analogs to an `@` picker — both are command-palette search, not relationship-creation pickers, so the programme's new `entity-picker.js`/`entity-chips.js` are additive, not a replacement of an existing primitive. Also confirms: vanilla JS/CSS only, no framework, `startHubMotion()` convention, locked rail/mobile/sign-in patterns, and that `packages/design-kit` is the single source consumed by symlink from every hub app — matches programme fact #14 ("New hub interfaces must use `packages/design-kit`").

## 7. Conflicts / deviations found between the programme and current code

1. **Per-app installs are required for `npm run build` to succeed and this is undocumented at the root.** `npm install` at repo root does not install `apps/teaching`, `apps/knowledge`, or `apps/tasks` dependencies (each has its own `package.json`/lockfile, no npm workspaces). A fresh checkout's root build fails immediately with `ERR_MODULE_NOT_FOUND: vite` until each app is installed separately. See §9.
2. **A real build failure exists today, unrelated to Universal Links**: once all three app installs are done, `build:teaching` still fails — Rollup cannot resolve `@annotorious/annotorious` (a **root**-level dependency, used by `packages/design-kit/js/hub-image-annotate.js`) from inside `apps/teaching`'s isolated `node_modules`. This is a pre-existing repository build-topology gap (shared design-kit code depends on a root package that per-app builds can't see), not something introduced by this slice, and not something Slice 0 is scoped to fix. It should be flagged to Adam/Codex as a blocker independent of the Universal Links programme, since it currently blocks a clean `npm run build` from a fresh clone.
3. **`apps/teaching` and `apps/life` have no `AGENTS.md`.** Only `apps/knowledge/AGENTS.md`, `apps/tasks/AGENTS.md`, and `packages/design-kit/AGENTS.md` exist. The programme's Slice 0 instructions say "Read affected app `AGENTS.md` files" — done for the two that exist; the absence of the other two is itself the finding.
4. **Universal Link storage site-id indirection** — see §3's conflict note: the programme doesn't specify whether new stores (`universal-link-content`, `professional-hub-content`) need the legacy `*_SITE_ID`/token fallback that `tasks-blobs.mjs`/`teaching-blobs.mjs` carry for historical reasons. Recommend Slice 1/2 open them directly on the umbrella site with no fallback branching, since there is no legacy site to fall back to.
5. **No divergence found** between the programme's claimed file paths for Slices 1–6 targets and the actual repository — every path listed in §5 as "should exist already" does exist, exactly as named. The programme's authors clearly worked from the real tree.

## 8. Baseline test and build results (this session, on `main` @ `9d41dc376e612b679dfb3d36440396eec8e79748`)

**Root suite** — `npm test` (`node --test tests/unit/*.test.js tests/integration/*.test.js`):

```text
tests 2574
suites 19
pass 2543
fail 31
duration ~14.3s
```

31 pre-existing failures, all in this sandbox environment — sampled failing suites include `tests/unit/load-live-events.test.js`, `tests/unit/medical-validate.test.js`, `tests/integration/chat-function.test.js`, `tests/integration/static-server.test.js`, `tests/unit/dependency-security.test.js`. These read as environment-dependent (missing secrets/external services in this sandbox, e.g. live network calls, `ANTHROPIC_API_KEY`), not something this slice investigated further or fixed — out of scope for Slice 0.

**Root build** — `npm run build`:

- **Fails** with each app's own `node_modules` absent (`ERR_MODULE_NOT_FOUND: vite`) until `npm install` is run inside `apps/teaching`, `apps/knowledge`, and `apps/tasks` individually (all three installed cleanly, no errors, in this session).
- **Still fails** after those installs, at `build:teaching`, with `[vite]: Rollup failed to resolve import "@annotorious/annotorious"` from `packages/design-kit/js/hub-image-annotate.js` — a root-only dependency not visible to the isolated `apps/teaching` install. See §7 item 2.
- `build:knowledge` and `build:tasks` were not reached because `build:apps` short-circuits on the first failure (`&&` chain in `package.json`).

**Per-app test suites** (each app's own Vitest suite, run directly in this session, not part of root `npm test`):

| App | Test files | Tests | Result |
| --- | --- | --- | --- |
| `apps/tasks` | 106 | 723 | 718 pass / 5 fail (4 files) |
| `apps/knowledge` | 159 | 878 | 869 pass / 9 fail (6 files) |
| `apps/teaching` | not run this session | — | has its own `vitest run`/`test:unit`/`test:integration` per no `AGENTS.md`, scripts confirmed in `apps/teaching/package.json` |

Sampled failures were unrelated to anything this slice touches (e.g. `apps/tasks/tests/unit/shell.test.ts` icon-signature uniqueness assertion; `apps/knowledge` a workflow-secret-name assertion against `.github/workflows/*`). Recorded as baseline, not diagnosed further — out of Slice 0's scope.

**Conclusion for Slice 1 planning**: the repository's automated checks have known, pre-existing noise (~1.2% root test failure rate, one real build blocker in Teaching's design-kit import). Slice 1 (server-only, no build target for `apps/professional` yet) is not blocked by the Teaching build issue, but Slice 4 (new Professional SPA) will need it resolved or worked around first.

## 9. Proposed Slice 1 file list (names only — no code in this slice)

Per the programme's own Slice 1 scope ("Shared contracts, registry and read only repository"):

```text
netlify/functions/_shared/entity-ref.mjs
netlify/functions/_shared/relationship-registry.mjs
netlify/functions/_shared/universal-link-schema.mjs
netlify/functions/_shared/universal-link-blobs.mjs
netlify/functions/_shared/entity-resolvers.mjs
netlify/functions/_shared/entity-access.mjs

tests/unit/entity-ref.test.js
tests/unit/relationship-registry.test.js
tests/unit/universal-link-schema.test.js
tests/unit/universal-link-blobs.test.js
tests/unit/entity-resolvers.test.js
tests/unit/entity-access.test.js
```

No handler, no store write path, no Person/Organisation record creation, no `apps/professional`, and no UI — all explicitly deferred by the programme to Slices 2–6.

## 10. Explicitly out of scope for this document

Per the programme's Slice 0 definition and Adam's direct instruction: no runtime code, schema, handler, store, route, or UI was created or edited; `docs/consolidation/**` was read only, not modified; PR #304 was not merged or copied into this branch; no dependency, deployment, or environment variable was changed; no real contact or student data appears anywhere above (none exists in the repo to begin with — confirmed by the grep in §4).
