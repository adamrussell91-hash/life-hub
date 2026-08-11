# Nutrition Dashboard Clarity

**Date:** 2026-08-11  
**Status:** Approved  
**Deploy rule:** Local commits only until Adam asks to push.  
**Approach:** Surgical — keep existing chart kit; fix unclear/empty cards and layout density only.

## Problem

1. **30-day protein heatmap** tile numbers are too small to read inside the squares.
2. **This week vs prior** shows this-week bars plus a prior-week average caption — no real comparison, so the card is opaque.
3. **7-day energy** is a full-width line chart that looks oversized next to the protein/fat pair.
4. **Protein by meal** is a mostly empty full-width card.
5. **Hit strip** under 7-day protein looks like a week selector, is not interactive, and fat has no equivalent — so it reads as broken UI.
6. **Guide lines** on protein/fat (avg / goal / ceiling) rely on a tiny footer caption; they need on-chart labels.

## Out of scope

- New chart interactivity (click-to-select days, tooltips beyond existing behaviour)
- Fat hit/miss strip
- Carbs goals/ceilings (unless already present in targets — do not invent)
- Grouped monthly protein-by-meal bar chart (explicitly rejected)
- Weight / body series on Nutrition
- Rewriting the whole chart-kit API

## Decisions

### 1. Layout order (Nutrition dashboard)

Top → bottom:

1. Macro split (unchanged)
2. **4-up row:** Sodium | Calcium | Polyphenols | **Protein by meal (today pie)**
3. What you ate today (unchanged)
4. **2-up:** 7-day protein | 7-day fat
5. **2-up:** 7-day energy | **7-day carbs**
6. This week vs prior (summary + labeled sparkline)
7. 30-day protein heatmap

Remove the old full-width protein-by-meal card and the protein hit strip.

### 2. Protein by meal → today pie in the micronutrient row

- Fourth card in the Sodium / Calcium / Polyphenols row (grid 3 → 4 columns; wrap at existing narrow breakpoints).
- **Today only.** Pie segments = breakfast / lunch / dinner / snack `protein_g`.
- Blue gradient light → dark across meal types.
- Legend or center readout: total protein g + per-meal grams for segments with data.
- Empty day (all zeros): muted empty state, not a degenerate pie.
- Delete the previous standalone meal-breakdown card markup + render path.

### 3. 7-day energy + 7-day carbs side by side

- Put energy and carbs in the same 2-column pattern as protein/fat (same card height/chart treatment).
- Energy remains calories (`calories` series).
- Carbs is a new week series from meal `carbs_g`.
- Extend `aggregateNutrition` / `dailyNutrition` to include `carbs_g` so the week model can chart it.
- Point value labels on both charts (same pattern as protein/fat).
- No carbs target/ceiling line in this slice.

### 4. Protein / fat guide-line labels; remove hit strip

- Remove `#nutrition-hit-strip` markup and `renderHitStrip` usage.
- Label guide lines **on the chart** near the line (e.g. “avg”, “goal”, “ceiling”), not only as a footer footnote.
- Keep existing point value labels and protein trend badge on the protein card.

### 5. This week vs prior → summary + labeled sparkline

- Replace column bars with:
  - This-week protein average
  - Prior-week protein average
  - % change badge (reuse `proteinTrend` / `comparePeriods` semantics)
  - Sparkline of **this week’s** daily protein with **day letters and value labels on each point**
- Prior week is summary numbers only (not a second sparkline series).
- Card must be self-explanatory without relying on a cryptic caption alone.

### 6. Heatmap number size

- Keep 30-day proximity-to-goal tile styling.
- Increase in-tile protein number size so grams are legible (~0.85–1rem vs current ~0.58rem; tune in CSS against tile size).
- Do not change colour/scale semantics in this slice.

## Data flow

| Change | Source |
|---|---|
| Pie segments | Existing `model.nutrition.meals` protein for display date |
| Carbs week series | `dailyNutrition` + `aggregateNutrition` sum of `carbs_g` |
| Week vs prior avgs / % | Existing `model.week`, `model.previousWeek`, `model.proteinTrend` |
| Sparkline points | `model.week[].protein_g` |

## Files (expected)

- `index.html` — dashboard card markup/order; 4-up micronutrient row; energy+carbs pair; remove hit strip + old meal card
- `js/core/aggregate.js` — include `carbs_g` in daily nutrition aggregate
- `js/app/nutrition-model.js` — pass `carbs_g` through daily/week series
- `js/app/render-nutrition.js` — pie card, carbs chart, week-compare rewrite, hit-strip removal, guide labels
- `js/app/chart-kit/area-line.js` (and/or small pie helper) — on-chart guide labels; optional pie SVG helper
- `css/app.css` — 4-col micronutrient grid, heatmap font, pie card, week-compare summary layout
- Unit tests where nutrition aggregate/model/render are already covered
- `service-worker.js` — bump shell cache if published assets change

## Success criteria

- Heatmap grams are readable at a glance on phone and desktop.
- Week-vs-prior answers “how does this week compare?” with labeled numbers and a labeled sparkline.
- Energy is no longer a lonely full-width strip; carbs sits beside it at matching size.
- Protein-by-meal lives as a compact today pie; the old empty card is gone.
- Protein/fat charts no longer show a fake selector; guide lines are labeled on-chart.
- No new interactive controls introduced.
