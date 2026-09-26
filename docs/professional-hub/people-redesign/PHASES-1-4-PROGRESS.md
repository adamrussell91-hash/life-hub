# People redesign — Phases 1–4 progress

Progress: **Phases 1–4 on PR #505** (Adam override: one PR for 1–4). Phases 5–8 untouched.

Branch: `cursor/people-redesign-phase-1-a983` · rebased onto `main` including type-scale #506.

## Decisions recorded in this PR

- Warmth ring uses Phase 3 score (band word in UI; number in tooltip only — D1).
- Link proposals: deterministic rules now; Clare sweep (Phase 8) writes same store.
- Ledger: derived from open linked tasks + `waiting_on`; Clare button runs deterministic scan (LLM Clare job can replace later).
- Task → comms conversion disabled with “Needs Communications” tooltip (I3).
- Remember / Ask / Today remain empty visible slots (Phases 5–7).
- Crests: `logo_key` + R2; Filters sheet fixed viewport overlay.

## Checklist

### Phase 1
- [x] 1.1–1.6 (prior commits)
- [x] W2 `people-page.test.ts`
- [x] hub-ui-guardian PASS (Phase 1)
- [ ] P1/D3 screenshots on **real** Henry data (mock only)

### Phase 2 — link proposals
- [x] 2.1 Proposal store (`link-proposal-schema` / repository)
- [x] 2.2 Deterministic pass (`link-inference-rules`) + “Check for links”
- [x] 2.3 Dashed chips ✓/✕; Needs-you filter counts proposals
- [x] D4 Henry fixtures (Accreditation Mentor + mentoring task)
- checked: V4 D4 D5 I3

### Phase 3 — warmth score
- [x] `warmthFor` / half-life tiers (Inner/Current/Former/Wider)
- [x] Directory + person model + ring from one score
- [x] Band word only in chip; number in tooltip
- [x] Henry Inner / Bianca Former tests
- checked: V4 D1 D4 C2

### Phase 4 — Clare ledger
- [x] Derived you_owe / they_owe + stored Clare items
- [x] Clare button + “Clare is reading…” + patch path
- [x] Inline edit / done / dismiss; → Comms disabled
- [x] Henry mentoring task under You owe (unit)
- checked: V4 L2 I4 D5

## Named W2 tests
- `apps/professional/tests/unit/people-page.test.ts` → `renderPeoplePage`
- `tests/unit/people-redesign-phases-2-4.test.js` → inference / warmth / ledger
- `apps/professional/tests/unit/person-model.test.ts` → V4 + proposals

## Mockup diff (vs 04-directory-plus, mock data)
- No Today strip / Ask / Remember facts (Phases 5–7) — intentional
- Proposal chips and Clare ledger live; agent empty slots visible
- Directory+pane, filters, phone push — aligned

## Screens
`docs/professional-hub/people-redesign/screens/` and `/cursor/stores/self/media/people-redesign/`
