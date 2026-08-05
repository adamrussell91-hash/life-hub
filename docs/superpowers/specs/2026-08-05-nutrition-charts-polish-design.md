# Nutrition Charts Polish

**Date:** 2026-08-05  
**Status:** Approved  
**Deploy rule:** Local commits only until Adam asks to push.  
**Slice:** First pack from the 2026-08-05 Nutrition/Chat/CN feedback dump. Later slices: Brisket+CN reliability, chat UX, layout/polish, Chadwick.

## Problem

1. **Day labels** on Nutrition 7-day SVGs are horizontally squashed because charts use `preserveAspectRatio="none"` while strokes use `vector-effect: non-scaling-stroke` — glyphs stretch, lines do not.
2. **Dotted line** on the protein week chart is a 3-day rolling average with **no caption**, so it reads as a broken or mystery series.
3. **“Broken” lines** are mostly valleys to zero on unlogged days (series zero-fills missing days) plus the unlabeled rolling overlay — not null path gaps. Adam chose to **keep** per-day zeros and fix presentation.
4. **“Meal timing · protein”** is not clock time — it duplicates B/L/D/S protein grams and is not useful.
5. **Polyphenol** is a score (sum of meal scores vs daily aim), but the tile presents like a percentage ring.
6. **Fat over ceiling** never turns red anywhere.

## Out of scope

- Macro-split / empty-tile layout packing (layout slice)
- Brisket search hang, confirm→refresh, Central Node write bugs (reliability slice)
- Chat researching UI, unread badge, avatar size (chat UX slice)
- Skincare visual polish; Chadwick workout builder
- Changing zero-fill to null-gap paths or hourly meal timelines (explicitly deferred)

## Decisions

### 1. Day labels — stop non-uniform SVG stretch

- Set Nutrition week chart SVGs to `preserveAspectRatio="xMidYMid meet"` in `index.html` and stop forcing `"none"` in `render-nutrition.js`.
- Keep existing `vector-effect: non-scaling-stroke` on line/area/rolling paths.
- Match Central Node / Mind chart behaviour already fixed for this class of bug.
- Bump viewBox / bottom padding only if labels clip after `meet`; prefer readable labels over edge-to-edge stretch.

### 2. Series behaviour — keep daily points, label the rolling average

- Continue mapping missing days to `0` via `buildAreaLine` / nutrition series (Adam choice **B**).
- Keep the protein chart’s 3-day rolling path (`data-role="rolling"`).
- Add a permanent caption under the protein week chart (or in the card header): **“Dotted = 3-day average.”**
- Ensure `animateAreaReveal` does not leave the solid line invisible (clear dash styles / finish animation state so the primary line remains visible after reveal).

### 3. Remove Meal timing tile

- Remove the Meal timing · protein card from `#nutrition-dashboard` (`index.html`).
- Remove its render path in `render-nutrition.js` (column chart bound to that host).
- Leave **Protein by meal** and **What you ate today** unchanged in this slice.

### 4. Polyphenol — score + vs-aim pill (no % ring)

- Replace the polyphenol ring UI with:
  - Large **score** number (today’s summed polyphenol score)
  - Pill: `+N vs aim` / `−N vs aim` / `at aim` against `polyphenol_daily_aim`
- Colour: positive/at-aim uses success green; under aim uses muted/neutral (not fake progress %).
- Do not present polyphenol as “out of 10” percentage fill.

### 5. Fat over ceiling — today red + per-day week markers

When today’s `fat_g` exceeds the daily fat ceiling:

- **Today:** macro-split fat ring stroke and today’s fat readout use alert red (overage class). Ring may show overshoot visually (do not clamp the mental model to “full = safe”); if the ring geometry still clamps at 100%, still apply red styling so overage is obvious.

On the **7-day fat trend** chart:

- Do **not** paint the entire series red.
- Mark **only days whose fat exceeded that day’s ceiling** (dot markers and/or red segment styling on those points). Days within ceiling keep the normal fat/series colour.

Requires the week fat series (or render path) to know per-day ceiling comparison — use the same daily fat ceiling from targets for each day in range.

### 6. Approach

Targeted fixes in existing chart-kit + nutrition render/CSS (not a chart-kit rewrite, not a full Nutrition layout pass).

## Files (expected)

- `index.html` — SVG `preserveAspectRatio`, remove meal-timing card, polyphenol markup, rolling caption
- `js/app/render-nutrition.js` — meet aspect, drop meal-timing render, polyphenol score+pill, fat overage classes/markers
- `js/app/nutrition-model.js` / charts helpers — per-day fat-over-ceiling flags if not already present
- `css/app.css` — polyphenol score styles, fat overage red, day-marker styles
- Unit tests for model flags + render smoke where the project already tests nutrition charts
- `service-worker.js` — bump shell cache if published assets change

## Success criteria

- Weekday letters on Nutrition 7-day charts are not squashed.
- Protein chart’s dotted line is explicitly labeled as 3-day average; solid line remains visible after animation.
- Meal timing tile is gone from Nutrition.
- Polyphenol reads as a score with vs-aim pill, not a % ring.
- Over-ceiling fat: today UI red; week chart marks only overage days.
- Existing nutrition unit/browser tests still pass; add coverage for fat-over flags / polyphenol display helpers as needed.

## Queued after this slice

1. Brisket + Central Node reliability (search feedback, save→refresh, CN write after log)  
2. Chat UX (researching state, unread badge, larger avatars)  
3. Layout & polish (macro tile, empty meal tiles, CN protein tile, skincare)  
4. Chadwick workout builder stuck  
