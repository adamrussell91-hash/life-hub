# Organisations page rebuild: build plan

## Outcome

Replace the search-only `#/organisations` page and the generic
`#/organisations/<id>` entity page with:

- a crest wall;
- an organisation page (header and chips, **How it is run**, **Ann's read**,
  **Potential opportunities**, **Your time with …**);
- a Compare view.

The design is in `mockups/01–03`, and `DECISIONS.md` says who owns what.

**St. Aloysius College is the acceptance case:**

> Adam opens Organisations → St. Aloysius. The chips say **Workplace · 2025–now**
> and **Event venue**. **How it is run** shows Adam in three containers
> (English faculty, Learning Enrichment, Accreditation mentors), linked as one
> person. It draws three bold reporting lines: to the Head of English, to the
> Leader of Learning Enrichment, and to the Director of Professional Learning.
> The Rector ⇄ Principal arrow is two-way. The header count says 82 people and
> counts Adam once.

**Read first:**
- `DECISIONS.md`
- `mockups/README.md`, including its buildability table
- `mockups/02-organisation.html`
- `docs/CURSOR-UI-FAILURES.md`
- `.cursor/rules/ui-failure-register.mdc`
- `.cursor/rules/first-pass-correctness.mdc`
- `.cursor/rules/agent-context-integrity.mdc` (Phases 5 and 6)
- `.cursor/rules/ponytail-project-guardrails.mdc`

**Mockups show placeholder data.** They put Adam in HSIE. On real data Adam is in
English and Learning Enrichment and is an accreditation mentor, so the flowchart
must follow the real data, not the mockup's faculties.

## One PR, not one per phase

**The whole build ships as a single PR.** Every PR costs Adam real money, so this
is deliberately unlike the People build.

- **One branch.** `cursor/organisations-redesign` from fresh `main` (P2). Open it
  as a **draft PR once**, after the first phase commit, and push every later phase
  to the same PR.
  - Don't open a PR per phase.
  - Don't close and reopen the PR.
  - Don't open follow-up "fix" PRs. Review fixes land on the same branch.
- **Phases are commits, in order.** Each phase is one or more commits titled
  `feat(orgs): Phase N — …`. Every phase commit leaves the page working, and later
  phases only fill slots (I3).
- **One progress ledger.** `docs/professional-hub/organisations-redesign/PROGRESS.md`
  has a section per phase. For each ticked item, record:
  - the failure-register IDs checked;
  - the named real-entry-point test (W2);
  - "diff vs mockup: none", or the listed deviations.
- **Mark ready for review only once**, when every phase in scope is ticked. Adam
  reviews once.
- **Phases 6 and 8 aren't in this PR.** They need People Phase 2's proposal store
  and the live sweeps, which don't exist yet. They go **into the People PRs that
  build those pieces** (the People Phase 2 and Phase 8 scope), not into a new
  Organisations PR. Leave their slots showing their empty states.
- **Phase 7 (Compare) ships in this PR.** It uses the provisional warmth band
  until People Phase 3 lands. It is not held back for a later PR.
- **The PR touches only** the files this plan names, plus tests, docs, the ledger
  and screenshots. Check with `git diff --stat origin/main...HEAD` before marking ready.

## Ground rules

- **Prerequisite.** Don't start until People Phase 1
  ([PR 505](https://github.com/adamrussell91-hash/life-hub/pull/505)) is merged.
  This plan reuses its crests, `sectionHost` pattern and arc.
- **Screenshots** at 1440 and 390 on **real data** (D3), taken per phase. They
  must show:
  - St. Aloysius College, with Adam's three memberships;
  - Trinity Catholic College.
  
  Put them in `docs/professional-hub/organisations-redesign/screens/phase-N/`,
  with a written diff against the mockup (P1).
- **Before ticking a phase**, state Must / Must-not / Verify
  (`first-pass-correctness.mdc`).
- **API calls** go through `apiGet`/`apiPost` (W1).
- **Dates** use `formatDisplayDate` (dd/mm/yy) or relative text (D5). A date the
  data only knows to the month renders as "Oct 2026" (D1).
- **Styling.** No new colours, type sizes or radii. Use the hub design kit tokens,
  and overlays only (`hub-design-kit.mdc`).
- **Dependencies.** No new dependency except `elkjs` (Phase 3), which must be
  dynamically imported on the organisation page only.

## Existing code this builds on (verified 26/09/26)

| Need | Already exists |
|---|---|
| Organisation record | `_shared/identity-schema.mjs`; `logo_key`, `org-crest-sign.mjs`, `org-crest.mjs` on PR 505 |
| The self person | `findActiveSelfPerson()` in `_shared/career-overview.mjs` (`is_self`) |
| Links | `_shared/universal-link-repository.mjs`. Every registry type is `many_to_many`. Links carry `valid_from`/`valid_to` (`temporalMode: 'period'`) and `context_ref` |
| Organisation relationships | `_shared/relationship-registry.mjs`: `employee_at`, `member_of` (person → org); `venue`, `provider` (event → org); `applies_to` (application → org); `presenter`, `attendee` (event → person); `professional_relationship` (person ↔ person, own inverse) |
| Notes about an organisation | `_shared/observation-schema.mjs`. `about_ref` may be `shared:organisation` |
| Person model, warmth band, arc | PR 505: `domain/person-model.ts` (`buildPersonModel`, `WarmthBand`), `domain/relationship-arc.ts` (`layoutRelationshipArc`, `renderRelationshipArcSvg`) |
| Section hosts, live patching | PR 505: `sectionHost()` in `views/people.ts` |
| Link proposals | People Phase 2 (`_shared/link-proposal-schema.mjs`, planned) |
| Scheduled agent work | `ai-jobs-tick-scheduled.mjs` / `_shared/ai-jobs-tick.mjs` |
| Graph drawing today | `components/network-graph-canvas.ts` (`d3-force`, Network Ecology). Not a hierarchy layout; don't reuse it for the flowchart |
| Applications | `applications.mjs` (the "Add to Applications" target) |

Views to replace: `apps/professional/src/views/organisations.ts` (entity search)
and `organisation-page.ts` (generic `renderEntityDetail`).

---

## Phase 1: Crest wall and organisation page (no structure yet)

**1.1 One model.**
- `domain/organisation-model.ts` exports `buildOrganisationModel()`. It feeds the
  crest tile, the page header, the chips and the arc from one call (V4).
- People counts de-duplicate by person id.
- Warmth uses People's band until People Phase 3 lands (same provisional mapping
  as PR 505), then `warmthFor()`.

**1.2 Relationship chips.**
- Each chip is derived from links to the organisation:
  - `employee_at`: Workplace, current or former by `valid_to`;
  - `member_of`: Member;
  - events with `venue`/`provider`: Event venue / PD provider, with a count;
  - `presenter` on an event whose provider is this organisation, where the
    presenter is the self person: You presented, with the year;
  - `applies_to`: Applied.
- New registry keys, declared in this slice: `studied_at` and `placement_at`
  (person → organisation, `period`, `optional_text` role, e.g. "M.Teach").
- Chip text reads as a phrase with years, e.g. "Workplace 2021–24" (D5).

**1.3 Crest wall.**
- `#/organisations` renders a heading and a count, then an opportunities strip
  (empty state until Phase 4), then filters.
  - Filters: All · Work · Study & placement · Events & PD · Professional bodies · Prospects.
  - Sort: Most active, Newest, A–Z, Most people.
  - Group: none / relationship.
- Filter, sort and group live in the URL query. One state object drives the grid
  and the control labels (V2).
- **Tiles:**
  - crest, name, chips, people count, warmth spread bar, and a mini arc on a
    shared 2019→now scale;
  - the current workplace tile spans two columns;
  - tiles are `<a href="#/organisations/<id>">` (I2).
- Grid tracks are `repeat(auto-fill, minmax(0, 1fr))` with `min-width: 0` children (L1).

**1.4 Organisation page skeleton.** Header, then the four sections, each with its
own section host, loading, empty and error states (I3):
- How it is run: empty until Phase 3, with an "Add structure" button that opens
  the Phase 2 editor once it exists.
- Ann's read: "Ann reads this organisation daily", with Run now disabled until Phase 5.
- Opportunities: empty state until Phase 4.
- Your time with …: built in this phase.

**1.5 Your time with ….**
- An SVG with lanes: Work & study (periods), Events (points), Roles (periods,
  filled from Phase 2 memberships).
- Behind the lanes, a cumulative count of people known there, stepping at the
  first-link date of each person linked to the organisation.
- The domain starts at the first touch and ends at now, plus future events.
- Height is `rows × 32px + 24px` axis (C3). Collision pass on labels (C1). The
  line is drawn from real points (C2).

**1.6 Phone (390).**
- The wall becomes a one-column list of compact tiles.
- Toolbar: search, **Filters** sheet, icon Add (L5).
- The organisation page stacks sections in the same order.

**Failure modes: Phase 1**

| ID | Feature-specific check |
|---|---|
| L1 | Opportunities strip, filter bar and wall share the right edge ±1px at 1440 |
| L2 | A tile's height = its content. No `min-height`; max 200px for a one-row-chip tile |
| L5 | Toolbar ≤ 2 rows at 390 |
| S2/S3 | Tiles have explicit surfaces; the Filters sheet is opaque `var(--paper)` |
| S4 | Mini arc and arc shapes have explicit fills |
| V2 | Change the filter via URL; the segment highlight follows |
| V4 | Test: tile count, header count and chip counts come from one `buildOrganisationModel()` call and agree |
| R1/R2 | 390 → 1440 → 390 without reload; `scrollWidth === innerWidth` at 390 |
| C1/C2/C3 | Arc `getBBox` test at 390/1440; the people line passes real points; height formula measured |
| D1/D5 | Month-only dates render as "Oct 2026"; read every chip aloud |
| D4 | Chip derivation tested against **real** St. Aloysius and Trinity links from the store |
| I2 | Tiles are anchors; Tab + Enter opens the organisation |
| W1/W2 | No relative fetch; one test drives the real `organisations` route controller |
| P3 | The generic entity page no longer renders at `#/organisations/<id>` |

---

## Phase 2: Structure data (containers)

**2.1 Records.** In `_shared/identity-schema.mjs` (same store, same validation
style as Organisation):
- **`shared:unit`**: `{ id: unit_<uuid>, organisation_ref, name, kind: 'leadership'|'faculty'|'team'|'program'|'board'|'department'|'other', order, lifecycle_status }`.
  A container. `order` is its place across its layer.
- **`shared:position`**: `{ id: position_<uuid>, organisation_ref, title, unit_ref | null, is_head: boolean, lifecycle_status }`.
  A named role that outlasts its holder (Rector, Head of English, Director of
  Professional Learning, Deputy · Staff). A position with no holder renders as a
  dashed "not met" box.

**2.2 Relationship keys** (registry, this slice). All `many_to_many`, all `period`
unless noted.

| Key | Source → target | Meaning |
|---|---|---|
| `member_of_unit` | person → unit | Membership. `optional_text` role (e.g. "gifted education teacher"). A person may hold many |
| `holds_position` | person → position | Who fills a named role |
| `part_of` | unit → unit | Nesting (Learning Enrichment inside Teaching & Learning) |
| `reports_to` | position or unit → position | **Exceptions only.** A unit or role may report to several |
| `shares_authority_with` | position ↔ position | Symmetric. Equivalence hash sorts the two refs first, so A⇄B and B⇄A are one link |
| `works_with` | unit/position ↔ unit/position | Symmetric, same hashing. Dotted |
| `answers_to` | organisation, unit or position → organisation | An outside body (owner, employer system), `timeless` |

Every structure link sets `context_ref` to the organisation.

**2.3 Deriving the graph.** `_shared/org-structure.mjs` exports
`deriveReportingGraph(org)`. It's a pure function that returns nodes and edges
with a `derived | explicit` flag:
- A member of a unit reports to the unit's head position.
- The head of a unit reports to the head of its `part_of` parent.
- An explicit `reports_to` adds to the defaults. It replaces the default only when
  it sets `metadata.replaces_default: true`.
- Cycles are allowed in the data. The function marks them and never loops.
- Only active links count (`valid_to` null or in the future).

**2.4 API.**
- `org-structure.mjs` GET returns the derived graph plus the raw records.
- POST/PATCH endpoints for units, positions and links reuse
  `universal-link-repository` and entity lifecycle.
- Clients go through `apiGet`/`apiPost` (W1).

**2.5 Edit structure** (a mode on the organisation page, not a separate page).
- Add, rename and nest units. Set a unit's head. Add a position (with or without holder).
- Add members by person search. A person can be added to several units.
- Draw an exception: pick the source, then "reports to", then the target. Also
  shared authority, works with, answers to.
- Reorder units within a layer. This sets `order`, which Phase 3 layout respects.
- Every write patches the section in place (the People 1.4 pattern). No full re-render.

**Failure modes: Phase 2**
- **D4 / P3:** `deriveReportingGraph` is tested on **Adam's real St. Aloysius
  memberships**: English faculty, Learning Enrichment and Accreditation mentors
  give three distinct lines ending at the Head of English, the Leader of Learning
  Enrichment and the Director of Professional Learning.
- **Multi-parent:** a unit with two `reports_to` produces two edges.
- **Symmetric:** creating B⇄A after A⇄B returns the existing link.
- **Cycle:** A → B → A terminates and marks both.
- **Temporal:** an ended membership isn't in the graph.
- **V4:** the member count de-duplicates Adam (three memberships, counted once).
- **I3:** an organisation with no structure shows "No structure yet. Add units",
  and the button opens the editor.
- **W2:** one test goes through the real `org-structure` handler.

---

## Phase 3: The flowchart

**3.1 Layout.**
- `elkjs`, dynamically imported, runs the `layered` algorithm with
  `hierarchyHandling: INCLUDE_CHILDREN`:
  - units are compound nodes;
  - positions and people sit inside them;
  - `considerModelOrder` uses unit `order`;
  - edges route orthogonally.
- `ponytail:` no free x/y pinning in this phase. Ordering within layers is the
  control. If Adam needs drag-to-place later, store per-organisation offsets, which
  is a separate item.

**3.2 Marks.**

| Thing | Drawn as |
|---|---|
| Position with holder | Card: warmth-ringed avatar, name, title |
| Position without holder | Dashed card, "not met" |
| Unit | Container card: name, count, warmth dots for members without a named position. Collapsible; collapsed shows count and warmth spread |
| Outside body | Dashed cotton card, "Outside body" eyebrow |
| `reports_to` / derived | Solid arrow to the manager |
| `shares_authority_with` | Solid line, arrowheads at both ends |
| `works_with` | Dotted, no arrowhead |
| `answers_to` | Dashed arrow |

**3.3 One person, several containers.**
- A person with several memberships appears in each container.
- Hovering or focusing one appearance highlights all of them and draws a thin
  connector between them.
- A small "also in Learning Enrichment" line sits under the name.
- Adam's appearances carry "You", and the header says "You · 3 roles".

**3.4 Highlight.**
- "Your lines" is on by default and bolds every line from each of Adam's
  memberships to the top.
- A menu picks one line (e.g. "as accreditation mentor").
- Other options: "Who decides on <unit>" (the unit's line upward) and any unit (its members).
- One state object drives the highlight menu and the drawing (V2).

**3.5 Phone (390).**
- Default view is **Outline**: an indented tree of units.
  - Each role reads "reports to <name>".
  - Shared authority reads "shares authority with <name>".
  - A multi-role person is listed under each unit with "also in …".
- A **Flow** button opens the flowchart in its own pan/zoom box, with + / − /
  fit buttons and touch Pointer Events (R2, C4). It re-renders via `matchMedia` (R1).

**3.6 People list.** A "People list" toggle shows everyone known at the
organisation, sortable by unit, warmth and role, from the same model (V4).

**Failure modes: Phase 3**

| ID | Feature-specific check |
|---|---|
| C1 | `getBBox` test: no card or edge label overlaps another at 1440 and in the 390 flow box |
| S4 | Every arrowhead marker and path has an explicit `fill`/`stroke`; no `#000` |
| V1 | A collapsed unit's member dots have `offsetHeight === 0` |
| V2 | Pick "as accreditation mentor" via URL `?line=`; the menu label follows and only that line is bold |
| V3 | One highlight control, one view toggle (Flow / People list) |
| V4 | Header count, container counts and People list length come from one model; Adam counted once |
| R1/R2 | 390 → 1440 → 390 keeps the view and highlight; page never scrolls sideways at 390 |
| C4 | Pan/zoom tested in Safari; buttons work without gestures |
| I2 | Every card is a `<a>` to the person, or a `<button>` for a vacant role; Tab reaches each |
| D4 | Rendered from **real** St. Aloysius structure, not a fixture |
| P3 | **Acceptance: the St. Aloysius scenario in Outcome, run live** |
| Perf | Layout of 120 nodes finishes in < 500ms on the umbrella; `elkjs` isn't in the main bundle (check the build output) |

---

## Phase 4: Potential opportunities (store + manual add)

- **Store.** `_shared/opportunity-schema.mjs` + `-repository.mjs`, one Blob each:
  `{ id, organisation_ref, kind: 'scholarship'|'pd'|'program'|'role'|'call_for_presenters'|'grant'|'event'|'other', title, summary, closes_on, closes_precision: 'day'|'month'|'none', url, sources: [{ref|url, excerpt}], found_by: 'adam'|'sweep'|'ann', status: 'open'|'interested'|'applied'|'dismissed'|'expired', created_at }`.
- **Internet sweep: to be built.** A separate spec will add a targeted scheduled
  sweep that writes `found_by: 'sweep'` items into this store. Nothing in this
  phase depends on it.
- **Manual add.** An "Add opportunity" sheet on the wall strip and on each
  organisation's card: title, organisation, kind, closes, link.
- **Wall strip.** Open items across all organisations, sorted by `closes_on`
  ascending, undated last (D2), next 6 weeks, maximum 4 cards plus "See all".
- **Organisation card.** Open items for that organisation, same sort.
- **Actions:**
  - **Add to Applications** creates an application with `applies_to` the
    organisation, and sets `applied`.
  - **Add to Events** creates an event with `provider`.
  - **Dismiss.**
  - A past close date marks the item expired on read.
- **Failure modes:**
  - D1: a month-only close renders "closes Oct 2026".
  - D2: sort order is tested.
  - I3: an empty strip shows "No opportunities yet. Add one, or they'll arrive
    once the sweep is built", with Add live.
  - I4: the action sits on its own row, and titles don't wrap because of a button.
  - S3: the Add sheet is opaque.
  - V4: the strip count and "See all" count come from one query.
  - W2: the Add to Applications path is tested through the real handler, and the
    new application appears on the Applications page.

---

## Phase 5: Ann's read

- **Job.** A new Ann job, run daily at 07:00 Sydney (`ai-jobs-tick-scheduled`
  pattern), only for organisations with changed structure, links, observations,
  meetings or opportunities since the last run. Also a **Run now** button.
- **Output.** `OrganisationRead { organisation_ref, summary (≤ 90 words), threads: [{ key: 'real_power'|'your_lines'|'gaps'|'culture'|'drifting', text, sources[] }], generated_at }`.
  If Adam edits a thread, it's stored as `author: 'adam'`. Ann never overwrites it,
  and her next run is told about it.
- **Context.** Ann receives:
  - the derived structure (Phase 2);
  - Adam's memberships;
  - warmth by unit;
  - observations about the organisation;
  - meetings whose attendees include people there (for "real power", only with a meeting as source);
  - open opportunities.
- **Agent context integrity** (`agent-context-integrity.mdc`):
  - *Availability*: the job's context builder returns all six inputs for St. Aloysius.
  - *Delivery*: a deterministic test on the final request string asserts the
    structure block and Adam's three memberships are present.
  - *Interpretation*: Ann's instructions say what each block means and that
    "real power" needs a meeting or note source.
  - *Behaviour*: a fixture where meetings show decisions made by a deputy, not the
    principal, gives a `real_power` thread naming the deputy. The negative control
    (no such meetings) doesn't claim it.
  - Exercise **Ann's** real route, not a generic agent.
- **Failure modes:**
  - I1: no kinetic text on editable threads.
  - I3: before the first run, "Ann hasn't read St. Aloysius yet. Run now". A failed
    run shows the failure, never an empty card that looks complete.
  - D5: each thread reads as a sentence with a source label.
  - L2: the card height is its content.

## Phase 6: Structure proposals (Ann): ships in the People Phase 2 PR

- Ann reads Knowledge pages tagged to an organisation (staff handbook, org chart,
  bulletin). She proposes units, positions, heads and exceptions into the People
  Phase 2 proposal store (`proposer: 'ann'`).
- Proposals show as dashed ghost nodes and edges on the flowchart with ✓ / ✕,
  and patch in place.
- A declined proposal isn't re-proposed from the same source.
- Nothing is written to the structure without Adam's confirm.
- **Failure modes:**
  - Agent context integrity: delivery test that the Knowledge page text reaches
    Ann's request, and a behaviour fixture from a real handbook page.
  - V4: the proposal badge count equals the ghost count.
  - I3: "Nothing to confirm".

---

## Phase 7: Compare

- **Route.** `#/organisations/compare?ids=a,b[,c]`, 2–3 organisations, each drawn
  by Phase 3's flowchart in compact mode, side by side. At 390 they stack, and
  bridges become a list.
- **Bridges.** `_shared/org-bridges.mjs`, pure. Candidates:
  - **moved**: `employee_at` in both organisations;
  - **know each other**: `professional_relationship` between a person in each;
  - **met at an event**: shared `attendee` on one event.
- **The useful-link rule.** A candidate is shown only if at least one holds:
  1. the far end is cold or never met, and the near end is warm (a route in);
  2. either end is tied to an open opportunity at either organisation;
  3. it's Adam's own move and an upcoming event includes cold former colleagues.
  
  Everything else is counted as "N more hidden", and **All links** shows them.
- **Reasons.** Each shown bridge gets a number and a rule-written reason. The
  reasons are deterministic text, not model output (D5), e.g. "Henry is your
  warmest way back into Trinity's HSIE faculty, not you."
- **Drawing.** Ghost lines are drawn between the facing edges of the two flowcharts.
- **Failure modes:**
  - D4: the rule is tested against real St. Aloysius / Trinity links.
  - V4: the numbered badges equal the reasons list, and the hidden count is correct.
  - C1: badges don't overlap.
  - S4.
  - R2: at 390 the list replaces lines.
  - P3: live Compare of St. Aloysius and Trinity shows the Henry → Bianca route
    only while Bianca is cold.

## Phase 8: Sweeps and Hammond: ships in the People Phase 8 PR

- **Clare's sweep** proposes organisation links from new events (`venue`,
  `provider`) and tasks (`studied_at`/`placement_at` mentions) into the proposal store.
- **Hammond** flags an opportunity closing within 7 days when it matches an active
  goal or project (`Hammond→Adam` line).
- **Internet sweep: to be built** (separate spec). It writes to the Phase 4 store.

---

## Order and dependencies

| Phase | Depends on | Ships in |
|---|---|---|
| 1 Wall + page | People PR 505 merged | This PR |
| 2 Structure data | 1 | This PR |
| 3 Flowchart | 2 | This PR (only new dependency: `elkjs`) |
| 4 Opportunities | 1 | This PR |
| 5 Ann's read | 2, 4 | This PR |
| 7 Compare | 3 | This PR (provisional warmth until People Phase 3) |
| 6 Structure proposals | 2, People Phase 2 | The People Phase 2 PR, not a new one |
| 8 Sweeps | People Phase 2, 4; sweeps live | The People Phase 8 PR; the internet sweep is a separate later spec |

Build order in this PR: 1 → 2 → 3 → 4 → 5 → 7.

## Verification per phase (before each phase commit)

```bash
cd apps/professional && npm test && npm run typecheck && npm run build
npm test   # repo root: netlify function unit tests
```

Then:
1. Take live 1440 and 390 screenshots on real data.
2. Write the mockup diff.
3. List the failure-register IDs checked in the progress ledger.
4. Write Must / Must-not / Verify for the phase's acceptance scenario.

Run the full set once more before marking the single PR ready for review.
