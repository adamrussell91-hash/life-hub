# Unified Timeline: visual and motion contract

Put this folder at `docs/proposals/timeline-reference/`. It is the design for the Timeline view described in `docs/superpowers/specs/2026-09-24-unified-timeline-design.md`. That spec says **what** the view does. This folder says **exactly how it looks and moves**.

The last Graph build shipped the logic without the design (see `docs/proposals/graph-reference/VISUAL-SPEC.md`, "Why this round exists"). This folder exists so the Timeline doesn't repeat that. **The reference files are the design. Port them. Don't reinterpret them.**

## What's in this folder

| File | What it is |
|---|---|
| `timeline.html` | Working reference prototype. Open it from the repo so it can load the real kit CSS (`../../../packages/design-kit/`). It animates, zooms (pills, ctrl/cmd + wheel), expands, drags, morphs to Lines, shows Hammond's ghosts and the drag ripple. The "reference controls" row isn't part of the product. |
| `golden/*.png` | Target screenshots at 2× scale. `timeline-1280`, `timeline-390`, `week-1280`, `term-1280`, `critical-1280`, `drag-1280`, `hammond-1280`, `lines-1280`, `lines-390`. `morph-midflight-1280` is illustrative only (timing-dependent, not pixel-compared). |
| `fixture.json` | The data behind the golden images. Seed it and freeze the clock to 2026-09-22 09:00 Sydney time. |
| `timeline-visual.spec.mjs` | Playwright visual and motion contract. Goes in `apps/tasks/tests/browser/`. |
| `compare.html` | Puts your screenshots (`compare/`) next to the golden images, side by side or as a difference overlay. |
| `src/` | Source of the prototype (`timeline-ref.ts`, `fixture.ts`, `timeline.template.html`, `build-ref.mjs`). Rebuild `timeline.html` with `node src/build-ref.mjs` after changing it. |

The prototype bundles three **real** modules, and a fourth covers Phase 7's data. They are finished code, with tests, ready to drop in:

| Module | Goes to | Tests |
|---|---|---|
| Motion engine | `apps/tasks/src/views/timeline-motion.ts` | `apps/tasks/tests/unit/timeline-motion.test.ts` (20) |
| Bars/Lines morph | `apps/tasks/src/views/timeline-morph.ts` | `apps/tasks/tests/unit/timeline-morph.test.ts` (6) |
| School time and scale | `apps/tasks/src/domain/school-time.ts` | `apps/tasks/tests/unit/school-time.test.ts` (10) |
| APST standards and focus areas | `apps/tasks/src/domain/apst.ts` | `apps/tasks/tests/unit/apst.test.ts` (7) |

Don't rewrite them. If one is wrong, fix it in place and keep its tests passing, and say why in the PR.

## Rules

1. **One motion engine.** Every moving thing on the Timeline goes through `createMotion()` from `timeline-motion.ts`. No CSS transitions on SVG geometry, no `setTimeout` chains, no per-element `requestAnimationFrame`, no Web Animations on bars. The only exceptions: the morph (`timeline-morph.ts`), the one-off entrance (section "Motion contract"), and hover/focus colour changes in CSS.
2. **The render pattern is fixed.** `state → layout()` (pure, returns `Map<entityId, Props>`) `→ reconcile()` `→ apply(id, props)` writes the DOM. `apply` is the only function that writes geometry. Copy the structure of `timeline-ref.ts` sections "Entities", "Layout" and "Render".
3. **Zoom tweens one number.** `engine.to('__view', { dayWidth })`. Its `apply` re-lays out and calls `engine.place()` for every entity. Never start a tween per bar for a zoom.
4. **Never tear down and redraw on data change.** Nodes are created once per entity id (`create`) and removed once (`remove`) after `engine.exit`. `replaceChildren()` and `innerHTML` are only allowed on first mount and inside the Lines renderer.
5. **Port the constants verbatim.** The `TL` block at the top of `timeline-ref.ts` is "port exactly". Move it into `apps/tasks/src/domain/timeline-geometry.ts` as a named export; views read it from there. No magic numbers in the view.
6. **Tokens only.** Every colour in the prototype is a `var(--token)` or `color-mix()` of tokens. The five surface literals without a token are named in `SURF` with the token they derive from. Keep them as named constants. Don't add CSS variables to the kit.
7. **Classes are the contract.** Move the `<style>` block of `timeline.template.html` to `apps/tasks/src/styles/timeline.css` with the same class names (`tl-*`). Load it from `src/app/main.ts` next to `gantt.css`, then delete `gantt.css` rules that are no longer used.
8. **`data-part` attributes are the test contract.** Add them exactly as `timeline-visual.spec.mjs` expects. Don't edit the spec to fit the build. If you believe an assertion is wrong, explain why in the PR.
9. **`transform-box: fill-box; transform-origin: center`** on every SVG element that scales (`.tl-pop`). Without it pop-ins pivot around the SVG origin.
10. **Text is measured once.** Layout measures text for fit and truncation through a cache (`textW` in the prototype). Layout waits for `document.fonts.ready` before the first pass. Never call `measureText` or `getBBox` inside the frame loop.
11. **Reuse nodes.** Per-frame child lists (milestone dots, shadow density columns) use the `pool()` helper, not `innerHTML`.

## Loop until it matches

1. Seed `fixture.json` (`POST /api/timeline-visual-seed`, built like `/api/graph-visual-seed`), freeze the clock, run `npx playwright test tests/browser/timeline-visual.spec.mjs` in `apps/tasks`.
2. Open `docs/proposals/timeline-reference/compare.html`. Check every pair side by side, then with the difference overlay.
3. Fix whatever differs and repeat.
4. Open `timeline.html` and the build next to each other and do every interaction in the "Motion contract" table on both. They must feel the same.
5. Done when every assertion passes, the pairs differ only in anti-aliasing and chrome outside the card, and the screen recordings listed under "Done when" are attached to the PR.

---

## Layout contract (desktop, canvas ≥ 720px)

| Part | Spec |
|---|---|
| Toolbar | Left: zoom pills (Year, Term, Month, Week, Day) then view pills (Bars, Lines), both kit `.hub-pills` with the sliding thumb. Right: toggles Critical path, Load, Holidays, Today (`.tl-toggle`, pressed state uses the kit pressed colours; Critical path pressed uses `--high-sea-ink` on a 14 % High Sea wash), then **Ask Hammond** (`.btn--secondary`), then the 40px round add button. |
| Card | Kit glass: `--hub-glass-fill`, 1px `--line`, `--radius-md`, `--hub-elev-card`, `blur(var(--hub-glass-blur))`. `overflow: hidden`. |
| Frame | Grid `208px / 1fr`. Label column has a right border 1px `--line` and a 55 % paper wash. Canvas scrolls horizontally only (`overscroll-behavior-x: contain`). |
| Axis | 64px tall. Term tier: pill at y 8, height 20, rx 6, `--pastel-sage` fill, caps label 11px/600 `--pastel-sage-ink`, 10px in. Holidays tier: no fill, label `--muted`. Week tier: label "T4 W3" 12px/600 `--ink` at y 42, date `dd/mm/yy` 12px `--muted` at y 56, 6px in from the week line. Narrow weeks show "W3" only (room 18 to 40px) and nothing below 18px. |
| Grid | 1px `--line` at every Monday, from the axis bottom to the canvas bottom. |
| Holidays | Full-height band, fill 3.5 % navy (`SURF.holiday`). Compressed to 0.25 of a term day's width by default. |
| Today | 1.5px `--wave`, dash 3 3, from the axis to the rows bottom. Pill 52 × 20, rx 10, `--wave`, "Today" 12px/600 white, centred, at y 8. Drawn **behind** bars (layer order below). |
| Rows | Heights: dream 36, goal 36, project 44 (collapsed) or 34 (open), task 36, step 30, milestone 36, marking 48, group 36, plus 24 under a project with a ribbon. 12px gap after each goal block and group. |
| Labels | 13px `--ink`, indented 14px per depth after an 8px start. Chevron 20 × 20, 14px icon, `--shallow`, rotates 90° when open (300ms standard easing). Goals and groups: 11px/600 caps, 0.08em tracking, `--navy`. Projects: 600 weight with an 8px colour chip (rx 3). Milestones and steps: `--muted`. Dreams: a "Dream" tag (11px/600 caps on `--pastel-gold`, `--pastel-gold-ink`) then the title in `--pastel-gold-ink`. |
| Task bar | Height 24 (step 18), rx 6. Fill: domain colour 16 % on white. Stroke 1px navy 12 %, 28 % on hover. Stripe: 3 × (h − 10), rx 1.5, 6px in, domain colour (blocked: `--danger`). Title 13px/500 `--ink`, 16px in when it fits (title width + 26 ≤ bar), otherwise 8px right of the bar. Sub 12px `--muted`, 12px after the title ("due dd/mm/yy", "done"; blocked: `--danger` 500 "blocked 4 days"). Minimum width 28, anchored at the due date. Resize grip: 3px navy 22 % at the right edge, visible on hover. |
| Task states | Done: whole bar at 0.45. Selected or focus-visible: Wave stroke 2 plus a halo rect inset −4 filled Wave 16 %. Dragging: Wave stroke 2, cursor grabbing. Critical (path on): `--high-sea-ink` stroke 2; everything off the path at 0.35. |
| Milestone | 14px square rotated 45°, rx 2, project colour fill, white stroke 2. Label "Finals · 03/10/26" 12px/600 `--ink`, 15px right of centre. |
| Project, collapsed | Height 28, rx 8, project colour 18 % on white. Progress fill (done ÷ all tasks) project colour 38 % on white. Title 13px/600 `--ink`, **sticky**: stays 12px inside the visible left edge while the bar is scrolled. Milestone dots: 9px diamonds, project colour, white stroke 2, on the bar's centre line. Baseline tick at `baseline_end_date`: 2 × 36, rx 1, `--muted`. |
| Project, open | A 6px bracket, rx 3, solid project colour, spanning the project. Tasks, steps and milestones below. |
| Goal band | Height 24, rx 12, navy 5 % (`SURF.goalBand`). "N projects" 12px/500 `--muted`, sticky. |
| Dream | Dotted line (dash 1 5, round caps, 2px, `--pastel-gold-ink` at 0.7) from origin to target. White diamond with a 2px gold stroke at the target when in range. "Target dd/mm/yy" 12px/500 gold, sticky, 9px above the line, with "→" when the target is past the range. |
| Undated chip | Height 22, rx 11, 70 % paper, 1px `--shallow` dash 3 3, "+N undated" 12px/500 `--muted`, 10px padding. Sits 8px after the bar, or after the outside title when the title is outside. Click opens the date popover. |
| Curves | Cubic from source finish to target start, control points `max(24, |dx|/2)` horizontal. 1.5px `--shallow` with an 8px filled arrowhead (`M1 1 L9 5 L1 9 Z`, `markerUnits="userSpaceOnUse"`). Critical: 2.5px `--high-sea-ink`. SS: dash 4 3. FF: dash 8 4. |
| Life wall | Full-height hatch: 8px pattern rotated 45°, 2px navy 16 % lines on navy 4 %. Edges 1.5px navy 30 %. Pill at the wall's top-left (8px in, 8px down): navy fill, rx 10, height 20, lock glyph (stroke 1.4 white) then "Overseas trip · wall" 12px/600 white. Walls sit behind bars and in front of the grid. |
| Marking shadow | Height 32, rx 8, navy 7 % (`SURF.shadowFill`). Leading edge 3px navy 40 % at `collected_on`. Progress fill domain 34 % on white. Density: one column per day, 2px gaps, height `(h − 8) × min(1, minutesPerDay / 120)`, navy 9 % (warning: `--high-sea-ink` 22 %). Label "9B · 18 of 28 · ~1 h left" 13px/500 inside when it fits, else outside. Warning (needs > 60 % of that day's capacity): 1.5px `--high-sea-ink` stroke and edge, plus "needs 84 min a day" 12px/500 `--high-sea-ink` after the label. |
| Standards ribbon | Coverage from `standardsCoverage()` in `apst.ts`; hover and `aria-label` text from `APST_STANDARDS` and `focusAreaLabel()`. Seven 26 × 16 segments, 3px gaps, rx 4, under the project bar, sticky with the bar's left edge. Number 11px/600 centred. None: navy 6 % / `--muted`. Some: `--pastel-gold` / `--pastel-gold-ink`. Evidenced: `--pastel-sage` / `--pastel-sage-ink`. |
| Load strip | 104px under the rows, a 1px `--line` divider above. One column per week, 8px gap, rx 4, `--pastel-blue`. Over capacity: `--warning-surface` fill, 1.5px `--high-sea-ink` stroke, value in `--high-sea-ink` 600. Weeks with a wall: hatch fill. Value "13 h" 12px/500 `--muted`, 6px above the column, hidden at 0 or when the column is under 26px wide. Capacity: stepped 1.5px navy line, dash 4 3. Label column shows "LOAD" and a legend (Committed, Free time, Over) plus "Learning your term rhythm" until two terms of history exist. |
| Ghost bar | Same box as a task bar at the proposed dates. Fill Wave 6 %, 1.5px navy dash 4 3. "H" chip: 8px radius navy circle, "H" 11px/600 white, on the ghost's top-right corner. Arrow from the current bar's middle to the ghost's middle: cubic lifting 18px, 1.25px navy, navy arrowhead. |
| Hammond tray | Above the card. Paper, 1px `--line`, `--radius-sm`, `--elev-2`. 28px navy avatar "H". Headline 13px/600, detail 13px `--muted`. Buttons: primary Apply all, secondary Review, ghost Dismiss. Enters rising 6px over 220ms. |
| Ripple | Dependants: outline at the preview position, 1.5px `--muted` dash 4 3, no fill. Slipping milestone: rotated square outline in `--danger`, label "would slip to dd/mm/yy" 12px/600 `--danger` placed after the milestone's own label. Banner above the card: `--warning-surface`, 18 % `--high-sea-ink` border, bold lead sentence, ghost Drop anyway, primary Suggest a fix. |
| Layer order (back to front) | grid and holidays, walls, axis, today, goal bands and brackets, curves, marking shadows, bars (tasks, milestones, projects, dreams, chips, ribbons), ghosts and ripples, load strip. |

## Layout contract (phone, canvas < 720px)

- Label column collapses to 0. Goal, group, dream and open-project titles ride the canvas as sticky row titles (`[data-part="row-title"]`), 12px in from the visible left edge, with a 4px paper halo (`paint-order: stroke`).
- Toolbar stacks: zoom pills full width; view pills; then one horizontally scrolling row of toggles, Ask Hammond and the add button. **The page never scrolls sideways.**
- Lines uses the vertical layout from `graph-reference/lines.html` (track at x 22, stations 64 apart, title 13px/500 at x + 26, status 12px below, terminus pill at the bottom).
- Drag needs a 300ms long-press so a swipe scrolls. (The prototype doesn't implement this; the app must.)

## Motion contract

Easing: `EASE = cubic-bezier(.2,.8,.2,1)`, `OVERSHOOT = cubic-bezier(.34,1.3,.64,1)`, both exported from `timeline-motion.ts`. The morph uses the kit spring (`morphing-dialog.js` `DEFAULT_SPRING`, stiffness 200, damping 24, mass 1) sampled into a CSS `linear()` easing by `springEasing()`; it settles in about 620ms. All durations are in `MOTION` in `timeline-motion.ts`; import them, never type them.

| Trigger | What moves | Duration | Easing | Stagger / delay | If interrupted | Reduced motion |
|---|---|---|---|---|---|---|
| First mount | Bars, labels, bands, shadows rise 6px and fade in; curves draw in (dashoffset); load columns grow from the bottom | 260 (rise), 420 (curves, +380), 320 (columns) | EASE; columns OVERSHOOT | Rows by y: `min(360, y/12)` ms; columns 12ms each after 300 | Not replayed on data change | Instant |
| Zoom (pill, key, wheel, pinch) | `dayWidth` only; every entity is placed per frame | `MOTION.zoom` 280 | EASE | none | Retarget from the current `dayWidth` | Snap |
| Zoom anchor | The date under the pointer (wheel/pinch) or today (pills, keys) stays at the same screen x on every frame | same frame | n/a | n/a | n/a | n/a |
| Semantic change after zoom | Rows that appear or disappear because of the zoom rules; geometry of everything else | `MOTION.expand` 300 | EASE | starts when the zoom lands | Reconcile again | Instant |
| Expand / collapse | Rows below slide; new rows pop in (scale 0.6 → 1, fade); removed rows fade | 300 slide, 320 pop, 160 fade | EASE; pop OVERSHOOT | none | Retarget, never jump | Instant, 120 fade |
| Live update (data changed anywhere) | Changed entities move to their new geometry; new ones pop in; deleted fade | `MOTION.settle` 420 | EASE | none | Retarget with EASE (never a second overshoot) | Instant, 120 fade |
| Drag | The bar follows the pointer **1:1**; attached curves follow 1:1; ripple outlines and the load strip update | per frame (outlines 120) | none while dragging | none | Escape restores everything | Same |
| Release | The bar settles onto the snapped day; dependants moved by the cascade follow | 220 (bar), 420 (dependants) | OVERSHOOT (bar), EASE (dependants) | 30ms per dependant | n/a | Instant |
| Hammond proposal | Tray rises 6px and fades; ghosts and their arrows pop in | 220, 320 | EASE, OVERSHOOT | none | Dismiss fades ghosts 160 | Instant |
| Apply all | Real bars settle into the ghost positions; ghosts fade | 420, 160 | EASE | none | n/a | Instant |
| Bars ↔ Lines | Shared entities fly bar → station (radius 6 → 50 %, colour to line colour); project bars and brackets become tracks; outgoing chrome fades 0 to 35 %; incoming chrome fades 60 to 100 %; card height springs | ~620 (spring) | kit spring | none | Pressing again reverses from the current frame | 160 cross-fade, no flight |
| Hover / focus | Stroke colour, grip opacity | 120 | CSS ease | none | n/a | Same |

Budget: the engine records its own frame cost (`engine.stats()`). On Adam's Mac, p95 must stay under 8ms and no frame over 16ms during zoom, drag and settle with the fixture loaded. In headless CI (2 cores, software rendering) the thresholds in the spec file are p95 under 16.7ms and max under 50ms. If a 200-task scope breaks the budget, virtualise rows outside the viewport before optimising anything else.

## Failure patterns this contract exists to stop

Each of these has shipped in a hub before, or is the usual way agents get this kind of view wrong.

1. **CSS `transition` on SVG attributes** (`x`, `width`, `d`). Chrome and Safari don't transition presentation attributes, so the bar teleports. Tween through the engine.
2. **`innerHTML` or `replaceChildren()` on every update.** Kills listeners, focus and selection and makes everything flash. Reconcile by id.
3. **One `setTimeout` or `requestAnimationFrame` per element.** Hundreds of loops fight each other and drift. One loop, the engine's.
4. **Restarting a tween from its start value when new data arrives mid-flight.** The bar jumps back and then moves. The engine continues from the current value; keep it that way.
5. **Easing while dragging.** The bar lags the finger and feels broken. Drag is `place()`, 1:1.
6. **Animating `width`, `left` or `top` on HTML.** Layout every frame. Only the morph overlay may, because it is `contain: strict`.
7. **Scale without `transform-box: fill-box`.** Pop-ins swing in from the SVG's top-left corner.
8. **Measuring text inside the loop, or before fonts load.** Titles overlap their subtitles on first paint (this happened in the first cut of the prototype). Measure once, through the cache, after `document.fonts.ready`.
9. **Resizing the canvas and writing `scrollLeft` every zoom frame.** Forces a page reflow per frame. Size the canvas once for the widest frame at the start of a zoom (`zoomCanvasWidth`), then settle.
10. **Tweening every entity during a zoom.** Tween `dayWidth`, place the rest.
11. **Swapping views with `hidden` and no transition.** The morph is required. So is reversing it mid-flight.
12. **Measuring the incoming view while it sits below the outgoing one.** Clones fly off the card (this also happened in the prototype). `startMorph` overlays the incoming view absolutely before measuring; don't change that.
13. **Hard-coded hex, sizes or durations in the view.** Tokens, `TL`, `MOTION`.
14. **Text under 12px** anywhere except 11px uppercase micro-labels (term tier, goal and group labels, ribbon numbers, "H" chips).
15. **Forgetting the phone.** The page must not scroll sideways at 390px, and every row must still be named.
16. **Replacing the prototype's custom controls with native ones** (`<select>` for zoom, a checkbox for Critical path). The kit pills are the design.

## Tokens used

Everything is `var(--…)` from `packages/design-kit/tokens.css` and `overlays.css`: `--ink`, `--muted`, `--navy`, `--wave`, `--shallow`, `--line`, `--paper`, `--warm-white`, `--danger`, `--high-sea`, `--high-sea-ink`, `--warning-surface`, `--pastel-blue`, `--pastel-blue-ink`, `--pastel-sage`, `--pastel-sage-ink`, `--pastel-gold`, `--pastel-gold-ink`, `--hub-glass-fill`, `--hub-glass-blur`, `--hub-elev-card`, `--elev-1`, `--elev-2`, `--radius-xs`, `--radius-sm`, `--radius-md`, `--radius-full`, the `--text-*`, `--weight-*`, `--space-*`, `--tracking-*` and `--leading-*` scales. Domain colours come from Properties; the fixture sets teaching `#376fb7`, professional `#5d4e70`, life `#2f7a4f`. Shaded lines (a second project in the same domain) mix 30 % toward `--depth`, as Lines does.

## Done when

- `timeline-visual.spec.mjs` passes, along with the phase's unit tests.
- `compare.html` shows every pair as the same design.
- Attached to the PR: screen recordings (or GIFs) of zooming Month → Week → Year, expanding a project, dragging Book bus with the ripple, Apply all from Hammond, Bars → Lines → Bars including one mid-flight reversal, all at desktop, plus one at 390px.
- `CHARTS.md` gains a `plan-timeline` row linking to this folder as the canonical look, with a Log line, in the same PR (the kit rule for any new chart or graph type).
