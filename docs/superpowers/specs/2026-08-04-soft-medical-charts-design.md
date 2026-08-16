# Soft-Medical Charts & Dashboard Density — Design

## Purpose

Life Hub’s Home, Nutrition, and Central Node tabs under-use visual progress and feel sparse or unfinished: Home still uses thin horizontal bars; Nutrition macros are text-only; the 7-day protein trend’s hollow end-circle reads as unfinished; Central Node’s “Today’s Status” is mostly empty space around a small completion ring. This design upgrades those surfaces to a **soft-medical** chart language with **fill-on-load animations**, without adding a charting library and without changing the GitHub write path yet.

**Explicitly deferred:** Brisket (and other agents) rewriting `central-node.md` Today’s Status / Cross-Agent on confirm. Meal file writes already work; Status prose may stay stale until a follow-up design. Live Status panels in this design still update from event aggregates after refresh.

**Deploy constraint:** do not push to GitHub continuously (Netlify token burn). Local commits and local preview only unless Adam explicitly asks to push.

## Decisions (locked)

| Topic | Choice |
|-------|--------|
| Priority | Visual redesign first; logging → Central Node writes later |
| Visual language | Soft medical (rounded rings, calm cards, area fills; stay close to current Life Hub shell) |
| Home Daily Pulse macros | Circle targets (same kit as Nutrition), not polished bars |
| Nutrition density | Maximal monitor wall (phased into two visual slices) |
| Today’s Status | Hybrid: live checklist/totals + agent prose when present |
| Protein trend | Soft area line — no end marker; gradient fill animates on load |
| Implementation approach | Shared SVG/CSS chart kit consumed by existing models/renderers |

## Architecture

```
events / targets / central-node.md
        ↓
home-model · nutrition-model · central-node-model
        ↓
js/app/chart-kit/   (new)
  ring · areaLine · columns · animateFill
  respects prefers-reduced-motion
        ↓
render-home · render-nutrition · render-central-node
        ↓
index.html SVG shells + css/app.css soft-medical tokens
```

- **Pure geometry** lives in `chart-kit` (unit-tested).
- **DOM apply** stays in existing `render-*` modules (same pattern as today’s `nutrition-charts.js` / `central-node-charts.js`).
- Existing helpers may be **moved or thin-wrapped** into the kit (e.g. `buildCompletionRing`, `buildProteinLineChart`) so Home/Nutrition/Central Node share one ring and one area-line implementation.
- No Chart.js / uPlot / other runtime chart dependency.

## Components

### Chart kit primitives

1. **Ring target** — rounded stroke track + fill; center value + unit (or percent); animates `stroke-dashoffset` from empty → value on mount (~520–700ms, aligned with existing 520ms progress easing).
2. **Area line** — line + soft gradient area; load reveal via path-length or clip; **day labels**. **Nutrition protein:** no vertex / end-circle. **Body:** small dots on each observation. **Bloods series:** dot on every vertex, sage reference band, larger latest point (see Life Hub Design → Charts).
3. **Columns** — bars grow from 0 height (meal timing, week comparisons).
4. **Hit strip / heatmap** — keep existing geometry; restyle to soft-medical tokens rather than rewrite.

### Motion rules

- Fill-on-load only (no looping “alive” animations).
- Replay on manual Refresh and when navigating to a section if values changed.
- `prefers-reduced-motion: reduce` → snap to final geometry (existing app pattern).

### Soft-medical tokens

Extend `css/app.css` with a small token set (ring track, ring accents already used for energy/protein/fat, area fill opacity, chart grid/label color). Do not introduce a dark instrument theme or clinical monospace-monitor look.

## Surfaces

### Home — Daily Pulse

- Energy / Protein / Fat metric cards become **ring targets** driven by existing `home-model` progress fractions.
- Logging completeness keeps the domain checklist plus the existing horizontal progress track, upgraded to the same fill-on-load motion. **No second large ring** on this card.
- Movement card: soft-medical polish only if needed for consistency; no new data requirements.

### Nutrition — maximal monitor (two slices)

**Slice 1 (foundation)**

- Six macro **ring targets**: Energy, Protein, Fat, Sodium, Calcium, Polyphenols (values already in `nutrition-model`).
- **7-day protein** soft area line (remove `[data-role="last-point"]` circle from markup and render path).
- Restyle hit strip + month heatmap to tokens.

**Slice 2 (maximal density)**

Add charts that make the page feel like a full medical monitor, extending `nutrition-model` only when a series is not already available:

- Calorie 7-day area line (own card)  
- Fat 7-day area line (own card; not multi-series overlay)  
- Meal-timing columns for **today**: breakfast / lunch / dinner / snack protein grams from the existing meal breakdown  
- Macro-split dual-ring: today’s **protein progress** and **fat progress** toward their targets (two concentric or paired rings — not a kcal pie)  
- Week comparison columns for protein (current 7-day daily totals vs prior 7-day via existing `comparePeriods` / series)  
- Rolling-average overlay on the protein area chart only (trailing 3-day mean from the daily series)  

Empty or sparse history → empty states, not fake markers.

### Central Node — Today’s Status (hybrid)

Layout fills the card:

| Region | Source |
|--------|--------|
| Completion ring | `getLoggingCompleteness()` via kit |
| Live checklist + snapshot totals | events aggregates (nutrition/fitness/diary/body/skincare flags + key macros) |
| Agent prose | `extractTodaysStatus` from `central-node.md`; empty state if missing |

`central-node-model` gains a `liveStatus` object alongside existing markdown extracts. Prose remains secondary until the deferred write-path fix keeps it fresh; **live side must still look correct after a meal log + refresh**.

## Data flow

- This design is **read-path only** for sync/writes: no new `chat-confirm` Central Node mutations.
- Render path: build model → kit geometry → apply DOM attributes → `animateFill` once.
- Home model progress fractions stay; renderers switch from CSS `--progress` bars to rings.
- Nutrition slice 2 adds model fields only for new series.
- After confirm + `onRecordWritten` refresh, Home/Nutrition rings update from events as they do today; Status **prose** may lag until follow-up.

## Edge cases & errors

| Case | Behaviour |
|------|-----------|
| Zero / missing targets | Ring at 0%; valid dasharray (no NaN) |
| Over target | Visual fill caps at 100%; label shows actual (e.g. 130/120) |
| Empty week series | Flat empty state; no end marker |
| Missing Status prose | Live panel still renders; prose slot empty state |
| Bad series / apply failure | Soft-fail that chart; tab must still render |
| Reduced motion | Final geometry immediately |

Sync/auth failures keep current refresh UX; no new network surface area.

## Testing

- **Unit:** ring/area/column geometry (fraction, dashoffset, over-target cap, area points without last-point).
- **Unit:** `liveStatus` shape on central-node-model; nutrition-model series for slice 2.
- **Browser/acceptance:** Home rings present; Nutrition rings present; protein chart has no last-point circle; Status hybrid shows live checklist.
- Extend existing `*-charts.test.js` and section specs; do not introduce a parallel test stack.

## Out of scope (follow-up)

1. Brisket/persona confirm path rewriting Today’s Status and hardening Recent Actions / Cross-Agent appends.  
2. Full Notion protocol migration into prompts.  
3. Dark instrument-panel theme.  
4. Continuous GitHub pushes / Netlify deploys as part of iteration.

## Success criteria

1. Home Energy/Protein/Fat read as soft-medical rings with visible fill-on-load.  
2. Nutrition macros are rings; page feels chart-dense after slice 2.  
3. Protein trend has no end circle; area fill animates cleanly.  
4. Today’s Status uses the card width: live + prose hybrid.  
5. `prefers-reduced-motion` snaps without broken layouts.  
6. No chart library added; existing PWA/offline constraints preserved.
