# Calendar D · The Almanac: visual, motion and wiring contract

The Almanac is the fifth zoom stop (Day · Week · Term · Year · **Almanac**). Every calendar remembers what was booked; the Almanac shows **what nobody has booked yet**:

- **last safe days** cast backwards from every fixed point
- the **world's calendar** laid over Adam's
- a **15-week capacity forecast**
- **openings**: free, high-capacity windows held for Corey, Bob, Newcastle and the Sunday he'd lose to daylight saving

Behaviour and data: `docs/superpowers/specs/2026-09-24-calendar-design.md`, "D · The Almanac". This folder says **exactly how it looks, moves and writes**. As with Tideline, **the reference is the design. Port it. Don't reinterpret it.**

## What's in this folder

| File | What it is |
|---|---|
| `almanac.html` | Working reference, built from `src/`. Includes a 330px **rail stand-in**, so the reference at any window width matches the app at that width. Open it from the repo so the kit CSS resolves. Reference controls: Reset, Slow motion ×5, Reduced motion. |
| `golden/*.png` | 2× targets: `almanac-1280`, `almanac-popover-1280`, `almanac-held-1280`, `almanac-390`. |
| `fixture.json` | Generated from `src/fixture.ts`. Anchors are real (central-node.md); world entries marked `example` stand in for live feeds. |
| `almanac-visual.spec.mjs` | 8 browser tests named `almanac phase N`. The reference passes all 8. |
| `compare.html` | Goldens vs your build. |
| `src/` | `almanac-ref.ts`, `fixture.ts`, `almanac.template.html`, `build-ref.mjs` (`node docs/proposals/calendar-reference/almanac/src/build-ref.mjs`). |

Finished modules, with tests. Use them; don't write your own:

| Module | Does | Tests |
|---|---|---|
| `packages/design-kit/js/lead-lines.js` | Anchor + rules → steps with last safe day, days left and status (`overdue` · `now` · `soon` · `later` · `done`); window anchors; dreams; summary | `tests/unit/lead-lines.test.js` (8) |
| `packages/design-kit/js/openings.js` | Days + wants → the earliest qualifying window per want, never double-booking part of a day | `tests/unit/openings.test.js` (5) |
| `apps/life/js/app/almanac-rules.js` | Adam's lead-time rules and wants, each with its reason and source | covered by the two above |
| `apps/life/js/app/capacity-model.js` → `forecastSeries` | 15-week forecast with a widening confidence band and the term pattern | `tests/unit/capacity-model.test.js` |
| `apps/life/js/app/ghost-writes.js` → `create_task`, `draft_message`, `protect_block` | What every Almanac button writes, and the receipt | `tests/unit/ghost-writes.test.js` |

## Rules

1. **One motion engine** (`createMotion`). The tide reveal, line draw, bead pop, count-down, popover, toast and held tint all go through it. No CSS transitions on geometry. Timers only for how long the toast stays.
2. **Every number is computed.** The summary (2 · 7 · 4), bead statuses, last safe dates and opening windows all come from the modules over the fixture. If yours differ, your inputs are wrong. Don't type them in.
3. **Port the constants.** The `ALM` block goes to `packages/design-kit/js/almanac-geometry.js`.
4. **Laid out, never scaled.** At mount the chart is laid out at its card's real width (`setWidth(card.clientWidth)`), and the SVG's `width` equals its `viewBox` width, so 1 unit is 1 CSS px and 11.5px text stays 11.5px. A `ResizeObserver` on the host re-lays it out when the width changes by more than 2px. Never `width:100%` on the SVG. (Scaled into the app's 900px column, every label would shrink to about 9px. The spec checks 960, 1280 and 1600.) `.alm` has `min-width:0; contain:inline-size`.
5. **Labels have budgets.** A bead label may run up to the next label on the same side of its lead line (minus `labelGap`). Two labels facing each other split the gap at the midpoint. Longer text ends in "…" via `fitText` (measured once through the `textW` cache, never in the frame loop). The full title is always in the popover and `aria-label`. No chart text or pill may leave the chart (the Korea pill clamps to the right edge).
6. **Classes are the contract.** `alm-*` rules move verbatim (from `.alm{` down) to `packages/design-kit/calendar-almanac.css`. The `alm-hatch` pattern and `alm-area` gradient defs move with them (render them once in the shell).
7. **Status has one look each.** `now` is a High Sea dot with a halo. `overdue` is a danger diamond. `soon` is a navy ring (2.2px). `later` is a navy ring (1.6px). `done` is a sage dot with a tick. `tasked` adds a dashed navy halo. Dream beads are gold. Never colour a bead any other way.
8. **Example data says so.** Any world entry that isn't from a live feed ends its sub-label with "· example". When a live feed replaces one, the word goes.
9. **Nothing is sent.** A draft is shown to copy. "Plan it with Hammond" writes nothing yet (phase 5 of the calendar work).
10. **The server resolves actions.** Buttons send `{ id, decision }` to `POST /api/calendar-ghosts`. For `alm-…` ids, the server recomputes the Almanac with the same modules and builds the ghost itself. The client never builds writes.
11. **Phone is lists.** Under 720px there is no chart: summary, then one card per lead line with its steps (dot, title, last safe date or "now"), then openings stacked. Never sideways scroll.

## Layout contract (desktop)

| Part | Spec |
|---|---|
| Nav | `‹`, period ("The Almanac · until you're home from Korea" / "24/09/26 → 10/01/27 · 15 weeks"), `›`, Today, zoom pills with **Almanac** pressed, spacer, "What am I forgetting?" ask chip. |
| Summary | 4 cells: thesis (17px/600 navy, balanced), then three numbers 28px/700 tabular: **unbooked** (High Sea ink), **last safe days in the next 5 weeks** (navy), **openings** (sage ink), each with a 12px muted caption. |
| Chart frame | Label column to x 210 (rule at x0 − 12). Labels 12.5px/600 navy, sub 11px muted. Days from x0 222 to 1168. |
| Axis | Month ticks and labels (11.5px/600 muted) at y 20. Tier pills y 30 h 18 r 6: HOLIDAYS / SUMMER navy 6 %, TERM 4 · ONE CLASS sage. |
| Holidays | Full-height sage 40 % wash. The Korea wall is hatched from y 98, with a navy pill "Korea · 23/12 – 10/01". |
| World | Two rows (y 66, 92). A 3.5px Wave-ringed dot, then title 11.5px/500 and sub 11px muted. |
| Anchors | Navy flags; title 11.5px/600, sub 11px. Rows y 122 and 142, alternating to avoid collisions. |
| Tide | Base y 262, height 96. Area: Wave 24 % → 0 gradient. Confidence band: Wave 8 %. Line: Wave 2.25px. The 40 % line is High Sea ink, dashed 3 4, at 0.55. Pattern notes 11px blue ink ("holidays refill you", "report-writing dip…" **below** the line, "Korea"). Opening dots: sage 4.5px on the line. |
| Lead lines | Divider at y 284, "LAST SAFE DAYS" caps at 304. Rows from y 318, 52 each, sorted most urgent first. Rail: navy 28 %, 2px, from the earliest step to the anchor. Anchor: navy diamond, white 2px stroke. Window anchors: a sand pill across the window + "window closes dd/mm". Dreams: gold dotted line to the right edge + "→ 2027". |
| Bead labels | 11.5px, alternating above (y − 12) and below (y + 21) by step order. Within 240 units of the right edge, a label anchors to its end. `now` labels are 600. **No label may overlap another or leave its column** (the spec checks). |
| Today | Wave dashed 1.5px line with a 52 × 18 pill at the top. |
| Openings | A 5-column grid under the chart. Card: white, `--radius-sm`, `--elev-1`. When: 12px muted + capacity % in sage ink. Title 13px/600 (Corey: peach ink, two-ring mark, peach wash). Reason: 12px muted, from `almanac-rules.js` `why`. Buttons: see the wiring table. Held: sage border and tint (tweened `--held`). |
| Popover | 300px paper, `--elev-2`, below-right of the bead. Title; "Last safe day **dd/mm/yy** · N days left"; the rule's `why`; "ADD AS TASK WRITES" + a dashed preview of the exact receipt; **Add as task** / **Already done**. |
| Draft | Inside its card: dashed navy 40 % box, the text (select-all), **Copy** (clipboard, falling back to selecting the text). |

## Wiring

| Button | Ghost built by the server | Writes | Receipt |
|---|---|---|---|
| Step › Add as task | `create_task` (title, due = last safe day, source `almanac:<stepId>`) | `POST /api/tasks`, one Recent Actions line | "Hammond → Tasks: “…”, due dd/mm/yy (the last safe day)." |
| Step › Already done | none | `almanac-done.json` in the data repo: `{ stepId, at }`, read back as `ctx.done` | "Marked done. The Almanac stops asking about it." |
| Good night › Hold it | `protect_block` with Corey, 18:00–22:00 | `calendar_block` (corey, tentative, protected); This Week line; Hammond→Clare line | protect_block receipt |
| Keep empty › Wall it | `protect_block` 06:00–22:00 "Keep empty (daylight saving)" | `calendar_block` (protected) | protect_block receipt |
| Newcastle › Hold both days | two `protect_block`s, 08:00–21:00 | two `calendar_block`s | both receipts |
| Draft a message | `draft_message` with `{when}` filled from the opening's dates | nothing | "Draft ready for X. Nothing sent." |
| Plan it with Hammond | none (phase 5) | nothing | "Nothing written yet…" |

## Motion contract

| Moment | Motion |
|---|---|
| Mount | The tide reveals left to right: clip width 0 → 1198 over 700ms, EASE. Lead lines draw back from their anchor (rail `x1` from anchor to first step) over 520ms, staggered 60ms per row. Beads pop (scale 0.4 → 1, opacity 0 → 1, OVERSHOOT, 320ms), starting halfway through their row's draw, staggered 40ms. |
| Popover | Opacity and y 4 → 0 over 180ms. |
| Add as task | Buttons disable during the POST. Then the bead gains the dashed "tasked" halo, and the toast shows. |
| Already done | The bead's status changes to `done`. A pulse: scale placed at 1.25, then OVERSHOOT back to 1 over 320ms. The unbooked number counts down over 420ms. |
| Hold | "Saving…", then `--held` 0 → 1 over 320ms and the button reads "Held for you both" / "Walled" / "Held". |
| Reduced motion | Everything lands at once. Opacity fades only. |

## Failure patterns

1. Typing the summary numbers or bead dates into the view.
2. One colour for every bead. Status is the whole point.
3. Labels colliding once real data is longer than the fixture. The flip-to-left rule and alternating rows exist for this; the spec checks it.
4. The tide as a flat line with no band. The band widening with distance is the honesty.
5. Hiding "example" on world data that isn't live.
6. A "Send" button on drafts.
7. Building the write in the browser.
8. Rendering the chart on phone and letting it scroll sideways.
9. CSS `transition` on SVG attributes, or `setTimeout` chains for the entrance.
10. Scaling the chart to fit instead of laying it out at its width. The text shrinks.
11. Openings chosen by "best capacity" instead of the earliest window that clears the bar. Something else would take the early one.

## Test hooks

In dev builds only: `window.__almanac = { state, ALM, lines(), summary(), openings, series, openPop, closePop, addTask, markDone, finish, stats }`, exactly like the prototype.

## Loop until it matches

`npm run build && ALMANAC_APP=1 node --test tests/browser/almanac-visual.spec.mjs`, then check `compare.html`, then run the motion contract side by side with the reference at ×5. You're done when all 8 pass, the goldens differ only in anti-aliasing, and the PR has a recording of the entrance plus Add as task → Already done → Hold.
