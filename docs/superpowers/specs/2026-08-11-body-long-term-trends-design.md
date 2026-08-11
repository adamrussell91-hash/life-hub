# Body Tab — Long-Term Trends & History Import

**Date:** 2026-08-11  
**Status:** Approved  
**Deploy rule:** Local commits only until Adam asks to push.  
**Supersedes (ranges/charts):** range and chart decisions in `2026-08-05-body-tab-design.md` for Weekly / Monthly / 6M and stub chart height. Logging, Sara chat, and stacked Scale → Composition → Tape contexts remain.

## Problem

1. Body charts read as empty stubs: short aspect ratio, weekly-biased ranges, and almost no history in the live CN path.
2. Local app `data/` has no body tree; `life-hub-data` only holds a handful of 2026 composition/tape files from the Chadwick CSV/dir import.
3. The Notion **Body Data Record** markdown holds weight and body fat from ~2012 onward in prose form; `import-notion-history.mjs` does not parse that format.
4. Tape sites stack full-width; charts omit point values; long ranges need accordion-style condensation, not every raw point.

## Out of scope

- Expanding Tape quick-log beyond waist + chest
- Sleep / heart domains
- Filtering or excluding “faulty” historical readings at import time (import with notes; filter later if needed)
- Replacing Central Node sync mechanics
- Mind / Nutrition chart changes beyond reusing existing label patterns

## Decisions

### 1. Full historical import (Approach 1)

Extend `scripts/import-notion-history.mjs` with `--body-log <markdown>` for:

`/Users/adamrussell/Downloads/Private & Shared 12/Body Data Record Weight, Body Fat and Measurements 3b9f794f84768016935ce337a1e6c93c.md`

| Rule | Behaviour |
|------|-----------|
| Line shape | `D Mon YYYY: weight N kg, body fat N%` (and weight-only / fat-only variants) |
| Same-day `(a)` / `(b)` | Distinct record IDs (suffix); both kept; charts order by date then id |
| Record type | `composition` when weight pairs with fat (or other composition fields); else `weight` or composition with `body_fat_pct` alone |
| Metadata | `time: '12:00'`, `sydneyLocalStamp`, `source: 'notion_import'` (same as existing body import) |
| Existing CSV / dir | Re-run `--body-csv` / `--body-dir` so 2026 tape + K1 remain |
| Overwrite | Do not overwrite newer non-import files unless `--force` |

Output: `life-hub-data/data/body/YYYY/MM/…` as today.

Also keep using:

- Body Measurements CSV (`…_all.csv` / sibling CSV)
- Body Measurements markdown directory under Chadwick Flexington

### 2. Ranges — long-term, no weekly

Replace Weekly · Monthly · 6M with:

| Range key | Label | Window | Series resolution |
|-----------|-------|--------|-------------------|
| `monthly` | Month | last 30 days | raw readings |
| `six_month` | 6M | last 182 days | monthly means |
| `year` | Year | last 365 days | monthly means |
| `five_year` | 5Y | last 1826 days | 6-month means |

- Shared `#body-range-control`; default **`six_month`**.
- Bucket aggregate = mean of finite values; bucket date = **end of period**.
- Primary growth % = first→last finite point on the **displayed** (aggregated) series.
- Secondary trend vs previous reading via existing `getTrend` (unchanged semantics on latest raw pair).

Accordion idea: as the window squeezes more history into the same chart width, resolution compresses (raw → monthly → half-year).

### 3. Charts

- Keep Catmull–Rom smooth paths via `buildAreaLine`.
- Taller Body charts (~viewBox / aspect **320×160–180**, not 120).
- **Value label on every displayed point** (nutrition-style `chart-value-label`); labels sit on accordion points, not every suppressed raw reading.
- Soft dots on points; keep area fill + soft reveal; Scale / Composition / Tape accent colours unchanged.
- Y scale from series **min→max** with padding (not forced zero-based) so weight/tape trends are readable.

### 4. Layout

Stacked contexts remain: **Scale → Composition → Tape**.

- **Scale:** one full-width weight chart; latest + dual growth; quick-log weight.
- **Composition:** body fat (+ skeletal muscle when present); same chart treatment; quick-log fat + muscle.
- **Tape:** CSS grid **2 columns** (1 column on very narrow viewports). Each cell: site label, latest + growth, smooth labeled chart. Sites with data only. Order: waist, chest, hips, shoulders, neck, arms, thighs, calves.
- Tape quick-log: waist + chest only (unchanged this pass).

### 5. Empty / partial windows

- No fake series.
- If a latest reading exists but **no points fall in the selected window**, still show the latest value card; chart area uses a short empty-for-range caption.

## Behaviour

1. Import body log (+ optional CSV/dir refresh) into `life-hub-data`; sync/load so Body sees events.
2. Body nav opens `#body-dashboard` with Month / 6M / Year / 5Y; default 6M.
3. Range switch rebuilds model (aggregated series) and re-renders with motion (respect `prefers-reduced-motion`).
4. Each metric chart draws smooth line + area + per-point value labels.
5. Tape metrics render two-up.
6. Confirm overwrite same-day path slugs unchanged: `weight`, `composition`, `measurements`.

## Verification

- Unit: body-log line parser; accordion bucketing; range windows; growth on aggregated series; tape grid presence of metrics with data.
- Import dry-run: count weight/composition files; spot-check years (e.g. 2015, 2017, 2021, 2026).
- Manual: Month → 5Y condensation + labels; tape 2-up; log weight still confirms through Sara path.

## Files (expected)

| Area | Files |
|------|--------|
| Import | `scripts/import-notion-history.mjs` (+ small pure helper if tests need it), unit tests |
| Model | `js/app/body-model.js`, `tests/unit/body-model.test.js` |
| Render / CSS / HTML | `js/app/render-body.js`, `css/app.css`, `index.html` range buttons |
| Chart kit | `js/app/chart-kit/area-line.js` only if min–max scaling needs a shared option |
| Wiring | `js/app/app-controller.js` default range if required; SW bump when shipping UI |

## Non-goals reminder

Do not add Daily / 1Y-as-daily-points ranges. Do not keep Weekly. Do not invent placeholder history in the UI.
