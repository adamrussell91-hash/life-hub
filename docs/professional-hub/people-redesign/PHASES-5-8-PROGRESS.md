# People redesign — Phases 5–8 progress

Progress: **Phases 5–8 on one PR** (same batching as #505 for 1–4).

Branch: `cursor/people-redesign-phases-5-8-db42` · base `main` @ #505 merge.

## Decisions recorded in this PR

- Remember: Ann scheduled tick hourly, gates Sydney 07:00 / 16:00; facts ≤120 chars; Ann never overwrites Adam.
- Ask: one search box (V3); `?` / who-questions → Ann; relational-nl fast path; honest unknown copy.
- Today: Adam availability only; “You usually meet X…”; Next shares `todayData.suggestion` (V4).
- Clare People sweep hooks morning-sweep + `/api/people/coordination`; Hammond cooling flags Inner/active-project only (cooling or cold band).

## Checklist

### Phase 5 — Remember (Ann)
- [x] Facts store (`remember-schema` / repository / service)
- [x] Scheduled job `people-remember-tick-scheduled` + Sydney gate
- [x] Ann voice widened (agent-directory + persona)
- [x] UI: list, edit, dismiss, reorder ↑↓, Run now; empty I3
- checked: D5 I1 I3

### Phase 6 — Ask (Ann)
- [x] Search box Ask mode + answer card
- [x] Graph + Remember + relational-nl fast path
- [x] “Show these in the list” filter
- [x] Honest unknown copy
- checked: S3 V3 I3

### Phase 7 — Today strip
- [x] Next school day slots + free gaps
- [x] Suggestion wording + Next card one model
- [x] No pattern yet (D1); slots by start (D2); slot ≤96px (L2); scroll box (R2)
- checked: R2 L2 D1 D2 V4

### Phase 8 — Clare / Hammond
- [x] Clare people sweep on morning-sweep + API
- [x] Hammond cooling flags (Inner / active project)
- [x] Persona lines for Hammond / Clare / Ann
- checked: D4 (confirm-only links)

## Named W2 tests
- `apps/professional/tests/unit/people-page.test.ts` → Remember empty + Today
- `tests/unit/people-redesign-phases-5-8.test.js` → Remember / Ask / Today / Hammond

## Mockup diff (vs 04-directory-plus)
- Today strip: simpler slot faces (names as text, not avatar rings) — kit avatar density deferred
- Ask: answer card below title row when question detected (not inline “Ask:” chrome in the search field)
- Remember: source labels match; no emoji prefixes (kit / D5)
- Next: shares Today suggestion when meet pattern exists

## Screens
`docs/professional-hub/people-redesign/screens/phase-5-8/` and store `media/people-redesign/`
