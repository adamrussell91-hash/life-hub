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

- [ ] Pending

## Phase 3 — Flowchart

- [ ] Pending

## Phase 4 — Opportunities

- [ ] Pending

## Phase 5 — Ann's read

- [ ] Pending

## Phase 7 — Compare

- [ ] Pending

## Out of this PR

- Phase 6 / 8 → People PRs
