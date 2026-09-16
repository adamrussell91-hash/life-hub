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
   same single fetch as every other tab.

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
   entries whose `source_ref` matches the relationship's counterpart-person
   ref.

## Phase status

- Phase 1: in progress
- Phase 2: not started
- Phase 3: not started
- Phase 4: not started
- Phase 5: not started
