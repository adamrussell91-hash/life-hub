# Organisations redesign — progress ledger

One PR: `cursor/organisations-redesign-5124`. Phases are commits.

**Prerequisite note:** People Phase 1 ([PR 505](https://github.com/adamrussell91-hash/life-hub/pull/505)) was still open when this branch started. Crest / `logo_key` / warmth / arc primitives are included here so Organisations can ship; reconcile with People on merge.

## Phase 1 — Crest wall and organisation page

- [x] `buildOrganisationModel()` (V4)
- [x] Relationship chips + `studied_at` / `placement_at` registry
- [x] Crest wall + URL filter/sort/group
- [x] Organisation page skeleton (How / Ann / Opps empty; Your time built)
- [x] Phone 390: Filters sheet, one-column wall; bar `[hidden]{display:none}`
- [x] Route `#/organisations/<id>` (legacy singular still resolves)
- [x] Tests: model, query, timeline, directory, wall W2, getBBox C1
- [x] hub-ui-guardian **PASS**
- Failure-register checked: L1 L2 L5 S2 S3 S4 V2 V4 R1 R2 C1 C2 C3 D1 D5 I2 W1 W2 P3
- Diff vs mockup: kit surfaces (no cream); no Compare; opportunities empty host; mock seed not live D3

### Reopened 27/09/26 (see `FIX-BRIEF-01.md`)

PR 508 was merged with only Phase 1 done. These Phase 1 ticks failed on live data
and are reopened:
- C1: count labels pile up on the tiles, and timeline labels are clipped and
  collide.
- C2: the tile line is placed by list position, not by real points.
- D4 / P3: the St. Aloysius acceptance case fails.
- Warmth: everyone is banded cold (D6).
- Ongoing role drawn as a dot (C6).
- Dead buttons and roadmap copy (P4).

## Phase 2 — Structure data

- [x] `shared:unit` / `shared:position` in identity-schema + entity-ref + resolvers
- [x] Registry keys: member_of_unit, holds_position, part_of, reports_to, shares_authority_with, works_with, answers_to
- [x] `deriveReportingGraph` + org-structure repository/handler (`/api/org-structure`)
- [x] Edit structure sheet on organisation page (Add unit / position / member / reports-to)
- [x] Tests: Aloysius three lines; multi-parent; symmetric pair; cycle; temporal; W2 handler factory
- Checks: D4 P3 V4 I3 W2
- Diff vs mockup: structure starts empty on live Blob until Adam edits (no GitHub seed yet)

## Phase 3 — Flowchart

- [x] `elkjs` dynamic import (`org-flowchart.ts`); separate build chunk (not main bundle)
- [x] Layered INCLUDE_CHILDREN layout; position/person cards; unit compounds; edge marks
- [x] Your lines highlight + `?line=` (V2); Outline / Flow / People list
- [x] Phone Outline default; Flow pan box
- Checks: S4 V2 V3 V4 R1 D4 Perf (elk chunk split)
- Screens: `screens/fix-01/part-b-*` (see Part B ledger)

## Phase 4 — Opportunities

- [x] opportunity-schema + repository + `/api/opportunities`
- [x] Add opportunity sheet on wall + org page; dismiss; empty "No opportunities yet."
- [x] Tests: D1 month label, D2 sort
- Checks: D1 D2 I3 I4 S3 V4 W2

## Phase 5 — Ann's read

- [x] OrganisationRead schema + context builder + `/api/organisation-read` Run now
- [x] Never overwrite `author: 'adam'` threads
- [x] Context integrity tests (availability / delivery / behaviour + negative control)
- [x] UI: empty + Run now; failed run visible
- Checks: agent-context-integrity I3 D5 L2
- Note: scheduled 07:00 Sydney tick not wired in this slice — Run now is live

## Phase 7 — Compare

- [x] Route `#/organisations/compare?ids=`
- [x] `org-bridges.mjs` pure rules + `/api/org-bridges`
- [x] Compare page: compact flowcharts + bridge list (390 stacks)
- [x] Header **Compare with…** preselects current org
- Checks: D4 V4 R2 P3 (bridges need real cross-org links in store)

## Out of this PR

- Phase 6 / 8 → People PRs

## Fix 01: Phase 0

Branch: `cursor/organisations-fix-01`. Investigated 27/09/26 against
fresh `origin/main` + local `life-hub-data` `data/professional/{organisations,people,relationships}.json`,
assembled with the same rules as `github-professional-data.mjs`
(`LEGACY_IMPORT_TIMESTAMP = 2026-09-15T00:00:00.000Z` stamped on every
synthetic link's `created_at`) and `assembleOrganisationsDirectory` /
`assemblePeopleDirectory` / `warmthFor()`. No Blob store was bound in this
environment; Organisations on the live umbrella also loads GitHub for these
records. **No Part A code changes in this commit.**

### 1. `first_link_at` — St. Aloysius and Trinity

Directory rule (unchanged): `valid_from || occurred_at || created_at`.

**St. Aloysius College — 56 people**

| Field source | Count |
|---|---|
| `valid_from` | 1 |
| `occurred_at` | 0 |
| `created_at` | 55 |

Only Adam has a real `valid_from` (`2025-01-22`). Everyone else falls through
to `created_at` = the import stamp `2026-09-15T00:00:00.000Z`. So **55/56
are import timestamps, not "when Adam got to know them".**

| Person | `first_link_at` | Field |
|---|---|---|
| Adam Russell | 2025-01-22 | `valid_from` |
| Alison DeSousa | 2026-09-15T00:00:00.000Z | `created_at` |
| Carmel Cordaro | 2026-09-15T00:00:00.000Z | `created_at` |
| Carolyn Muir | 2026-09-15T00:00:00.000Z | `created_at` |
| Chris Dobell-Brown | 2026-09-15T00:00:00.000Z | `created_at` |
| Claire Smith | 2026-09-15T00:00:00.000Z | `created_at` |
| Dallas Davies | 2026-09-15T00:00:00.000Z | `created_at` |
| Daniel Heyman | 2026-09-15T00:00:00.000Z | `created_at` |
| Daniel Levitt | 2026-09-15T00:00:00.000Z | `created_at` |
| Daniel Ronchetti | 2026-09-15T00:00:00.000Z | `created_at` |
| David Comito | 2026-09-15T00:00:00.000Z | `created_at` |
| Dr Georgia Macbeth | 2026-09-15T00:00:00.000Z | `created_at` |
| Eileen Quinane | 2026-09-15T00:00:00.000Z | `created_at` |
| Elizabeth Phipps | 2026-09-15T00:00:00.000Z | `created_at` |
| Erin Webb | 2026-09-15T00:00:00.000Z | `created_at` |
| Felipe Basioli | 2026-09-15T00:00:00.000Z | `created_at` |
| Fr Ross Jones SJ | 2026-09-15T00:00:00.000Z | `created_at` |
| Grant Smith | 2026-09-15T00:00:00.000Z | `created_at` |
| Hamish Bragg | 2026-09-15T00:00:00.000Z | `created_at` |
| Hanna Lucas | 2026-09-15T00:00:00.000Z | `created_at` |
| Heidi Quinn | 2026-09-15T00:00:00.000Z | `created_at` |
| Isabella Talliano | 2026-09-15T00:00:00.000Z | `created_at` |
| Jennifer Walker | 2026-09-15T00:00:00.000Z | `created_at` |
| Joe El-Khoury | 2026-09-15T00:00:00.000Z | `created_at` |
| John Browne | 2026-09-15T00:00:00.000Z | `created_at` |
| John Powell | 2026-09-15T00:00:00.000Z | `created_at` |
| John Tzantzaris | 2026-09-15T00:00:00.000Z | `created_at` |
| Joseph Histon | 2026-09-15T00:00:00.000Z | `created_at` |
| Joseph Lee | 2026-09-15T00:00:00.000Z | `created_at` |
| Joshua Levy | 2026-09-15T00:00:00.000Z | `created_at` |
| Justyn Ambrose | 2026-09-15T00:00:00.000Z | `created_at` |
| Kate Quinane | 2026-09-15T00:00:00.000Z | `created_at` |
| Kathleen Esser | 2026-09-15T00:00:00.000Z | `created_at` |
| Kelly Ryu | 2026-09-15T00:00:00.000Z | `created_at` |
| Lisa Gascoigne | 2026-09-15T00:00:00.000Z | `created_at` |
| Marcel Kennedy | 2026-09-15T00:00:00.000Z | `created_at` |
| Martin Corcoran | 2026-09-15T00:00:00.000Z | `created_at` |
| Matt Fanning | 2026-09-15T00:00:00.000Z | `created_at` |
| Michelle O'Connor | 2026-09-15T00:00:00.000Z | `created_at` |
| Mitchell Chriss | 2026-09-15T00:00:00.000Z | `created_at` |
| Natalie Shih | 2026-09-15T00:00:00.000Z | `created_at` |
| Nick Lah | 2026-09-15T00:00:00.000Z | `created_at` |
| Nina Radice | 2026-09-15T00:00:00.000Z | `created_at` |
| Paul Monteleone | 2026-09-15T00:00:00.000Z | `created_at` |
| Phillip Merchant | 2026-09-15T00:00:00.000Z | `created_at` |
| Pier Milanoli | 2026-09-15T00:00:00.000Z | `created_at` |
| Richard Steele | 2026-09-15T00:00:00.000Z | `created_at` |
| Seth Fitisemanu | 2026-09-15T00:00:00.000Z | `created_at` |
| Simone Salle | 2026-09-15T00:00:00.000Z | `created_at` |
| Sinclair Watson | 2026-09-15T00:00:00.000Z | `created_at` |
| Sophie Unsworth | 2026-09-15T00:00:00.000Z | `created_at` |
| Sue Gough | 2026-09-15T00:00:00.000Z | `created_at` |
| Tamara Dabic | 2026-09-15T00:00:00.000Z | `created_at` |
| Thierry King | 2026-09-15T00:00:00.000Z | `created_at` |
| Tom Spencer | 2026-09-15T00:00:00.000Z | `created_at` |
| Vanessa Wadih | 2026-09-15T00:00:00.000Z | `created_at` |

**Trinity Catholic College — 20 people**

| Field source | Count |
|---|---|
| `valid_from` | 0 |
| `occurred_at` | 0 |
| `created_at` | 20 |

**All 20 are import timestamps.**

| Person | `first_link_at` | Field |
|---|---|---|
| Bianca Gambrill | 2026-09-15T00:00:00.000Z | `created_at` |
| Cait Grey | 2026-09-15T00:00:00.000Z | `created_at` |
| Carmel Wright | 2026-09-15T00:00:00.000Z | `created_at` |
| Cherie Borger | 2026-09-15T00:00:00.000Z | `created_at` |
| Helen Davies | 2026-09-15T00:00:00.000Z | `created_at` |
| Jonathan Reynolds | 2026-09-15T00:00:00.000Z | `created_at` |
| Jordan Fulmer | 2026-09-15T00:00:00.000Z | `created_at` |
| Justine Webb | 2026-09-15T00:00:00.000Z | `created_at` |
| Kerrie Sellers | 2026-09-15T00:00:00.000Z | `created_at` |
| Natalie Adams | 2026-09-15T00:00:00.000Z | `created_at` |
| Olivia Slevin | 2026-09-15T00:00:00.000Z | `created_at` |
| Rachel Logan | 2026-09-15T00:00:00.000Z | `created_at` |
| Rachel Moore | 2026-09-15T00:00:00.000Z | `created_at` |
| Renai Thirlway | 2026-09-15T00:00:00.000Z | `created_at` |
| Robert Emery | 2026-09-15T00:00:00.000Z | `created_at` |
| Ruby Wyker | 2026-09-15T00:00:00.000Z | `created_at` |
| Simon Pearse | 2026-09-15T00:00:00.000Z | `created_at` |
| Stephanie Strachan | 2026-09-15T00:00:00.000Z | `created_at` |
| Tania Hough | 2026-09-15T00:00:00.000Z | `created_at` |
| Taylah Grainger | 2026-09-15T00:00:00.000Z | `created_at` |

**A1 / A8 implication:** a tile spark / people line that trusts `first_link_at`
as-is will stack almost everyone on 15/09/26. Header "first Jan 2025" on
St. Aloysius is Adam's own `valid_from`, not the organisation's first touch
with other people. Directory people count is **56**, not the build-plan's 82.

### 2. Warmth bands — St. Aloysius (defect A2)

| Source | warm | cooling | cold | total |
|---|---|---|---|---|
| Organisations directory (`assembleOrganisationsDirectory`) | 0 | 0 | 56 | 56 |
| People `warmthFor()` for the same 56 ids (full person relationship set; empty timeline / no meetings — same inputs People directory uses, and People page until overview loads richer touchpoints) | 0 | 0 | 56 | 56 |

**Band counts currently match (both all cold).** They do **not** prove A2 is
absent: the org directory still calls `warmthFor()` with touchpoints from
**only the single person→org link** and `timeline: []` (A2 cause in
`FIX-BRIEF-01.md`). People uses the person's full relationship list (and the
person page later patches from overview meetings/events when those exist). On
this GitHub dataset there are no meeting/event/comms touchpoints and 55/56
Aloysius people have only that one org link, so both paths score cold. The
architectural second computation remains; do not restyle the bar warmer.

### 3. Relationship-type counts (all organisations)

From `life-hub-data` `relationships.json` (250 rows). Directory org count
from the same store: **114** (brief said 112).

| Type | Count in `relationships.json` |
|---|---|
| `employee_at` | 246 |
| `member_of` | 4 |
| `venue` | 0 |
| `provider` | 0 |
| `applies_to` | 0 |
| `presenter` | 0 |
| `studied_at` | 0 |
| `placement_at` | 0 |

Also: `professional_relationship` = 0 in this file.
`github-professional-data.mjs` `normalizeRelationships` only imports
`employee_at`, `member_of`, and `professional_relationship` into the runtime
graph — so even if venue/provider/etc. were added to the JSON later, they
would still not reach the directory until that importer is extended.

**Wall filter chip counts** (orgs whose derived chips hit each
`filterBucket`, as `chipMatchesFilter` does):

| Filter | Count |
|---|---|
| All | 114 |
| Work | 8 |
| Study & placement | **0** |
| Events & PD | **0** |
| Professional bodies | 4 |
| Prospects | **0** |

**Why Events & PD / Study & placement / Prospects are 0:** there are **no**
`venue`, `provider`, `presenter`, `studied_at`, `placement_at`, or
`applies_to` links in the store. Chip derivation cannot invent Event venue /
PD provider / Studied / Placement / Applied chips. St. Aloysius has no Event
venue chip because no venue links exist (A7 — data absence, not a missed
derivation on present links). Work = 8 is Adam's `employee_at` workplaces;
bodies = 4 is his `member_of` orgs.

### 4. Adam → St. Aloysius links

Exactly **one** link in `relationships.json`:

| Role | `valid_from` | `valid_to` |
|---|---|---|
| Gifted Education Teacher | 2025-01-22 | `null` (open / current) |

Directory chips for St. Aloysius: **Workplace · Gifted Education Teacher · 2025–now**.
Timeline lane from the assembler: `kind: work_study`, `start: 2025-01-22`,
`end: null`.

### Phase 0 status

- [x] Items 1–4 answered with real numbers
- [x] Part A (A1–A8) — see **Fix 01: Part A** below
- [x] Part B — see **Fix 01: Part B** below

## Fix 01: Part A (Phase 1R)

Branch: `cursor/organisations-fix-01`. Implemented 27/09/26 against
Phase 0 numbers. Commits: `fix(orgs): Phase 1R — …`.

### A1. Tile spark by date (C5, C1, C2, D1)

- [x] `renderOrganisationSparkSvg` — shared 2019→now x, step y, axis labels only, last-point dot
- [x] `first_link_at` = `valid_from || occurred_at` only (never import `created_at`)
- [x] Undated people omitted from spark; tile `aria-label` includes undated count
- [x] Unit: different orgs → different path; shared-scale x; spark text = `2019`/`now` only
- Checks: C5 C1 C2 D1 W2
- Screens: `screens/fix-01/live-wall-1440.png`, `live-wall-390.png` (plus harness wall PNGs)
- Diff vs mockup: see `screens/fix-01/DIFF.md` (1 dated person on Aloysius; Trinity empty)

### A2. Warmth from People source (D6, V4)

- [x] Handler loads people + `buildPersonWarmthById` (same `warmthFor` path as People directory)
- [x] Test: org bands equal People bands for same ids
- [x] **Real St. Aloysius spread remains 0 warm / 0 cooling / 56 cold** — ledgered; not restyled
- Checks: D6 V4
- Screen: wall tiles show single grey cold segment (honest)

### A3. Ongoing role as bar to now (C6)

- [x] Work/roles `end: null` → bar to domain end (now); events stay points
- [x] Unit: bar right edge = now x
- Screen: `screens/fix-01/live-aloysius-1440.png`, `live-aloysius-timeline-390.png`

### A4. Timeline labels + people area (C1, C3)

- [x] Labels inside bars (or beside when too long); axis row below; stepped people area; count label; no per-person dots
- [x] getBBox non-overlap at 900 and 390; height = rows×32+24
- Screens: timeline live 1440 / 390 (`live-aloysius-*.png`); `preserveAspectRatio=xMinYMid meet` + minWidth so 390 scrolls instead of squashing (C1)

### A5. Dead buttons / roadmap copy (I3, P4)

- [x] Compare / Edit / Add structure / Run now not rendered until Part B wires them
- [x] Opportunities copy: "No opportunities yet." (wall + page)
- [x] Ann: "Ann hasn't read {org} yet."
- [x] Test: no `button[disabled]` on org page; no Phase/arrives/is built in rendered text
- Checks: I3 P4

### A6. Chip one-line ellipsis (L6)

- [x] `.orgs-rchip` nowrap + detail ellipsis; `title` = full text
- Screens: live wall HALT chip; `getClientRects().length === 1` at 1440 and 390
- Harness: `halt-chip-1440.png`, `halt-chip-390.png`

### A7. Filter / chip counts (D4, V4)

- [x] Phase 0: venue/study/etc. counts are **0** — data absence, not chip bug
- [x] Model test: St. Aloysius real links → Workplace only, no Event venue
- [x] No invented chips
- Ledger: Events & PD 0, Study & placement 0, Prospects 0 (114 orgs in Phase 0; this evidence pass 113 after identity dedupe)

### A8. Header first date (D5)

- [x] `first_touch_kind: you_started | first_contact`
- [x] Aloysius meta: **"56 people · you started Jan 2025"**
- Check: D5; screen in wall/timeline captures

### Part A status

- [x] A1–A8 ticked with checks + screens
- [x] hub-ui-guardian **PASS** (r3; L1 phone wall one-column; C1 timeline meet+scroll)
- Failure-register checked: L1 L6 S2 S4 V4 C1 C2 C3 C5 C6 D1 D3 D4 D5 D6 I3 W2 P1 P3 P4
- [x] Part B — see **Fix 01: Part B** below (PR stays draft until Part B ticked + guardian)

## Fix 01: Part B (Phases 2→3→4→5→7)

Branch: `cursor/organisations-fix-01-part-b-d77e` (fresh from `main` after #542).
PR: draft (do not mark ready until ledger + guardian + pre-pr-check).

### Must / Must-not / Verify

- **Must:** St. Aloysius page shows Edit / Add structure / Run now / Add opportunity / Compare with… wired; structure editor writes units; flowchart/outline when structure exists; no roadmap copy.
- **Must-not:** Disabled placeholder buttons; Phase/arrives copy; elkjs in main bundle; invented venue chips; PR marked ready before Part B ticks.
- **Verify:** unit tests + professional tests + live 1440/390 screens in `screens/fix-01/` + hub-ui-guardian PASS + `npm run pre-pr-check`.

### Ledger

| Phase | Status | IDs checked | W2 entry | Diff vs mockup |
|---|---|---|---|---|
| 2 Structure | [x] | D4 P3 V4 I3 W2 | `org-structure` handler + editor | Empty until structure entered (no GitHub units seed) |
| 3 Flowchart | [x] | S4 V2 V3 V4 R1 D4 Perf | org page How section | Kit surfaces; ELK order not drag-pin |
| 4 Opportunities | [x] | D1 D2 I3 I4 S3 V4 | `/api/opportunities` | Empty until manual add |
| 5 Ann's read | [x] | I3 D5 L2 context-integrity | Run now → organisation-read | Scheduled tick deferred; Run now live |
| 7 Compare | [x] | D4 V4 R2 P3 | `#/organisations/compare` | Bridges empty without cross-org UL links |

### Part B status

- [x] Phases 2→3→4→5→7 implemented
- [ ] hub-ui-guardian **PASS** (pending)
- [ ] Screens in `screens/fix-01/part-b-*` + DIFF
- [ ] `npm run pre-pr-check` exit 0
- [ ] PR stays **draft** until above ticked