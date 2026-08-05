# Body Tab (Scale · Composition · Tape)

**Date:** 2026-08-05  
**Status:** Approved  
**Deploy rule:** Local commits only until Adam asks to push.

## Problem

Body is a later-phase stub. Weight, composition, and measurements already validate and route through Dr Sara Tonin; the tab should surface trends with line charts, dual growth signals, quick logging, and Sara chat.

## Decisions

| Topic | Choice |
|-------|--------|
| Scope v1 | Weight, body fat (+ skeletal muscle when present), tape measurements |
| Out | Sleep, heart, Daily / 1Y ranges |
| Layout | Stacked contexts: Scale → Composition → Tape |
| Ranges | Weekly · Monthly · 6M (default Monthly) |
| Growth % | **Primary:** % change first→last finite point in selected range. **Secondary:** vs previous reading via `getTrend` |
| Logging | Quick number fields → direct `/api/chat/confirm` + floating Sara |
| Charts | Existing `buildAreaLine` / soft reveal; null gaps; weekly means when range > 90 days |
| Good direction | weight / body fat / waist (and similar girths for fat loss) → down; skeletal muscle / chest / shoulders / arms → up |

## Behaviour

1. Body nav opens `#body-dashboard`.
2. Shared range control; switching animates section content (respect `prefers-reduced-motion`).
3. Each context section: heading, metric cards with latest value, primary % + secondary trend arrow/label, line chart, quick-log row.
4. Tape: one chart per measurement site that has data; sites with no data stay out of the chart list but remain available in quick-log for waist (and other primary sites: chest, hips if space).
5. Confirm overwrite same-day path slugs: `weight`, `composition`, `measurements`.
6. Empty sections show a short empty state, not fake series.

## Verification

- Unit: model builds series, dual growth, range windows.
- Manual: switch ranges, log weight/BF/waist, charts update after refresh.

## Files (expected)

`body-model.js`, `render-body.js`, `body-controller.js`, HTML/CSS, app wiring, SW bump.
