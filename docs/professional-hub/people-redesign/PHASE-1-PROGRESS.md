# People redesign — Phase 1 progress

Progress: in review (Phase 1 only — later phases ship on fresh `main` per BUILD-PLAN)

## Decisions recorded in this PR

- **`professional_relationship` roles:** closed enum already on main; Phase 1 consumes it.
- **Evidence / Remember / Clare ledger / Ask / Today / Warmth score:** slots render with honest empty states; agents land in Phases 2–7.
- **Warmth ring (provisional):** mapped from existing `relationship-state` bands until Phase 3 score.
- **Crests:** `logo_key` on Organisation + R2 sign/get; monogram fallback until Adam uploads.
- **Failure register:** copied already on `main` (`docs/CURSOR-UI-FAILURES.md`).

## Checklist (Phase 1)

- [x] 1.1 One page `#/people` + `#/people/<id>`; brief/legacy person routes redirect
- [x] 1.2 Directory filter/sort/group in URL query
- [x] 1.3 `logo_key` + crest sign/get (PNG/SVG ≤512KB)
- [x] 1.4 Section hosts load independently (header/next/ledger/remember/arc)
- [x] 1.5 Relationship arc (86px, collision pass)
- [x] 1.6 Phone 390: directory → push person + Filters sheet + icon Add
- [x] W2: `people-page.test.ts` drives `renderPeoplePage`
- [x] W1: no relative `fetch('/`
- [ ] P1 mockup diff screenshots on **real** Henry/SAC/Trinity data (local mock only in this environment — see notes)
- [ ] hub-ui-guardian PASS

## Failure-register IDs checked

| ID | Check | Result |
|---|---|---|
| L1 | split `minmax(0,440px) minmax(0,1fr)` | code |
| L2 | row max 60px / ledger li 56px / no card min-height | CSS |
| L3 | no sticky columns | CSS |
| L5 | phone toolbar Filters + icon Add | CSS/JS |
| S2/S3 | paper surfaces; sheet `var(--paper)` | CSS |
| S4 | arc explicit fills | `relationship-arc.ts` |
| V1 | Full record `<details>` closed | test |
| V2 | URL sort ↔ Sort label | `directory-query.test.ts` |
| V3 | one sort + one group control | UI |
| V4 | `buildPersonModel` open count | `person-model.test.ts` |
| R1 | matchMedia listener | `people.ts` |
| C1–C3 | arc layout tests | `directory-query.test.ts` |
| D5 | `formatDisplayDate` | next card |
| I2 | rows are `<a href="#/people/…">` | test |
| I3 | empty section copy | UI |
| W1/W2 | api client + entry test | pass |
| P3 | brief redirect; single h1 | router + test |

## Named W2 test

`apps/professional/tests/unit/people-page.test.ts` → `renderPeoplePage`
