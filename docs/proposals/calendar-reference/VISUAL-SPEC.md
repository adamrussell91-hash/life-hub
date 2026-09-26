# Calendar A · Tideline: visual, motion and wiring contract

This folder is the design for the Tideline week, concept A of the four calendar views in `docs/superpowers/specs/2026-09-24-calendar-design.md`. That spec says **what** the calendar does. This folder says **exactly how it looks, moves and writes**.

Adam signed off the mockups. Past builds (Graph: see `docs/proposals/graph-reference/VISUAL-SPEC.md`, "Why this round exists") shipped the logic without the design. So: **the reference files are the design. Port them. Don't reinterpret them.**

## What's in this folder

| File | What it is |
|---|---|
| `tideline.html` | Working reference, built from `src/`. Open it from the repo so it loads the real kit CSS (`../../../packages/design-kit/`). It expands bands, opens chip popovers, accepts and dismisses ghosts, shows receipts, and switches to one day at 390px. The "Reference controls" row (Reset, Slow motion ×5, Reduced motion) is not product. |
| `golden/*.png` | Target screenshots at 2×: `tideline-1280`, `tideline-960` (app column width), `school-1280`, `yours-1280`, `popover-1280`, `accepted-1280`, `tideline-390`. |
| `fixture.json` | The data behind the goldens, generated from `src/fixture.ts`. Clock frozen at Thu 24/09/26 18:05 Sydney. |
| `tideline-visual.spec.mjs` | The contract: 10 browser tests named by phase. The reference passes all 10. Copy it unchanged to `tests/browser/`. |
| `compare.html` | Golden (left) vs your build (right), side by side or as a difference overlay. Build images come from the spec's `compare/` output. |
| `src/` | Prototype source: `tideline-ref.ts`, `fixture.ts`, `tideline.template.html`, `build-ref.mjs`. Rebuild with `node docs/proposals/calendar-reference/src/build-ref.mjs`. |

The prototype bundles **real, finished modules**. They have tests. Use them; don't write your own.

| Module | Does | Tests |
|---|---|---|
| `packages/design-kit/js/calendar-bands.js` | Band stack, expand targets, hour ↔ y, block geometry, chip density | `tests/unit/calendar-bands.test.js` (11) |
| `apps/life/js/app/capacity-model.js` | Capacity % and note from sleep, diary energy, mood, symptoms, streak; forecasts; load and "over" | `tests/unit/capacity-model.test.js` (7) |
| `apps/life/js/app/ghost-writes.js` | What Accept writes for each ghost (Central Node patches, Life records, Tasks PATCH) and the receipt text | `tests/unit/ghost-writes.test.js` (7) |
| `apps/tasks/src/views/timeline-motion.ts` | The one animation engine (already on main) | `apps/tasks/tests/unit/timeline-motion.test.ts` |

If one is wrong, fix it in place, keep its tests passing, and say why in the PR.

## Rules

1. **One motion engine.** Every moving thing goes through `createMotion()`: band heights, column entrance, ghost accept, dismiss, popover, toast. No CSS transitions on `top`, `height` or `transform`, no `setTimeout` animation, no per-element `requestAnimationFrame`. (`setTimeout` is allowed for how long a receipt stays up, never for motion.) The only CSS transitions allowed are colour changes on hover and focus, and the band chevron's rotation.
2. **The render pattern is fixed.** Band heights are one engine entity (`__bands`, props `h0..h3`). Its `apply` calls `layout(heights)` (pure, returns `Map<entityId, Props>`) and `engine.place()`s every entity. `apply` is the only function that writes geometry. Copy sections 3–5 of `tideline-ref.ts`.
3. **Expand tweens one entity.** `engine.to('__bands', { h0, h1, h2, h3 }, { duration: CAL.bandMs, easing: EASE })`. Never a tween per chip.
4. **The stack never changes height.** `bandTargets()` keeps the total. Nothing below or beside the body moves while a band opens.
5. **Density is height, and it fades.** Chips never swap markup mid-tween. `apply` sets `--t` (title), `--m` (meta) and `--a` (actions) from `CAL.fade`, `--lines` from `CAL.twoLinesAt`, `--py` from `CAL.cardAt`/`CAL.lineBox`, and `data-density`. Below `cardAt` the meta, proposal and action rows are `display:none` (they are already at opacity 0 by then).
6. **Port the constants verbatim.** The `CAL` block in `tideline-ref.ts` goes to `packages/design-kit/js/calendar-tideline-geometry.js` as a named export. No magic numbers in the view.
7. **Tokens only.** Every colour is a `var(--token)` or a `color-mix()` of tokens. The derived surfaces are named once on `.cal` (`--cal-school-wash`, `--cal-health`, …). Don't add kit tokens.
8. **Classes are the contract.** Move the `<style>` block of `tideline.template.html` (from `.cal{` down, not the `.page` and `.ref-controls` rules) to `packages/design-kit/calendar-tideline.css`, with the same `cal-*` class names.
9. **`data-part` attributes are the test contract.** Add them exactly as the spec expects. Don't edit the spec to fit the build. If an assertion is wrong, explain why in the PR.
10. **Capacity is computed, never typed.** Header percentages come from `capacityForDates()` over the day's Life records. The golden numbers (79, 51, 42, 34, 52, 68, 75) are what the model gives for the fixture. If your number differs, your inputs are wrong.
11. **Accept goes to the server.** The client sends `{ id, decision }` to `POST /api/calendar-ghosts`. The server builds the plan with `acceptPlan()` from the stored ghost and executes it. The client never builds or sends writes. The receipt in the toast is the server's `plan.receipt`.
12. **Logs never take a slot.** Meals, diary, sleep, skincare and symptoms appear only in the vitals line and the ambient chip. The grid is for commitments.

## Layout contract (desktop, ≥ 720px)

| Part | Spec |
|---|---|
| Nav | `‹` round 36px, period (`T3 W10 · last week of term` 17px/600 navy; `dd/mm/yy – dd/mm/yy` 12px muted, tabular), `›`, **Today** (`.btn--secondary`), zoom `.hub-pills` Day · Week · Term · Year · Almanac (Week pressed), spacer, "Focus" + `.hub-pills` Balanced · Morning · School · After bell · Yours. |
| Tray | Paper, 1px `--line`, `--radius-sm`, `--elev-2`. Navy 28px avatar, headline 13px/600, detail muted. Apply all (primary), Review (secondary), Dismiss (ghost). |
| Sources | Pills 12px/500, 8px round dot in the source stripe colour (changed 26/09/26 for Comms: see `docs/superpowers/specs/2026-09-26-calendar-comms-design.md`). Corey uses the two-ring mark and peach ink. Ambient pill: dashed border, muted, counts of logs (never records). |
| Card | Kit glass (`--hub-glass-fill`, 1px `--line`, `--radius-md`, `--hub-elev-card`, blur). Grid `104px / repeat(7, 1fr)`. |
| Day head | 108px min. DOW 11px caps muted, date 15px/600 in a 30px circle (today: `--danger` fill, white). Right: "over" pill (only if over), then the tag (`Last day T3` gold, `Holidays` sage). Capacity bar 6px: fill ≥60 `--pastel-sage-ink`, ≥40 `--pastel-gold-ink`, else `--high-sea`; forecast = dashed fill at 0.6. Text `NN% · note` 12px (percentage 600 ink; over: `--high-sea-ink`). Vitals 11px muted: moon + sleep h, bolt + energy (low: `--high-sea-ink`), fork + meal count, `● symptom` in `--high-sea-ink`. The over head has a `--warning-surface` fill. |
| Due row | 56px min. Task chip: sage 80 %, 8px radius, title 2 lines max. A proposal row: agent avatar 18px, label, navy **Move** button. Moved: opacity 0.55, "Moved to T4 W1 Tue". |
| Band labels | Buttons, absolutely positioned from layout. Label 12px/600 navy + chevron; sub-label 11px muted, opacity `--sub` fades 38→48px. Expanded: Wave 8 % wash, Wave label, chevron rotated 180°. Sleep label: hatch, fixed 30px. |
| Bands at rest | Morning 58, School 158, After bell 104, Yours 232 (total 552) + sleep 30. School wash `--cal-school-wash` on school days only. Yours wash `--cal-yours-wash` every day. 1px `--line` at each band top. |
| Band expanded | Expanded band = 552 − 3 × 30 = 462; others 30. |
| Chip | Absolute, 6px side insets, radius 9, 3px stripe in the kind colour. Card padding 5/8/5/10. Title 12px/600, line-height 1.25, clamp `--lines`. Meta 11px muted, one line, ellipsis. Kinds: teaching/fitness blue, professional lilac, task sage, health `--cal-health`, Corey peach gradient + peach ink + two-ring mark. Classes: 80 % white, no shadow, Wave 18 % border. Past days: 0.72. |
| Ghost chip | `--cal-ghost-fill`, 1.5px dashed navy 55 % (Corey: peach ink 60 %). Agent avatar 18px top right. Inline Accept (navy) / Dismiss only when the chip is ≥ 62px (`CAL.fade.actions`). |
| Proposal on an item | When a ghost is about an existing item (`overItem`), there's no second chip. The item gets a 1.5px dashed outline offset 2px, the agent avatar, and a line `Sara suggests: skip workout` (11px/600 navy). |
| Chip popover | Any chip opens it (click, Enter or Space). 288px, paper, `--radius-sm`, `--elev-2`. 8px right of the chip, or to its left when there's no room. For proposals: "SARA SUGGESTS" and "ACCEPT WRITES" caps labels, then a dashed Wave 6 % box with the exact receipt from `acceptPlan()`, then Accept / Dismiss. |
| Free evening | Dashed 1px navy 18 %, radius 9, inset 8px: "4½ h free" sage-ink 600 + muted line. Hidden when its band is under 90px. |
| Now line | 2px `--danger`, 8px dot at the left, time label 11px/600 top right. Today's column only. |
| Wall | Hatch over the day body (not the sleep strip), navy pill with a lock: "Your day · protected". |
| Toast | Navy, white, `--radius-sm`, bottom right 24px, sage check circle. `Written.` + receipt. |

### Narrow columns (the real app)

Inside the Life shell, the rail takes about 330px, so at a 1280px window each day column is **about 115px**, not the 157px of the reference page. The reference handles it with container queries on `.cal-head` and `.cal-body`, so port those rules verbatim:

- The name row wraps. The "over" pill and the day tag drop under the date instead of running into the next column. Tags ellipsize.
- Vitals wrap onto a second line instead of clipping mid-word.
- Under 150px: the wall pill shows its first part only ("Your day"). Inline Accept/Dismiss are hidden, so proposals are accepted from the chip popover. The date circle shrinks to 26px.
- Tray buttons never wrap; the tray detail ellipsizes.

- Under 96px (the app at about 960px wide): the wall pill shows only its lock (full label in `title`/`aria-label`).
- **`.cal` has `min-width:0; contain:inline-size`.** The Life shell's content column sizes itself from its content (`1fr`), so without this, one line of `nowrap` text (the tray summary) widens the whole page. This happened in phase 2b.

The reference page includes a 330px **rail stand-in** and the same grid sizing as the Life shell, so the reference at any window width matches the app at that width (day columns about 115px at 1280, about 70px at 960). The spec checks 960 and 1280 in "phase 2: nothing spills out of a narrow day column", including that the page never scrolls sideways and Sunday is never cut off. Goldens `tideline-1280` and `tideline-960` are captured with the rail.

### Phone (< 720px)

One day. The zoom and focus pills hide; bands expand by tapping their labels. A 7-button week strip sits above the card (DOW 10px caps, date 13px, a capacity bar in the capacity colour). The tray wraps and hides its detail. The toast spans the width. The page never scrolls sideways. Label column 72px.

## Motion contract

| Interaction | Motion |
|---|---|
| First mount | Columns rise 8px and fade in over 320ms (`MOTION.enter`), 30ms stagger left to right. The only one-off motion. |
| Band expand / fold | `__bands` tweens over 420ms with `EASE`. Every chip, wash, line, label, free block and the now line follow every frame. Density fades by height (rule 5). Retargeting mid-flight continues from the current heights, with no jump (the engine guarantees it). |
| Popover | Opacity 0→1 and y 4→0 over 180ms. It closes the same way, then goes `hidden`. |
| Accept (standalone ghost) | Buttons show "Saving…" while the POST is in flight. On success, `solid` tweens 0→1 over 320ms: dashed ring and avatar fade out, fill and stripe fade in. |
| Accept (proposal on an item) | The outline, avatar and proposal line go. The title gets a strike-through, and the meta reads "Skipped · Sara". |
| Dismiss | Scale 1→0.96 and fade out over 160ms (`MOTION.exit`), then the node is removed. |
| Apply all | Each pending ghost accepts in turn with a 90ms stagger, then one toast: "N changes written." |
| Toast | Rises 6px and fades in over 220ms. Stays 5.2s, then fades out. |
| Reduced motion | Geometry snaps (the engine does this). Only opacity fades remain. |

Use **Slow motion ×5** in the reference to study every one of these.

## Failure patterns (each one has happened before or will)

1. Adding a CSS `transition: top, height` to chips "to make it smooth". Banned: it fights the engine and lags a frame behind.
2. Rebuilding chip markup when density changes. Titles jump. Density is CSS variables on the same nodes.
3. A title clipped to half a line in one-line chips. `--py` and `display:none` on hidden rows prevent it; the spec tests it.
4. A meta line cut off under a two-line title. `twoLinesAt` is 56, not 38.
5. The stack growing while a band opens, so the page jumps. The total is constant.
6. Typing capacity numbers into the fixture or view instead of calling `capacityForDates`.
7. Logs (breakfast, diary) rendered as chips again.
8. A ghost drawn as a second chip on top of the item it's about.
9. Every chip the same blue. Kinds carry colour; Corey is warm and has the mark.
10. The "over" flag hidden inside the truncated capacity note. It lives in the name row.
11. Accept building writes in the browser. Only `{ id, decision }` leaves the client.
12. Holding the Accept button enabled during the POST, so it gets double writes.
13. Hex colours in the view. Tokens and the named `--cal-*` surfaces only.
14. `YYYY-MM-DD` on screen. Dates display as `dd/mm/yy` (and `24/09` in Central Node lines).
15. Measuring text inside the frame loop. Layout never reads the DOM.
16. The phone view as a separate "mobile calendar". It's the same object with one column.
17. Designing only for the full-width page, or letting nowrap content size the calendar (`.cal` must keep `contain:inline-size`). In the app, the rail makes columns about 115px, so tags, vitals and pills must fit there too.

## Test hooks

In dev builds only (`import.meta.env.DEV`, or the Life app's dev flag), expose `window.__tideline = { state, CAL, heights(), total, capacity, setBand, accept, dismiss, openPop, closePop, finish, stats }` exactly like the prototype. The spec uses `setBand` and `finish` to reach states quickly, and `stats()` to check frame cost.

## Loop until it matches

1. `npm run build` then `TIDELINE_APP=1 node --test tests/browser/tideline-visual.spec.mjs`.
2. Open `docs/proposals/calendar-reference/compare.html`. Check every pair side by side, then with the difference overlay.
3. Fix whatever differs, and repeat.
4. Open `tideline.html` and the build side by side. Do every row of the motion contract on both, at normal speed and with Slow motion ×5. They must feel the same.
5. You're done when every assertion passes, the pairs differ only in anti-aliasing and chrome outside the card, and the PR has two screen recordings attached: (a) Balanced → School → Yours → Balanced, (b) open Sara's proposal, Accept, then Apply all.
