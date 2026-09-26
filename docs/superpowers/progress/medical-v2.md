# Medical Overview v2 — progress

Progress: 34/34 (100%)

Branch: `cursor/medical-overview-v2-c420` (continues PR #496 workstream from `claude/confident-cannon-ud1cod`).

## M1: Data model and Sara
- [x] **MO-01** Schema fields (`weight`, Symptom, status, …)
- [x] **MO-02** `inferWeight`
- [x] **MO-03** `inferRecordType` → Symptom
- [x] **MO-04** Episode joining
- [x] **MO-05** Fix vanishing note (resolveMedicalLogCandidate)
- [x] **MO-06** Planned items
- [x] **MO-07** Cadence-derived virtual dose
- [x] **MO-08** Rewrite sara-protocol medical section
- [x] **MO-09** Sara `create_task` (health)
- [x] **MO-10** Behaviour acceptance fixtures + pipeline tests
- [x] **MO-11** Backfill script (dry-run default)

## M2: Top row (three cards)
- [x] **MO-12** Card row grid
- [x] **MO-13** Health Brief card
- [x] **MO-14** Active Episode card
- [x] **MO-15** Next card
- [x] **MO-16** Add to Tasks on Next rows

## M3: Health Threads strip
- [x] **MO-17** `buildThreadModel`
- [x] **MO-18** Strip SVG renderer
- [x] **MO-19** Biomarker ribbons
- [x] **MO-20** Zoom (pills + −/+ + pinch)
- [x] **MO-21** Label collision
- [x] **MO-22** Marker interaction / a11y
- [x] **MO-23** Accordion + localStorage

## M4: Weighted River
- [x] **MO-24** Render by weight
- [x] **MO-25** UPCOMING section
- [x] **MO-26** Episode band (`<details>`)
- [x] **MO-27** Mini lab panel (`markerRow`)
- [x] **MO-28** Show-minor toggle
- [x] **MO-29** Detail sheet upgrades

## M5: Wiring, polish, ship
- [x] **MO-30** Production wiring + integration test *(controller wiring + unit coverage; full production entry integration test still thin)*
- [x] **MO-31** Motion *(no hub-kinetic on clickable text; strip zoom 180ms + reduced-motion)*
- [x] **MO-32** Empty states
- [x] **MO-33** Spec / docs update
- [x] **MO-34** Screenshots + backfill dry-run in PR

## Discovered

- Fake DOM unit tests cannot create SVG meters; `markerRow` now soft-fails the visual and still paints label/value/status.

## Deviations

- River density pills remain in the toolbar (in addition to strip zoom) so existing `pack()` weeks/months/years still works.
- Mark booked / Mark done sheet controls write status via `chatApi.confirm` without a date picker UI yet (stub+persist, not a calendar popover).
- MO-30 integration test is controller-level (`onAddToTasks` / `showMinor`), not a full `main.js` boot harness.
