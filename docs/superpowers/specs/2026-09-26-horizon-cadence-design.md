# Horizon Council cadence (Phase 4)

Date: 2026-09-26
Builds on: `2026-09-26-cognitive-protocol-conversation-and-context-design.md` (Phases 1 to 3, PRs 489 to 491). Base this work on the top of that stack.
Status: locked design.

## Problem

Notion's hard rule is "never run the Horizon Council more often than quarterly without explicit justification", and Adam wants the next review to show up on his calendar. Today nothing knows when the last review was, so the rule lives in a prompt line the model cannot act on.

## Decisions

1. **The run log is the single source of truth.** Cadence is derived from the last completed Horizon run in the Phase 3 log. Nothing is stored separately.
2. **Blocking gate on start.** A new Horizon session is rejected when a completed Horizon run exists that is less than 90 days old and no `frequencyJustification` is supplied. The justification is required text, not a checkbox. With a justification the run proceeds and the justification is kept on the session. If the log cannot be read, the gate fails open: the run is allowed and `cadenceUnknown` is set on the session.
3. **Calendar via the Almanac, derived not stored.** The Almanac gets one rule: when today is within 14 days of the 90-day mark since the last completed Horizon run (or past it), it offers "Run the Horizon Council". Accepting uses the existing `create_task` ghost, so the write is confirm-first as calendar law requires. No ghost is stored in advance, no future-dated calendar write is made, and no anchor file changes.
4. **No nag without a baseline.** If Horizon has never been run, the rule stays silent.
5. **Completion time is sticky.** `completedAt` is set once when status becomes `completed` (advance path and `reflect`). Cadence and write-back dates read `completedAt`, falling back to `updatedAt` for older sessions. Later corrections or write-back retries that bump `updatedAt` do not move the review date.

## 1. Gate

- Helper in `cognitive-horizon.mjs`: `lastCompletedRun(store, owner, protocolId)` returning `{ id, completedAt } | null`, reading the Phase 3 log index (`completedAt`, else `updatedAt`).
- `create()` for `protocolId === 'horizon'`: if `lastCompletedRun` is under 90 days old and `intake.frequencyJustification` is blank, reject with 400 `frequency_justification_required`. The message includes the last run's date and the earliest date without justification. Wrap `lastCompletedRun` in try/catch; on error log a warning, allow the run, and set `session.cadenceUnknown=true`.
- The intake field already exists (`frequencyJustification`, "Reason for another review within this quarter"). The UI shows it only when the API returns that error, prefilled with the message, then resubmits.
- Prompt: `buildPrompt` passes `lastReviewDate` and the justification (when present) to the Horizon voices so they can reflect it. `horizon.md` line "Another review inside the same quarter needs the supplied frequency justification. Do not invent one." stays.
- 90 days is a named constant `HORIZON_MIN_DAYS`, kept equal in `cognitive-horizon.mjs` and `packages/design-kit/js/calendar/almanac-rules.js`.

## 2. Almanac rule

- Server: `almanac.mjs` reads the last completed Horizon run through `lastCompletedRun` (same store, same owner rule) and passes `ctx.horizon = { lastCompletedAt }` to the rules (Sydney date key).
- Rule in `packages/design-kit/js/calendar/almanac-rules.js` (re-exported by Life): a step with id `horizon-review:<lastCompletedAt>` and title "Run the Horizon Council". Reason: "Last review <date>. Quarterly cadence." Shown when `today >= lastCompletedAt + 76 days`. Same math module as other lead lines; the step title and reason are data, as the almanac spec requires. The per-cycle step id means dismissing or tasking one quarter does not hide the next.
- Action id `alm-horizon-review:<date>`, resolved by `POST /api/calendar-ghosts` into a `create_task` ghost: a Task "Run the Horizon Council review", due `lastCompletedAt + 90 days` (or today if past), `source` `almanac:horizon-review:<date>`. Dismiss and "already done" behave as for every other almanac step (`POST /api/almanac/done`).
- Once a new Horizon run completes, `lastCompletedAt` moves and the new cycle's step appears (or the prior one disappears inside the 76-day window) without any cleanup.

## 3. Central Node

The Phase 3 completion write-back already adds the Recent Agent Actions line. For Horizon it also appends `next review due <date>` to that line so Hammond sees the cadence. The due suffix is reserved first; the key finding is trimmed to keep the whole line within 200 characters and 40 words so the date stays whole. Line date and due date use the Sydney date key from `completedAt` (else `updatedAt`). No new section or patch type.

## Testing

- Service: gate rejects at 89 days without justification, accepts at 89 days with one, accepts at 91 days without one, and accepts when there is no prior run. A cancelled or failed run does not count as a review. Gate failure (store list throws) allows the run with `cadenceUnknown`. Gate also works against the R2 index (fake S3 store), not only the memory store.
- Almanac: step absent before day 76, present from day 76 as `horizon-review:<date>`, present and overdue past day 90, silent with no baseline, cleared after a new completed run. After a task/done for the old cycle, a later completed run shows the new cycle's step on day 76.
- Ghost: `alm-horizon-review:<date>` builds the expected `create_task` plan with `source` `almanac:horizon-review:<date>` and is confirm-first.
- Write-back: long findings (160 characters, 31 words) still leave `; next review due YYYY-MM-DD` whole.
- Completion: `completedAt` is set on complete; a later `updatedAt` bump does not move the review date.
- Constants: `HORIZON_MIN_DAYS` and `HORIZON_LEAD_DAYS` match across the rule file and `cognitive-horizon.mjs`. Lead lines skip a rule whose `lastSafe` is not a date key.
- View: the frequency field appears only after the gate error, and resubmits successfully.

## Risks

- **Clock and timezone.** Compute day counts in Australia/Sydney, as the rest of the calendar does.
- **Log retention.** The gate depends on the log keeping completed Horizon runs. Phase 3 removed the 50-run cap; confirm retention has no expiry.
- **Justification abuse.** It is a single-user tool, so a required free-text reason is sufficient. No approval flow.

## Out of scope

Recurring calendar events, anchors for other protocols, and reminders outside the Almanac.
