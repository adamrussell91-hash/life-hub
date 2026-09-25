# Calendar C · Day Dial: visual, motion and wiring contract

The Day stop. Today as one 24-hour circle, noon at the top, time running clockwise. Commitments are arcs on the middle ring; logs are dots on the outer ring; the shape of the day (sleep wall, school, yours) is the inner ring; capacity is the centre. Two side panels answer only two questions: **what's left tonight** and **what does tomorrow need**. A row of seven small dials sits along the bottom.

Behaviour and data: `docs/superpowers/specs/2026-09-24-calendar-design.md` ("C · Day Dial"). This folder is **how it looks, moves and writes. Port it. Don't reinterpret it.**

## What's in this folder

| File | What it is |
|---|---|
| `day-dial.html` | The working reference, built from `src/` (`node docs/proposals/calendar-reference/day-dial/src/build-ref.mjs`). It includes the 330px rail stand-in, so the reference at any window width matches the app at that width. Reference controls: Reset, Slow motion ×5, Reduced motion. |
| `golden/*.png` | 2× targets: `dial-1280`, `dial-960`, `dial-popover-1280`, `dial-accepted-1280`, `dial-390`. |
| `dial-visual.spec.mjs` | 10 browser tests named `dial phase N`. The reference passes 9 (the tenth, the reload check, is app-only). |
| `compare.html` | Goldens vs your build. |
| Data | The Tideline fixture (`../fixture.json`, the same week), with the clock at Thu 24/09/26 6:05 pm. |

Finished modules, with tests. Use them; don't write your own:

| Module | Does | Tests |
|---|---|---|
| `packages/design-kit/js/dial-geometry.js` | Hour ↔ angle (noon up, clockwise), arcs, the clockwise reveal (`visibleSpan`), radii from the real size, callout layout and callout room | `tests/unit/dial-geometry.test.js` (7) |
| `apps/life/js/app/day-brief.js` | Tonight (time left until lights out, remaining commitments, proposals, the missing Dinner row) and Tomorrow (headline, "one big thing and 2 classes, then holidays for 17 days", rows with proposals) | `tests/unit/day-brief.test.js` (7) |
| `calendar-bands.js`, `capacity-model.js`, `ghost-writes.js`, `hub-motion-engine.js` | As for Tideline | — |

## Rules

1. **One motion engine.** The sweep, the hand, the gauge, the week stagger, the popover, the toast and ghost solidifying all go through `createMotion()`. There are no CSS transitions on SVG attributes. Timers are only for how long the toast stays.
2. **Laid out, never scaled.** The dial is `min(DD.maxSize, cell width)` px wide. Its height comes from `ringRadii(size).height` (callouts sit left and right, so there's no dead space above or below). The SVG `width`/`height` attributes equal its `viewBox`. A resize re-lays out **without replaying the entrance**. `.dd` has `min-width:0; contain:inline-size`.
3. **Callouts have room and are fitted.** Callouts sit in one column beside the dial on each side (`layoutCallouts`), never over it, pushed apart so they never overlap. Text is fitted to `calloutRoom(size).width` with an ellipsis (measured once through a cache). The full text lives in the popover and `aria-label`. Compact dials (under 460px, i.e. phone) have no callouts: the lists below carry that information.
4. **Centre text is spaced by real text boxes.** A text box reaches 1em above its baseline, so the caps line sits `big + 6px` above the % baseline. Notes are fitted to 1.6 × the gauge radius.
5. **Every number is computed.** Capacity comes from `capacityForDates`; Tonight and Tomorrow come from `day-brief.js`; arc positions come from `dial-geometry.js`. Never type them in.
6. **Only the logs a person cares about.** Meals and symptoms are dots on the outer ring. A missing lunch is a hollow dashed dot (only after 3 pm, only on a day with logs). Logs never become arcs.
7. **Proposals are the same objects as on the Tideline.** A proposal about an item gets a dashed outline on its arc and a suggestion under its Tonight row. A standalone proposal (Sara's lights-out) is a dashed ghost arc. Accepted, it becomes solid and stays as a plain row. The popover previews the `acceptPlan()` receipt. Accept sends only `{ id, decision }`.
8. **Choosing a day** (week dials, ‹ ›, ← →) re-lays out with a faster sweep and keeps keyboard focus on the chosen day. Only today has a now hand and a Tonight panel.
9. **Linear** opens the Tideline one-day view (the same object as the phone week). There's no second linear design.

## Layout contract

| Part | Spec |
|---|---|
| Nav | ‹, period ("Thursday 24/09/26 · T3 W10" / "6:05 pm · second-last school day of term"), ›, Today, zoom pills with **Day** pressed, spacer, Dial · Linear pills. |
| Body | Grid `minmax(0,1fr) 340px`. Under a 780px card (container query) the panels move under the dial. The dial cell aligns to the top. |
| Rings (fractions of R) | Log dots at 0.94. Ticks at the rim (major every 6 h). Event ring 0.70–0.88 (classes inset 4px, others 2px). Context ring 0.575–0.66 (sleep hatch, school blue, yours peach, the rest quiet). Gauge at 0.43, 10px. Hour labels (noon, 6 pm, midnight, 6 am) at R + 18, 11.5px/600 navy. |
| Arcs | Teaching/fitness blue, professional lilac, health sand, Corey peach with peach-ink stroke. Classes are paler. Proposal: dashed navy stroke. Ghost: Wave 6 % fill, dashed. Skipped: 0.35 opacity. |
| Time left | A High Sea lip just outside the event ring, from now to lights out. |
| Now hand | 2.5px `--danger` from the gauge to past the event ring, with a 5px dot and "now 6:05" (no label on compact dials). |
| Centre | FORECAST/CAPACITY caps 11px, the % in the capacity colour (`clamp(28px, 0.42 × gauge, 48px)`), the note and streak 12px muted. |
| Callouts | 12px/600 title (Corey in peach ink, symptoms in High Sea ink, meals in gold ink) and an 11px muted sub-line. Leader lines are navy 22 %. |
| Tonight | "3 h 55 m that's yours" (22px/700 navy) with "Now 6:05 pm · lights out 10:00 pm (Sara)". Rows are a 56px time plus a title/note, with a dashed suggestion and Skip/Keep, Accept or Move/Dismiss where a proposal exists. A struck row for skipped items. |
| Tomorrow | "Forecast 52%" with its day tag and note, then rows. |
| Week | Seven 68px mini dials: context ring, non-class arcs, capacity ring and number. The pressed day has a `--danger` 5 % wash. |

## Motion contract

| Moment | Motion |
|---|---|
| Mount | The day is revealed clockwise from noon (`__sweep` 0 → 24 h over 900ms, EASE). The hand swings from noon to now (700ms, OVERSHOOT, after 260ms). The gauge fills (700ms). The week dials rise in with a 40ms stagger. |
| Choose a day | A re-layout, then a faster sweep (480ms) and the gauge refills. |
| Resize | Re-layout only. Nothing animates. |
| Accept | "Saving…", then a re-layout from the server's data, then the receipt toast. |
| Popover and toast | As for Tideline. |
| Reduced motion | Everything lands at once. |

## Failure patterns

1. Scaling the SVG to fit (text shrinks, or the dial grows past its cell).
2. A square drawing with dead space above and below.
3. Callouts over the dial, overlapping each other, or cut off at its edge.
4. "CAPACITY" touching the %.
5. Replaying the entrance on every re-render or resize.
6. Losing keyboard focus after choosing a day.
7. A Tonight list that includes classes, past items or logs.
8. An accepted proposal vanishing instead of becoming real.
9. A second, separate "linear day" design.

## Test hooks

In dev builds only: `window.__dayDial = { state, DD, capacity, rings(), setDay, decide, openPop, closePop, finish, stats }`.

## Loop until it matches

`npm run build && DIAL_APP=1 node --test tests/browser/dial-visual.spec.mjs`, then `compare.html`, then the motion contract side by side with the reference at ×5. You're done when all 10 pass, the goldens differ only in anti-aliasing, and the PR has a recording of the entrance plus Skip → Accept lights out.
