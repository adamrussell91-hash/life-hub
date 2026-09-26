# Medical Overview v2 — progress

Progress: 34/34 (100%) — review fixes in flight on #499

Branch: `cursor/medical-overview-v2-c420` (continues PR #496 workstream from `claude/confident-cannon-ud1cod`).

Review brief: `docs/superpowers/plans/2026-09-26-medical-overview-v2-review.md`

## M1: Data model and Sara
- [x] **MO-01** Schema fields (`weight`, Symptom, status, …)
- [x] **MO-02** `inferWeight`
- [x] **MO-03** `inferRecordType` → Symptom
- [x] **MO-04** Episode joining *(review: band groups by episode.id globally)*
- [x] **MO-05** Fix vanishing note (resolveMedicalLogCandidate) *(review: 26/09 in band)*
- [x] **MO-06** Planned items *(review: To book / month labels / Dose)*
- [x] **MO-07** Cadence-derived virtual dose
- [x] **MO-08** Rewrite sara-protocol medical section
- [x] **MO-09** Sara `create_task` (health)
- [x] **MO-10** Behaviour acceptance fixtures + pipeline tests
- [x] **MO-11** Backfill script (dry-run default)

## M2: Top row (three cards)
- [x] **MO-12** Card row grid
- [x] **MO-13** Health Brief card *(review: watch refs + Sara verdict)*
- [x] **MO-14** Active Episode card
- [x] **MO-15** Next card *(review: 5 items + task on own row)*
- [x] **MO-16** Add to Tasks on Next rows

## M3: Health Threads strip
- [x] **MO-17** `buildThreadModel` *(review: Mind = Kate + Hook)*
- [x] **MO-18** Strip SVG renderer
- [x] **MO-19** Biomarker ribbons *(review: value-scaled band in lane)*
- [x] **MO-20** Zoom (pills + −/+ + pinch) *(review: strip-only; hidden when collapsed)*
- [x] **MO-21** Label collision *(review: TODAY row + getBBox)*
- [x] **MO-22** Marker interaction / a11y
- [x] **MO-23** Accordion + localStorage

## M4: Weighted River
- [x] **MO-24** Render by weight *(review: pills + compact planned)*
- [x] **MO-25** UPCOMING section *(review: TO BOOK group)*
- [x] **MO-26** Episode band (`<details>`) *(review: latest-date sort)*
- [x] **MO-27** Mini lab panel (`markerRow`) *(review: meter CSS + 4-col row)*
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
- Review 2026-09-26: contiguous episode banding broke the cold band when Gastro interrupted; fixed by global episode grouping.

## Deviations

- River density pills removed from the visible toolbar; strip zoom owns Weeks/Months/Years and syncs pack density via `onDensityChange`. Hidden `#medical-density` kept for paintDensity / tests.
- Mark booked / Mark done sheet controls write status via `chatApi.confirm` without a date picker UI yet (stub+persist, not a calendar popover).
- MO-30 integration test is controller-level (`onAddToTasks` / `showMinor`), not a full `main.js` boot harness.
