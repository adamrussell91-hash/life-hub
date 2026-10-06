# Sara — medical assistant, record keeper and analyst (design)

Status: approved by Adam 6 Oct 2026 ("its all a priority"). Confirm policy for edits: option A (below) is the default until Adam says otherwise.

## Problem

Dr Sara Tonin is meant to be a doctor in Adam's pocket: record keeper, assistant, analyst. Audit on 6 Oct 2026 found:

- **Record keeping:** create-only. `log_entry` makes a visit; adding detail works only through an undocumented server fuzzy title match (≥55 score, ±3 days). Rescheduling, cancelling, deleting, merging and `cancelled` status do not exist. A date change >3 days away silently creates a duplicate (this is how three GP appointments appeared). Reads are keyword search (no ids) and a one-date brief; the kernel calls the brief with *today*, not the visit date.
- **Analysis:** `analyse_medical_evidence` only tags recency and returns the two latest bloods raw. No marker time series or deltas, no treatment/Stelara cycle model, no symptom-vs-cycle view, no cross-domain join, no open-loop detection. Workflow only triggers on keywords. Body history is bounded to 8 composition records; nutrition to 7 days; no diary/workout history for Sara.
- **Assistant:** health tasks only for `to_book`; no appointment brief with questions, no retest reminders.

Data available (life-hub-data): 15 bloods collections (~40 markers, with ranges), 181 medical records, 200+ weight/composition records, ~450 meals, 88 diary entries, workouts with pain flags.

## Design

### Phase 1 — Analyst (read-only, deterministic; Sara interprets)
New pure module `sara-analyst.mjs`; schemas/dispatch in `sara-analyst-tools.mjs`; on-demand bounded history loader (no extra cost on turns that don't use it).

| Tool | Returns |
|---|---|
| `get_marker_trend` | every dated value for a marker/group with range, delta vs previous and vs first, slope/month, direction relative to range, days since last, retest due |
| `compare_bloods` | two collections marker by marker: newly abnormal, normalised, biggest moves |
| `get_treatment_timeline` | Stelara induction + maintenance doses, cadence (56 d), cycle day today, next due, overdue; steroid courses |
| `get_symptom_timeline` | episodes (onset, duration, resolved) with Stelara cycle day for each entry |
| `get_cross_signals` | window join of protein/calcium/fibre, training load + pain, mood/energy, weight against bloods + symptom dates; reports n and refuses to infer when thin |
| `get_open_loops` | ordered-not-booked, overdue follow-ups, retests due, planned visits without a date |
| `build_appointment_brief` | for a visit id/date: results since last visit with deltas, symptoms since, treatment status, open loops, questions to ask, data gaps |

Fixes: brief uses the visit date; `analyse_medical_evidence` bloods comparison becomes marker-level; analyst workflow triggers on any health question, not a keyword list.

Prompt: an analyst method (question → evidence → calculate → interpret with dates/values → confidence + gaps → who to see) and playbooks (symptoms vs Stelara cycle, pre-appointment brief, post-visit summary, results review, "is this unusual", weekly scan). Temporal-discipline rules and red-flag escalation stay.

### Phase 2 — Record keeper
`list_medical_visits`, `get_medical_visit` (ids), `update_medical_visit`, `delete_medical_visit`, `merge_medical_visits`; status `cancelled`. `log_entry` for `medical` becomes create-only: on a likely duplicate it refuses with the existing id. Symptom-episode logic is unchanged.

Confirm policy (option A): additive/safe edits (add notes, set status/time/duration/provider/location/weight) save immediately with a receipt; structural edits (change date, change type, delete, merge) raise a Confirm card showing the exact before/after (a move = create new path + delete old, one proposal).

### Phase 3 — Assistant
Booking workflow (to_book → task + calendar slot with time/length), retest reminders from open loops, post-visit capture prompts. Uses existing `create_task` and the calendar time/length fields shipped on this branch.

### Prompt rewrite
`config/sara-protocol.md` restructured around her three jobs with a worked workflow for each.

## Testing
Unit tests per tool on fixtures shaped like the real data; golden cases (GGT 131→233 flagged moving away from range; Stelara cycle day maths; 26 Oct GP brief lists GGT/ALT/calprotectin/MRCP; no causal claim at n<3); a conversation-level test for "it's booked" not creating a duplicate; full `npm test` + `pre-pr-check`.

## Out of scope
Diagnosis/prescribing (boundaries unchanged); changes to other agents; UI redesign.
