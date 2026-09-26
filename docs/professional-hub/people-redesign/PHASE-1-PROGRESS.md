# People redesign — Phase 1 progress

Progress: **Phase 1 complete for review** (guardian PASS). Later phases ship alone from fresh `main`.

## Decisions recorded in this PR

- Warmth ring provisional from relationship-state until Phase 3 score.
- Remember / Clare / Ask / Today are visible empty slots (Phases 4–7).
- Crests: `logo_key` + R2; monogram + upload on group crest.
- Filters sheet is a fixed viewport overlay (not clipped by the directory card).

## Checklist (Phase 1)

- [x] 1.1 One page; brief/person redirect
- [x] 1.2 Directory filter/sort/group + URL
- [x] 1.3 Crests (logo_key, sign/get, badge, upload)
- [x] 1.4 Independent section hosts
- [x] 1.5 Relationship arc 86px
- [x] 1.6 Phone 390 push + Filters sheet with sort/group
- [x] W2 `people-page.test.ts`
- [x] hub-ui-guardian PASS
- [ ] P1/D3 screenshots on **real** Henry data (mock only in this agent)

## Named W2 test
`apps/professional/tests/unit/people-page.test.ts` → `renderPeoplePage`

## Mockup diff (vs 04-directory-plus, mock data)
- No Today strip / Ask (Phases 6–7) — intentional
- Warmth score number is provisional band mapping — Phase 3
- Ledger you-owe from open tasks only until Clare (Phase 4)
- Directory+pane, filters, phone push — aligned; agent/Today slots empty by design
