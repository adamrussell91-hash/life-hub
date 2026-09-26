# Career page — progress ledger

Branch: `cursor/career-page-build-d77e` (from fresh `main` at `fdab298a`).
Plan: `BUILD-PLAN.md`. Plan wins over mockup.

---

## Phase 0: Ground truth

**Status:** done (2026-09-26)
**Checked:** P2 W1 D3 (partial — see blockers)

### 0.1 Acceptance records

| Need | Finding |
|---|---|
| Gifted education policy (project / goal / task) | **Not found in reachable stores.** No Tasks project/goal/task titled "Gifted Education Policy" in `apps/tasks/fixtures/seed.json`. No matching record under `life-hub-data`. Closest Knowledge pages are NSW/DoE policy notes (e.g. `page_notion_129f794f847680539797e4bb1ee84789` "NSW High Potential and Gifted Education Policy"), not Adam's school policy project. People notes reference Aloysius "Policy & Audit Strategy" meetings (Nina Radice, Feb 2025) — strong signal the project lives in **production Tasks Blobs**, which this environment cannot read (`tasks-api.adam-russell.com` unreachable, HTTP 000). **Id: unknown until live Tasks access.** |
| Meeting for evidence | Notion-sourced (not yet Professional Hub meeting id): "Gifted Education Planning Meeting with Nina in A0033 - Policy & Audit Strategy Discussion - Feb 5 9AM" (`18cf794f847680148126ecc06ed1d4c8`). Professional meetings live in Blobs (`meetings/records/`) — not in `life-hub-data` JSON. |
| PD event for evidence | Not named in local seed. Production Professional events store not reachable from this agent. |
| Done task with `apst_focus` | Seed has done tasks (`task_demo_close_done`, `task_ha_writeup`) but **none carry `apst_focus`**. Live Tasks store required for a real APST-tagged done task. |
| Adam's current `employee_at` | **Confirmed** in `life-hub-data/data/professional/relationships.json`: **Gifted Education Teacher** at St Aloysius' College (`154f794f-8476-8096-8d33-cb09f6411dc9`), `valid_from: 2025-01-22`, `valid_to: null`. Full role history listed below. |

**Current + past `employee_at` (Adam / `derived:person:adam-russell`):**

| Role | From | To | Org |
|---|---|---|---|
| Gifted Education Teacher | 2025-01-22 | open | St Aloysius' (`154f794f-…`) |
| English Teacher | 2024-08-19 | 2024-12-20 | Catherine McAuley Medowie |
| English Teacher | 2021-01-25 | 2024-08-16 | St Pius X |
| Psychology Teacher | 2023-01-23 | 2024-08-16 | St Pius X |
| Professional Experience Placement Organiser | 2024-01-29 | 2024-08-16 | St Pius X |
| Curriculum Committee Coordinator for School Transition | 2023-05-01 | 2024-02-29 | St Pius X |
| Leader of Learning - English (Acting) | 2023-04-21 | 2023-05-13 | St Pius X |
| Leader of Wellbeing and Engagement (Special Projects) | 2021-05-03 | 2021-12-17 | St Pius X |
| Gifted Education Mentor | 2020-05-04 | 2020-12-18 | St Pius X |
| HSIE Teacher | 2020-01-27 | 2020-12-18 | St Pius X |
| HSIE and Business Studies Teacher | 2019-05-01 | 2019-12-31 | St Joseph's Aberdeen |
| Senior Education Project Officer | 2018-10-01 | 2019-05-03 | All Areas Education |
| English Teacher (Maitland Grossmann) | 2017-05-01 | 2017-12-31 | Maitland Grossmann |
| English/HSIE Teacher | 2015-01-26 | 2018-10-01 | Xavier High Albury |
| English Teacher | 2012-12-02 | 2014-12-19 | Kooringal High |

### 0.2 Stone "done" field for project / program

- **Task:** `status === 'done'`
- **Goal:** `status === 'achieved'` (`goal-record.mjs`)
- **Project:** `status === 'completed'` (also terminal: `archived_dead` via `isProjectArchived`; use **`completed`** for intentional finish)
- **Program:** catalogue records in `ProgramSchema` have **no closed/status field**. Treat program `stone_action` targets as never auto-done unless `status_override === 'done'`.

### 0.3 Inverse link rendering (incoming + inverse label)

| Hub surface | Renders incoming Universal Links? | Uses inverse label? | Phase 5.6 needed? |
|---|---|---|---|
| Tasks — task detail (`task-relationships.ts`) | No (outgoing contact/collaborator only) | No | **Yes** |
| Tasks — project page (`page-editor` + entity-tagger) | Yes (chips merge outgoing+incoming for `tagged_with`) | No — supporting label is kind, not `inverse_label` | **Yes** (Career evidence list) |
| Tasks — goal | Same tagger pattern where mounted; no dedicated inverse list | No | **Yes** |
| Teaching — unit / lesson | Entity-tagger merges incoming; no inverse-label copy | No | **Yes** |
| Knowledge — page | **Yes** — `inverseLinksHtml` + relationships editor `incoming_readonly` | Wiki inverse section yes; UL chips use endpoint labels | Partial — Career evidence item still needs a clear link to `#/career/card/<id>` |

### 0.4 Route references to redirect in Phase 2

| Location | Current |
|---|---|
| `apps/professional/src/shell/shell.ts` | Rail item `#/applications` |
| `apps/professional/src/app/router.ts` | `applicationRoute` → `#/application/<id>`; `parseRoute` for applications / application-new / application |
| `apps/professional/src/views/applications.ts` | `#/application/new`, `#/applications`, `applicationRoute` |
| `apps/professional/src/views/career.ts` | Uses `applicationRoute` for items |
| `apps/professional/scripts/mock-api.ts` | `href: /professional/#/application/${id}` |
| `netlify/functions/_shared/entity-resolvers.mjs` | `resolveApplication` → `/professional/#/application/…` |
| `apps/knowledge/src/domain/hub-ref.ts` | `/professional/#/application/…` |
| `apps/life/js/app/hub-map-seed.js` | `#/applications`, `#/application/` |
| Tests | `applications-career.test.ts`, `entity-detail.test.ts`, knowledge `hub-ref.test.ts`, integration tests |

### 0.5 Blockers / notes for later phases

- **D3 acceptance case** (gifted-policy project id) is **blocked** without production Tasks Blobs or a seeded stand-in Adam confirms. Build continues with empty/fixture data; ledger will name the real id when available.
- Screenshots for Phase 0: N/A (no UI). Diff vs mockup: n/a.

**Must:** Named inventory of records, inverse yes/no, route list in this ledger.
**Must-not:** Invent a gifted-policy project id that does not exist in data.
**Verify:** This section; `relationships.json` employee_at rows; grep hits for `#/application`.

---

## Phase 1: Data layer

**Status:** done (2026-09-26)
**Checked:** V4 W1 W2 D2

- Entity kinds: `achievement`, `future`, `stepping_stone` in `entity-ref.mjs` + resolvers
- Schemas: `career-schema.mjs` + `career-schema.test.js`
- Relationships: `evidenced_by`, `witnessed_by`, `supports_future`, `answers_criterion`, `probe_of`, `stone_for`, `stone_action` (+ registry tests)
- Blob prefixes + `career-repository.mjs`
- Endpoints: `career-achievements`, `career-futures`, `career-stones`, `career-scan` (stub), `career-moves` (stub)
- `buildCareerModel` in `apps/professional/src/domain/career-model.ts` + `career-model.test.ts`
- Overview payload extended with achievements/futures/stones/links/scan
- Stone done: project `status === 'completed'`; program never auto-done (no closed field)

**Must:** One model call feeds readiness, match %, what-if deltas.
**Must-not:** Store readiness on records.
**Verify:** `career-model.test.ts`, `career-schema.test.js`, `relationship-registry.test.js`

**diff vs mockup:** n/a (data layer)

---

## Phase 2: Page merge, routes, Skills ledger

**Status:** pending

---

## Phase 3: River

**Status:** pending

---

## Phase 4: Futures

**Status:** pending

---

## Phase 5: Skills scan

**Status:** pending

---

## Phase 6: Applications + Criteria Mirror

**Status:** pending

---

## Phase 7: Ghost paths

**Status:** pending

---

## Phase 8: Ann spotted a future

**Status:** pending

---

## Phase 9: What if

**Status:** pending
