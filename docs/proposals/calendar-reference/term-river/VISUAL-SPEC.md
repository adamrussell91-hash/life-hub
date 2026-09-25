# Calendar B · Term River: visual, motion and wiring contract

The Term and Year stops. The term (or the year, Term 3 to home from Korea) is drawn as **lanes, one per identity**, in About Me's order: Teacher, Corey, Scholar, Friends & family. Body runs underneath as the capacity line, and a Load strip shows booked hours against capacity each week. Holidays are narrower, not removed. Hammond's proposals sit in their lane as dashed points with an H badge.

Behaviour and data: `docs/superpowers/specs/2026-09-24-calendar-design.md` ("B · Term River"). This folder is **how it looks, moves and writes. Port it. Don't reinterpret it.**

## What's in this folder

| File | What it is |
|---|---|
| `term-river.html` | The working reference, built from `src/` (`node docs/proposals/calendar-reference/term-river/src/build-ref.mjs`). It includes the 330px rail stand-in. Reference controls: Reset, Slow motion ×5, Reduced motion. `+` / `-` switch Term / Year. |
| `golden/*.png` | 2× targets: `river-term-1280`, `river-year-1280`, `river-term-960`, `river-year-960`, `river-popover-1280`, `river-390`. |
| `river-visual.spec.mjs` | 11 browser tests named `river phase N`. The reference passes 10; the eleventh (reload) is app-only. |
| `compare.html` | Goldens vs your build. |
| `src/fixture.ts` | The data: two terms, the two zoom ranges, items, the Korea wall, logged capacity, the term pattern and commitments. Today is Thu 24/09/26. |

Finished modules, with tests. Use them; don't write your own:

| Module | Does | Tests |
|---|---|---|
| `apps/life/js/app/term-river.js` | `LANES`, `laneFor` / `byLane` (every item in exactly one lane), `weeksBetween`, `riverWeekLabel`, `weeklyLoad` (booked vs capacity on `CAPACITY.budgetHours`; classes, protected time and ghosts don't count) | `tests/unit/term-river.test.js` (5) |
| `apps/tasks/src/domain/school-time.ts` | `buildTimeScale` (holiday compression), `weekLabel` | `apps/tasks/tests/unit/school-time.test.ts`. **Promote to the kit** (see the prompt). |
| `capacity-model.js`, `ghost-writes.js`, `hub-motion-engine.js`, `hub-motion.js` (pills thumb) | As for Tideline and the Day Dial | — |

## Rules

1. **One motion engine.** The reveal, the Term ↔ Year zoom, the popover and the toast go through `createMotion()`. No CSS transitions on SVG attributes.
2. **One zoom blend.** Both scales are built from `buildTimeScale` with the zoom's `holidayFactor` (Term 0.65, Year 0.5), each normalised to the plot. The `__zoom` entity tweens `t` 0 → 1; every positioned thing is a **placer** that receives `X = A + (B − A) × t`. Nothing is re-mounted during the zoom. `apply()` is the only writer of geometry.
3. **Laid out, never scaled.** SVG `width` = `viewBox` width = the card's width. The plot runs from `labelW` (196) to `W − padR` (24) and is clipped there; nothing draws past it. A resize re-lays out **without replaying the reveal**. `.tr` has `min-width:0; contain:inline-size`.
4. **Labels are fitted, never collide.** Bar titles fit to the visible bar (clamped to the plot edge). Point labels alternate above and below the lane line, each budgeted to the next label on the same side. The UOW hum's label runs to the first label below the line. Labels above sit at `cy − 19`, above the agent badge (`cy − 8`), so a badge never cuts a label. Two badges closer than 18px show one. Measured-text cache; the full title is in the popover and `aria-label`.
5. **Weeks, not months, while they fit.** Week labels (`T3 W10`, `Hol W1`) show when a *school* week is ≥ `minWeekLabel` (46px). Each label fits its own week or falls back to the short form (`W10`, `H1`), else hides. Below 46px the axis shows months. Nothing labels past the plot edge.
6. **Every number is computed.** Lanes from `byLane`, week labels from the module, load from `weeklyLoad`, the body line from `forecastSeries` over logs. Never type them in.
7. **Proposals are the same objects as everywhere else.** The popover previews the `acceptPlan()` receipt. Accept sends only `{ id, decision }`. Accepted, a proposal becomes a held point (Corey: peach fill, ink ring) with no badge. Dismissed, it leaves the river.
8. **Phone is lists.** Under 720px there's no chart: each lane is a card listing this range's items in date order (ghosts with the H mark), and Body shows today and next week's forecast. The period title gets its own row; the zoom pills sit under it.

## Layout contract

| Part | Spec |
|---|---|
| Nav | ‹, period ("Term 3 → Term 4" / "T3 W9 – T4 W3 · 14/09/26 – 01/11/26"; Year: "2026 · Term 3 to home from Korea"), ›, Today, zoom pills with **Term** or **Year** pressed. |
| Axis | Tier bar (TERM 3, HOLIDAYS, TERM 4 · ONE CLASS, SUMMER) 18px at y 8; week label 12px/600 at y 50 and date 11px muted at y 63; week lines full height. Today: a dashed Wave line and a Wave pill on the axis rule (`axis.h − 9`). |
| Lanes (heights) | Teacher 160, Corey 76 (peach wash), Scholar 64, Friends 72, Body 104, then Load 104. Label column 196: lane name 14px/600 (Corey in peach ink) and a muted sub-line. |
| Bars | 18px, radius 7, 6px gap, pastel blue, 12px/600 navy titles. |
| Points | 5px. Teacher lilac, Corey peach ink (past sample evenings small and pale), Scholar gold, Friends sage, Body white with a health ring. Diamond for milestones (conferral). Marker line for "Y11 becomes Y12". Ghost: dashed, faint fill, navy H badge. |
| Hum | UOW: a dotted gold line across the range, label below at its start. |
| Body | Logged capacity solid Wave, forecast dashed with its band, the 40% line dashed High Sea with "40%". |
| Load | A bar per week (booked h), a dashed navy capacity tick, the value above ("8.5 h", "22.5 h · over"). Holidays sage; over-capacity warning fill with a High Sea ring. |
| Legend | School day, Wall, Agent proposal, Over capacity, and "Holidays are shown narrower, not squashed: they're where your life happens." |

## Motion contract

| Moment | Motion |
|---|---|
| Mount | The plot is revealed left to right (`__reveal` clip 0 → W, 700ms, EASE). Labels and the lane column don't move. |
| Term ↔ Year | One tween of `__zoom.t` over 520ms, EASE. Bars, points, lines, week lines and load bars all slide together; week labels hand over to months as weeks narrow. Pills thumb slides. |
| Resize | Re-layout only. Nothing animates. |
| Accept / Dismiss | "Saving…", then a re-lay out from the server's data (no reveal), then the receipt toast. |
| Popover and toast | As for Tideline. |
| Reduced motion | Everything lands at once. |

## Failure patterns

1. Scaling the SVG to fit, or a viewBox that disagrees with its width (content shifts and clips).
2. Re-mounting on zoom (a jump, then a fade) instead of one blended tween.
3. Bars or labels running past the plot's right edge.
4. Agent badges on top of labels, or stacked on each other.
5. Months at the Term zoom because the week width was measured across compressed holidays.
6. Holidays drawn full width, or removed.
7. Replaying the reveal on resize.
8. Classes or Corey time counted in Load.
9. An accepted proposal vanishing instead of becoming held.

## Test hooks

In dev builds only: `window.__termRiver = { state, TR, loads, lanes(), setZoom, decide, openPop, closePop, finish, stats, blend() }`.

## Loop until it matches

`npm run build && RIVER_APP=1 node --test tests/browser/river-visual.spec.mjs`, then `compare.html`, then the zoom side by side with the reference at ×5. You're done when all 11 pass, the goldens differ only in anti-aliasing, and the PR has a recording of Term → Year → Term plus Accept on Lunch with Bob.
