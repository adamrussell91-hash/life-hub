# People experience — build programme

## Outcome

Build the People section of Professional Hub — the six screens designed and
mocked in this folder's `SOURCE-BRIEF.md` (People Home, Person Profile,
Person Brief, Network Ecology world view, Organisation page, Your Network /
EGO view) — as a sequence of scoped, independently shippable phases on top
of the Universal Links data layer that already exists.

This document is the build document `SOURCE-BRIEF.md` Part E asked for. It
does not repeat the product brief (`SOURCE-BRIEF.md` Part A, the 54-section
brief) or the mockup descriptions (Part B) — read those first if you have
not. What follows re-verifies every reuse claim in Part C against the
current repository (several have drifted since that document was written —
see "Corrections to SOURCE-BRIEF" below) and turns Part D's gap analysis
into per-feature contracts.

Do not treat this document as a substitute for reading the source files it
cites. Line numbers and function names below were correct as of this
session's direct reads; re-check anything load-bearing before extending it,
the same way this document had to re-check `SOURCE-BRIEF.md`.

## Repository state

Repository: `adamrussell91-hash/life-hub`

Branch: `claude/people-section-build-plan-pgbc0x`, merged forward from
`claude/people-section-mockups-7vz5yp` (PR #341, draft) to bring in
`SOURCE-BRIEF.md` and the six mockups. This document is the only new file
this branch adds.

This is a planning document only. No application code, schema, or test
changes ship on this branch. The phases below are written so a future
session — human-directed or Cursor, which maintains
`docs/consolidation/plan.md` and the `docs/universal-links/` programme docs
— can start Phase 1 immediately without re-deriving scope.

## Scope and ownership

In scope for this document: an implementation path for each of the six
mockups, phased per the brief's own section 53 sequence, with concrete file
changes, server contracts, and tests.

Out of scope, same boundary `apps/professional/AGENTS.md` already draws:
Tasks integration beyond what Milestones 5–6 already shipped, Meetings,
Events, Applications, Career, Knowledge migration, StudentReference. People
work must not regress or duplicate any of those.

Out of scope for the *product*, per the brief itself (Principle 6, section
26): no numerical relationship scores, no "influence" or "usefulness"
ranking of people. Every "why" in a suggestion, cohort, or habitat must cite
observable evidence (dates, shared contexts, shared work), never a hidden
weight.

This programme does not touch `docs/consolidation/`. That is the umbrella
fold, a separate, now-largely-complete project — do not write
`docs/consolidation/checkpoints/` from here.

## Mandatory source reading

Before implementing any phase below, read, in order:

1. Root `CLAUDE.md`.
2. `packages/design-kit/AGENTS.md`, `RAIL.md`, `MOBILE.md`, `ICONS.md`.
3. `apps/professional/AGENTS.md` and `apps/professional/README.md`.
4. `docs/professional-hub/people-experience/SOURCE-BRIEF.md` in full —
   Part A is the product brief every section below cites by number; Part C
   is the reuse map this document re-verifies; Part D is the gap analysis
   this document turns into contracts.
5. `docs/universal-links/implementation-programme.md`, particularly the
   Universal Link write path, relationship registry, and entity resolver
   sections — the data layer every phase below builds on.
6. `docs/proposals/comms-hub-people-unification.md` — why Person/
   Organisation are shared identities and Universal Links are the only
   relationship mechanism; several phases below extend the registry this
   document explains.
7. Current code, read directly rather than trusted from this document:
   `netlify/functions/_shared/relationship-registry.mjs`,
   `netlify/functions/_shared/entity-overview.mjs`,
   `apps/professional/src/components/entity-detail.ts`,
   `apps/professional/src/views/person-page.ts`,
   `apps/professional/src/app/router.ts`.

Reuse existing auth, HTTP envelope, validation, operation journal, resolver,
and Blob adapter patterns (`operator-gate.mjs`, `http.mjs`,
`universal-link-blobs.mjs`, `universal-link-repository.mjs`). Do not create
parallel versions for People-specific needs.

## Corrections to SOURCE-BRIEF (re-verified this session)

`SOURCE-BRIEF.md` says to re-verify anything load-bearing before relying on
it. Two things had drifted or were overstated:

1. **The relationship registry has 19 declared keys today, not 8**
   (`netlify/functions/_shared/relationship-registry.mjs`, lines 44–324:
   `employee_at`, `member_of`, `collaborator`, `contact`, `recipient`,
   `about_person`, `follows_from`, `follow_up`, `attendee`, `preparation`,
   `venue`, `provider`, `learning_for`, `related_to`, `applies_to`,
   `application_contact`, `referee`, `application_action`,
   `participates_in`). The count grew because Milestones 5–6
   (Communications, Tasks relationships) landed since Part C was written —
   confirmed by their presence: `communications.mjs`,
   `communication-schema.mjs`, `communication-repository.mjs`,
   `professional-blobs.mjs` all exist and are wired up. This is good news
   (more of the plumbing Phase-1-and-later phases need already exists) but
   the specific number "8" in Part C is stale; do not cite it further.

2. **No `shared:person` ↔ `shared:person` relationship type exists in the
   registry at all.** This is the single most important correction in this
   document, because it blocks Phase 1 (Person Profile) as literally
   mocked. Read the registry closely: `collaborator` and `contact` — the
   two keys that sound like the brief's person-to-person relationship
   language — are actually declared `source_kinds: ['tasks:task']`,
   `target_kinds: ['shared:person']` (lines 74–91). They mean "a Task has
   this Person as a collaborator/contact," not "Person A is a colleague of
   Person B." Every other declared key is similarly Task-to-Person,
   Communication-to-Person, Meeting-to-Person, or Application-to-Person.
   `SOURCE-BRIEF.md` Part C's claim that Universal Links already carry
   "Current + historical relationships" for the Person Profile's brief
   sections 6, 10, 16 is true only for **Person-to-Organisation**
   relationships (`employee_at`, `member_of`). The brief's Current
   Relationships module (section 10) and Human Relationship Labels
   (section 11) — "Academic contact," "Mentor," "Research collaborator,"
   "Former colleague" between two *people* — has no registry key to write
   through today. This is new work, not reuse, and it was not called out
   as such in Part D. See Phase 1, Feature 1.1 below for the resolution
   this document proposes and the open decision it still leaves for Adam.

Everything else in Part C's reuse table (`entity-overview.mjs` assembler
shape, `entity-search.ts`/`entity-picker.js`, the four knowledge/tasks graph
engines, `sankey-flow.js`, `radial-year.js`) was re-opened and re-read this
session and stands as described, with exact paths and line counts recorded
per feature below.

## Phase 1 — fitted Person Profile

Brief section 53: "Phase 1 should perfect the Person Profile." This is the
closest phase to already-built: `entity-overview.mjs` (302 lines) and
`entity-detail.ts` (239 lines) already assemble and render current/
historical relationships, linked activity, and a timeline for a Person. What
Phase 1 adds is the brief's richer shape (tabs, summary strip, human labels,
observations, evidence) on top of that existing pipe, plus the one missing
registry primitive identified above.

### Feature 1.1 — person-to-person relationships (new registry key)

**New work**, not reuse. Add one relationship declaration to
`netlify/functions/_shared/relationship-registry.mjs`, following the exact
`declaration({...})` shape already used by every other key (lines 44–56):

```js
[
  'professional_relationship',
  declaration({
    key: 'professional_relationship',
    sourceKinds: ['shared:person'],
    targetKinds: ['shared:person'],
    inverseLabel: 'professional_relationship',
    cardinality: 'many_to_many',
    temporalMode: 'period',
    roleMode: 'optional_text',
    allowedRoles: [
      'colleague', 'former_colleague', 'mentor', 'mentee',
      'academic_contact', 'research_collaborator', 'recruiter',
      'referee', 'conference_contact', 'introduction'
    ],
    metadataKeys: ['human_label']
  })
]
```

Design notes, not yet decided by Adam — **flag these, do not silently pick
an answer**:

- **Symmetric by construction.** Unlike `related_to` (also symmetric,
  line 212), a person-to-person relationship is directional in wording
  (`mentor`/`mentee`) but the *link* itself has one canonical direction
  (source = the person who initiated or the earlier-known party — pick a
  rule and document it in the declaration's comment). `inverse_label` should
  probably differ per role rather than being the single string
  `'professional_relationship'` above; the registry's `declaration()`
  helper does not currently support a per-role inverse label, so this is
  either a small registry extension or a decision to store the inverse
  wording in `metadata.human_label` on both ends' resolved projections.
- **`role` vs `metadata.human_label`.** `role` (an enum via `allowedRoles`)
  is the *canonical relationship type* the brief distinguishes from the
  *human description* in section 11 ("Collaborator" vs. "Research person I
  bounce ideas off"). `metadata.human_label` is free text and must go
  through the same trim/length-bound discipline the Communication schema
  already applies to `subject`/`summary` (`communication-schema.mjs`) —
  do not leave it unbounded.
- **One relationship per period, not one canonical type ever.** Principle 3
  (history must survive editing) means changing "Colleague" to "Former
  colleague" must close the current period link and open a new one, exactly
  like `entity-detail.ts`'s existing `renderRoleEditor` /
  `changeUniversalLinkRole` flow for `employee_at`/`member_of` (lines
  37–106) — that UI and its server action already generalise to this new
  key without modification once the key exists. A person can hold more than
  one *simultaneous* `professional_relationship` link to the same other
  person (e.g. concurrently "colleague" and "mentor") — cardinality
  `many_to_many` already allows this; confirm the write path's duplicate
  hashing (`equivalenceInput`, `universal-link-schema.mjs` lines 96–121)
  treats different `role` values as distinct links, which it does since
  `role` is one of the `duplicate_fields`.
- **Open product decision for Adam:** should `allowedRoles` be a closed
  enum (as drafted above) or `optional_text` free-form like `employee_at`'s
  role? A closed enum gives Dynamic Cohorts (Phase 2) and Network Ecology's
  habitat classifier (Phase 4) a stable vocabulary to group on; free text
  gives the user Adam's own words but nothing groupable without an
  additional normalisation step. Recommend the closed enum with an
  `'other'` escape hatch plus `human_label` for the personal phrasing, but
  this is Adam's call, not this document's.

### Feature 1.2 — tabbed Overview/Timeline/Shared Work/Observations/Network/Evidence/History

`apps/professional/src/views/person-page.ts` (32 lines) is a thin wrapper
that calls `renderEntityDetail` with a `renderExtraFields` hook. Fork the
tab shell as new state inside `person-page.ts` (or a new
`apps/professional/src/components/person-tabs.ts` if the tab chrome should
be shared with `organisation-page.ts` later — check that file before
deciding) that renders one `EntityDetailConfig`-shaped section per tab, on
top of the *same* `fetchEntityOverview(ref)` call `entity-detail.ts` already
makes (line 143). Do not add a second network round trip per tab — the
`EntityOverview` response already contains everything Overview, Timeline,
Shared Work (a filter over `linked_records`), and History (a filter over
`historical_relationships` + timeline) need. Observations and Evidence
(Features 1.4–1.5 below) are the two tabs needing new server data.

`entity-detail.ts`'s existing `renderRelationshipList` /
`renderRoleEditor` /  `renderRelationshipTimeline` (imports
`packages/design-kit/js/relationship-timeline.js` via the 10-line
`apps/professional/src/components/relationship-timeline.ts` wrapper) are the
reusable primitives for the Current Relationships module (section 10) and
Timeline tab (section 16) respectively — extend, do not fork, unless the
new `professional_relationship` role/human-label rendering genuinely needs
different markup than `employee_at`/`member_of` rows do.

### Feature 1.3 — person header, summary strip, human relationship labels

New markup in the tab shell's Overview section, all sourced from the
existing `EntityOverview.entity` fields (`identity-schema.mjs`) plus the new
`professional_relationship` links from 1.1. The "relationship state" word
(Active/Cooling/Dormant/Reactivated/New, brief section 21) is **new
computed data**, not stored — see Feature 1.6.

### Feature 1.4 — Observations

**New work**, confirmed no analogue exists (`SOURCE-BRIEF.md` Part D item 1
checked `apps/professional/src/domain/types.ts`'s `incomplete_links`
tracking and correctly found it unrelated). Follow the Communication
storage pattern exactly (`professional-blobs.mjs`,
`communication-schema.mjs`, `communication-repository.mjs`,
`communications.mjs`) rather than inventing a new persistence shape:

```text
netlify/functions/_shared/observation-schema.mjs
netlify/functions/observations.mjs
```

Store name: `professional-hub-content` (same store Communications use — no
new Blob store).

```js
{
  schema_version: 1,
  id: 'observation_<uuid>',
  about_ref: 'shared:person:<id>',   // or shared:organisation:<id>
  text: '',                           // trimmed, bounded length
  occurred_at: '<ISO timestamp>',
  source: 'meeting' | 'communication' | 'manual' | 'imported',
  linked_ref: null,                   // optional: meeting/communication ref this came from
  created_at: '<ISO timestamp>',
  updated_at: '<ISO timestamp>'
}
```

Route: `GET/POST /api/observations?about_ref=<encoded ref>`. Same operator
gate, CORS policy, `{ ok, data | error }` envelope as `communications.mjs`.
List sorted `occurred_at` descending then ID, same tie-break rule
`entity-overview.mjs`'s `compareTimelineOrder` already uses (lines 47–56) —
reuse that comparator rather than re-deriving it.

Section 14's "repeated observations might prompt a structured update"
(e.g. three observations mentioning a new organisation triggering a change-
detection prompt) is Phase 2/3 work (Change Detection, brief section 22) —
do not build the prompt heuristic in Phase 1; just get observations stored,
listed, and rendered on the new tab.

### Feature 1.5 — Evidence Ledger and Collection Gaps

**New work**, confirmed no analogue (`SOURCE-BRIEF.md` Part D item 1).
This is the one Phase 1 feature most likely to be over-scoped if built
literally — the brief's example (section 17) is per-*fact* provenance
(e.g. "current employer" sourced from an email signature vs. a LinkedIn
import), which requires each identity fact to carry a source annotation,
not just each relationship. `identity-schema.mjs` (277 lines) does not
currently have a per-field evidence structure.

Recommend scoping Phase 1's Evidence tab to **evidence about relationships
and observations only** (which already have a natural source: the
Universal Link's own `metadata`/`context_ref`, and the new Observation's
`source`/`linked_ref` from 1.4) rather than per-identity-field evidence,
and treating full per-fact provenance (conflicting employer sources, the
"UNSW vs. University of Melbourne" example) as Phase 5 ("deeper network
intelligence," brief section 53). Record this scoping choice explicitly in
the Phase 1 PR description so a reviewer knows Evidence is deliberately
partial, not an oversight.

Collection Gaps (section 18) can ship in Phase 1 without new storage: it is
a derived, computed list (e.g. "no `professional_relationship` link has a
`human_label`," "no interaction recorded in the last 12 months") over data
Phase 1 already has — a pure function over `EntityOverview` plus the new
Observations list, not a stored record.

### Feature 1.6 — Relationship Activity State classifier

**New work**, confirmed no analogue (`SOURCE-BRIEF.md` Part D item 2). A
pure function, not a stored field (recomputed on read, same principle as
Collection Gaps):

```ts
// apps/professional/src/domain/relationship-state.ts
type RelationshipState = 'active' | 'cooling' | 'dormant' | 'reactivated' | 'new';
function classifyRelationshipState(input: {
  lastMeaningfulInteraction: string | null;
  upcomingInteraction: string | null;
  activeSharedContexts: number;
  personCreatedAt: string;
}): { state: RelationshipState; reasons: string[] };
```

`reasons` is mandatory and rendered whenever the state word is shown
(brief section 21: "clicking Active reveals the evidence" — section 9's
example: "Three meaningful interactions during the past six months," etc.).
Never render the state word without its reasons available on click/tap —
that is what keeps this compliant with Principle 6 (no opaque score).
Thresholds (what counts as "meaningful," how many months to "cooling") are
a product decision to pin down with Adam before writing tests, not an
implementation detail — write the thresholds as named constants at the top
of the file so they are trivially adjustable, and list them explicitly in
the PR description.

### Server contract summary (Phase 1)

- Extend `GET /api/entities/overview` response — add `professional_relationship`
  as a queryable `current_relationships`/`historical_relationships` entry
  type (no response shape change, just a new possible `relationship_type`
  value once the registry declares it).
- New `GET/POST /api/observations?about_ref=<ref>`.
- No new route for Evidence/Collection Gaps/Relationship State in Phase 1 —
  all three are computed client-side from the overview + observations
  responses already fetched for the page. If profiling later shows this is
  too much client computation, move classification server-side into
  `entity-overview.mjs` as an additional response field — do not do this
  pre-emptively.

### Required tests (Phase 1)

Follow `apps/professional/tests/unit/*.test.ts` convention (Vitest,
`describe`/`it`, `jsonResponse()` fetch mocking as in
`entity-detail.test.ts` lines 1–33):

1. `relationship-registry.test.mjs` (or extend existing registry tests, if
   present under `netlify/functions/_shared/`): `professional_relationship`
   validates person→person only, rejects a task or organisation endpoint,
   enforces the `allowedRoles` enum, accepts `metadata.human_label` and
   rejects unknown metadata keys.
2. `observation-schema.test.mjs`: valid/invalid boundaries (bounded text
   length, required `occurred_at`, valid `source` enum), mirroring
   `communication-schema.mjs`'s existing boundary tests.
3. `observations.test.mjs` (Netlify function): auth, CORS, method,
   malformed JSON, list ordering, path-safe ID generation — same checklist
   `communications.mjs`'s test file already exercises for Communications.
4. `apps/professional/tests/unit/person-page.test.ts` (extend
   `entity-detail.test.ts`'s existing fixtures): tabs render, role editor
   still works for `employee_at` **and** the new `professional_relationship`
   role, human-label displays when present and is absent gracefully when
   not.
5. `relationship-state.test.ts`: table-driven cases for each of the five
   states plus their `reasons` output — pure function, no fetch mocking
   needed.
6. `collection-gaps.test.ts`: same style, pure function over a constructed
   `EntityOverview` + observations fixture.
7. Rapid-navigation regression: extend the existing stale-response guard
   test pattern (`apps/professional/AGENTS.md` references PR 315's
   navigation-generation guard) to cover tab switches within one Person
   page, not just page-to-page navigation.

## Phase 2 — People Home and Professional Overview

Brief section 53: "Phase 2 should build People Home and Professional
Overview." Focus: recent changes, reconnect, dynamic cohorts, upcoming
interactions.

### Feature 2.1 — People Home replaces the current search-only `#/people`

`apps/professional/src/views/people.ts` (23 lines) today is *only*
`mountEntitySearch` — confirmed by direct read, not inferred. The brief's
People Home (section 4: signal cards, People Today modules, Dynamic
Cohorts, Recent Activity) is a materially different page, not an extension
of a search box. Two structural options, pick one and document the choice
in the Phase 2 PR:

(a) Change `#/people` to render the new dashboard, move the existing search
    box into a persistent header search action (the brief's own "Secondary
    action: Search" in section 4 supports this — search becomes an action,
    not the landing content); or
(b) Add a new `#/professional-overview`-style route for the dashboard and
    keep `#/people` as search+list.

Recommend (a): the brief explicitly describes People Home as *the* entry
point (section 3: "People Home acts as the entry point"), and
`railHighlightFor` / `parseRoute` in `router.ts` (177 lines) already treat
`people` as the rail's primary destination — a second competing landing
page under the same rail item would be confusing. `mountEntitySearch`
(`entity-search.ts`, 174 lines) stays exactly as-is and is reused as the
header search affordance.

### Feature 2.2 — signal cards and People Today modules

All four signal cards (Active relationships / Upcoming interactions /
Recent relationship changes / Current opportunity windows) and most People
Today modules (Reconnect, Recent relationship changes, New connections) are
**aggregation queries over data Phase 1 already produces** — counts and
recency over `professional_relationship` links plus the Relationship
Activity State classifier (Feature 1.6). "Upcoming meetings and events" pull
from the existing Meetings/Events routes (`apps/professional/AGENTS.md`
confirms these exist as separate, already-integrated destinations). New
server work is one aggregation endpoint rather than the client fetching and
recombining five separate overview calls per visible person:

```text
GET /api/people/home-signals
```

Returns the four signal counts plus the People Today module contents in one
authenticated call, built the same way `entity-overview.mjs` assembles
`EntityOverview` from lower-level repository calls — do not have this
handler re-implement relationship-state classification; import Feature
1.6's classifier (move it to a `_shared/` module if the client-only version
from Phase 1 needs to run server-side here too — likely, since the classifier
must run over *every* person, not one at a time, and doing that in the
browser after downloading every person's linked data would be wasteful and
would leak data outside `entity-overview.mjs`'s existing per-record
authorisation boundary).

### Feature 2.3 — Dynamic Cohorts

Real engineering, but a query, not new architecture (`SOURCE-BRIEF.md` Part
D item 5 correctly scoped this). A cohort is "people who share a
`context_ref`/organisation/`professional_relationship` role" — group by
existing link fields. Confirm `universal-link-blobs.mjs`'s by-source/
by-target index (313 lines) supports an efficient "all links with this
`context_key`" scan before committing to a query shape; if it only indexes
by single-entity ref today, a cohort query needs either a new secondary
index or an accepted full-scan-with-cache cost for the (presumably modest)
Professional Hub data volume — check current index shape first, this
document does not re-verify that internal detail.

### Feature 2.4 — Recent Activity strip

A filtered projection of the timeline entries `entity-overview.mjs` already
produces per-person, unioned across people and sorted by date — same
`compareTimelineOrder` comparator, applied across the whole People store
rather than one entity's timeline. New endpoint or a `scope=all` parameter
on a shared timeline-projection helper — prefer extracting the comparator
and point-entry shaping into a function `entity-overview.mjs` and this new
endpoint both call, rather than duplicating it.

### Server contract summary (Phase 2)

- `GET /api/people/home-signals` (new) — signals + People Today modules.
- `GET /api/people/cohorts` (new) — Dynamic Cohorts list and per-cohort
  detail.
- `GET /api/people/activity?since=<cursor>` (new) — Recent Activity strip,
  paginated the same way `entity-overview.mjs`'s timeline already is
  (`encodeTimelineCursor`/`decodeTimelineCursor`, lines 29–44 — reuse this
  cursor shape rather than inventing another).

### Required tests (Phase 2)

1. Home-signals aggregation: each of the four signals computed correctly
   from a fixture set of people/links/meetings; empty-state text matches
   brief section 50 exactly ("No current opportunity windows detected."
   etc.).
2. Cohort grouping: people with a shared `context_key` group together;
   people with no shared context appear in zero cohorts (not a default
   "Uncategorised" cohort — the brief never asks for one).
3. Recent Activity ordering and pagination, mirroring
   `entity-overview.mjs`'s existing timeline pagination tests.
4. `apps/professional/tests/unit/people-home.test.ts`: renders all four
   signal cards, all People Today module types, cohort chip row, activity
   feed; desktop and 390px layout tests per the repo's existing mobile
   convention (`packages/design-kit/MOBILE.md`).
5. Reconnect suggestion cap: never renders more than 3–5 suggestions
   (brief section 20 — "do not produce a backlog") even when the fixture
   data has many eligible candidates.

## Phase 3 — Person Brief and Relational Search

Brief section 53: "Phase 3 should build Person Brief and relational
search." Focus: Since you last spoke, Open loops, Recent changes, Mutual
connections, relationship queries.

### Feature 3.1 — Person Brief page and layout

Mockup 3 (`03-person-brief.png` / `.html`) is deliberately a different
layout family from every other People screen — a centred reading "sheet,"
not rail+canvas. Build it as its own top-level view
(`apps/professional/src/views/person-brief.ts`), not a mode of
`person-page.ts`. Route: `#/person/<id>/brief` (brief section 19's "Open
Person Brief" quick action from the Person header, Feature 1.3, links
here).

Most sections (Who they are, Open loops, Current shared work, Mutual
connections) are re-shaped subsets of the same `EntityOverview` +
Observations data Phase 1 already fetches — no new storage. Reuse the exact
mockup's HTML/CSS structure in `mockups/03-person-brief.html` as the
starting markup; it was built against the real `packages/design-kit/
tokens.css`, not placeholder styling, so porting it into a Vite component is
closer to "wire up real data" than "redesign."

### Feature 3.2 — "Since you last spoke" (LLM generation)

**New work** (`SOURCE-BRIEF.md` Part D item 4, confirmed): the first People
feature needing server-side LLM generation over a structured diff rather
than query+render. The pattern to fork is confirmed in
`netlify/functions/knowledge-clementine-coach.mjs`: a direct
`https://api.anthropic.com/v1/messages` call (model `claude-sonnet-4-6` in
that file — check current model choice against `claude-api` guidance before
copying verbatim, model IDs move), gated the same `createOperatorHandler`
way as every other Professional route, degrading to a
`knowledge_anthropic_unbound`-style 503 when unbound rather than failing
hard. Follow `netlify/functions/ai-job.mjs` / `ai-jobs.mjs`'s job-queue
shape (job written, job resolved async, `writeJobInbox`) if brief-generation
latency makes a synchronous request-response feel slow in practice — decide
this against real latency, not speculatively.

The prompt's structured input is: the person's `EntityOverview` timeline
entries since the last meaningful interaction, any Observations since then,
and any `professional_relationship`/`employee_at` links that changed
(opened or closed) in that window. The prompt's job is entirely
summarisation over that closed set — it must never be given license to
invent facts not present in the structured input. Section 19's own warning
("should feel like professional preparation, not surveillance") is a tone
constraint on the prompt, real product work, not plumbing — write and
iterate the prompt with Adam before hard-coding it into a test fixture's
expected output (test the *shape* and *inputs* deterministically; do not
assert exact LLM prose in a unit test — assert the function correctly
degrades when the model call fails, and correctly assembles the input
context).

### Feature 3.3 — Relational Search

Section 45's example queries ("Who do I know at UNSW connected to gifted
education?") go beyond `entity-search.mjs`'s current MiniSearch-backed
name/label search (332 lines). Two layers:

1. **Structured relational queries** (organisation + context + relationship
   type combinations) — a query builder over the same link-index data
   Dynamic Cohorts (2.3) already queries. Ship this first; it covers most
   of section 45's examples without any LLM involvement.
2. **Natural-language relational search** ("who have I not spoken with
   recently but share an active project with?") — an LLM query-planning
   layer that translates the question into the structured query from (1),
   using the same Anthropic-call pattern as 3.2. Explicitly Phase 3-and-a-
   half: ship (1) in Phase 3, treat (2) as acceptable to defer into Phase 5
   ("advanced opportunity detection," brief section 53) if Phase 3's time
   budget is tight — the brief does not require natural-language parsing to
   be a Phase 3 blocker, only that *relational* (not just name) search
   exists.

### Server contract summary (Phase 3)

- `GET /api/people/<id>/brief` (new) — assembles Feature 3.1's structured
  sections; synchronous.
- `POST /api/people/<id>/brief/generate` (new) — triggers 3.2's LLM call;
  returns the generated sections or a job reference per the ai-job pattern
  decided above.
- `GET /api/people/relational-search?q=<encoded>` (new) — Feature 3.3 layer
  1's structured query endpoint. Layer 2, if built in this phase, wraps this
  endpoint rather than replacing it.

### Required tests (Phase 3)

1. Person Brief section assembly: Open loops, Recent changes, Mutual
   connections computed correctly from fixture overview + observations
   data.
2. "Since you last spoke" generation: prompt-input assembly is
   deterministic and testable without a real API call (inject a fake
   Anthropic client, assert exactly what context it receives); graceful
   503 degradation when unbound, matching the existing
   `knowledge_anthropic_unbound`-style contract.
3. Relational search: each of section 45's example query shapes returns
   correct results against a fixture graph; result explanations
   ("why each result matched," section 45's own requirement) are present
   and non-empty for every result.
4. `apps/professional/tests/unit/person-brief.test.ts`: renders all six
   body sections plus the two additional ones (Current shared work, Mutual
   connections), Snooze and Open full profile actions work, desktop and
   390px.

## Phase 4 — Network Ecology

Brief section 53: "Phase 4 should build Network Ecology." Focus: World
view, Habitats, EGO Ecology, Bridge people, Ecotones, Opportunity, Dormancy,
History.

This is the showpiece and the biggest single phase. `SOURCE-BRIEF.md` Part
C's graph-engine reuse table is the load-bearing claim here — every path in
it was re-opened this session and the specific exported symbols it names
were grepped and confirmed present (see this session's verification; exact
line numbers below).

### Feature 4.1 — World view rendering engine

Fork, do not import cross-app: `mountForceGraph`
(`apps/knowledge/src/archive/forceGraph.ts:87`, 788 lines total,
`"constellation"` vs `"showAll"` variants) is Knowledge-app-local — copy its
mechanical structure (canvas rendering, hover/drag/select, animated fade
between view states) into a new
`apps/professional/src/components/network-ecology.ts`, swapping the node/
link data source from Knowledge's notes to People/Organisations. Do not
attempt a shared cross-app import; these apps do not currently share
component code across app boundaries (confirm this against the current
build config before assuming otherwise — `packages/design-kit/` is the only
established shared layer).

Habitat clustering: `collapseConstellation` / `applyConstellationHubClick`
(`apps/knowledge/src/archive/keywordGraph.ts:256` and confirmed present via
grep — the clustering mechanism, hub = topic keyword today) is the direct
analogue for hub = organisation/shared-context, leaf = person. This is
confirmed still accurate, matching `SOURCE-BRIEF.md` Part C exactly.

### Feature 4.2 — Habitat classification rule

**Open product/algorithm decision, not yet made** (`SOURCE-BRIEF.md` Part D
item 3, confirmed still open). The clustering *mechanism* is reused per
4.1; the *rule* deciding a cluster reads as Forest vs. Reef vs. Mangrove vs.
Savannah vs. Wetland vs. Island (brief sections 28–33) needs concrete,
written thresholds before this feature can be implemented, e.g.:

- Forest: internal link density above threshold *X*, median relationship
  duration above *Y* months, low cross-cluster bridging.
  do not invent the numbers in this document — sit with Adam and set them
  against real (or realistic synthetic) data, the same way Feature 1.6's
  Relationship Activity State thresholds need pinning down first.
- Wetland is explicitly *temporal* (section 32: "grows before the event and
  recedes afterwards") — this requires the classifier to be re-run against
  a moving time window, not a single static pass; wire this as the same
  input the History mode (Feature 4.6) scrubber needs, rather than building
  two separate time-windowing mechanisms.
- Ecotones (section 34) are a *derived* overlay, not a habitat type of their
  own — computed where two habitat clusters' boundary link-density exceeds
  a threshold. Build this after the six base habitat rules exist and are
  validated, not concurrently.

Write the classifier as a pure, independently testable function
(`classifyHabitat(cluster): HabitatType`) so its thresholds can be tuned
against fixture data without touching the rendering engine from 4.1.

### Feature 4.3 — EGO Ecology (recentre on one person)

Already built, for a different domain: `selectionCluster`, `isFocusNode`,
`isFocusLink`, `searchCluster` (`apps/knowledge/src/archive/graphFocus.ts`,
confirmed via grep at lines 20, 54, 94, 130) and `neighborhood(edges, focus,
hops)` (`apps/life/js/app/chart-kit/theme-constellation.js:27`, confirmed).
`neighborhood()` is literally the hop-traversal function section 36 needs —
fork it the same way as 4.1, swapping theme/edge data for person/link data.

### Feature 4.4 — Your Network / a second structural precedent

`buildWorkstreamModel` and the `'blockers'`/`'workstreams'` mode toggle
(`apps/tasks/src/views/graph.ts:60` and `:23`, confirmed, using
`forceLink`/`forceManyBody`/`forceX`/`forceY`/`forceCollide` from `d3-force`
at lines 230–238) is structurally the closest existing precedent for mockup
6 (Your Network): two entity kinds, two relationship "layers" toggled on
one graph. `d3-force` is a confirmed repo-root devDependency, proven in
three places already (`apps/tasks/src/views/graph.ts`,
`apps/knowledge/src/archive/forceGraph.ts` +
`constellationSimulation.test.ts`, `apps/life/js/app/chart-kit/d3-layout.js`
— all confirmed present this session). Not a new library evaluation; import
it the same way these three already do.

### Feature 4.5 — Introduction Paths and Bridge People

Introduction Paths (section 23) upgrade path: `buildSankeyFlow`
(`apps/life/js/app/chart-kit/sankey-flow.js:34`, confirmed, wraps
`sankey()` re-exported from `d3-layout.js:6`, which itself wraps the
vendored `d3-sankey.min.js`) turns the "You → Nina → UNSW → James Cho" text
chains from mockup 6 into a real flow diagram. Treat this as a Phase 4
*upgrade*, not a blocker — ship the plain-text chain list first (it is what
mockup 6 actually shows), add the Sankey rendering once the underlying path-
finding query (multi-hop traversal over `professional_relationship` +
`employee_at`/`member_of` links, prioritised as section 23 requires by
"current, evidenced and contextually relevant," never by bare degree-of-
separation count) is proven correct.

Bridge People (section 43) is a query over the same clustering output as
4.2 — people whose links span two or more classified habitats — plus a
plain-language description of *why* each bridge matters (never a ranking,
per Principle 6 / section 43's own "no ranking by personal value").

### Feature 4.6 — History mode (Ecological Succession)

`apps/life/js/app/chart-kit/radial-year.js` (34 lines, confirmed — angle
math for a year-circle) is a *supporting primitive* for the time-scrubber
UI, not the scrubber itself. The actual succession logic — replaying
habitat classification (4.2) across a moving historical window — is new
work, but the *data* it needs already exists: Universal Links already store
dated `valid_from`/`valid_to` periods (confirmed, `universal-link-schema.mjs`
lines 84–89's period validation). Do not build a separate history-tracking
store; recompute classification against link data filtered to `valid_from
<= scrubber_date <= (valid_to ?? now)` at each scrubbed point, same
pagination-free full-recompute approach the brief's section 38 describes
("dragging through time shows...") rather than pre-computing every possible
year server-side.

### Feature 4.7 — Opportunity and Dormancy layers

Both are recolouring/relabelling passes over the same classified graph
(4.1–4.2), not new data: Opportunity (section 40) highlights nodes/edges
tied to upcoming events, new project overlap, or newly-detected changes
(reuse Feature 2.x's change-detection output); Dormancy (section 41) reduces
visual saturation for nodes whose Relationship Activity State (Feature 1.6,
reused server-side per Phase 2's note) is `dormant`. Confirm
`--high-sea` is used exactly as `SOURCE-BRIEF.md` Part B's mockup 4
describes — sparingly, for the Opportunity layer only, never as a habitat
fill (`packages/design-kit/tokens.css:` `--high-sea: #f68620`, confirmed
present and commented as rail/decisive-accent-only in that file).

### Server contract summary (Phase 4)

- `GET /api/network-ecology/world` (new) — full graph: nodes (people,
  organisations), edges (`professional_relationship`, `employee_at`,
  `member_of`, plus shared-context derived edges), and each node's
  classified habitat membership (4.2's output, computed server-side so the
  classification rule and its thresholds are not duplicated client-side).
- `GET /api/network-ecology/ego?ref=<person ref>&hops=<n>` (new) — Feature
  4.3's recentred subgraph.
- `GET /api/network-ecology/history?date=<iso date>` (new) — Feature 4.6's
  point-in-time recomputation.
- All three follow the existing operator-gate + `{ ok, data | error }`
  envelope; all three must respect the Privacy and Visibility rule (brief
  section 52) — a hidden linked record must not leak through node presence,
  edge presence, or habitat membership counts. This is a *harder* version
  of the same rule `entity-overview.mjs` already enforces per-record; a
  world-view endpoint aggregating many records must apply the same
  per-record visibility check to every node and edge it assembles, not just
  to the top-level entity a request names.

### Required tests (Phase 4)

Follow the existing knowledge/tasks graph test convention
(`apps/knowledge/src/archive/graphFocus.test.ts`,
`apps/knowledge/src/archive/keywordGraph.test.ts`,
`apps/tasks/tests/unit/graph-view.test.ts` — all confirmed present, use
their structure as the template):

1. `classifyHabitat` pure-function tests: one fixture per habitat type,
   boundary cases at each threshold, explicit "no habitat forced" case for
   a genuinely ungrouped cluster.
2. World-view visibility: a node/edge behind a hidden or archived record
   never appears in the response, mirroring `entity-overview.mjs`'s
   existing per-record visibility tests.
3. EGO Ecology hop-traversal correctness: `neighborhood()`-equivalent
   output matches expected nodes at hop 1, 2, and beyond-cutoff exclusion.
4. History mode: classification at two different `date` values on the same
   underlying data differs correctly when a link's `valid_from`/`valid_to`
   window changes what is "current" at that date.
5. Introduction Paths: path-finding returns evidenced paths only, never a
   path through a hidden/archived intermediate node.
6. Component tests for `network-ecology.ts`: renders habitats, ecotones,
   opportunity/dormancy states, legend, with the same accessibility
   requirements the brief mandates (section 49 — every habitat has a text
   label, colour never solely encodes state, reduced-motion disables
   animated transitions). Test the text-label and reduced-motion paths
   explicitly; do not assume visual-only QA covers them.
7. Desktop and 390px: brief section 48 explicitly describes a *different*
   mobile flow (community cards, not a shrunk map) — test the mobile
   component separately from the desktop one, not as a CSS-only variant.

## Phase 5 — Mycelium and deeper network intelligence

Brief section 53: "Phase 5 should add Mycelium and deeper network
intelligence." Focus: Universal Links visual layer, cross-habitat analysis,
ecological succession refinement, advanced opportunity detection.

This phase is intentionally underspecified here — it depends on what Phases
1–4 actually ship and learn. Concrete items already identifiable:

- **Mycelium layer** (section 37): a toggle on the Feature 4.1 renderer
  that fades habitat terrain and reveals the raw Universal Link graph
  underneath, using the same edge data 4.1 already has — primarily a
  rendering-mode addition, not new data or new queries.
- **Full per-fact Evidence Ledger** (deferred from Phase 1, Feature 1.5) —
  conflicting-source tracking for identity fields, not just relationships.
- **Natural-language relational search** (deferred from Phase 3, Feature
  3.3 layer 2), if not already pulled forward.
- **Advanced opportunity detection** — cross-referencing Opportunity
  Windows (brief section 44) against multiple signal types simultaneously
  (an event plus a dormant contact plus a shared project overlapping) is
  explicitly called out in the brief as more advanced than Phase 4's
  Opportunity layer (which recolours by single-signal presence).

Do not begin Phase 5 scoping in detail until Phase 4 has shipped and its
actual data shapes are known — several Phase 5 items (Mycelium especially)
depend on decisions Phase 4 has not made yet (e.g. exactly which edge types
the world-view endpoint returns).

## Verification commands

Run per-phase, not only at the end — each phase should be independently
mergeable and independently green:

```text
cd apps/professional && npm test
cd apps/professional && npm run typecheck
cd apps/professional && npm run build
node --test tests/unit/apps-spa-remount.test.js tests/unit/hub-sections.test.js tests/integration/static-server.test.js
```

For phases touching the shared graph primitives (Phase 4 especially), also
run the source apps' own suites to confirm the fork did not silently break
the original:

```text
cd apps/knowledge && npm test
cd apps/tasks && npm test
```

For phases adding new Netlify functions (Observations in Phase 1,
home-signals/cohorts/activity in Phase 2, brief/relational-search in Phase
3, network-ecology in Phase 4):

```text
node --test netlify/functions/_shared/<new-file>.test.mjs
node --test netlify/functions/<new-route>.test.mjs
```

Full umbrella check before any phase's PR is marked ready:

```text
npm test
npm run build
```

If a named package lacks one of these commands, use its existing
equivalent and document the exact command used — do not invent a no-op
script to satisfy this list.

## Stop condition

Each phase stops when:

1. Its features above are built against the server contracts specified,
   with no shortcuts into a simplified contract the production client would
   reject.
2. Its required tests pass, and no existing test elsewhere in the repo
   (Knowledge, Tasks, or Professional Slice 4's existing suites) regresses.
3. Any open product decision the phase surfaced (habitat thresholds,
   `professional_relationship`'s `role` enum vs. free text, Evidence
   Ledger's Phase 1 scope cut) is recorded in the phase's PR description
   as an explicit decision made or explicitly deferred — never silently
   resolved without a record.
4. Desktop and 390px are both verified for any new UI, per this repo's
   existing mobile convention (`packages/design-kit/MOBILE.md`).
5. The phase's PR stays in draft, stacked on the previous phase's branch,
   until Adam reviews it — do not chain all five phases into one
   unreviewed sequence.

Do not begin a later phase's implementation before the phase before it has
been reviewed, even though this document specifies all five up front — the
sequencing exists so review can happen incrementally, not so five phases
ship as one undifferentiated change.
