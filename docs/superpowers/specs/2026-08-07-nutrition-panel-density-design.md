# Nutrition Panel Density + Advice

**Date:** 2026-08-07  
**Status:** Approved  
**Deploy rule:** Local commits only until Adam asks to push.

## Scope (Adam: all)

1. **Macro-split advice** — fill empty right side of Today’s macros / Macro split with Brisket meal advice (latest meal `notes` / verdicts for today).
2. **7-day protein + fat** — halve chart height; protein | fat side-by-side; dotted protein goal + fat ceiling; subtle point labels; smaller day labels.
3. **7-day energy** — same denser chart treatment (not tall empty whitespace).
4. **30-day protein heatmap** — protein value centered in each cell; colour by proximity to daily protein goal (not binary hit/miss).

## Out of scope

- Sodium / food-library accuracy (next slice)
- Invalid Notion import files
- Chat reliability / hero (done)

## Approach

- Extend `nutrition-model.js` with advice text + per-day `proteinPct` / goal lines.
- Tighten `chart-kit` / `render-nutrition.js` / CSS aspect ratios.
- Protocol note only if advice must be written to a new field; prefer existing meal `notes` shown in the panel.
