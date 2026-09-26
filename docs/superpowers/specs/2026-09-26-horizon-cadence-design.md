# Horizon Council cadence (Phase 4)

Date: 2026-09-26
Builds on: `2026-09-26-cognitive-protocol-conversation-and-context-design.md` (Phases 1 to 3, PRs 489 to 491). Base this work on the top of that stack.
Status: locked design.

## Problem

Notion's hard rule is "never run the Horizon Council more often than quarterly without explicit justification", and Adam wants the next review to show up on his calendar. Today nothing knows when the last review was, so the rule lives in a prompt line the model cannot act on.

## Decisions

1. **The run log is the single source of truth.** Cadence is derived from the last completed Horizon run in the Phase 3 log. Nothing is stored separately.
2. **Blocking gate on start.** A new Horizon session is rejected when a completed Horizon run exists that is less than 90 days old and no `frequencyJustification` is supplied. The justification is required text, not a checkbox. With a justification the run proceeds and the justification is kept on the session.
3. **Calendar via the Almanac, derived not stored.** The Almanac gets one rule: when today is within 14 days of the 90-day mark since the last completed Horizon run (or past it), it offers "Run the Horizon Council". Accepting uses the existing `create_task` ghost, so the write is confirm-first as calendar law requires. No ghost is stored in advance, no future-dated calendar write is made, and no anchor file changes.
4. **No nag without a baseline.** If Horizon has never been run, the rule stays silent.

## 1. Gate

- New helper in `cognitive-service.mjs`: `lastCompletedRun(owner, protocolId)` returning `{ id, completedAt } | null`, reading the Phase 3 log index.
- `create()` for `protocolId === 'horizon'`: if `lastCompletedRun` is under 90 days old and `intake.frequencyJustification` is blank, reject with 400 `frequency_justification_required`. The message includes the last run's date and the earliest date without justification.
- The intake field already exists (`frequencyJustification`, "Reason for another review within this quarter"). The UI shows it only when the API returns that error, prefilled with the message, then resubmits.
- Prompt: `buildPrompt` passes `lastReviewDate` and the justification (when present) to the Horizon voices so they can reflect it. `horizon.md` line "Another review inside the same quarter needs the supplied frequency justification. Do not invent one." stays.
- 90 days is a named constant `HORIZON_MIN_DAYS`, not a magic number.

## 2. Almanac rule

- Server: `almanac.mjs` reads the last completed Horizon run through `lastCompletedRun` (same store, same owner rule) and passes `ctx.horizon = { lastCompletedAt }` to the rules.
- Rule in `apps/life/js/app/almanac-rules.js`: a step with id `horizon-review` and title "Run the Horizon Council". Reason: "Last review <date>. Quarterly cadence." Shown when `today >= lastCompletedAt + 76 days`. Same math module as other lead lines; the step title and reason are data, as the almanac spec requires.
- Action id `alm-horizon-review`, resolved by `POST /api/calendar-ghosts` into a `create_task` ghost: a Task "Run the Horizon Council review", due `lastCompletedAt + 90 days` (or today if past). Dismiss and "already done" behave as for every other almanac step (`POST /api/almanac/done`).
- Once a new Horizon run completes, `lastCompletedAt` moves and the step disappears without any cleanup.

## 3. Central Node

The Phase 3 completion write-back already adds the Recent Agent Actions line. For Horizon it also appends `next review due <date>` to that line so Hammond sees the cadence. No new section or patch type.

## Testing

- Service: gate rejects at 89 days without justification, accepts at 89 days with one, accepts at 91 days without one, and accepts when there is no prior run. A cancelled or failed run does not count as a review.
- Almanac: step absent before day 76, present from day 76, present and overdue past day 90, silent with no baseline, cleared after a new completed run.
- Ghost: `alm-horizon-review` builds the expected `create_task` plan and is confirm-first.
- View: the frequency field appears only after the gate error, and resubmits successfully.

## Risks

- **Clock and timezone.** Compute day counts in Australia/Sydney, as the rest of the calendar does.
- **Log retention.** The gate depends on the log keeping completed Horizon runs. Phase 3 removed the 50-run cap; confirm retention has no expiry.
- **Justification abuse.** It is a single-user tool, so a required free-text reason is sufficient. No approval flow.

## Out of scope

Recurring calendar events, anchors for other protocols, and reminders outside the Almanac.
