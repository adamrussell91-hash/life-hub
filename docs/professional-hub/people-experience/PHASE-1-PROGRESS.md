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
- Phase 4: not started
- Phase 5: not started
