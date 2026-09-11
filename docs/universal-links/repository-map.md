# Universal Links repository map

> Revision note: this replaces the first version of this map after Codex's review (PR #305,
> review id 5176545277, submitted against commit `e6f275d7c3dfa53c381de5b5ca0637b6afc33f0e`).
> That review required exact headings, four required tables this version adds, coverage of
> every path named by the current implementation programme (not a sample), removal of a
> request for Adam to confirm a design choice already settled in the programme, and evidence
> instead of a blanket "environmental" label on baseline failures. This revision does all of
> that and corrects two claims the first version got wrong (see "Baseline verification").

## Source revisions

| Field | Value |
| --- | --- |
| `BASE_SHA` | `9d41dc376e612b679dfb3d36440396eec8e79748` (`origin/main`) |
| `PLAN_SHA` | `ba323c74bffa4fbfa4294703f488fa91032411f9` (`origin/pr-304-plan`, fetched via `git fetch origin pull/304/head:refs/remotes/origin/pr-304-plan`) |
| Architecture baseline ancestry | `git merge-base --is-ancestor 7fd44087e5d88d8e7dff1e224b7d7c278712fcef origin/pr-304-plan` exits `0` — confirmed ancestor |
| Branch | `claude/universal-links-slice-0-repository-map`, created from `BASE_SHA` |
| Inspection date | 2026-09-11 |

Both planning files were read with `git show origin/pr-304-plan:<path>` and are not present on this branch:

- `docs/proposals/comms-hub-people-unification.md` — the PR #304 proposal text.
- `docs/universal-links/implementation-programme.md` — this file's source contract, 1587 lines at `PLAN_SHA` (grew from 1339 lines at the architecture baseline commit; the intervening commits are titled "docs: make Universal Links slice contracts explicit" and "docs: make planning revision retrieval deterministic").

## Build and deployment topology

| Script / command | Defined in | Does | Output | Umbrella mount |
| --- | --- | --- | --- | --- |
| `npm run build` | root `package.json` | `build:apps && node scripts/prepare-web.mjs` | `dist/` | — |
| `npm run build:apps` | root `package.json` | `build:teaching && build:knowledge && build:tasks` (fails fast on first error) | — | — |
| `npm run build:teaching` | root `package.json` | `node scripts/build-spa.mjs teaching` | `apps/teaching/dist/` | `/teaching/` |
| `npm run build:knowledge` | root `package.json` | `node scripts/build-spa.mjs knowledge` | `apps/knowledge/dist/` | `/knowledge/` |
| `npm run build:tasks` | root `package.json` | `node scripts/build-spa.mjs tasks` | `apps/tasks/dist/` | `/tasks/` |
| `node scripts/prepare-web.mjs` | `scripts/prepare-web.mjs` | copies each `apps/<name>/dist/` into `dist/<name>/` for `spaApps = ['teaching', 'knowledge', 'tasks']` (line 9), copies Life's own files/dirs into `dist/` root, copies `packages/design-kit/` into `dist/packages/design-kit/` | `dist/` (Life at root, others nested) | `/` for Life |
| `npm test` | root `package.json` | `node --test tests/unit/*.test.js tests/integration/*.test.js` | — | — |

Evidence-backed findings, not asserted by the programme but relevant to it:

1. `scripts/build-spa.mjs` line 6-9 hardcodes `if (!['teaching', 'knowledge', 'tasks'].includes(name))` — confirms the programme's Professional Hub update item "`scripts/build-spa.mjs` allowed app list" is real and required.
2. `scripts/prepare-web.mjs` line 9 hardcodes `const spaApps = ['teaching', 'knowledge', 'tasks'];` — confirms the matching "`scripts/prepare-web.mjs` SPA list" update item is real and required.
3. `scripts/build-spa.mjs` invokes `npx vite build` directly in each app's directory (line 16-20) rather than that app's own `npm run build`. Each app's own `package.json` "build" script is `vite build && node scripts/copy-spa-fallback.mjs` (`apps/tasks`, `apps/teaching`) or `vite build && cp dist/index.html dist/404.html` (`apps/knowledge`) — none of these three invoke `tsc` directly, and neither does `build-spa.mjs`. **No step in the umbrella build pipeline runs a TypeScript type-check.** This is not asserted false by the programme, but is worth recording because `apps/professional` (Slice 4) is specified as "vanilla TypeScript" — type errors there will not fail `npm run build` unless a check is added.
4. `apps/tasks/AGENTS.md` describes its own lint/type-check step as `npx tsc -p tsconfig.json --noEmit` run manually / by CI, separate from `npm run build`. This is consistent with finding 3, not a contradiction of it.

## Authentication and origin boundary

| Concern | Value | Evidence |
| --- | --- | --- |
| Handler factories | `createOperatorHandler`, `createSessionOriginHandler` | `netlify/functions/_shared/operator-gate.mjs`, read in full |
| Session cookie | `life_hub_session` (`readUmbrellaSessionCookie`) | `operator-gate.mjs` line 8, `_shared/http.mjs` |
| Session verification | `verifySessionToken(cookie, umbrellaSessionSecret(env), now())` | `_shared/auth-security.mjs` |
| Origin validation helper | `guardRequestOrigin(request, env)` → `requireAllowedOrigin` | `_shared/http.mjs` line 47 |
| Passphrase / secret env vars | `LIFE_HUB_PASSPHRASE_HASH`, `SESSION_SECRET` | `operator-gate.mjs`, `docs/consolidation/plan.md` "Auth (step 2)" |
| Function directory | `netlify/functions/` | `netlify.toml` `[functions] directory = "netlify/functions"` |
| Route mapping source | Each function file's own `export const config = { path: '/api/...' }` (Netlify Functions v2 URL config) — **not** a central `_redirects` file or `[[redirects]]` block in `netlify.toml` | Confirmed: `netlify/functions/tasks.mjs` line 23 `export const config = { path: '/api/tasks' };`; `netlify.toml` contains no `redirects` block and no `_redirects` file exists anywhere in the repo |
| Number of authenticated identities | One (the operator, Adam) | `docs/consolidation/plan.md` "One Adam session" invariant; no second passphrase/cookie found anywhere in `netlify/functions/` |

Repository facts item 7-9 ("All private operator APIs use `createOperatorHandler` or `createSessionOriginHandler`"; single passphrase/cookie) are **confirmed**, not contradicted.

## Runtime data ownership

| Domain | Storage technology | Existing adapter path | Status |
| --- | --- | --- | --- |
| Tasks | Netlify Blobs, store `tasks-hub-content` | `netlify/functions/_shared/tasks-blobs.mjs` | confirmed |
| Teaching | Netlify Blobs, store `teaching-hub-content` | `netlify/functions/_shared/teaching-blobs.mjs` | confirmed |
| Knowledge | **Separate private GitHub repository `adamrussell91-hash/knowledge-hub-data`**, accessed through the GitHub Contents API — **not** Netlify Blobs | `netlify/functions/_shared/knowledge-data.mjs`, which sets `DEFAULT_KNOWLEDGE_DATA_REPO = 'adamrussell91-hash/knowledge-hub-data'` (env override `KNOWLEDGE_GITHUB_REPOSITORY`) at line 7-8 | confirmed — this is the "expected correction" the programme asked Slice 0 to verify; it is correct, and this map states it as a plain fact rather than something needing further confirmation |
| Life | Netlify Blobs, own stores (not inventoried — out of programme scope) | not inspected; out of the programme's 28-path inspection list | confirmed (existence only) |
| Person, Organisation (shared identity) | Proposed Netlify Blobs store `universal-link-content` | none | **not implemented** |
| Universal Link, relationship operation journal | Proposed Netlify Blobs store `universal-link-content` | none | **not implemented** |
| Communication, Meeting, Professional Event, Job Application | Proposed Netlify Blobs store `professional-hub-content` | none | **not implemented** |

No SQL database, ORM, Prisma, Drizzle, or Supabase configuration exists anywhere in the repository (repeated grep across the tree; no `.sql` files).

## Current entity and relationship mechanisms

| Mechanism | Current behaviour | Disposition |
| --- | --- | --- |
| Task contexts, `kind: 'person'` | Free-text label on a Task, not an identity reference — no `person_id`-shaped field exists in `apps/tasks/src/schemas/task.ts` or `_shared/task-shape.mjs` | Migrates: programme's Tasks integration section says "Deprecate only free text `contexts[kind='person']` after migration tooling exists" — remains until then |
| Knowledge `connected: string[]` | Each Knowledge page stores its own array of hub-refs, set in `saveKnowledgePage` (`_shared/knowledge-data.mjs`) and mirrored into `manifest.json` | Migrates in Slice 7 |
| `HubRef` (`netlify/functions/_shared/hub-ref.mjs`) | Closed registry `HUB_REF_KINDS = { knowledge:['page'], teaching:['unit'], tasks:['project'], life:['decision'] }`; string refs `hub:kind:id` or bare id for Knowledge pages | Remains as the legacy adapter — the programme explicitly says "Do not extend `hub-ref.mjs` into the new canonical implementation. Treat HubRef as the legacy adapter" |
| Inverse links (`netlify/functions/_shared/inverse-links.mjs`) | `collectInverseLinks` performs a **linear scan** of every Knowledge page's `connected` array to find backlinks to one target — not an indexed lookup | Migrates in Slice 7; this is precisely what Universal Links' indexed `by-source`/`by-target` membership keys replace |
| Teaching student references | **None exist.** Grepped the repo for `Person`, `Organisation`, `Contact`, `StudentReference`; the only `Student*` hit is `apps/teaching/src/student/` — a UI *view mode* for lesson rendering, not a data entity | Out of scope until Slice 8, and blocked until the College approval gate regardless |
| Domain ownership fields (`Task.parent_project_id`, `Task.parent_task_id`, Teaching lesson→unit ownership) | Present and authoritative today | Remains authoritative — Universal Links "does not replace a domain's authoritative ownership, containment, ordering, or integrity relationships" |

## Existing helpers to reuse

| Helper | Path | Reusable for |
| --- | --- | --- |
| `listBlobKeys`, `isIndexKey`, `dedupeRecords` | `netlify/functions/_shared/blobs-list.mjs` | Prefix-listing membership keys under `universal-links/by-source/<hash>/` etc. |
| `getJSON`/`setJSON`/`listJSON`/index-array pattern | `netlify/functions/_shared/tasks-blobs.mjs` | The general Blobs read/write convention. **Deliberate deviation required**: the programme specifies one membership Blob per link rather than a shared `_index` array, specifically so concurrent writers cannot clobber each other's additions — do not copy the `_index` array pattern for Universal Link membership. |
| `coerceStringArray`, `normalizeTaskRecord` | `netlify/functions/_shared/task-shape.mjs` | Small normalization pattern worth mirroring for Person/Organisation/Communication record coercion (Slice 3/5) |
| `parseHubRef`/`formatHubRef` pattern | `netlify/functions/_shared/hub-ref.mjs` | Precedent for `entity-ref.mjs`'s parse/format shape — but per programme rule 7, `entity-ref.mjs` is a **new, separate** implementation, not an extension of this file |
| `createOperatorHandler`/`createSessionOriginHandler` | `netlify/functions/_shared/operator-gate.mjs` | The only auth wrapper every future handler (Slice 2+) must use |
| MiniSearch-backed command palette | `packages/design-kit/js/hub-entity-search.js` | Closest existing analog to the `@` picker (Slice 5) — it is a command-palette search, not a relationship-creation picker, so `entity-picker.js`/`entity-chips.js` are additive, not a replacement |

## Confirmed implementation paths for Slices 1 to 6

Every path named anywhere in the implementation programme, not only the Slice 1-6 sections. Status uses exactly `confirmed`, `moved`, `missing`, or `contradicted`.

### Files named in Slice 0's own inspection list (28 paths) — all `confirmed`

| Path | Status | Note |
| --- | --- | --- |
| `CLAUDE.md` | confirmed | Defines the stress-test and consolidation-overseer roles; does not mention Universal Links |
| `docs/consolidation/plan.md` | confirmed | 579 lines; consolidation is "complete" per its own Status table; no Universal Links content |
| `package.json` | confirmed | Root scripts as tabulated above |
| `netlify.toml` | confirmed | Functions-only Netlify deploy; no redirects block |
| `scripts/build-spa.mjs` | confirmed | Hardcoded 3-app allow-list, see Build topology finding 1 |
| `scripts/prepare-web.mjs` | confirmed | Hardcoded 3-app `spaApps` list, see Build topology finding 2 |
| `packages/design-kit/AGENTS.md` | confirmed | Vanilla CSS/JS design system; no build step; symlinked into each app |
| `packages/hub-switcher.js` | confirmed | Exists; will need a Professional entry in Slice 4 |
| `packages/design-kit/js/hub-entity-search.js` | confirmed | MiniSearch-backed palette search, see Existing helpers |
| `apps/tasks/AGENTS.md` | confirmed | Describes mock API dev flow, Vitest, `tsc --noEmit` as a separate check |
| `apps/tasks/package.json` | confirmed | `"build": "vite build && node scripts/copy-spa-fallback.mjs"` |
| `apps/tasks/src/schemas/task.ts` | confirmed | No `person_id`-shaped field; `contexts[kind='person']` is free text |
| `apps/tasks/src/services/client-api.ts` | confirmed | Exists; Slice 6 target |
| `apps/tasks/src/views/task-editor.ts` | confirmed | Exists; Slice 6 target for the Relationships section |
| `apps/tasks/src/app/main.ts` | confirmed | Exists |
| `apps/knowledge/AGENTS.md` | confirmed | Vite + TS SPA; Vitest; no lint script |
| `apps/knowledge/package.json` | confirmed | `"build": "vite build && cp dist/index.html dist/404.html"` |
| `apps/knowledge/src/domain/hub-ref.ts` | confirmed | Client mirror of `hub-ref.mjs` |
| `apps/knowledge/src/domain/page.ts` | confirmed | Exists |
| `apps/knowledge/src/wiki/connectedHtml.ts` | confirmed | Renders `connected` backlinks client-side |
| `netlify/functions/_shared/operator-gate.mjs` | confirmed | See Authentication table |
| `netlify/functions/_shared/tasks-blobs.mjs` | confirmed | See Existing helpers |
| `netlify/functions/_shared/teaching-blobs.mjs` | confirmed | Same site-id/token fallback pattern as `tasks-blobs.mjs` |
| `netlify/functions/_shared/knowledge-data.mjs` | confirmed | See Runtime data ownership — GitHub Contents API, not Blobs |
| `netlify/functions/_shared/hub-ref.mjs` | confirmed | See Current entity and relationship mechanisms |
| `netlify/functions/_shared/inverse-links.mjs` | confirmed | Linear scan, see above |
| `netlify/functions/tasks.mjs` | confirmed | `export const config = { path: '/api/tasks' }` |
| `tests/integration/tasks-list.test.js` | confirmed | Exists |
| `tests/integration/knowledge-pages.test.js` | confirmed | Exists |
| `tests/unit/hub-ref.test.js` | confirmed | Exists |
| `tests/unit/inverse-links.test.js` | confirmed | Exists |

No genuine `moved` case was found: every existing-repository path the programme names was found exactly where it says. No `contradicted` case was found among these 28 (the "expected correction" about Knowledge storage was correct, not a contradiction of the repository — it would have been a contradiction only if the programme had asserted Blobs, which it does not in this revision).

### Slice 1 files — all `missing` (not on `origin/main`; to be created in Slice 1)

| Path | Note |
| --- | --- |
| `netlify/functions/_shared/entity-ref.mjs` | Create in Slice 1 |
| `netlify/functions/_shared/entity-access.mjs` | Create in Slice 1 |
| `netlify/functions/_shared/entity-resolvers.mjs` | Create in Slice 1 — Task resolution only; Person/Organisation/Communication resolver slots defined but return a named unavailable result |
| `netlify/functions/_shared/relationship-registry.mjs` | Create in Slice 1 — 8 declarations, including `contact` (Task→Person) |
| `netlify/functions/_shared/universal-link-schema.mjs` | Create in Slice 1 — validates existing records; does not generate IDs or timestamps in this slice |
| `netlify/functions/_shared/universal-link-blobs.mjs` | Create in Slice 1 — read-only: no `set`, `setJSON`, `delete`, or index-rebuild exports |
| `netlify/functions/_shared/universal-link-read-repository.mjs` | Create in Slice 1 — see "Planning assertions" for a naming conflict this map found between this file and the unrevised "Canonical write service" section |
| `tests/unit/entity-ref.test.js` | Create in Slice 1 |
| `tests/unit/entity-access.test.js` | Create in Slice 1 |
| `tests/unit/entity-resolvers.test.js` | Create in Slice 1 |
| `tests/unit/relationship-registry.test.js` | Create in Slice 1 |
| `tests/unit/universal-link-schema.test.js` | Create in Slice 1 |
| `tests/unit/universal-link-blobs.test.js` | Create in Slice 1 |
| `tests/unit/universal-link-read-repository.test.js` | Create in Slice 1 |

### Slice 2 files — all `missing`

| Path | Note |
| --- | --- |
| `netlify/functions/_shared/universal-link-repository.mjs` | Per the "Canonical write service" section — adds `createLink`/`endLink`/`suppressLink`/`deleteLink`/`repairOperation`/`rebuildIndexes` on top of Slice 1's read repository; see "Planning assertions" for the naming question this raises |
| `netlify/functions/universal-links.mjs` | Route `/api/universal-links` |
| `netlify/functions/universal-links-admin.mjs` | Route `/api/universal-links/admin` |
| `GET /api/relationship-registry` route | Read-only projection of the registry; not yet named to a specific file in the programme |

### Slice 3 files — all `missing`

| Path | Note |
| --- | --- |
| `netlify/functions/_shared/identity-schema.mjs` | Person/Organisation validation, self-identity rules |
| `netlify/functions/_shared/entity-lifecycle.mjs` | Not tied to a specific slice number in the programme's own slice list, but Slice 3's acceptance path (archive Person, self-identity refuses archive) requires it |
| `netlify/functions/entities.mjs` | Route `/api/entities` |
| `netlify/functions/entity-search.mjs` | Route `/api/entities/search` |
| `netlify/functions/entity-overview.mjs` | Route `/api/entities/overview` — the API **handler** (distinct from the `_shared` assembler below) |

### Slice 4 files

`apps/professional/**` (whole new SPA) — all `missing`: `AGENTS.md`, `README.md`, `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `src/app/main.ts`, `src/api/client.ts`, `src/api/config.ts`, `src/auth/gate.ts`, `src/domain/types.ts`, `src/shell/shell.ts`, `src/views/people.ts`, `src/views/person-page.ts`, `src/views/organisations.ts`, `src/views/organisation-page.ts`, `src/views/communications.ts`, `src/views/communication-editor.ts`, `src/components/entity-picker.ts`, `src/components/relationship-timeline.ts`, `src/styles/hub.css`, `tests/unit/`.

Integration touch points named for Slice 4 — all `confirmed` (they exist today and need editing, not creating):

| Path | Required edit |
| --- | --- |
| `package.json` | add `build:professional`, include in `build:apps` |
| `scripts/build-spa.mjs` | add `'professional'` to the allow-list |
| `scripts/prepare-web.mjs` | add `'professional'` to `spaApps` |
| `scripts/pages-spa-fallback.html` | add Professional route recognition |
| `packages/hub-switcher.js` | add Professional entry |
| `apps/life/js/shell/hub-sections.js` | add Professional section |
| `apps/life/index.html` | add Professional to the hub row |
| `tests/unit/apps-spa-remount.test.js` | extend for Professional |

### Slice 5 files — all `missing`

| Path | Note |
| --- | --- |
| `netlify/functions/_shared/professional-blobs.mjs` | Store `professional-hub-content` |
| `netlify/functions/_shared/communication-schema.mjs` | Communication record shape |
| `netlify/functions/communications.mjs` | Route `/api/communications` |
| `packages/design-kit/entity-links.css` | `@` picker styling |
| `packages/design-kit/js/entity-picker.js` | `createEntityPicker` |
| `packages/design-kit/js/entity-chips.js` | Chip rendering |
| `netlify/functions/_shared/entity-overview.mjs` | The **shared assembler** the "Relationship timeline" section asks for — distinct from `netlify/functions/entity-overview.mjs` (Slice 3's handler), which calls it |
| `packages/design-kit/js/relationship-timeline.js` | Shared renderer |
| `packages/design-kit/relationship-timeline.css` | Timeline styling |

### Slice 6 files

| Path | Status | Note |
| --- | --- | --- |
| `apps/tasks/src/schemas/task.ts` | confirmed | Edit — no new field for Person IDs; relationships stay in Universal Links |
| `apps/tasks/src/views/task-editor.ts` | confirmed | Edit — add the Relationships section |
| `apps/tasks/src/views/page-editor.ts` | confirmed | Edit — named in "Tasks integration"'s relevant-files list |
| `apps/tasks/src/services/client-api.ts` | confirmed | Edit — call `/api/universal-links` |
| `netlify/functions/tasks.mjs` | confirmed | Named as a relevant file; the programme does not require changing its own logic, only that Task saves stay on the existing API while links go through the canonical link API separately |
| `netlify/functions/_shared/tasks-blobs.mjs` | confirmed | Named as a relevant file; no change expected — Task storage stays as-is |
| `tests/integration/tasks-list.test.js` | confirmed | Extend for the new Relationships behaviour |

### Later-slice mentions (Slices 7-11) already covered above

Knowledge migration (Slice 7) touches only files already listed as `confirmed` in the Slice 0 inspection group (`hub-ref.mjs`, `inverse-links.mjs`, `knowledge-data.mjs`, `hub-ref.ts`, `connectedHtml.ts`). StudentReference (Slice 8) and later slices name no additional concrete file paths beyond store/route names, which are not file paths and are out of this table's scope.

## Planning assertions which are false, stale or unverified

1. **Stale internal naming conflict (not a repository contradiction — a document self-consistency issue).** The "Canonical write service" section (implementation programme, `PLAN_SHA`, around the "Create: `netlify/functions/_shared/universal-link-repository.mjs`" heading) still names the write-capable module `universal-link-repository.mjs` with a 9-method interface (`createLink`, `getLink`, `listOutgoing`, `listIncoming`, `listForEntity`, `endLink`, `suppressLink`, `deleteLink`, `repairOperation`, `rebuildIndexes`). The newer "Slice 1 exact file contract" section names a *different* file, `universal-link-read-repository.mjs`, exporting `createUniversalLinkReadRepository({ store, resolveEntity })` with only 4 read methods. The document never states whether Slice 2 renames the read repository, wraps it, or the "Canonical write service" section is simply stale. This map follows the more specific, later "Slice 1 exact file contract" section for Slice 1's actual deliverable (`universal-link-read-repository.mjs`) and records `netlify/functions/_shared/universal-link-repository.mjs` separately under Slice 2, per the unrevised section — Slice 2 will need to resolve which name is authoritative, and should say so explicitly in its own PR body rather than silently picking one.
2. **Domain ownership table omission, not falsehood.** The programme's "Domain ownership" table lists Knowledge storage as the private GitHub repo through `_shared/knowledge-data.mjs` (confirmed correct), but does not mention that `docs/consolidation/plan.md` separately tracks a Cloudflare R2 bucket **also named** `knowledge-hub-archive` (binary media, 5,940+ objects) and a since-deleted Netlify site of the same name, both distinct from the GitHub data repo. Nothing in the programme is false here, but Slice 7 (Knowledge migration) will need this distinction and it is not currently written down anywhere in the programme.
3. **No TypeScript type-check currently gates `npm run build`** (see Build and deployment topology finding 3). Not an assertion the programme makes, but worth flagging before `apps/professional` (Slice 4) is built as "vanilla TypeScript" on the assumption that a type error would fail CI — today it would not, in this build pipeline.
4. **Correction of this map's own prior version, not the programme.** PR #305's first version and PR #306 both reported `npm run build` failing on an unresolved package from `packages/design-kit` (`@annotorious/annotorious` in the first Slice 0 report, `photoswipe` in the Slice 1 report) and described it as a "real, pre-existing repository build blocker." Re-investigated this session: `npm install` at the repository root was producing an **incomplete** `node_modules` in this sandbox instance — `js-yaml`, `jsdom`, and `@aws-sdk/client-s3` were absent despite being declared dependencies in root `package.json`, which is also what caused 30 of the 31 previously-reported test failures (see Baseline verification). A clean `npm install` at root, combined with the already-complete per-app installs, makes **both** `npm test` and `npm run build` pass with **zero** failures. There is no confirmed repository build defect. This retracts the "real build blocker" claim from both prior PRs' bodies.

## Baseline verification

Commands run from the repository root, in order, after `git checkout -B claude/universal-links-slice-0-repository-map origin/main`:

1. `npm test` — **initially failed**, exit code `1`, `2575` tests / `2544` pass / `31` fail. Root-caused by running each of the 30 failing suite files individually with `node --test <file>`: 27 failed with `Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'js-yaml'`, 1 with the same for `'jsdom'` (`tests/integration/schedule-diff-product-boundary.test.js`), 1 for `'@aws-sdk/client-s3'` (`tests/unit/cognitive-service.test.js`), and 1 (`browser assets contain no server environment names that reveal values`, inside `tests/unit/dependency-security.test.js`'s suite) with `ENOENT: .../node_modules/js-yaml/dist/js-yaml.mjs`. All three packages are declared dependencies in root `package.json` (`js-yaml@4.3.0`, `@aws-sdk/client-s3@^3.758.0`; `jsdom` appears in `package-lock.json`) but were confirmed absent from `node_modules` on disk (`ls node_modules | grep -E "js-yaml|jsdom"` returned nothing; `ls node_modules/@aws-sdk` had no `client-s3`) despite `node_modules/` otherwise being present and most other tests passing. **Fix applied and verified**: `npm install` at the repository root (`added 362 packages`). **Re-run result**: exit code `0`, `3026` tests, `3026` pass, `0` fail.
2. `npm run build` — **initially failed** at `build:teaching`, exit code non-zero, stage `[vite]: Rollup failed to resolve import "@annotorious/annotorious"` (a root-only dependency) from `packages/design-kit/js/hub-image-annotate.js`, reached only after separately running `npm install` inside `apps/teaching`, `apps/knowledge`, and `apps/tasks` (each app is its own npm package with its own `node_modules`; root `npm install` does not install them). After the root-level `npm install` in step 1 above (which restored `@annotorious/annotorious` along with everything else root `package.json` declares), **re-run result**: exit code `0`. `build:teaching`, `build:knowledge`, and `build:tasks` all completed; `dist/teaching/`, `dist/knowledge/`, `dist/tasks/`, and Life's own root-level `dist/` output were all produced by the same command.
3. `git diff --check` — exit code `0`, no whitespace errors.

No undiagnosed failure remains. Every failure observed in this session traced to one exact, evidenced cause (an incomplete root `node_modules`, fixed by `npm install`) and is not present after the fix. This session did not need to fall back to an "environmental, not investigated further" classification for any test or build failure — none remained unexplained.

## Slice 1 exact file contract

Per the programme's "Required exports" section, restated per file with one sentence each:

| File | Export / test responsibility |
| --- | --- |
| `netlify/functions/_shared/entity-ref.mjs` | Exports `parseEntityRef`, `formatEntityRef`, `assertRegisteredEntityRef`, `hashEntityRef`, and the registered namespace/kind table; round-trips `namespace:kind:id` strings and rejects unregistered pairs. |
| `netlify/functions/_shared/entity-access.mjs` | Exports `createAccessContext`, `isVisibilityAllowed`, `strictestVisibility`, `assertEntityKindAllowed`; `createAccessContext` takes server-supplied `actor`/`workflow` only — no request-body field may set access. |
| `netlify/functions/_shared/relationship-registry.mjs` | Exports the frozen declarations (exactly the 8 listed in the programme, including `contact`), `getRelationshipDeclaration`, `validateRelationshipInput`, `projectRelationshipRegistry`. |
| `netlify/functions/_shared/universal-link-schema.mjs` | Exports `parseUniversalLink`, `validateUniversalLinkRecord`, `equivalenceInput`; validates *existing* records only — does not generate IDs or timestamps in this slice. |
| `netlify/functions/_shared/universal-link-blobs.mjs` | Exports the store name, key builders, membership parser, `defaultGetUniversalLinkStore`; reuses `listBlobKeys` and `_shared/tasks-blobs.mjs`'s `getJSON` convention; exports no `set`, `setJSON`, `delete`, or index-rebuild function. |
| `netlify/functions/_shared/entity-resolvers.mjs` | Defines a resolver registry interface and injectable resolvers; implements Task resolution only against the existing Tasks adapter; defines Person/Organisation/Communication resolver *slots* that return a named unavailable result (their stores do not exist yet) rather than creating empty identity stores. |
| `netlify/functions/_shared/universal-link-read-repository.mjs` | Exports `createUniversalLinkReadRepository({ store, resolveEntity })` with exactly `getLink`, `listOutgoing`, `listIncoming`, `listForEntity` — no write method. |
| `tests/unit/entity-ref.test.js` | Round-trip and rejection tests for `entity-ref.mjs`. |
| `tests/unit/entity-access.test.js` | Access-context derivation and visibility-intersection tests for `entity-access.mjs`. |
| `tests/unit/entity-resolvers.test.js` | Task resolution and unavailable-slot tests for `entity-resolvers.mjs`, with injected fake stores. |
| `tests/unit/relationship-registry.test.js` | Source/target/role/temporal rejection tests for all 8 declarations. |
| `tests/unit/universal-link-schema.test.js` | Record validation tests, including rejecting unknown relationship keys and invalid temporal fields. |
| `tests/unit/universal-link-blobs.test.js` | Key-builder and membership-parsing tests against the exact key layout in the programme's Storage layout section. |
| `tests/unit/universal-link-read-repository.test.js` | Indexed-lookup and non-disclosure tests using the fixture set the programme specifies (visible link, hidden endpoint, missing authoritative link, hash collision, malformed record, duplicate membership, eleven-link batching). |

`apps/professional` and every proposed Netlify Blobs store are marked **not implemented** throughout this map; none of them exist on `origin/main` at `BASE_SHA`.
