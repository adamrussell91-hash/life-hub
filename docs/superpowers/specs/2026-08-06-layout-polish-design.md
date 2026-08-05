# Layout & Polish — Nutrition Packing, Meals, CN Protein, Skincare

**Date:** 2026-08-06  
**Status:** Approved  
**Deploy rule:** Local commits only until Adam asks to push.

## Problem

1. **Nutrition macro area** wastes space: Macro split already shows protein/fat/energy, then the 6-tile grid repeats Energy/Protein/Fat.
2. **Protein by meal** always shows four slots including `0 g` for unlogged meals.
3. **Central Node protein tile** stacks prose above a lighter chart, leaving dead space when prose is empty/short.
4. **Skincare** is functionally complete but sparse vs Nutrition/Fitness — weak current-routine emphasis, no consistency strip.

## Decisions (locked)

| Topic | Choice |
|-------|--------|
| Approach | Four-surface surgical polish (one slice) |
| Macro packing | Keep macro-split; grid = Sodium / Calcium / Polyphenols only |
| Empty meals | Hide unlogged protein-by-meal slots; empty state if none |
| CN protein | Chart-first densify; prose below / collapsed when empty |
| Skincare | Consistency strip (last-7 dots) + stronger current card + compact procedure list |
| Out of scope | Full Nutrition chart-kit parity on CN; skincare chart suite; Chadwick builder; FAB redesign |

## Design

### 1. Nutrition — macro packing

- Keep the **Macro split** hero card (dual rings + protein/fat/energy copy).
- Remove **Energy**, **Protein**, and **Fat** tiles from `.nutrition-grid` (markup + any render that targets those nodes).
- Remaining grid: **Sodium**, **Calcium**, **Polyphenols** — three columns on desktop; 1–2 columns on narrow as CSS already allows.
- Even out tile heights where polyphenol (score + pill) vs ring tiles differ; light CSS only if needed.

### 2. Nutrition — protein by meal

- Render only meal slots with `protein_g > 0` (or otherwise logged for that slot).
- If none: show a single empty line — **“No meals logged yet.”**
- Do **not** change “What you ate today” empty handling.
- Aggregation may still zero-fill internally; UI filters for display.

### 3. Central Node — protein this week

- **Chart first** in the protein card: SVG is the primary visual.
- Add a short caption under the chart when a rolling path is present (reuse Nutrition copy: **“Dotted = 3-day average”**) — only if the chart already draws rolling; do **not** rebuild the full Nutrition chart kit in this slice.
- Agent **prose** for This Week: place **below** the chart; if prose is empty/missing, omit the prose block (no “No agent notes” dead zone on this card — Status hybrid already covers empty notes).
- Keep existing `preserveAspectRatio` / clipping fixes.

### 4. Skincare

- **Consistency strip** at top of the dashboard: last 7 calendar days as dots (logged skincare that day vs missed), plus optional short streak numeral if model already can derive it cheaply — otherwise dots-only is enough.
- **Current routine** (AM before noon Sydney / PM after, existing rule): stronger primary treatment — accent border + small **Now** chip; non-current card slightly de-emphasized (opacity or quieter border).
- **Today’s procedures**: compact list (title + time/note one line), not loose caption paragraphs.
- No new rings/charts beyond the 7-day dots.

## Edge cases

| Case | Behavior |
|------|----------|
| Nutrition day with only dinner | Protein by meal shows Dinner only |
| All meals empty | “No meals logged yet.” in protein-by-meal card |
| CN week prose empty | Chart + optional caption only |
| Skincare no logs in 7 days | Strip shows seven missed dots; cards still usable |
| Reduced motion | No new looping motion beyond existing soft-medical patterns; dots static |

## Testing

- Unit: nutrition render/model — grid no longer requires energy/protein/fat tile nodes; meal breakdown filters zeros.
- Unit: central-node render — chart before prose; empty prose omitted.
- Unit: skincare model/render — 7-day strip + current-card class/chip.
- Full `npm test`; bump service-worker shell cache after client HTML/CSS/JS change.
- Manual: Nutrition top denser; meal slots hide; CN protein card; Skincare Now + dots.

## Success criteria

- Nutrition top no longer doubles macro story.
- Empty meal slots don’t fake `0 g` rows.
- CN protein card reads chart-first without a hollow prose slab.
- Skincare shows at-a-glance consistency and which routine is active.
