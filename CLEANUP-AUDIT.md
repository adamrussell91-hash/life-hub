# Life Hub cleanup audit

**Date:** 17 October 2026
**Status:** audit only. Nothing was deleted, archived, unpublished, or moved.
**Where to start:** this file, at the root of `adamrussell91-hash/life-hub`.

This is a map of every repository on the `adamrussell91-hash` GitHub account, the websites those repos publish, and the private data they read. Each item is marked **keep**, **keep but stranded**, or **candidate**. A candidate is something that looks unused. It is not a deletion order.

Checked against live HTTP responses, Cloudflare Workers and R2, GitHub Actions run history, and the code on `life-hub` `main` (`0852ed85`).

---

## Read this first

The product that is actually running is one website and one API:

| What you open | What it is |
|---|---|
| `https://life-hub.adam-russell.com` | The only app. GitHub Pages for `life-hub`, custom domain. Home, `/teaching/`, `/knowledge/`, `/tasks/`, `/professional/`, `/travel/` all returned 200 on 17 Oct 2026. |
| `https://api.adam-russell.com` | Netlify site `life-hub2`. Functions only. Returned 200. |
| `adamrussell91-hash/life-hub-data` | Private records, Central Node, automations. Still written today. |
| `adamrussell91-hash/knowledge-hub-data` | Private Knowledge pages (4,337 files). Still written by scheduled jobs. |

Everything else is either a redirect, a separate classroom-widget site, a worker that serves one of those, or a repo that still contains source after its website was folded.

Do not archive `knowledge-hub` or `teaching-hub` just because their public hostnames redirect. Both still hold work the umbrella does not.

---

## Every GitHub repository

The account has nine repositories. No others turned up in a full user search.

| Repo | Visibility | Last push | Website today | Verdict |
|---|---|---|---|---|
| `life-hub` | public | 17 Oct 2026 | `life-hub.adam-russell.com` | **Keep.** Umbrella code. |
| `life-hub-data` | private | 17 Oct 2026 | none | **Keep.** Private vault. |
| `knowledge-hub-data` | private | 16 Oct 2026 | none | **Keep.** Knowledge archive. Not a copy of `life-hub-data`. |
| `knowledge-hub` | public | 4 Sep 2026 | hostname redirects to `/knowledge/` | **Keep the Actions.** The site is a stub. Curator and tidy still commit to `knowledge-hub-data` every night. |
| `teaching-hub` | public | 16 Oct 2026 | hostname redirects to `/teaching/` | **Keep until the 16 Oct feature is ported.** Pages publishes only a redirect. The source tree received a real feature that is not in `life-hub`. |
| `widgets` | public | 12 Oct 2026 | `adamrussell91-hash.github.io/widgets/` (200, real page) | **Keep.** Separate classroom site, by decision on 4 Sep 2026. |
| `proxies` | private | 4 Sep 2026 | root 404; functions live | **Keep.** OpenAI proxy for widgets. Root is not a website. |
| `hub-design-kit` | private | 4 Sep 2026 | none | **Candidate to archive.** Design kit now lives at `life-hub/packages/design-kit/`. |
| `Tasks-Hub` | public, **archived** | 4 Sep 2026 | hostname redirects to `/tasks/` | **Candidate to unpublish Pages later.** Already archived. The redirect is the only live thing. |

---

## Websites probed on 17 Oct 2026

| URL | Result | Meaning |
|---|---|---|
| `https://life-hub.adam-russell.com/` | 200, title “Life Hub · Home” | Live app. |
| `…/teaching/`, `…/knowledge/`, `…/tasks/`, `…/professional/`, `…/travel/` | 200, each hub’s own title | All six mounts are deployed. |
| `https://adamrussell91-hash.github.io/life-hub/` | 301 to the custom domain | Same site. |
| `https://teaching-hub.adam-russell.com/` | 200, 594-byte page | JavaScript `location.replace` to `/teaching/` plus the old path. GitHub.com serves it. |
| `https://knowledge-hub.adam-russell.com/` | 200, 600-byte page | Same pattern, to `/knowledge/`. |
| `https://tasks-hub.adam-russell.com/` | 200, 576-byte page | Same pattern, to `/tasks/`. |
| `https://adamrussell91-hash.github.io/teaching-hub/` (and knowledge, Tasks-Hub) | 301 to those custom domains | Pages is still on, publishing the stub. |
| `https://adamrussell91-hash.github.io/widgets/` | 200, “Classroom Widgets — Adam Russell” | Live, and it does not redirect into Life Hub. |
| `https://api.adam-russell.com/` | 200, “Life Hub API” | Placeholder page. The functions are the product. |
| `https://class.adam-russell.com/` and `/s/` | 404, “This page isn't available.” | Worker `class-site` is up (Cloudflare `modified_on` 5 Oct 2026). Root and a bare `/s/` are supposed to be dead. A real lesson slug was not requested. |
| `https://knowledge-tidy.adam-russell.com/` | 401 | Worker `knowledge-hub-research` is up (`modified_on` 3 Oct 2026) and refuses anonymous calls. |
| `https://teaching-api.adam-russell.com/`, `tasks-api`, `knowledge-api` | TLS failed: certificate name does not match | Old Netlify API hosts. Treated as gone. They do not serve the current API. |
| `https://jade-melomakarona-ea20fe.netlify.app/` | 404 | Expected. This site is functions only. |
| `…/.netlify/functions/ai` OPTIONS from `https://evil.example.com` | 403 `Origin not allowed` | Proxy CORS still refuses strangers. |
| `…/.netlify/functions/ai` OPTIONS from `https://adamrussell91-hash.github.io` | 204, allow-origin echoed | Widgets origin still allowed. |

Cloudflare account, same day:

- Workers: `class-site`, `knowledge-hub-research`. No others.
- R2 buckets: `knowledge-hub-archive` only (created 13 Aug 2026). Still the Knowledge binary archive. Do not delete it because the old Netlify project of the same name was deleted.

---

## What the umbrella actually builds

`npm run build` builds five Vite apps and then `scripts/prepare-web.mjs` copies them plus the Life shell:

| Path in the repo | URL | Built? |
|---|---|---|
| `apps/life/` | `/` | Copied as static files. Not a Vite app. |
| `apps/teaching/` | `/teaching/` | Yes |
| `apps/knowledge/` | `/knowledge/` | Yes |
| `apps/tasks/` | `/tasks/` | Yes |
| `apps/professional/` | `/professional/` | Yes, and typechecked |
| `apps/travel/` | `/travel/` | Yes |

`packages/design-kit/` is the only design kit. `apps/*/design-kit` are symlinks to it. There is no second copy inside the umbrella.

The hub switcher (`packages/hub-switcher.js`) lists Life, Teaching, Knowledge, Tasks, and Professional. **Travel is built and linked from Life, and it is not in that switcher.** That is a product gap, not junk. Do not delete Travel to make the switcher true.

GitHub Actions on `life-hub`: `pages.yml` (test, Tasks vitest, build, Pages) and `blocksuite-whiteboard-ci.yml` (pull requests). Knowledge and Teaching vitest are not in that gate.

Netlify (`netlify.toml`) publishes `netlify/public` and deploys `netlify/functions/` (222 handlers). The browser calls `https://api.adam-russell.com`.

---

## Stranded work — do not archive these repos yet

### `teaching-hub` received a feature on 16 Oct 2026 that never reached the live site

Commit `1291705`, merged as pull request 29, message “Add removable Kaplan qualifiers to existing teaching blocks”.

Files added or edited only in `teaching-hub`:

- `src/blocks/kaplan.ts`, `kaplan-editor.ts`, `kaplan-view.ts`
- `src/schemas/kaplan.ts`, `src/styles/kaplan.css`
- edits to `editors.ts`, `render.ts`, `schemas/block.ts`, `lesson-canvas/mount-page.ts`, `app.css`
- `tests/unit/kaplan.test.ts`, `tests/browser/kaplan.spec.ts`

`life-hub` has no `kaplan.ts` and no Kaplan block. The word shows up only in pedagogy notes (Kaplan Depth and Complexity). The Pages workflow for `teaching-hub` deploys the `redirect/` folder, and that deploy succeeded on 16 Oct, so the live hostname stayed a stub. The feature is in git and not on `life-hub.adam-russell.com`.

**Before archiving `teaching-hub`:** port that block into `apps/teaching/`, or explicitly drop it.

The rest of `teaching-hub` (full `src/`, its own `netlify/`, its own `design-kit/`) is the pre-fold app plus this one new commit. Safe to treat as a archive **after** the Kaplan decision.

### `knowledge-hub` Actions are still the nightly writers

The website workflow only copies `redirect/index.html`. These workflows are still active and succeeded through 16 Oct 2026:

| Workflow | Schedule | Last seen success | Writes |
|---|---|---|---|
| Curator | `17 14 * * *` | 16 Oct 2026 | `knowledge-hub-data` (`_curator/`, page links) |
| Tidy notes | `47 14 * * *` | 16 Oct 2026 | `knowledge-hub-data` (`pages/`, `_tidy/state.json`) |

Manual-only, and not on a schedule: retag, tidy backfill, tidy retry, split leftovers, sync manifest, stamp origins. Inspect-tidy-skips is bound to an old cursor branch plus `workflow_dispatch`.

Also still defined, and stale:

| Workflow | Last success | Risk if someone pushes `main` |
|---|---|---|
| Deploy Netlify API | 29 Aug 2026 | Would try to deploy functions at the deleted Knowledge API site. |
| Deploy research Worker | 29 Aug 2026 | The Worker was modified again on 3 Oct 2026 from somewhere else (the umbrella tree `apps/knowledge/worker/`). This workflow can overwrite that with the old repo. |

The umbrella has its own tidy. `netlify/functions/ai-jobs-tick-scheduled.mjs` uses the same cron minute as the Curator (`17 14 * * *`, which is just after midnight in Sydney) and tidies up to 20 pages that are missing from `_tidy/state.json`. It does not run the curator. So tonight both systems can write Knowledge pages: Netlify tidy at 14:17 UTC, GitHub tidy at 14:47 UTC.

**Do not turn either tidy off, and do not archive `knowledge-hub`, until one owner is chosen and the curator script has a home in `life-hub`.**

---

## Keep — runtime

### Code (`life-hub`)

- `apps/life`, `apps/teaching`, `apps/knowledge`, `apps/tasks`, `apps/professional`, `apps/travel`
- `packages/design-kit`, `packages/hub-switcher.js`, `packages/graph-blocks`, `packages/whiteboard`, `packages/alchemy`, `packages/grove-history`, `packages/problem-solver`
- `netlify/functions/**` and `netlify.toml`
- `capabilities/`, `intuition/`, `config/` (agent protocols bundled into functions), public `central-node.md` (structural template only)
- `fixtures/`, `scripts/build-spa.mjs`, `scripts/prepare-web.mjs`, `scripts/pre-pr-check.mjs`, `scripts/mock-api.mjs`
- `workers/class-site/` → `class.adam-russell.com`
- `apps/knowledge/worker/` → `knowledge-tidy.adam-russell.com`, R2 binding `knowledge-hub-archive`
- `tools/grove-previews/`, `tools/voice-lab/`
- Root dependencies that are actually imported: BlockSuite (whiteboard), TipTap (teaching, tasks, knowledge), Uppy (teaching uploads), Annotorious / PhotoSwipe / pdf.js / WaveSurfer / jscanify (design kit and knowledge capture), MapLibre (travel and the places map)

Scheduled Netlify functions (no browser button, still live): watch radar, people-remember, promise nudges, ties infer, garage-home mail scan, Ann teaching forecast, calendar ghosts, career scan, Clare weekly judgment, day sense, AI jobs tick.

### Private data

`life-hub-data` paths the app reads or writes: `central-node.md`, `config/targets.yml`, `config/vera-intake.md`, `config/humanizer/voices/`, `config/automations/` (Cursor jobs, not the website), `data/body`, `calendar`, `challenges`, `fitness`, `food-journal`, `governance`, `hammond`, `home`, `mind`, `nutrition`, `os`, `professional`, `property`, `skincare`, `travel/trips`, `data/knowledge/url-watches.json` (watches only, not the Knowledge wiki), plus root files `almanac-anchors.yml`, `almanac-done.json`, `pending-calendar-ghosts.json`, `calendar-ghost-decisions.jsonl`, `mio-candidates.json`, `mio-wanted.json`, `data/exercise-library.json`, `data/food-library.json`.

`knowledge-hub-data`: `pages/`, `manifest.json`, `studio/books.json`, `_curator/*.json`, `_tidy/state.json`. The README there says attachments stay in R2.

### Separate on purpose

- `widgets` and `proxies` / `jade-melomakarona-ea20fe`. Consolidation plan, 4 Sep 2026: do not fold these onto `life-hub2`. Widgets HTML still calls `/.netlify/functions/ai` and `/.netlify/functions/generate`.
- Teaching’s literary-elements block was copied in from widgets by `apps/teaching/scripts/sync-literary-elements.mjs`. The live block does not fetch the widgets site at runtime.

### Docs that agents still open

`AGENTS.md`, `CLAUDE.md`, `docs/consolidation/`, `docs/STRESS-TEST.md`, `docs/stress-test/`, `docs/CURSOR-UI-FAILURES.md`, `docs/CLARE-TASKS-PA-ASSUMPTIONS.md`, `docs/universal-links/`, `docs/professional-hub/`, `packages/design-kit/AGENTS.md`, each `apps/*/AGENTS.md`.

`docs/future-build-ideas/` is concept notes. Repo rules say those may land on `main` without a pull request. Keep the folder; it is not dead code.

---

## Candidates — look unused

Risk is what breaks if the thing disappears. None of these were removed.

### Inside `life-hub` — low risk once you accept losing the history

| Item | Evidence | Risk |
|---|---|---|
| Root reports: `ECC_FINAL_CONSOLIDATION_IMPLEMENTATION.md`, `ECC_ROUND_1` through `ECC_ROUND_4`, `REPO_MINING_ROUND_A` through `D`, `MATT_POCOCK_SKILLS_AUDIT.md`, `CONVERGENCE_LEDGER_FOR_CURSOR.md`, `OPEN_CAPABILITY_DISCOVERY_CURSOR.md`, `chatgpt-life-hub-diary-30-aug-2026.md` | Not referenced by CI or runtime. Round C is cited from `packages/design-kit/CHART-CATALOG.md`. Together about 460 KB. | Lose the audit trail. Move to `docs/` rather than delete if you still want them. |
| `problem solver/` (space in the name) | Four static HTML prototypes. No imports. The live coach is `packages/problem-solver/`. | Low. |
| `.shot4.mjs` | One-off screenshot script. Not in `package.json`. | Low. |
| `.superpowers/sdd/` | Not in CI. | Low. Confirm nothing local points at it. |
| `apps/README.md` and the root `README.md` “Current slice” | README still describes a Life-only shell and omits Professional and Travel. `apps/README.md` omits both. | Misleading, not unused. Update when you next touch docs. |
| `scripts/sync-to-hubs.sh` | Named in `.cursor/rules/hub-design-kit.mdc` and `docs/consolidation/plan.md`. The file is not in the repo. Kit updates are the symlink. | Fix the docs. There is no script to delete. |
| `apps/teaching/netlify/functions/_shared/*.mts` and teaching tests that import missing `*.mts` handlers | Plan says functions live at repo-root `netlify/functions/`. Teaching vitest is not in Pages CI, so this rot is invisible. | Do not delete root functions. Repoint or drop the stale teaching tests when that suite is next run. |
| 59 remote branches already merged into `main` | `git branch -r --merged origin/main`, excluding `main`. | Low if the branch is truly merged. |
| 392 remote branches **not** merged | 451 extra remotes in total. Many are from 16–17 Oct. | High. Do not bulk-delete. |

### Inside `life-hub` — large, mostly unused bytes

Working tree without `.git` or `node_modules` is about 691 MB. Git pack is about 470 MB.

`assets/kenney/` is 311 MB and 16,274 files. The grove tool `tools/grove-previews/normalise.mjs` reads `kenney_nature-kit` (36 MB). `kenney_cube-pets` and `kenney_mini-forest_1` appear in a city-candidate catalogue. `kenney_car-kit`, `kenney_train-kit`, and `kenney_watercraft-pack` appear only in asset-research notes.

These 21 packs have **no reference** outside `assets/kenney/` itself (about 236 MB):

`kenney_3d-road-tiles`, `kenney_building-kit`, `kenney_cartography-pack`, `kenney_city-kit-commercial_2`, `kenney_city-kit-industrial_2`, `kenney_city-kit-roads`, `kenney_city-kit-suburban_20`, `kenney_coaster-kit`, `kenney_fantasy-town-kit_2`, `kenney_food-kit`, `kenney_furniture-kit`, `kenney_graveyard-kit_5`, `kenney_holiday-kit`, `kenney_mini-characters`, `kenney_mini-skate`, `kenney_modular-buildings`, `kenney_pirate-kit`, `kenney_planets`, `kenney_platformer-kit`, `kenney_racing-kit`, `kenney_road-textures`.

They are CC0 packs, not personal data. A later cleanup can move them to R2. They are not in the Pages site (`prepare-web` does not copy `assets/kenney`).

`apps/knowledge/public/assets/cognitive-protocols/` is about 230 MB of PNGs (94 files, several near 3 MB). `apps/knowledge/src/protocols/view.ts` loads them. They are **in use** and they ship in the Knowledge build. Not junk. They are why the repo feels huge. Compressing or moving them is a performance job, not a deletion.

`docs/proposals/calendar-reference`, `timeline-reference`, `graph-reference`, and `goals-reference` are about 21 MB of reference captures. `scripts/almanac-visual-seed.mjs` reads `docs/proposals/calendar-reference/*.json`. Keep that folder until the seed script is checked. The other three reference folders had no runtime reader in this pass.

### Private data crumbs

| Item | Why it looks unused |
|---|---|
| `life-hub-data/private-migrations/2026-10-15/public-central-node-snapshot.md` | Documented as reference only. Not loaded by the app. Keep until you are sure no historical line is missing from the live Central Node, then it can leave the hot tree. |
| `life-hub-data/data/travel/design/` | Pre-build mock. The app reads `data/travel/trips/`. |
| `life-hub-data/data/professional/import-manifest.json` | Import counts. No runtime reader. |
| `life-hub-data/data/os/tasks-complete-toast-and-check.md` and `.patch` | No code reference. |
| `life-hub-data/data/nutrition/context_notes.md` | No code reference. |
| `life-hub-data/README.md` | Effectively empty. |
| `knowledge-hub-data/_tidy/` files other than `state.json` | Backfill and skip-list bookkeeping for the scripts in `knowledge-hub`. Keep while those workflows exist. |

`life-hub-data` does not contain `data/remember/`, `data/widgets/`, `data/research/`, or `records/`. Code paths name them. They appear on first write. Absence is not junk.

### Old sites and repos that are stubs

| Item | Still doing | Safe later step |
|---|---|---|
| `Tasks-Hub` Pages + `tasks-hub.adam-russell.com` | Redirect only. Repo archived 4 Sep 2026. | Unpublish Pages when old bookmarks are acceptable to break. |
| `teaching-hub` and `knowledge-hub` redirect folders | Redirect only. | Unpublish **after** the stranded-work section above is resolved. |
| `hub-design-kit` | No Pages, no deploy since 4 Sep 2026. Umbrella rule says this remote is retired. | Archive the GitHub repo. Do not copy it back into `packages/design-kit`. |
| Deleted Netlify projects `arteaching-hub`, `artasks-hub`, `knowledge-hub-archive` | Already gone (plan.md, 4 Sep 2026). TLS on the old API hostnames fails. | Nothing to delete. Remove leftover host strings in tests when convenient. |
| `knowledge-hub` workflows `netlify-api.yml` and `deploy-worker.yml` | Not running on a schedule. Last success 29 Aug 2026. | Disable so a drive-by push cannot deploy the old API or clobber the Worker. |

### Inside `widgets` — review, do not assume

The widgets site is live. A path that is not a classroom tool: `Wedding Website/wedding-website.html`. Other top folders (`English/`, `Classroom-Tools/`, `MindWorks/`, `Neuroscience/`) match the public index. Review `Wedding Website/` on its own before any deletion. This audit did not open that file.

---

## Duplicate systems (both live)

| Job | Owner A | Owner B |
|---|---|---|
| Knowledge tidy | `knowledge-hub` Action `tidy.yml`, 14:47 UTC, full script in the old repo | `life-hub` `ai-jobs-tick-scheduled`, 14:17 UTC, 20 pages per run |
| Knowledge curator | `knowledge-hub` Action `curator.yml` only | No umbrella equivalent found |
| Research worker source | `knowledge-hub/.github/workflows/deploy-worker.yml` (stale, 29 Aug) | `life-hub/apps/knowledge/worker/` (Worker modified 3 Oct) |
| Design kit | `life-hub/packages/design-kit/` | `hub-design-kit` repo, frozen 4 Sep |
| Teaching lesson editor | `life-hub/apps/teaching/` (what the website runs) | `teaching-hub/src/` (includes the unported Kaplan block) |

---

## Suggested order, when you do want to clean

1. Decide the Kaplan block: port it into `apps/teaching` or drop it.
2. Move the Knowledge curator (and pick one tidy) into `life-hub`, then disable `knowledge-hub`’s `netlify-api.yml` and `deploy-worker.yml`.
3. Archive `hub-design-kit`.
4. Delete the 59 branches already merged into `life-hub` `main`. Leave the 392 unmerged branches for a separate look.
5. Move the 21 unreferenced Kenney packs out of git (R2 or delete after you confirm the city project will not use them).
6. Shift root audit markdown and `problem solver/` into an archive folder, or delete them once you do not need the history in-repo.
7. Only then unpublish `teaching-hub`, `knowledge-hub`, and `Tasks-Hub` Pages. The custom domains can keep redirecting until bookmarks do not matter.
8. Leave `widgets`, `proxies`, both private data repos, R2 `knowledge-hub-archive`, and both Workers alone.

---

## Stale words this audit did not rewrite

- Root `README.md` still says the build publishes only the Life shell, and that Netlify is a different origin from `github.io`. The live origin is `life-hub.adam-russell.com`, and the build also publishes five hubs.
- `apps/README.md` omits Professional and Travel.
- `packages/README.md` omits alchemy, grove-history, problem-solver, and hub-switcher.
- `docs/consolidation/OVERSEER.md` still lists `teaching-hub`, `knowledge-hub`, `Tasks-Hub`, and `hub-design-kit` as current code repos.
- The API placeholder at `api.adam-russell.com` still says the site is hosted on GitHub Pages, which is true of the app and easy to misread as “the API is on Pages”.

---

## How this was checked

- GitHub repository search `user:adamrussell91-hash` (9 repos).
- `GET` / `HEAD` of the URLs in the table above, 17 Oct 2026.
- Cloudflare `workers_list` and `r2_buckets_list`.
- GitHub Actions run lists for `knowledge-hub`, `teaching-hub`, and `widgets`.
- Workflow YAML on `knowledge-hub` for schedule and data-repo checkout.
- `life-hub` `package.json`, `netlify.toml`, `scripts/build-spa.mjs`, `scripts/prepare-web.mjs`, `packages/hub-switcher.js`.
- Path constants in `netlify/functions/_shared/repo-policy.mjs`, `knowledge-data.mjs`, `knowledge-curator.mjs`, `knowledge-studio.mjs`, `ai-jobs-tick.mjs`.
- Working-tree sizes and a search for each Kenney pack name outside `assets/kenney/`.
- Commit `1291705` file list on `teaching-hub`, then a search for those files in `life-hub`.

Not checked: Netlify function traffic (so this audit does not name individual dead `/api/` routes), a real `class.adam-russell.com/s/<lesson>` URL, or the contents of private notes.
