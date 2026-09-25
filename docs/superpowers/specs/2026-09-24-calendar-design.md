# The calendar: four zoom stops that know Adam

**Date:** 2026-09-24
**Repo:** `life-hub` · Life calendar (`apps/life/js/app/render-calendar.js`), kit calendar (`packages/design-kit/`)
**Status:** Concept A (Tideline) is ready to build: reference, modules and prompts are on this branch. B, C and D get their own reference folders before they're built.
**Mockups Adam signed off:** the "Life Hub Calendar Concepts" artifact (four views).

## Problem

The Life calendar is the generic grid with every record painted on it (screenshot, 24/09/26):

- Logs drawn as meetings. "breakfast 7:30am –" takes an hour-tall slot and is still cut off.
- Counts that mean nothing ("Knowledge 2037", "Life 1035" are record counts).
- School hours get as much room as the evening, and the evening is the only time that's Adam's.
- No sense of term. Friday is the last day of Term 3 and nothing says so.
- Blind to health. Three low days, a sore throat, and Thursday looks like any Thursday.
- Duplicates (two gastro entries for one appointment).

## Outcome

One calendar object with four zoom stops. They replace Day / Week / Month everywhere:

| Stop | Concept | Job |
|---|---|---|
| Day | C · Day Dial | Run today honestly: what's left tonight, what tomorrow needs |
| Week | **A · Tideline** | Plan the week with elastic hours, capacity, ghosts and walls |
| Term | B · Term River | The term in identity lanes (teacher, Corey, scholar, friends and family), body line, load strip |
| Almanac | D · The Almanac | What nobody booked: last safe days, world calendar, forecast, openings |

The zoom pills read **Day · Week · Term · Year · Almanac**. Year reuses Term River at year scale.

**This replaces the lock in `packages/design-kit/CALENDAR.md`** (Adam, 24/09/26: "new lock for all hubs"). Phase 5 rewrites that file. Until then, Teaching, Tasks and Professional keep the current chrome.

## Non-negotiables

- Read `packages/design-kit/AGENTS.md` and `docs/proposals/calendar-reference/VISUAL-SPEC.md` before any UI work. Tokens and kit components only.
- The reference folder wins on anything visual or motion. This spec wins on behaviour and data; if they disagree, flag it in the PR.
- One motion engine: `createMotion()` from `apps/tasks/src/views/timeline-motion.ts`. Phase 2 moves it (unchanged, tests included) to `packages/design-kit/js/hub-motion-engine.js` with a `.d.ts`, and `timeline-motion.ts` re-exports it, so Life (plain JS) and Tasks (TS) share one engine.
- Every write is confirm-first and goes through the server. No silent writes. Messages to people are only ever drafts.
- Record the tsc error count and failing tests in `docs/proposals/calendar-reference/BASELINE.md` in phase 0. No phase may raise either count.
- Works at desktop and 390px. Works with `prefers-reduced-motion`.

---

## A · Tideline (week)

### Bands

The time axis is a stack of bands from `bandsFromProfile(profile)` in `calendar-bands.js`: Morning (6:00–8:15), School (8:15–15:10), After bell (15:10–17:30), Yours (17:30–22:00), plus a fixed 30px sleep strip (22:00–06:00 is a wall; nothing is booked there).

- Band times come from a new `day_profile` block in the Life planning profile (`/api/planning-profile`): `day_start`, `school_start`, `bell`, `home`, `sleep`. Defaults are Adam's real weekday from About Me.
- The week view uses the school-day stack for every column so rows line up. Non-school days show no School wash. (Day view uses `bandsFromProfile(p, { school: false })` on weekends and holidays.)
- A band expands from its label, the Focus pills, keys 1–4, or a click on its wash. The expanded band takes the room; the rest fold to 30px. The same band again, Balanced, 0 or Escape returns to rest.
- The expanded band is remembered per session (`sessionStorage`, key `life.calendar.band`).

### What goes on the grid

| Source | Where | Notes |
|---|---|---|
| Teaching `scheduled_lesson` | School band, `isClass` | Title = class, meta = `P1 · focus`. Classes never count as load. |
| Professional meetings and events | Timed chips (lilac) | |
| Tasks with a due date | Due row | Timed work blocks go on the grid. |
| Life `workout` (planned) | Timed chip (blue) | Completed workouts go to the vitals line. |
| Life `medical` appointments | Timed chip (health) | **Merge duplicates**: same date, start within 2h, same provider or ≥ 0.6 title similarity. Meta says "N records merged". |
| `calendar_block` (new, below) | Timed chip | `kind: corey` is warm with the two-ring mark; `protected` blocks never count as load. |
| Walls | Hatched overlay | A `calendar_block` with `kind: wall` (all-day or timed). Sunday "Your day" comes from `day_profile.protected_weekday`. |
| Meals, diary, sleep, skincare, heart, body | **Never on the grid** | Vitals line under the date, and counts in the Ambient pill. |
| Knowledge pages | Never on the grid | "N notes touched" in Ambient. |

The source pills count what's **on the grid this week**, not records.

### Free time is shown, not left blank

A day with ≥ 3h of unbooked Yours band shows a dashed "N h free" block: "Nothing booked. Keep it that way?". Tapping it proposes a wall (a Hammond ghost).

### Capacity

`capacityForDates(events, weekDates, { isHoliday })` in `apps/life/js/app/capacity-model.js`. Pure; the constants are in `CAPACITY`.

- Inputs: the sleep record dated that day (the night that ended that morning), diary `energy` and `mood_score`, diary symptoms, and the streak of earlier below-par days.
- Symptoms: the diary's `symptoms: string[]` when present. **Add this optional field to the diary schema** (`core/validate.js`) and have Penelope and Sara write it. Until then the model reads symptom words in the diary text.
- Days after the last log are forecasts (dashed). They recover toward baseline, with a small lift in the holidays.
- Load = hours of non-class, non-protected, non-ghost commitments. A day is **over** when load > pct × 6h. Over days get the warning wash and an "over" pill, and agents may propose softening them.
- Capacity is shown to Adam and passed to agents. It never blocks a booking.

### Ghosts and wiring

A ghost is an agent's proposal on the calendar. Kinds (see `apps/life/js/app/ghost-writes.js`):

| Kind | Proposed by | Accept writes |
|---|---|---|
| `skip_workout` | Sara | Central Node Cross-Agent line `- Sara→Chadwick: skip Thu 24/09 workout (reason).`; workout `status: skipped`; a Recent Actions line |
| `bedtime` | Sara | Today's Status `**Sleep:** lights out 10:00 pm (reason)`; a protected `calendar_block` (`kind: rest`, 30-minute wind-down); a Recent Actions line |
| `protect_block` | Hammond | `calendar_block` (tentative, protected; `kind: corey` when with Corey); This Week line; `- Hammond→Clare: keep … clear.` |
| `move_task` | Hammond or Clare | `PATCH /api/tasks?id=` `{ due_date }`; a Recent Actions line |

Every Central Node patch these produce is auto-class (tested), validates with `validateCentralNodePatchInput`, and lands in the live format (tested against `applyCentralNodePatch`).

**Server: `POST /api/calendar-ghosts` and `GET /api/calendar-ghosts?from=&to=`** (new function `netlify/functions/calendar-ghosts.mjs`, same auth and origin guard as `chat-confirm.mjs`):

- Pending ghosts live in the data repo at `pending-calendar-ghosts.json`, following the pending-CN-patch queue pattern (`parsePendingCnPatches` / `findPendingCnPatchById`). Each entry is the ghost object plus `created_at`, `agent` and `status`.
- `GET` returns pending ghosts in range, for the calendar to draw.
- `POST { id, decision: 'accept' | 'dismiss', reason? }`. The client sends **nothing else**. The server loads the stored ghost, runs `validateGhost`, and builds `acceptPlan(ghost, { today })` or `dismissPlan`.
- Execution order for accept:
  1. One GitHub commit containing every `central_node` patch (applied in order with `applyCentralNodePatch` to a single read of `central-node.md`), every `life_record` create or update (validated by `core/validate.js`), and the ghost's queue entry marked `accepted`. Use the same stale-SHA retry as `handleCnPatchConfirm`.
  2. Then the `tasks` steps, through the same store code as `tasks.mjs` (`mergeTask`, `normalizeTaskRecord`).
  3. If step 2 fails after step 1 landed, return 207 with `{ writes: 'partial', retry: 'tasks' }` and keep a `tasks_pending` marker on the queue entry. Retrying only reruns step 2. Never re-apply step 1.
- The response is `{ ok, receipt: plan.receipt, writes: 'applied' }`. The calendar shows `receipt` in the toast.
- Dismiss writes no Life, Central Node or Tasks data. It marks the queue entry `dismissed` and appends `{ agent, kind, outcome, reason, at }` to `calendar-ghost-decisions.jsonl`, which agents read to propose less of what Adam keeps dismissing.
- The Central Node patches are auto-class, but the user pressing Accept **is** the confirmation. `chat-confirm`'s `auto_class_rejected` rule doesn't apply to this endpoint. Say so in a comment.

**Where ghosts come from (phase 5):** a `propose_calendar_ghost` tool for Hammond and Sara (and Clare for `move_task`), validated with `validateGhost`, appends to the queue. Sara proposes only on days with `soften: true`. Hammond proposes `protect_block` for free evenings and good nights.

### New record type: `calendar_block`

```yaml
type: calendar_block
date: 2026-09-26
time: "18:00"          # start
end_time: "22:00"
kind: corey | rest | protected | wall | focus
status: tentative | confirmed
protected: true
title: Dinner out + a show
source_agent: hammond  # optional
```

Add it to `VALIDATORS` in `core/validate.js`, to `SOURCE_BY_TYPE`/`eventDetailTitle`/`eventBrief` in `calendar-model.js`, and to the canonical record paths. A block with `time` and `end_time` is already a busy span for Clare's scheduler (`lifeEventToBusySpan`), so protected time is respected for free (tested).

### Keyboard and accessibility

- Chips are focusable buttons. Enter or Space opens the popover; Escape closes it (and a second Escape rebalances the bands).
- Keys 1–4 expand a band, and 0 rebalances.
- Every change is announced in the `aria-live` region ("School expanded.", then the receipt text).

---

## B · Term River, C · Day Dial, D · The Almanac

Behaviour as in the signed-off mockups. Each gets its own reference folder (`docs/proposals/calendar-reference/{term-river,day-dial,almanac}/`) built the same way as Tideline before any build prompt is written. Notes that constrain them now:

- **B · Term River** is ready to build: reference in `docs/proposals/calendar-reference/term-river/`, one-prompt build in `docs/superpowers/plans/2026-09-26-term-river-prompt.md`. Lanes are identities from About Me in their order (teacher, Corey, scholar, friends and family), plus Body; `apps/life/js/app/term-river.js` routes every item to one lane and computes weekly load against `CAPACITY.budgetHours` (classes, protected time and ghosts don't count). The build promotes `school-time.ts` (holiday compression, week labels) to `packages/design-kit/js/school-time.js` so Life can use it, and the Tideline drops its duplicate `weekLabel`. Term and Year are one chart with one zoom blend, not two views. It uses the existing ghost endpoints unchanged.
- **C · Day Dial** is ready to build: reference in `docs/proposals/calendar-reference/day-dial/`, one-prompt build in `docs/superpowers/plans/2026-09-25-day-dial-prompt.md`. It uses the Tideline's data and ghost endpoints unchanged; new modules are `dial-geometry.js` (kit) and `day-brief.js` (Life). Linear is the Tideline one-day view.
- **D · The Almanac** is ready to build: reference in `docs/proposals/calendar-reference/almanac/`, prompts in `docs/superpowers/plans/2026-09-24-almanac-prompts.md`. Its data and server contract:
  - **Anchors** live in `almanac-anchors.yml` in the data repo: `{ id, title, kind, date | window, returns?, tags[], sub }`. Hammond seeds it from About Me and Constraints, and new anchors are confirm-class. Term dates (hub prefs) add `term` anchors automatically. Any `calendar_block` or Professional event with `anchor: true` becomes one too.
  - **Rules and wants** are `apps/life/js/app/almanac-rules.js`. Step titles and reasons are data; the math is `lead-lines.js` and `openings.js`.
  - **Done steps** are `almanac-done.json` in the data repo (`[{ stepId, at }]`), passed as `ctx.done`.
  - **`GET /api/almanac?from=&to=`** computes everything server-side with the same modules: lead lines, summary, forecast series (from the capacity model over Life logs plus the term pattern), openings, and world entries. Each action carries an id (`alm-<stepId>`, `alm-hold-<wantId>`, `alm-draft-<wantId>`).
  - **`POST /api/calendar-ghosts { id, decision }`** resolves `alm-…` ids by recomputing the Almanac and building the ghost (`create_task`, `protect_block`, `draft_message`) with `acceptPlan`. Nothing is stored in the ghost queue for these. "Already done" is `POST /api/almanac/done { stepId }`.
  - **World feeds** come last, as cached Netlify Functions: BOM forecast (7 days), NSW public holidays and daylight saving (a static yearly table is fine), the NESA HSC timetable (yearly), then listings. Until a feed is live, its entries say "example".

## Phases (Tideline)

Prompts: `docs/superpowers/plans/2026-09-24-calendar-prompts.md`.

| Phase | Scope | Proves |
|---|---|---|
| 0 | Baseline, run the module tests, copy the spec | BASELINE.md |
| 1 | `calendar_block` schema, `/api/calendar-ghosts`, queue, mock API, `/api/calendar-visual-seed` | Server tests |
| 2 | Kit CSS, geometry constants, motion engine in the kit, Tideline week in Life with real data (static bands) | spec "phase 2" |
| 3 | Band motion, focus pills, keyboard, reduced motion | spec "phase 3" |
| 4 | Ghost chips, proposals on items, popover, Accept/Dismiss/Apply all wired to the endpoint | spec "phase 4" |
| 5 | Agents propose ghosts; rewrite `CALENDAR.md`; other hubs adopt the object | Agent tests; hubs' own specs |
