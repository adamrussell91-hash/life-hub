# Dashboard UX Refresh — Body Diagram, Fitness Strength, Skincare Drawer, Nutrition Bars, Calendar Expand

**Date:** 2026-08-12  
**Status:** Approved (brainstorm)  
**Deploy rule:** Local commits only until Adam asks to push.  
**Approach:** Data-first, then UI — fix body history sync/import and skincare streak math before shipping visual redesigns.  
**Supersedes (partial):**
- Tape layout / quick-log in `2026-08-11-body-long-term-trends-design.md` (diagram replaces tape line grid; remove waist/chest quick-log)
- Nutrition “this week vs prior” chart in `2026-08-11-nutrition-dashboard-clarity-design.md` (grouped 14-slot bars replace line/sparkline)
- Fitness top streak/volume emphasis in `2026-08-04-fitness-tab-design.md` (long-term trio + region strength cards)

## Problem

1. **Body charts show ~2 points / “First reading”** despite a large CSV history — live sync lookback is ~30 days (extended only via workout streak), and arm flexed/relaxed collapse into one field.
2. **Tape UI** is a sparse line-graph grid; waist/chest quick-add at the bottom is unwanted.
3. **Skincare** shows AM and PM at once; streaks read **0** until today is logged.
4. **Fitness** 7-day volume card lacks useful labels; streak card is weak vs available space; session/template text is too small.
5. **Nutrition** full-width line “this week vs prior” blows up on web; micro four-up has too much empty space.
6. **Calendar** day select does not expand into a clear brief log summary.

## Out of scope

- Sleep / heart domains
- Wrist / forearm tape sites (CSV has them; defer unless already trivial)
- New chat agents or Central Node schema changes beyond measurement field additions
- Rewriting the entire chart-kit API (extend columns/area-line/animate only as needed)
- Pushing to remote / Netlify without explicit ask
- Filtering “faulty” historical body fat readings at import (keep with notes)

## Decisions

### 0. Sequencing

1. Body schema + CSV re-import + sync lookback so full history loads  
2. Skincare streak fix  
3. Body tape diagram UI + remove quick-log  
4. Fitness long-term trio + strength cards + typography  
5. Nutrition grouped bars + denser micro row  
6. Calendar inline day expand  
7. Motion polish pass across touched surfaces  

### 1. Body — data

**Source file (re-import):**  
`/Users/adamrussell/.codex/.chatgpt-projects/g-p-6a77f0eb110c81919b5397fa1bb3b535/outputs/body-records/body_measurements_full_history.csv`

**Schema (`MEASUREMENT_NUMBERS` / `TAPE_SITES`):**
- Keep: `waist`, `chest`, `hips`, `shoulders`, `neck`, `right_thigh`, `left_thigh`, `calves`
- Split arms into:
  - `right_arm_flexed`, `left_arm_flexed`
  - `right_arm_relaxed`, `left_arm_relaxed`
- Migrate/remove legacy `right_arm` / `left_arm` from validators and import (map old files: prefer flexed → `*_flexed`, else relaxed → `*_relaxed` when reading historical markdown if needed)

**Import mapping (CSV):**

| CSV measurement | Fields |
|-----------------|--------|
| Circumference + region Waist/Chest/… | existing site keys |
| Arm Flexed + side | `right_arm_flexed` / `left_arm_flexed` |
| Arm Relaxed + side | `right_arm_relaxed` / `left_arm_relaxed` |
| Thigh / Calf + side | `right_thigh` / `left_thigh`; calves: store `calves` from right if present else left (same-day both sides → mean) |

**Sync lookback:** Body history must not depend on workout streak. Change `loadLiveEvents` so lookback extends while older synced event files still appear at the window edge (any domain, including `data/body/**`), not only while a workout streak reaches the edge. Cap extension at the Body 5Y window (~1826 days) so Year/5Y charts show imported multi-year points (aggregated), not two monthly means from the last ~30 days.

**Trend polarity (physique):**
- Good **down:** waist, hips, neck (and weight / body fat elsewhere)
- Good **up:** chest, shoulders, arms (flexed + relaxed), thighs, calves
- Flat Δ → grey

**Remove:** Body tape quick-log UI (waist + chest form at bottom).

### 2. Body — tape diagram UI

Replace tape line-graph grid with a **medial figure + labels**:

- Asset: full-body diagram PNG (copy from Cursor assets into `assets/` under a stable name, e.g. `assets/body/full-body-diagram.png`).
- Labels positioned near anatomy (CSS absolute / percentage anchors). Sites with no observations are omitted.
- Each collapsed label shows:
  1. Body part name  
  2. Current measurement (cm)  
  3. Two trend figures: **Δ since last reading**, **Δ overall** (first→latest or range-aware overall — use first→latest on all loaded observations for that site). Each: arrow direction + magnitude; colour green/red/grey per polarity rules.
- **Click/tap** expands in place to a history table: date, raw value, trend % (vs previous row). Click again collapses. Exactly one site expanded at a time (opening another closes the current).
- Motion: smooth expand/collapse height + fade (respect `prefers-reduced-motion`).
- Scale + Composition sections remain stacked above; keep area-line charts with point labels and existing range control — now fed by full history.

### 3. Fitness

**Top long-term trio** (use available width; de-emphasize tiny streak strip):
1. **Weekly volume** — sparkline over a long window (≈12–26 weeks) + % vs earlier period  
2. **Workouts / week** + adherence %  
3. **Strength Δ** — composite of five region best-set trends  

**Replace 7-day volume card** with **five region strength cards** (2-up grid; back can span full width on 2-col):

| Card | Image asset |
|------|-------------|
| Chest | `front_chest_blank-…` |
| Arms | `front_bicep_-_flexed-…` |
| Abs | `front_abs_blank-…` |
| Legs | `back_legs_blank-…` |
| Back | `back_torso_blank-…` |

Copy into `assets/fitness/regions/` with stable names.

**Metrics per card:**
- Headline: best working-set kg change vs ~30 days ago for exercises mapped to that region  
- Secondary: volume (sets×reps×kg) % delta for that region vs prior comparable window  

Exercise→region mapping: use existing muscle-map / template focus tags where present; document a small fallback keyword map in code for untagged lifts.

**Typography:** Session exercise detail and template sheet body text ≥ ~0.95–1.05rem; set lines as stacked rows (not one compressed string at 0.75rem).

**Motion:** card entrance + column/sparkline reveal using existing chart-kit animate helpers.

### 4. Skincare

**AM/PM beauty drawer:**
- Show one routine at a time  
- Segmented AM | PM control + horizontal slide animation (“beauty drawer”)  
- Default from clock: AM before local noon, PM after; user can slide to the other  

**Streak bug fix:** Compute AM/PM streaks from the most recent logged day for that routine ≤ today (same spirit as fitness workout streak), so a prior streak remains visible when today is not yet logged.

Keep consistency heatmap.

### 5. Nutrition

**This week vs prior:**
- Replace full-width line/area chart with **grouped column bars**  
- **≥14 day slots:** prior 7 days + this 7 days (paired this/prior colour per day), so bars stay dense on wide cards  
- Keep week-average summary + % badge  
- Animate with `animateColumnGrow`  

**Sodium | Calcium | Polyphenols | Protein by meal:**
- Remain one vertical block / one row of four cards  
- Reduce internal padding / ring size so empty space shrinks; on narrow viewports 2×2, not four stacked full-bleed cards  

### 6. Calendar

**Day tap → inline expand** under week/month grid:
- Brief rows: domain affordance, title, one-line summary (workout duration/status, meal protein/kcal, skincare AM/PM, body metric, mind, etc.)  
- Another day → panel content swaps with short motion  
- Same day again → collapse  
- Empty → “Nothing logged this day.”  

Reuse existing `eventsForDate` / detail title helpers; improve density/readability of the detail panel rather than inventing a new data model.

### 7. Motion & UX (global to this pass)

- All new charts/sections: visible entrance (≈280–900ms existing curves)  
- Drawer slides and label expands must be perceptible, not instant  
- Honour `prefers-reduced-motion`  

## Architecture / touch points

| Area | Primary files |
|------|----------------|
| Sync lookback | `js/app/load-live-events.js` |
| Body model/render | `js/app/body-model.js`, `js/app/render-body.js`, `js/core/validate.js`, `js/app/body-controller.js`, `index.html`, `css/app.css` |
| Import | `scripts/import-notion-history.mjs` (+ helpers) |
| Fitness | `js/app/fitness-model.js`, `js/app/render-fitness.js`, `js/app/format-exercise.js`, `index.html`, `css/app.css` |
| Skincare | `js/app/skincare-model.js`, `js/app/render-skincare.js`, `css/app.css` |
| Nutrition | `js/app/render-nutrition.js`, `js/app/chart-kit/columns.js`, `index.html`, `css/app.css` |
| Calendar | `js/app/render-calendar.js`, `js/app/calendar-model.js`, `css/app.css` |
| Assets | `assets/body/`, `assets/fitness/regions/` |

## Error handling

- Missing region image → card still shows metrics with muted placeholder  
- Site with &lt;2 readings → show current value; trends grey / “First reading” only when truly one observation after full history load  
- Import conflicts: do not overwrite newer non-import body files unless `--force` (existing policy)  

## Testing

- Unit: body model tape sites + polarity; load-live-events lookback for body history; skincare streak without today; fitness region strength deltas; nutrition 14-slot week compare series; calendar expand selection behaviour  
- Manual: Body diagram labels expand/collapse; Skincare slide AM↔PM at morning/evening; Fitness cards + readable session text; Nutrition bars denser; Calendar inline panel  

## Success criteria

1. Body weight/fat/tape history charts show many points across 6M/Year when data exists in the data repo; tape sites including flexed/relaxed appear; no “First reading” on sites with multiple imported observations.  
2. Tape view is anatomical labels on the full-body diagram; waist/chest quick-log gone.  
3. Skincare shows one routine via sliding drawer; streaks survive unlogged today.  
4. Fitness top is long-term trio; five illustrated strength cards; readable session/template text.  
5. Nutrition week-compare is 14-slot grouped bars; four micros sit in one tight row.  
6. Calendar day tap expands brief logs inline with smooth motion.  
