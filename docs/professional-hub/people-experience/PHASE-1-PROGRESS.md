# People experience — build progress log

Working branch: `worktree-people-phase1` (isolated worktree, off `main`).
Built autonomously per Adam's approval (chat, 2026-09-16 night) to proceed
through BUILD-PLAN.md Phases 1–5 without per-phase check-ins. Decisions the
plan flagged as "Adam's call" are recorded here as they're made, per the
plan's own stop-condition requirement ("never silently resolved without a
record"). Nothing in this branch is pushed to origin or opened as a PR —
that step is left for Adam's explicit review when he's back.

## Decisions made

1. **Feature 1.1 `allowedRoles`: closed enum + `other` escape hatch.**
   Adam's explicit choice (chat, in-session AskUserQuestion), matching the
   plan's own recommendation. Gives Phase 2 Dynamic Cohorts and Phase 4
   habitat classification a stable vocabulary.

2. **Feature 1.6 Relationship Activity State thresholds: proposed defaults,
   not Adam-specified.** Adam's explicit choice (chat) was "propose
   reasonable defaults." Exact constants recorded in
   `apps/professional/src/domain/relationship-state.ts` when written —
   flagged there as tunable, not final.

3. **Feature 1.1 canonical direction + inverse label** (plan flagged this
   as needing "a rule, documented"): source = the person who was known
   first / initiated the relationship (subjective at write time, operator
   picks); single `inverse_label: 'professional_relationship'` rather than
   a per-role inverse (the registry's `declaration()` helper does not
   support per-role inverse labels, and extending it was judged out of
   scope for Phase 1 — the human-readable direction wording lives in
   `metadata.human_label` on each side's resolved projection instead, not
   in the registry).

4. **Features 1.2/1.3 Network tab scoping** (the plan lists Overview/
   Timeline/Shared Work/History as sourced entirely from the existing
   `EntityOverview` fetch, and separately says Observations+Evidence need
   new data, but never says which bucket Network falls in): Network
   renders `linked_records.people` and `linked_records.organisations` —
   the two arrays `EntityOverview` has always returned but that no
   existing UI rendered — as two labeled lists. Zero new server calls,
   same single fetch as every other tab. Known, accepted overlap: both
   lists are built from the same `entries` array as Overview's current
   relationships and History's historical relationships (deduped by ref
   only, no status/role context), so today Network largely re-lists
   "everyone connected" rather than a distinct notion of network — left
   as-is for Phase 1, a later phase can scope it down.

5. **Feature 1.3 `metadata.human_label` pass-through**: chose to extend
   `entity-overview.mjs`'s `current_relationships`/`historical_relationships`
   assembly (normalising `link.metadata` to `{}` when absent, explicitly,
   for every entry) plus `RelationshipLink`'s TS type, rather than punting
   the display of human labels to a follow-up. On investigation, the raw
   link record already carried `metadata` end-to-end (`validateUniversalLinkRecord`
   and the GitHub-import merge both set it) — the gap was only that
   `entity-overview.mjs` didn't make the field explicit/normalised and the
   client-side TS type didn't declare it, not that the data was actually
   missing.

6. **Feature 1.6 integration `RelationshipStateInput` derivation**:
   `upcomingInteraction` is always `null` and `activeSharedContexts` is
   always `0` — `EntityOverview` has no data source for either yet. Both
   are flagged as follow-ups (surface scheduled meetings/events for the
   former; derive from shared current relationships/active linked records
   for the latter) rather than fabricated. `lastMeaningfulInteraction`/
   `previousMeaningfulInteraction` come from the two most recent timeline
   entries whose ref matches the relationship's counterpart person —
   corrected post-review (see #7) to check both `source_ref` and
   `target_ref`, not `source_ref` alone.

7. **Review fix: `TimelineEntry` needed `target_ref`.** First cut of #6
   only matched `item.source_ref === counterpartRef`, which is wrong for
   almost all real data (`source_ref` on a Task/Communication/Meeting-
   derived timeline entry is that record's own ref, never a person ref;
   even a direct person-link only matches if the counterpart happens to be
   the link's `source_ref` per #3's "operator picks" direction rule) — this
   silently misclassified nearly everything as Dormant. Fixed by adding
   `target_ref` to `baseTimelineEntry`'s output (purely additive) and
   matching either field client-side. Caught by code review before this
   branch's only human reviewer (Adam) ever saw it; a regression test with
   mixed timeline data now pins the correct behaviour.

8. **Review fix: tab-switch stale-render race.** The tab shell's
   `isCurrent()` only tracked page-level navigation (`routeGeneration`),
   not which tab is currently active. A tab that starts an async fetch
   (Observations, Evidence) and is then switched away from — without any
   page navigation — could still write its late-resolving result into the
   shared `contentHost`, clobbering whatever tab the user had since
   switched to. Fixed with a second, tab-switch-scoped generation counter
   composed into the `isCurrent` passed to each tab's `render`. This is
   also what BUILD-PLAN.md Phase 1 required-tests item 7 ("rapid-navigation
   regression... cover tab switches within one Person page") asked for;
   the regression test added alongside this fix closes that item.

## Phase 2 decisions

9. **Feature 1.6 classifier ported to `.mjs`, not shared.** Netlify
   Functions run plain `.mjs` with no bundler; `apps/professional` is a
   separate Vite/TypeScript build target. No cross-app-boundary import
   exists anywhere else in this repo, so the classifier is duplicated
   (`netlify/functions/_shared/relationship-state.mjs`), byte-for-byte
   identical algorithm/constants/reason-text shape, with a "KEEP IN SYNC"
   comment in both files pointing at each other, and a standalone
   `tests/unit/relationship-state.test.js` (Node's `node:test`) mirroring
   the existing Vitest suite's cases against the port independently, rather
   than assuming the port is bug-free.

10. **Reconnect vs. "Dormant relationships worth reviewing" split.** The
    brief's Reconnect example ("Last meaningful interaction was five months
    ago") sits within/near the Cooling window (90–180 days), not deep
    Dormant (>180 days) — so `computeReconnectSuggestions` is scoped to
    `cooling` only, small and actionable (cap 5, brief: "three to five
    suggestions"). `dormant`-classified relationships get their own,
    separate, deliberately larger, browsable module
    (`computeDormantForReview`, cap 20) instead of being folded into
    Reconnect. This is a new split introduced in this task, not specified
    verbatim by the brief — recorded here per the plan's stop-condition
    requirement.

11. **"Newly detected organisation changes" omitted, not faked.** The
    brief's sixth People Today module depends on Change Detection (brief
    section 22), which the build plan already scoped as Phase 2/3
    "do not build in Phase 1" work requiring pattern-analysis over
    Observations — not a simple aggregation query this task's inputs
    support. No module, placeholder, or fake-data UI hook was added for
    it; People Home ships with five People Today modules instead of six
    until Change Detection lands.

12. **Dynamic Cohorts: organisation-only grouping, not organisation +
    role.** Considered grouping by shared `professional_relationship.role`
    (e.g. every `mentor`-role link) in addition to shared organisation, and
    deliberately did not implement it: a role value is already visible
    per-relationship on the Person Profile itself (Feature 1.3's
    human_label), and globally grouping "everyone ever labelled mentor"
    does not share an actual context the way a shared organisation does —
    it risks conflating unrelated mentor relationships across unrelated
    fields into one misleading bucket. Cohort labels use the organisation's
    own `display_name` directly (e.g. "UNSW") rather than a generated
    creative label ("Gifted Education network") — that needs semantic
    tagging this task has no data for.

13. **Recent Activity endpoint: a lighter parallel path, not
    `assembleEntityOverview` reused per person.** `people-activity.mjs`
    builds timeline entries directly from
    `loadAllPeopleWithRelationships`'s already-hydrated relationship
    arrays, mirroring `entity-overview.mjs`'s private `timelineLabel`/
    `timelineKind`/`effectiveDate` logic rather than calling
    `assembleEntityOverview` once per person — that function also resolves
    a `context_href` per entry (an extra I/O hop) and re-lists membership
    from storage per person, both already paid for by
    `loadAllPeopleWithRelationships`; reusing it as-is would mean a second
    full storage scan across the whole population. Sorting and pagination
    DO reuse the shared pieces exactly: `compareTimelineOrder` and the
    newly-exported `encodeTimelineCursor`/`decodeTimelineCursor` from
    `entity-overview.mjs`, so this endpoint's cursor is interchangeable
    with the Person Profile timeline's own.

14. **Feature 2.1 People Home structure: option (a), matching the plan's own
    recommendation.** `#/people` now renders the People Home dashboard
    directly (`apps/professional/src/views/people-home.ts`, replacing
    `views/people.ts`, which is deleted); `railHighlightFor`/`parseRoute`
    needed no changes. The old flat person/organisation search
    (`mountEntitySearch`) is reused, unchanged, as the header's "Search"
    action — it mounts lazily into a collapsible panel on first click rather
    than being duplicated or rebuilt. `main.ts`'s `people` route branch is
    now `await`ed, matching the `communications`/`meetings`/`events`
    pattern, with `isCurrent` threaded through the same way
    `renderPersonPage`/`renderOrganisationPage` already do.

15. **"Add person" has no real backing action — rendered honestly, not
    faked.** Rapid Person Capture (brief section 5) is a separate,
    not-yet-built feature; no create-person route or endpoint exists
    anywhere in this app (confirmed by search before writing the header).
    The button is real and reachable but its click handler reveals a
    visible status line explaining the scope cut, rather than opening a
    fake modal with nowhere to submit. Follow-up: implement Rapid Person
    Capture and wire this button to it.

16. **"Dormant relationships worth reviewing" links both sides, not a single
    "counterpart."** Unlike `reconnect_suggestions` (which pre-picks a
    counterpart server-side via `is_self`), `dormant_for_review` returns raw
    `source`/`target` with no `is_self` flag in the client payload, so there
    is no reliable way to guess which side is "the person to review" versus
    the operator. Both sides are rendered as links rather than arbitrarily
    picking one.

17. **Recent Activity's empty state reuses SOURCE-BRIEF.md section 50's
    "Empty Timeline" copy** ("No relationship events recorded yet.") rather
    than inventing a second string — the brief doesn't give Recent Activity
    its own empty-state copy, and this page-level strip is structurally the
    same "no events yet" case as the Person Profile Timeline tab it
    aggregates. The Reconnect module's empty state ("No reconnect
    suggestions right now.") is NOT sourced from the brief — section 20
    never specifies one — and is a plain, honest string written for this
    task, not a citation.

18. **Mobile/390px coverage for `people-home.test.ts` is a Vitest smoke
    check, not a layout assertion** — the same convention
    `meetings-events.test.ts`/`applications-career.test.ts` already use
    (set `window.innerWidth`/element width to 390px, assert the same
    content still renders). jsdom has no layout engine, so no
    `apps/professional` unit test asserts computed CSS or pixel geometry;
    that class of check belongs to this repo's Playwright/browser tests,
    not this Vitest suite.

19. **Feature 3.3 Relational Search ships layer 1 (structured queries)
    only — layer 2 (LLM natural-language query parsing) deliberately
    deferred to Phase 5.** BUILD-PLAN.md's own Feature 3.3 section allows
    this explicitly ("Explicitly Phase 3-and-a-half: ship (1) in Phase 3,
    treat (2) as acceptable to defer into Phase 5... if Phase 3's time
    budget is tight"), and Adam delegated the decision to ship layer 1 only
    given the size of this build. No Anthropic/LLM call of any kind exists
    anywhere in `_shared/relational-search.mjs` or
    `people-relational-search.mjs` — only structured filter/explain logic.
    A future Phase 5 task can wrap the same `GET
    /api/people/relational-search` endpoint with an LLM query-planning
    layer that translates a free-text question (e.g. "who have I not
    spoken with recently but share an active project with?") into the
    three structured params below, per the plan's own note that layer 2
    "wraps this endpoint rather than replacing it."

20. **Relational query design: three optional filters
    (`organisation_ref`/`role`/`text`), ANDed together, never ranked.**
    SOURCE-BRIEF.md section 45 gives example questions but no query
    grammar, so this task's own scoping decision (given in the task brief)
    is implemented exactly: `organisation_ref` matches a CURRENT
    `employee_at`/`member_of` link; `role` matches a CURRENT
    `professional_relationship` link whose `role` is one of the
    registry's declared `allowed_roles` (`relationship-registry.mjs`);
    `text` case-insensitively matches EITHER a current
    `professional_relationship` link's `metadata.human_label` OR any of
    the person's Observations' `text` — the only place topic-level context
    like "gifted education" lives in this data model today, since there is
    no dedicated topic-tagging system (not built here — out of scope).
    At least one filter is required; an all-empty query is a 400
    `missing_filter`. Every result carries `matched_reasons: string[]`
    citing exactly which filter(s) matched and how (e.g. "Employed at
    UNSW", "Role: academic_contact", "Human label mentions '...'",
    "Observation mentions '...'"). Per Principle 6 (brief section 2/26),
    results are never ranked or scored — `runRelationalSearch`
    (`netlify/functions/_shared/relational-search.mjs`) only filters and
    explains, returning a stable alphabetical-by-display-name order and
    nothing resembling a score/rank field. AND semantics are load-bearing
    and tested: a person matching only one of several given filters is
    excluded (`tests/unit/relational-search.test.js`'s "AND semantics"
    case constructs people matching org-only, role-only, and both, and
    asserts only the both-matching person is returned).

21. **Route shape deviates from the plan's own `?q=<encoded>` shorthand —
    three named query params instead.** BUILD-PLAN.md's Server Contract
    Summary lists `GET /api/people/relational-search?q=<encoded>`, but a
    single opaque blob would need its own parsing grammar invented for no
    real benefit when three named params (`organisation_ref`, `role`,
    `text`) work fine and match every other Professional route's existing
    query-param convention (`entity-overview.mjs`'s `?ref=`,
    `entity-search.mjs`'s `?q=&kinds=`, `people-brief.mjs`'s
    `?id=&action=`) — the same class of documented shorthand deviation
    prior Phase 3 tasks in this build (Features 3.1/3.2) have made for
    their own routes. Implemented as `GET
    /api/people/relational-search?organisation_ref=<ref>&role=<role>&text=<text>`,
    all three optional, at least one required.

## Phase 4 decisions

22. **Habitat classification thresholds: delegated, fixed numbers — not
    re-derived.** BUILD-PLAN.md Feature 4.2 explicitly leaves the six
    habitats' thresholds as an "open product/algorithm decision... sit
    with Adam and set them against real (or realistic synthetic) data."
    This task's own instructions gave exact, delegated placeholder values
    (`netlify/functions/_shared/habitat-classification.mjs`):
    `HABITAT_MIN_CLUSTER_SIZE=2`, `FOREST_MIN_DENSITY=0.4`,
    `FOREST_MIN_DURATION_DAYS=365`, `FOREST_MIN_SIZE=3`,
    `REEF_MIN_DENSITY=0.3`, `REEF_MIN_ROLE_DIVERSITY=0.5`,
    `REEF_MIN_SIZE=3`, `SAVANNAH_MIN_SIZE=8`, `SAVANNAH_MAX_DENSITY=0.2`,
    `ISLAND_MAX_BRIDGE_RATIO=0.1`, `ISLAND_MAX_SIZE=5`,
    `EVENT_WINDOW_DAYS=30`. These are implemented exactly as given, NOT
    validated against real or synthetic Adam data — flagged here exactly
    the way Feature 1.6's `relationship-state.mjs` thresholds were flagged
    (decision 2 above): named, exported constants at the top of the file
    specifically so they are trivially tunable later without touching the
    classification logic. Classification priority order (Wetland > Island
    > Forest > Reef > Savannah > Unclassified) is likewise the task's own
    delegated decision, documented in-line in `classifyHabitat`'s doc
    comment (most-specific/temporal signal first, broad catch-all last).

23. **Mangrove is Bridge People, not a 7th `classifyHabitat` branch.**
    SOURCE-BRIEF.md section 30 describes Mangrove as bridging behaviour —
    "People connect otherwise separate communities" — which is a property
    of a PERSON spanning clusters, not a cluster's own internal density/
    duration/diversity the way Forest/Reef/Savannah/Island/Wetland are.
    Implemented as the separate, pure `computeBridgePeople(organisationGroups)`
    function, which doubles as Feature 4.5's own "Bridge People" — one
    implementation serves both, per the task's explicit cross-reference.
    Each result carries a plain-language `description` (e.g. "Connects St
    Aloysius and UNSW", organisations sorted alphabetically so the text
    never leaks internal data-load ordering) rather than a rank/score, per
    Principle 6.

24. **Introduction Paths: plain-text chain only, Sankey rendering
    deliberately deferred.** BUILD-PLAN.md Feature 4.5 itself phases this:
    "ship the plain-text chain list first... add the Sankey rendering once
    the underlying path-finding query... is proven correct." This task
    builds only `findIntroductionPaths` (`netlify/functions/_shared/introduction-paths.mjs`)
    and its `GET /api/network-ecology/introduction-paths` route — no
    `buildSankeyFlow`/`d3-sankey` integration, no flow-diagram rendering.
    That remains explicitly out of scope for a later task once this
    path-finding query has shipped and been used.

25. **Introduction Paths' cap: 3 shortest paths, even when many equally-
    short paths exist.** `MAX_INTRODUCTION_PATHS = 3` — a small, human-
    scannable number chosen to satisfy brief section 23's "Do not show
    meaningless degrees of separation" without collapsing to a single path
    when a genuine choice of introducers exists. Verified with a dedicated
    fixture (`tests/unit/introduction-paths.test.js`'s "path count is
    capped" case): a 5-way fan-out with 5 equally-short 2-hop paths from A
    to Z still returns exactly 3, deterministically sorted by path-ref
    chain rather than arbitrary enumeration order.

26. **Introduction Paths' graph keeps Organisation nodes as real
    intermediate hops rather than synthesizing a "colleague at X"
    person-to-person edge.** The task's own illustrative example showed
    `[{ref: personA, via: 'colleague at UNSW'}, ...]`, which reads as if
    two colleagues at the same org are always directly connected. Chose
    NOT to synthesize that edge: brief section 23 requires "evidenced"
    connections, and inventing an edge with no backing Universal Link
    would be LESS evidenced than showing the real `employee_at`/
    `member_of` hop through the organisation node itself. `network-graph.mjs`
    documents this decision in full; `maxHops` is defined as bounding
    total graph hops (edges) walked, which may include an organisation
    node as one of them.

27. **One shared hop-traversal graph builder
    (`netlify/functions/_shared/network-graph.mjs`'s `buildRelationshipGraph`)
    feeds `/api/network-ecology/world`'s base nodes/edges,
    `/api/network-ecology/ego`'s neighbourhood BFS, AND
    `findIntroductionPaths`'s shortest-path BFS** — per the task's explicit
    instruction not to write hop-BFS logic twice. All three read the SAME
    current-link graph (`professional_relationship` + `employee_at`/
    `member_of`, `status === 'current'` only).

28. **Organisation clustering reuses Dynamic Cohorts' exact grouping, via
    a new extracted helper, not a re-derivation.** `people-cohorts.mjs`'s
    `computeDynamicCohorts` (Phase 2, Feature 2.4) was refactored to call
    a new exported `groupCurrentOrganisationMembers(peopleWithRelationships)`
    — the identical "current `employee_at`/`member_of` link, >= 2 members"
    grouping logic that was previously inline, now shared. Habitat
    classification's `computeOrganisationClusterStats` and
    `computeBridgePeople` both consume this SAME helper's output (extended
    only to keep each member's full `link` record, which
    `computeDynamicCohorts`'s own public shape never needed, for
    `avgDurationDays`'s `link.valid_from`). `computeDynamicCohorts`'s own
    output shape is byte-for-byte unchanged — its existing test suite
    (`tests/unit/people-cohorts.test.js`, `tests/integration/people-cohorts.test.js`)
    passes unmodified after the refactor.

29. **Privacy/visibility gap this task closes: an archived person's own
    top-level `loadAllPeopleWithRelationships` entry, not their appearance
    as someone else's "other endpoint".** `people-collection.mjs`'s
    `loadAllPeopleWithRelationships` deliberately resolves each person's
    OWN ref with `includeArchived: true` (correct for its own documented
    admin-aggregation purpose), which means an archived person's own
    `{ person, relationships }` entry still comes back in its output —
    even though `universal-link-read-repository.mjs` already drops that
    same archived person whenever they appear as the *other* endpoint of
    someone else's link (no `includeArchived` there). Network Ecology adds
    `network-ecology-world.mjs`'s `filterVisiblePeople` — drop any
    top-level entry whose `person.lifecycle_status === 'archived'` — before
    it reaches graph/cluster/path assembly, closing exactly the gap
    BUILD-PLAN.md's Phase 4 server contract calls out ("not just the
    top-level entity a request names"). See that file's doc comment for
    the full trace. Proven end-to-end by dedicated fixtures in all three
    integration test files (archived person created as ACTIVE with real
    links, THEN transitioned to `archived` directly in the store — an
    archived record cannot be a link endpoint at *create* time, so the
    fixture matches how this would actually happen in production).

30. **Event clusters tolerate `attendee` links not existing yet.** Per the
    task's own carried-over Phase 3 finding, `attendee`'s registry
    declaration currently only allows `sourceKinds: ['professional:meeting']`
    — Event attendee links may not exist in practice. `buildEventClusters`
    (`network-ecology-world.mjs`) queries both Meetings and Events for
    attendees identically and simply yields zero event-derived clusters
    for Events until that registry gap closes; this is exercised
    (`tests/integration/network-ecology-world.test.js`'s "no meetings/
    events at all" case) and does not error.

31. **World graph's edges are literal Universal Link types only — no
    synthesized "shared-context" edges.** BUILD-PLAN.md's Phase 4 server
    contract mentions "shared-context derived edges" as a possibility, but
    this task's own exact server-contract instructions specify
    `edges: [{source_ref, target_ref, relationship_type}]` with no such
    type. Implemented literally: every edge is a real current
    `professional_relationship`/`employee_at`/`member_of` Universal Link.
    A future task can layer derived/synthetic edges on top if the canvas
    frontend needs them — not invented speculatively here.

32. **Network Ecology canvas is a simplified fork of `apps/tasks/src/views/graph.ts`,
    not a port of `apps/knowledge/src/archive/forceGraph.ts`.** Both exist
    in this monorepo as prior `d3-force` canvas implementations.
    `apps/knowledge`'s version adds camera/zoom/pan, hub-expand/collapse
    animation, and cross-fade transitions deeply coupled to note/topic
    semantics — out of proportion to what World View / EGO Ecology / Your
    Network actually need (a force-directed layout, click-to-select, hover
    tooltips, habitat-tinted halos). `apps/tasks/src/views/graph.ts`'s
    plainer pattern (centred `d3-force`, straight-line links, plain circle
    nodes, simple hit-testing) is the fork base for the new shared
    `apps/professional/src/components/network-graph-canvas.ts`, which
    deliberately does NOT provide pan/zoom, animated expand/collapse, or
    cross-fade transitions between data updates — documented again in that
    file's own header comment.

33. **Self-ref lookup for "Your Network" (Feature 4.4) via a new, tiny
    `GET /api/people/self` route, not by extending `GET /api/career`.**
    Your Network mode needs to know the active self Person's ref before it
    can call the already-built `GET /api/network-ecology/ego?ref=<self
    ref>&hops=<n>`. `netlify/functions/_shared/career-overview.mjs`'s
    `assembleCareerOverview` already computes this internally
    (`findActiveSelfPerson`) but never returns the ref on its own, and
    additionally runs several unrelated Applications/Employment/People/
    Organisations queries the Network Ecology client does not need just to
    answer "who is me". `netlify/functions/people-self.mjs` reuses
    `findActiveSelfPerson` directly (same exported helper, same "other
    callers needing 'the active self Person' should reuse this exact
    lookup" contract that function's own doc comment already states) behind
    a new minimal route: `GET /api/people/self` ->
    `{ self: { ref, display_name } | null }`. Tested end-to-end in
    `tests/integration/people-self.test.js` (auth/CORS/method guards, the
    null case, the found case, and an archived self-flagged Person being
    correctly ignored).

34. **Opportunity/Dormancy overlay (Feature 4.7): real, documented scope
    cut — no backend change, no fabricated signal.** Checked directly
    against the actual backend rather than assumed: `NetworkEcologyEdge`
    (`GET /api/network-ecology/world` and `/ego`) is `{source_ref,
    target_ref, relationship_type}` — no date of any kind.
    `classifyRelationshipState` (`apps/professional/src/domain/
    relationship-state.ts`, ported to `netlify/functions/_shared/
    relationship-state.mjs`) is this codebase's one existing dormancy/
    opportunity classifier, and it needs `lastMeaningfulInteraction`,
    `previousMeaningfulInteraction`, `upcomingInteraction`,
    `activeSharedContexts`, and `personCreatedAt` per relationship —
    `people-home-signals.mjs`'s `classifyCurrentProfessionalRelationships`
    only manages to supply those by cross-referencing the WHOLE
    population's `professional_relationship` links (grouped by pair,
    sorted by effective date) plus Meetings/Events, for
    `professional_relationship` links only. Porting that pipeline into
    `network-ecology-world.mjs` for every edge of every `/world` and
    `/ego` response — and extending it to cover `employee_at`/`member_of`
    links `classifyRelationshipState` was never designed for — is real,
    out-of-proportion work, not a small addition. A narrower fix (adding
    just the Universal Link's existing `valid_from` to each edge) was
    considered and rejected: `valid_from` is when the relationship was
    RECORDED, not when the two people last actually interacted, so
    treating an old `valid_from` as "dormant" would misinform rather than
    honestly inform. **What the user actually sees:** the Opportunity &
    Dormancy toggle in `apps/professional/src/views/network-ecology.ts`
    renders a clearly-labeled "not enough data yet" note when switched on,
    and never marks any node/edge dormant or opportunity — no fabricated
    signal anywhere in the graph. Revisit once Feature 4.6 (History mode)
    or a similar effort gives edges real interaction-recency data.

35. **Feature 4.6 (History mode / Ecological Succession) — scrubber
    simplified to a plain date input, the point-in-time-filtering rule,
    and visibility-by-CURRENT-status (not historical).** Three decisions,
    documented together since they were made as one piece of work:

    - **Scrubber -> `<input type="date">` + "Recompute" button.** The
      mockup/brief's radial time-scrubber UI (dragging through a
      year-circle, `radial-year.js`) is NOT built. Given this build's
      remaining budget (delegated by Adam), History mode ships a plain
      date input plus an explicit "Recompute" button instead — same
      underlying point-in-time recomputation
      (`GET /api/network-ecology/history?date=`), a plainer interaction.
      Recompute is a genuine full server-side recompute-on-read per
      request (no persisted history store — see below), so it is
      deliberately NEVER triggered by typing/changing the date value
      alone, only by the explicit click — the same "full-recompute
      approach... at each scrubbed point" the plan's own Feature 4.2 note
      already anticipated for this feature.
    - **Point-in-time filtering rule: a link is "active as of date X" iff
      `valid_from <= X` AND (`valid_to` is null OR `valid_to >= X`)** —
      implemented as `isLinkActiveAsOf(link, cutoffMs)` in the new
      `netlify/functions/_shared/network-ecology-history.mjs`. Critically,
      this includes a link that has since ENDED (status `ended` today)
      as long as it was active at the historical instant being queried —
      the core "was active back then" case the task called out as most
      likely to be gotten wrong. `valid_from: null` (period relationships
      may omit it) is treated as "no known lower bound", never excluding a
      link on that basis alone. No new persisted history-tracking store —
      recomputed on read from the SAME Universal Link period data
      `/world` already reads, per the plan's own explicit instruction.
    - **`loadAllPeopleWithRelationships` needed NO new parameter or
      variant.** Verified by direct read of
      `universal-link-read-repository.mjs`: `listForEntity`'s ordinary
      read already discloses any link whose status is in
      `ORDINARY_READ_STATUSES` (`{'current', 'ended'}`), with
      `valid_from`/`valid_to` both intact — so an already-ended link is
      already present in the exact same full scan `/world` performs. Only
      `/world`'s OWN downstream helpers additionally filtered ended links
      out via `status === 'current'` checks. Rather than duplicating those
      helpers, two small backward-compatible extension points were added:
      `network-graph.mjs`'s `buildRelationshipGraph(peopleWithRelationships,
      { isLinkIncluded })` and `people-cohorts.mjs`'s
      `groupCurrentOrganisationMembers(peopleWithRelationships,
      { isLinkIncluded })` — both take an OPTIONAL predicate, defaulting to
      the existing "current only" check, so `/world`, `/ego`, and Dynamic
      Cohorts' existing one-argument calls are entirely unaffected (all
      three suites' existing tests still pass unmodified). History mode
      supplies `isLinkActiveAsOf` as that predicate instead.
    - **Visibility: evaluated by CURRENT `lifecycle_status`, never
      historical.** Reuses `/world`'s own `filterVisiblePeople` directly
      (not reimplemented) — a person archived TODAY is excluded from a
      History query even for a date before they were ever archived,
      because visibility is a property of the record's current state, not
      the queried instant. Same rule `/world` already enforces, applied
      unchanged rather than inventing a separate policy for this endpoint;
      confirmed by a dedicated privacy test mirroring `/world`'s own
      (archived-after-the-query-date, still excluded).
    - **Scoping cut: event (Wetland) clusters are not recomputed for
      History mode** — `clusters` in `GET /api/network-ecology/history` is
      always `kind: 'organisation'` only. `attendee` links (the only type
      event clusters are built from) are declared `temporalMode: 'point'`
      (`relationship-registry.mjs`) — they carry `occurred_at`, never a
      `valid_from`/`valid_to` PERIOD, so "was this attendee link active as
      of historical date X" is not a well-defined point-in-time query the
      way it is for the period-typed links organisation clusters use.
      Re-deriving Wetland's own separate "is the meeting near this date"
      time-window semantics for an arbitrary historical cutoff is a
      distinct, larger piece of work than this task's explicit deliverable
      and is not exercised by any of its required tests (all of which are
      organisation-cluster/habitat-change tests).

    Backend: `netlify/functions/network-ecology-history.mjs` (route) +
    `netlify/functions/_shared/network-ecology-history.mjs` (assembly),
    reusing `classifyHabitat`/`computeOrganisationClusterStats`/
    `computeBridgePeople` from `habitat-classification.mjs` completely
    UNCHANGED — proven by a dedicated test
    (`tests/unit/network-ecology-history.test.js`'s "habitat classification
    differs at two different historical dates" test) that constructs a
    6-person organisation cluster (deliberately sized above
    `ISLAND_MAX_SIZE` so Island cannot pre-empt the result) where a 6th
    `professional_relationship` link starts in 2026: queried at a 2025
    date the cluster's density is 5/15 (~0.33, below `FOREST_MIN_DENSITY`)
    and does NOT classify as forest; queried at a 2026 date (after that
    link starts) density is 6/15 (0.4) and DOES classify as forest — same
    underlying stored data, genuinely different classification purely from
    the query date crossing the link's `valid_from`. Frontend: History
    mode in `apps/professional/src/views/network-ecology.ts` (4th
    `.hub-pills` tab), `apps/professional/src/api/network-ecology.ts`'s
    `fetchNetworkEcologyHistory(date)`, and
    `NetworkEcologyHistory`/mirrored types in `domain/types.ts`. Verified:
    `apps/professional` `npm test` (182/182 — 177 baseline + 5 new History
    mode unit tests in `network-ecology.test.ts`), `npm run typecheck`
    (clean), `npm run build` (clean); root `npm test` (3904/3904 — 3879
    baseline + 25 new `network-ecology-history` unit + integration tests).

## Phase 5 decisions

36. **Mycelium is a pure rendering-mode switch on `network-graph-canvas.ts`,
    a clean prop addition — no refactor needed.** Confirmed before writing
    any code: `NetworkEcologyWorld`'s `edges` (`domain/types.ts`) already
    carry `source_ref`/`target_ref`/`relationship_type` for every link, and
    `network-ecology.ts`'s World View already hands the canvas component
    the FULL edge list (no habitat-based edge filtering happens today) —
    so "the raw graph underneath" is already fully present client-side the
    moment World View loads; only how it is DRAWN needed to change. Added
    `myceliumMode?: boolean` to `GraphMountOptions` (initial value at
    mount) and a new `GraphHandle.setMyceliumMode(value: boolean): void`
    method that mutates a closure-local flag and calls the existing
    `draw()` once — it never touches `simNodes`/`simLinks`, never restarts
    the `d3-force` simulation, and never triggers a fetch. `draw()` itself
    only gained two small branches (already parameterized by
    `HABITAT_META`-driven per-node halo drawing and a single edge-stroke
    loop, exactly as anticipated): habitat halo `globalAlpha` drops from
    0.4 to 0.08 (faded, not removed — brief section 37's own words, "the
    surface ecology becomes partially translucent"), and every edge is
    drawn with one plain, thin (`lineWidth: 1`), low-saturation stroke
    (`--shallow` token, alpha 0.35, dormancy ignored) instead of the
    habitat view's `--wave` accent + dormancy-based alpha — "elegant and
    restrained... not a technical graph debugger" (brief section 37),
    which is also why relationship type is deliberately NOT colour-coded
    here. `network-ecology.ts`: a "Mycelium — show raw connections"
    checkbox in the toolbar, hidden outside World mode (only World View
    draws habitat terrain at all — EGO/Your Network never carry `habitat`,
    per decision 1 in the Phase 4 section above), wired straight to
    `graphHandle.setMyceliumMode` with no re-fetch. State persists across
    an EGO recentre / History mode / whatever else — the closure-local
    `myceliumEnabled` variable in the view, threaded into
    `mountNetworkGraph`'s options on the next fresh World View mount (e.g.
    after "Back to World View").

37. **Habitat legend: stays visible, dimmed, with an explicit note — not
    hidden outright.** The task text offered either choice. Since the
    habitat halo is FADED (0.08 alpha), not fully hidden, in Mycelium mode,
    an entirely-hidden legend would describe less than what remains
    faintly on screen. Implemented as a `network-ecology__legend--dimmed`
    CSS class (opacity 0.35) toggled alongside a
    `.network-ecology__mycelium-note` paragraph ("Habitat view paused —
    showing the raw Universal Link structure beneath the terrain"), both
    driven by one `updateMyceliumChrome()` function called from
    `updateChrome()` and the checkbox's own `change` handler.

38. **Natural-language relational search: plan-and-execute in one call,
    following `person-brief-generation.mjs`'s pattern exactly, not
    `knowledge-clementine-coach.mjs`'s older one.** New
    `netlify/functions/_shared/relational-search-nl.mjs`:
    `planRelationalQuery({question, apiKey, fetchImpl, complete, store})`
    translates a free-text question into Layer 1's exact filter shape
    (`{organisation_ref, role, text}`), reusing `person-brief-generation.mjs`'s
    established shape (`MODEL_ID = 'claude-sonnet-5'`, `deps.complete`/
    `deps.fetchImpl` injection, a stray-```json-fence-stripping JSON parse,
    a `{status: 502, code: '..._plan_failed', retryable: true}` error for
    any malformed/failed model interaction — never a crash or garbage
    output). Two closed-vocabulary enforcement points, one for each
    filter the model cannot be trusted to invent:
    - **Role**: the system prompt is built with the REAL, current
      `getRelationshipDeclaration('professional_relationship').allowed_roles`
      (never hardcoded) and explicitly told never to invent outside it —
      but the model's word is not trusted blindly either: any returned
      `role` NOT actually in that list is silently DROPPED before it ever
      reaches `runRelationalSearch` (which would otherwise itself reject it
      with `invalid_role`). Proven by
      `tests/unit/relational-search-nl.test.js`'s "a model-hallucinated
      role value is dropped, not passed through, against the real registry
      enum" test, which asserts the fixture role is genuinely outside
      `getRelationshipDeclaration('professional_relationship').allowed_roles`
      (not just outside some fake test enum) before asserting it gets
      dropped.
    - **Organisation**: the model cannot know a real `organisation_ref` (an
      opaque id it is never shown), so it is asked for a plain
      organisation NAME instead. That name is resolved to a ref by
      **reusing `entity-search.mjs`'s own `searchIdentityKind`** — newly
      exported from that route file specifically for this reuse (no
      `_shared` module owned this logic before; it always lived at the
      route level) — via a new `resolveOrganisationByName(store, name)` in
      `relational-search-nl.mjs`. This is the EXACT SAME indexed-candidate-
      then-authoritative-re-validation search the "Search by name" picker
      already runs against the organisation index, not a second, invented
      resolution path. A name that doesn't resolve is a clean "no match"
      (`organisation_ref` left empty, `organisation_matched: false`) —
      this is where organisation invention gets caught, symmetric to the
      role check.
    - The model is also allowed to say a question is honestly
      `unsupported` (with a short `unsupported_reason`) when it needs more
      than these three filters can express — e.g. multi-hop reasoning,
      ranking — rather than being forced into a bad-fit filter. Route
      (`netlify/functions/people-relational-search.mjs`) treats
      `unsupported` (or a plan that resolved to zero filters) as "zero
      results, no error" rather than calling `runRelationalSearch` (which
      would 400 on an all-empty query).
    - Route: `POST /api/people/relational-search?action=plan`, body
      `{question}`, mirroring `people-brief.mjs`'s `POST
      ?action=generate&id=` sub-routing and 503-when-unbound shape exactly
      (`503 people_relational_search_nl_unbound` when
      `env.ANTHROPIC_API_KEY` is empty). PLANS and EXECUTES in one call —
      response is `{organisation_ref, organisation_name,
      organisation_matched, role, text, unsupported, unsupported_reason,
      results}` — the resolved filter fields double as the UI's
      transparency line ("never opaque" principle), and `results` carries
      the exact same `matched_reasons`-bearing shape Layer 1 already
      returns. A POST to this route without `?action=plan` now returns 400
      `invalid_action` rather than the previous blanket 405 (POST is a
      supported method now) — the one pre-existing integration test that
      asserted 405 for POST was updated accordingly (renamed to assert 405
      only for a genuinely unsupported method, PATCH).
    - Frontend: `relational-search-panel.ts` gained its own internal
      two-tab switch ("Structured filters" / "Ask a question") — a
      SEPARATE, second-level toggle from `people-home.ts`'s outer "Search
      by name" vs "Relational search" mode switch (documented in-code
      since the task described "three modes" together). "Ask a question"
      is a single text input + submit, calling the new
      `askRelationalSearchQuestion` API client function, showing the
      resolved-filter transparency line (`describePlanInterpretation`,
      e.g. "Searching: organisation = UNSW, text contains \"gifted
      education\"") before the results, which reuse the EXACT SAME
      `renderResultsInto` helper Layer 1's structured mode uses (extracted
      from the pre-existing inline `renderResults`, not duplicated). A 503
      `people_relational_search_nl_unbound` shows "Ask-a-question search is
      not configured." — the same honest, non-scary "not configured"
      pattern `person-brief.ts` already established for
      `people_anthropic_unbound`.

39. **Deliberately deferred (not built): full per-fact Evidence Ledger and
    advanced multi-signal Opportunity detection — genuinely open product
    questions, not implementation gaps.** Per this task's own explicit
    scoping instruction. Documented here with the actual reasoning, not
    just "deferred":
    - **Full per-fact Evidence Ledger** (brief's per-fact provenance/
      evidence-trail concept — every displayed fact traceable to its
      source record(s), individually). The Evidence tab built in Phase 1
      (Feature 1.5) already surfaces SOURCE-linked observations and
      relationship provenance at the person level; a full per-FACT ledger
      is a materially different, finer-grained data model question: which
      individual facts warrant their own evidence trail (every relationship
      change? every brief bullet? every classification like a habitat
      label or dormancy flag?), what "evidence" means for a derived/
      computed fact (e.g. a habitat classification isn't sourced from one
      record, it's computed from a whole cluster's stats) versus a directly
      observed one, and how much of this the UI should surface versus
      leave as an internal audit trail. These are product-design decisions
      about what the feature IS, not an engineering estimate — building
      something today would mean guessing at that shape and likely
      rebuilding it once Adam actually defines what "evidence" means for a
      derived fact. Left as an explicit open question for a future,
      dedicated product conversation.
    - **Advanced multi-signal Opportunity detection** (beyond the existing
      Feature 4.7 toggle's honest "not enough data yet" state — see Phase 4
      decision 34 above). The existing gap is NOT just missing data
      plumbing: `classifyRelationshipState` needs
      `lastMeaningfulInteraction`/`previousMeaningfulInteraction`/
      `upcomingInteraction`/`activeSharedContexts`/`personCreatedAt` per
      relationship, and "advanced multi-signal" implies combining several
      independent signals (e.g. recency + shared-context overlap + role
      change + introduction-path proximity) into one opportunity score or
      ranking — which directly collides with Principle 6 ("never rank or
      score people") unless carefully scoped to stay descriptive rather
      than evaluative. What signals count, how they combine, and how to
      phrase the result without it reading as a score are product
      decisions Adam needs to make, not additional plumbing this task could
      correctly guess at. Left as an explicit open question alongside the
      Evidence Ledger.

## Phase status

- Phase 1: **complete.** All six features (1.1 registry key, 1.2/1.3 tab
  shell + header + human labels + activity state, 1.4 Observations
  backend + tab, 1.5 Evidence tab + Collection Gaps, 1.6 Activity State
  classifier) built, spec-reviewed, code-quality-reviewed, and fixed to
  approval. Verified via the plan's own Phase 1 verification commands:
  `apps/professional` `npm test` (118/118), `npm run typecheck` (clean),
  `npm run build` (clean); root `npm test` (3667/3667); umbrella SPA
  checks (`apps-spa-remount`/`hub-sections`/`static-server`, 40/40).
  Not pushed, no PR — stacked commits on `worktree-people-phase1`,
  `bbf5e565`..`e6e2750d`.
- Phase 2: **backend (Features 2.2-2.4) complete; Feature 2.1 (People Home
  UI) complete.** Three Netlify routes (`GET /api/people/home-signals`,
  `GET /api/people/cohorts`, `GET /api/people/activity`) plus their
  `_shared` aggregation modules and the ported `relationship-state.mjs`
  classifier, consumed by `apps/professional/src/views/people-home.ts` (new
  API wrappers in `src/api/people-home.ts`, response types in
  `src/domain/types.ts`). `#/people` now renders the People Home dashboard;
  `views/people.ts` is deleted. Verified: `apps/professional` `npm test`
  (130/130), `npm run typecheck` (clean), `npm run build` (clean); root
  `npm test` (3731/3731, unaffected — a separate suite). Not pushed, no PR.
- Phase 3: **complete.** Feature 3.1 (Person Brief page —
  `apps/professional/src/views/person-brief.ts`, route `#/person/<id>/brief`,
  `GET /api/people/brief?id=`), Feature 3.2 ("Since you last spoke" +
  Talking Points LLM generation — `POST /api/people/brief?id=&action=generate`,
  `_shared/person-brief-generation.mjs`), and Feature 3.3 layer 1
  (Relational Search — `GET /api/people/relational-search?organisation_ref=
  &role=&text=`, `_shared/relational-search.mjs`, the "Relational search"
  mode in People Home's header search panel) are all built and tested.
  Feature 3.3 layer 2 (LLM natural-language query parsing) is deliberately
  deferred to Phase 5 per the plan's own allowance — see decision 19 above.
  Verified: `apps/professional` `npm test` (153/153), `npm run typecheck`
  (clean), `npm run build` (clean); root `npm test` (3808/3808). Not
  pushed, no PR.
- Phase 4: **FULLY complete — all 7 features (4.1-data World View backend,
  4.2 Habitat classification, 4.3 EGO recentre, 4.4 Your Network, 4.5-text
  Introduction Paths/Bridge People, 4.6 History mode, 4.7
  Opportunity/Dormancy overlay).** Habitat classification
  (`netlify/functions/_shared/habitat-classification.mjs` —
  `classifyHabitat`, `computeOrganisationClusterStats`,
  `computeBridgePeople`), the shared hop-traversal graph
  (`netlify/functions/_shared/network-graph.mjs`), Introduction Paths
  (`netlify/functions/_shared/introduction-paths.mjs`), and their I/O
  assembly (`netlify/functions/_shared/network-ecology-world.mjs`) are
  built and tested, behind four routes: `GET /api/network-ecology/world`,
  `GET /api/network-ecology/ego?ref=&hops=`, `GET
  /api/network-ecology/introduction-paths?from=&to=`, `GET
  /api/network-ecology/history?date=` (Feature 4.6 — new
  `netlify/functions/_shared/network-ecology-history.mjs`, see decision 35),
  plus the `GET /api/people/self` (decision 33) that Your Network needs to
  find "me". Frontend: the shared canvas force-graph renderer
  (`apps/professional/src/components/network-graph-canvas.ts`, forked per
  decision 32, unchanged by Feature 4.6 — History mode feeds it the exact
  same node/edge/cluster shape World View does) and the page itself
  (`apps/professional/src/views/network-ecology.ts`, route
  `#/network-ecology`) — World View with a 6-entry text legend (habitat
  never color-only, satisfying brief section 49's accessibility
  requirement), click-to-select + "Recentre here" into EGO mode with a
  "Back to World View" action, a "World View"/"Your Network"/"History"
  `.hub-pills` mode toggle, Your Network's self-ref lookup (with an honest
  "no self person set up yet" state, not a crash, when `self: null`) and
  its two client-side layer checkboxes (organisation links / relationship
  links, filtering the already-fetched edge set with no extra fetch), the
  Opportunity/Dormancy toggle's "not enough data yet" note (decision 34),
  and History mode's date input + explicit "Recompute" button (decision 35
  — never auto-fetches on keystroke, only on the explicit click; displays
  "Showing network as of <date>" from the server's own echoed `date`).
  Sankey upgrade for Introduction Paths remains explicitly out of scope
  (plain-text chain list only), unaffected by this phase's completion. See
  decisions 22-35 above, especially 22 (thresholds are delegated
  placeholders, not yet validated against real data), 29 (the
  privacy/visibility gap this task closes, with its dedicated end-to-end
  tests), 32-34 (Phase 4 frontend's own decisions), and 35 (Feature 4.6's
  three decisions: scrubber -> date input, the point-in-time-filtering
  rule, and visibility-by-current-not-historical-status). Verified:
  `apps/professional` `npm test` (182/182 — 177 baseline + 5 new History
  mode unit tests), `npm run typecheck` (clean), `npm run build` (clean);
  root `npm test` (3904/3904 — 3879 baseline + 25 new
  `network-ecology-history` unit + integration tests). Not pushed, no PR.
- Phase 5: **partial — 2 of 4 items shipped, 2 explicitly deferred.**
  Shipped: the Mycelium layer (World View's raw-graph rendering-mode
  toggle, `network-graph-canvas.ts`'s new `myceliumMode`/
  `setMyceliumMode`, `network-ecology.ts`'s toolbar checkbox — decisions
  36-37 above) and natural-language relational search (Layer 2 on top of
  Phase 3's Feature 3.3 structured search — `POST
  /api/people/relational-search?action=plan`,
  `_shared/relational-search-nl.mjs`'s `planRelationalQuery`, the "Ask a
  question" mode in `relational-search-panel.ts` — decision 38 above).
  Deliberately deferred, per this task's own explicit scoping: the full
  per-fact Evidence Ledger and advanced multi-signal Opportunity detection
  — both genuinely open product-design questions, not implementation gaps
  (decision 39 above explains why each needs Adam's own product input
  before they can be correctly built at all, not just more engineering
  time). Verified: `apps/professional` `npm test` (196/196 — 182 baseline
  + 14 new: `network-graph-canvas.test.ts` 19 total (6 new Mycelium
  rendering tests), `network-ecology.test.ts` 18 total (4 new Mycelium
  toggle/wiring tests), `relational-search-panel.test.ts` 9 total (4 new
  "Ask a question" mode tests, all 5 pre-existing tests still green
  unchanged) — 6+4+4=14), `npm run typecheck` (clean), `npm run build` (clean);
  root `npm test` (3926/3926 — 3904 baseline + 6 new integration tests in
  `tests/integration/people-relational-search.test.js` [1 new "POST
  without action=plan is now 400, not the old blanket 405" test + 5 new
  `?action=plan` tests: 503 unbound, success path, malformed model output,
  hallucinated-role dropped, honestly-unsupported question] + 16 new unit
  tests in `tests/unit/relational-search-nl.test.js`). Not pushed, no PR.
