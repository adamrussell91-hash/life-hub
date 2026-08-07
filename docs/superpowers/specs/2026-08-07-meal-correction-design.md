# Meal Correction (Same-Slot Overwrite)

**Date:** 2026-08-07  
**Status:** Approved  
**Deploy rule:** Local commits only until Adam asks to push.

## Problem

After a meal is confirmed, correcting it (e.g. “actually half a bowl”) proposes a new `log_entry` with a new time-based slug (`lunch-1430`), so Life Hub **adds** a second meal instead of replacing the first. Double-counting breaks Nutrition and Central Node totals.

## Decision

**One file per meal slot per calendar day.** Meal path slug is the slot only: `breakfast` | `lunch` | `dinner` | `snack`.

A second proposal for the same date + slot hits the existing path → existing write-conflict → “confirm again to overwrite” UX. Central Node re-syncs on successful overwrite.

## Behaviour

| Moment | Behaviour |
|--------|-----------|
| Before confirm | Inline field edits on the Confirm card (unchanged) |
| New meal, empty slot | Create `data/nutrition/YYYY/MM/YYYY-MM-DD-<slot>.md` |
| Correction / second log same slot | Conflict → confirm again overwrites SHA |
| Different slot | Separate file (lunch vs snack) |

## Agent rules

Brisket protocol + persona:

- When Adam corrects food already logged today, re-propose `log_entry` for the **same meal slot** with updated macros and `notes` (`"[food] — [verdict]"`).
- Tell him briefly that confirming will **replace** today’s that slot (not add another).
- Do not invent a second breakfast/lunch/dinner/snack for the same day unless he clearly means a different slot.

## Implementation

- `slugFor` in `chat.mjs`: for `type === 'meal'`, return `record.meal` only (must already be a valid slug enum).
- Keep time-based slugs for non-meal types (workout, skincare routine+time, etc.) unless already specialized.
- Tests: slug helper / proposal path for meals; protocol/persona mention correction.
- No bulk rename of historical `lunch-HHMM` files in v1 — they remain readable history; new writes use slot-only.

## Non-goals

- Stacking multiple snacks per day
- Silent auto-overwrite without second confirm
- In-tab meal editor outside chat
- Notion sync

## Follow-on

Optional migration script to merge/rename old timed meal files into slot paths.
