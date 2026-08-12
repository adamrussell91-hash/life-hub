# Dashboard UX Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix body history loading and skincare streaks, then ship Body anatomical tape labels, Fitness long-term/strength cards, Skincare AM/PM drawer, Nutrition 14-slot week bars, and Calendar inline day expand — with smooth motion throughout.

**Architecture:** Data-first. Extend sync lookback beyond workout-streak gating; add a long-format body history CSV importer and split arm flexed/relaxed fields. Then rebuild each tab’s render layer on corrected models. Keep vanilla JS + existing chart-kit; copy anatomy PNGs into `assets/`.

**Tech Stack:** Vanilla ES modules, SVG chart-kit, Node `node:test`, `scripts/*.mjs`, CSS in `css/app.css`, Netlify/GitHub Pages shell.

**Spec:** `docs/superpowers/specs/2026-08-12-dashboard-ux-refresh-design.md`

**Deploy:** Local commits only; do not push unless Adam asks. Body import writes go to sibling `../life-hub-data`, not the app shell tree.

---

## File map

| File | Responsibility |
|------|----------------|
| `scripts/lib/body-history-csv-import.mjs` | Parse long-format `body_measurements_full_history.csv` → weight/composition/measurements events |
| `scripts/import-notion-history.mjs` | Wire `--body-history-csv`; update wide-CSV arm flexed/relaxed fields |
| `js/core/validate.js` | Measurement field list includes flexed/relaxed arms |
| `js/app/load-live-events.js` | Extend lookback while older events exist; cap ~1826 days |
| `js/app/body-model.js` | Tape sites, polarity, label trend deltas (last + overall) |
| `js/app/render-body.js` | Anatomical diagram + expandable labels; drop tape quick-log |
| `js/app/body-controller.js` | Remove waist/chest quick-log wiring if present |
| `js/app/skincare-model.js` | Streak from most recent logged day ≤ today |
| `js/app/render-skincare.js` | AM/PM sliding drawer UI |
| `js/app/fitness-model.js` | Long-term trio + region strength metrics |
| `js/app/render-fitness.js` | Trio cards + 5 region cards; drop unlabeled 7-day volume hero |
| `js/app/format-exercise.js` | Clearer multi-line set formatting |
| `js/app/render-nutrition.js` | 14-slot grouped week-compare columns; denser micro row |
| `js/app/render-calendar.js` | Inline expand/collapse day detail |
| `js/app/calendar-model.js` | Brief summary lines per event (if needed) |
| `index.html` | Markup for new Fitness/Body/Skincare/Nutrition/Calendar structure |
| `css/app.css` | Diagram labels, drawer, strength cards, calendar expand, type sizes |
| `assets/body/full-body-diagram.png` | Full-body tape diagram |
| `assets/fitness/regions/*.png` | Chest/arms/abs/legs/back card images |
| `service-worker.js` | Bump cache after UI ships |
| Unit tests under `tests/unit/` | Matching each model/import change |

---

### Task 1: Long-format body history CSV parser

**Files:**
- Create: `scripts/lib/body-history-csv-import.mjs`
- Create: `tests/unit/body-history-csv-import.test.js`

- [ ] **Step 1: Write the failing test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBodyHistoryCsv } from '../../scripts/lib/body-history-csv-import.mjs';

const SAMPLE = `date,measurement,region,side,value,unit,method,record_label,source_dataset,source_url,quality_note
2015-05-19,Body fat,Whole Body,,21.2,%,scale,May 2015,Notion,,
2015-05-19,Body weight,Whole Body,,88.5,kg,scale,May 2015,Notion,,
2026-01-27,Circumference,Waist,,84.5,cm,tape,27 Jan 2026,Notion,,
2026-01-27,Arm Flexed,Arm Flexed,Right,42.0,cm,tape,27 Jan 2026,Notion,,
2026-01-27,Arm Relaxed,Arm Relaxed,Left,38.0,cm,tape,27 Jan 2026,Notion,,
2026-01-27,Thigh,Thigh,Right,62.0,cm,tape,27 Jan 2026,Notion,,
2026-01-27,Calf,Calf,Left,38.5,cm,tape,27 Jan 2026,Notion,,
2026-01-27,Calf,Calf,Right,39.0,cm,tape,27 Jan 2026,Notion,,
`;

test('parseBodyHistoryCsv groups same-day weight+fat into composition', () => {
  const events = parseBodyHistoryCsv(SAMPLE);
  const composition = events.find(e => e.record.date === '2015-05-19' && e.record.type === 'composition');
  assert.ok(composition);
  assert.equal(composition.record.weight_kg, 88.5);
  assert.equal(composition.record.body_fat_pct, 21.2);
  assert.equal(composition.record.source, 'notion_import');
});

test('parseBodyHistoryCsv maps tape sites including flexed/relaxed arms', () => {
  const events = parseBodyHistoryCsv(SAMPLE);
  const tape = events.find(e => e.record.date === '2026-01-27' && e.record.type === 'measurements');
  assert.equal(tape.record.waist, 84.5);
  assert.equal(tape.record.right_arm_flexed, 42);
  assert.equal(tape.record.left_arm_relaxed, 38);
  assert.equal(tape.record.right_thigh, 62);
  assert.equal(tape.record.calves, 38.75);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/unit/body-history-csv-import.test.js`  
Expected: FAIL (module not found)

- [ ] **Step 3: Implement parser**

Create `scripts/lib/body-history-csv-import.mjs` that:
1. Parses CSV rows (`date,measurement,region,side,value,...`)
2. Groups by date
3. Maps Body weight / Body fat / Skeletal muscle mass → weight or composition events
4. Maps Circumference regions, Arm Flexed/Relaxed + side, Thigh + side, Calf (mean if both sides) → measurements fields including `right_arm_flexed`, `left_arm_flexed`, `right_arm_relaxed`, `left_arm_relaxed`
5. Uses `source: 'notion_import'`, `time: '12:00'`, and the same sydney stamp helper as `import-notion-history.mjs` (extract to `scripts/lib/sydney-local-stamp.mjs` if needed)

Ignore Height and other non-mapped measurement strings.

- [ ] **Step 4: Run tests — expect PASS**

Run: `node --test tests/unit/body-history-csv-import.test.js`

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/body-history-csv-import.mjs tests/unit/body-history-csv-import.test.js scripts/lib/sydney-local-stamp.mjs
git commit -m "$(cat <<'EOF'
feat(body): parse long-format full history measurement CSV

EOF
)"
```

---

### Task 2: Schema + wide CSV arm split + CLI flag

**Files:**
- Modify: `js/core/validate.js` (`MEASUREMENT_NUMBERS`)
- Modify: `scripts/import-notion-history.mjs`
- Modify: any unit tests still expecting `right_arm` / `left_arm`

- [ ] **Step 1: Update `MEASUREMENT_NUMBERS`**

```js
const MEASUREMENT_NUMBERS = [
  'chest', 'waist', 'hips', 'shoulders', 'neck',
  'right_arm_flexed', 'left_arm_flexed',
  'right_arm_relaxed', 'left_arm_relaxed',
  'right_thigh', 'left_thigh', 'calves'
];
```

- [ ] **Step 2: Update wide-row mapping in `bodyEventsFromRow`**

Map flexed and relaxed columns separately (no more `Flexed || Relaxed` collapse). Calves: mean when both sides present, else whichever exists.

- [ ] **Step 3: Add CLI `--body-history-csv <path>`** mirroring `--body-csv` write path into `life-hub-data`, using `parseBodyHistoryCsv`. Do not overwrite newer non-import files unless `--force`.

- [ ] **Step 4: Run** `node --test tests/unit/body-history-csv-import.test.js tests/unit/records.test.js tests/unit/fixtures.test.js`  
Fix assertions that still expect `right_arm`.

- [ ] **Step 5: Commit**

```bash
git add js/core/validate.js scripts/import-notion-history.mjs tests/unit
git commit -m "$(cat <<'EOF'
feat(body): split arm flexed/relaxed fields and add history CSV import flag

EOF
)"
```

---

### Task 3: Sync lookback beyond workout streak

**Files:**
- Modify: `js/app/load-live-events.js`
- Modify: `tests/unit/load-live-events.test.js`

- [ ] **Step 1: Write failing test** proving lookback extends when an older **body** (or any) event sits on the window edge, even with **no** workout streak.

- [ ] **Step 2: Run test — expect FAIL**

- [ ] **Step 3: Change extension gate**

```js
const MAX_LOOKBACK_DAYS = 1826;

function historyReaches(events, boundary) {
  return (events ?? []).some(event => event?.record?.date === boundary);
}
```

Replace `streakReaches(...)` with `historyReaches(parsed.events, from)` and break when `daysBetween(from, date) >= MAX_LOOKBACK_DAYS`. Delete unused `streakReaches`.

- [ ] **Step 4: Update existing streak-extension tests to the new history-edge behaviour. Run** `node --test tests/unit/load-live-events.test.js`

- [ ] **Step 5: Commit**

```bash
git add js/app/load-live-events.js tests/unit/load-live-events.test.js
git commit -m "$(cat <<'EOF'
fix(sync): extend live lookback from any domain history, not workout streak

EOF
)"
```

---

### Task 4: Body model — tape sites, polarity, dual deltas

**Files:**
- Modify: `js/app/body-model.js`
- Modify: `tests/unit/body-model.test.js`

- [ ] **Step 1: Failing tests** for `TAPE_SITES` including flexed/relaxed (not legacy `right_arm`), and `lastDelta` / `overallDelta` / physique colours (waist down = green).

- [ ] **Step 2: Implement**

```js
const MEASUREMENT_GOOD_UP = new Set([
  'chest', 'shoulders',
  'right_arm_flexed', 'left_arm_flexed',
  'right_arm_relaxed', 'left_arm_relaxed',
  'right_thigh', 'left_thigh', 'calves'
]);

export const TAPE_SITES = [
  'neck', 'shoulders', 'chest', 'waist', 'hips',
  'right_arm_flexed', 'left_arm_flexed',
  'right_arm_relaxed', 'left_arm_relaxed',
  'right_thigh', 'left_thigh', 'calves'
];
```

Each tape metric: `current`, `lastDelta`, `overallDelta`, `lastColour`, `overallColour`, `history[]` with `{ date, value, delta, pct }`.

- [ ] **Step 3: Run** `node --test tests/unit/body-model.test.js`

- [ ] **Step 4: Commit**

```bash
git add js/app/body-model.js tests/unit/body-model.test.js
git commit -m "$(cat <<'EOF'
feat(body): model flexed/relaxed tape sites with last and overall deltas

EOF
)"
```

---

### Task 5: Copy anatomy assets

**Files:**
- Create: `assets/body/full-body-diagram.png`
- Create: `assets/fitness/regions/{chest,arms,abs,legs,back}.png`

- [ ] **Step 1: Copy from Cursor project assets**

```bash
mkdir -p assets/body assets/fitness/regions
cp "/Users/adamrussell/.cursor/projects/Users-adamrussell-Documents-Claude-Projects-life-hub/assets/Full_Body_Diagram-d6883b4e-03af-44cb-b480-a486d5772bdd.png" assets/body/full-body-diagram.png
cp "/Users/adamrussell/.cursor/projects/Users-adamrussell-Documents-Claude-Projects-life-hub/assets/front_chest_blank-50f8cf39-41ff-407b-a81f-c703f942d0b6.png" assets/fitness/regions/chest.png
cp "/Users/adamrussell/.cursor/projects/Users-adamrussell-Documents-Claude-Projects-life-hub/assets/front_bicep_-_flexed-4f7f864a-626d-407d-af86-c290a5995576.png" assets/fitness/regions/arms.png
cp "/Users/adamrussell/.cursor/projects/Users-adamrussell-Documents-Claude-Projects-life-hub/assets/front_abs_blank-b7aaf27a-b00d-42d5-857c-b96b8181886e.png" assets/fitness/regions/abs.png
cp "/Users/adamrussell/.cursor/projects/Users-adamrussell-Documents-Claude-Projects-life-hub/assets/back_legs_blank-a2805300-acd4-4250-93a8-6b2837ed98a6.png" assets/fitness/regions/legs.png
cp "/Users/adamrussell/.cursor/projects/Users-adamrussell-Documents-Claude-Projects-life-hub/assets/back_torso_blank-44089ec9-1e5f-4478-a93d-6f60380cf898.png" assets/fitness/regions/back.png
```

- [ ] **Step 2: Commit**

```bash
git add assets/body assets/fitness/regions
git commit -m "$(cat <<'EOF'
assets: add body diagram and fitness region anatomy images

EOF
)"
```

---

### Task 6: Body tape diagram UI + remove quick-log

**Files:**
- Modify: `js/app/render-body.js`, `js/app/body-controller.js`, `index.html`, `css/app.css`

- [ ] **Step 1: Replace tape grid markup** with figure + labels host; delete waist/chest quick-log block.

```html
<section class="body-tape" data-body-section="tape">
  <div class="body-figure" id="body-tape-figure">
    <img src="assets/body/full-body-diagram.png" alt="Full body anatomy diagram" class="body-figure__img" />
    <div class="body-figure__labels" id="body-tape-labels"></div>
  </div>
</section>
```

- [ ] **Step 2: Render expandable labels** with percentage anchors (`LABEL_ANCHORS`), dual trend chips (last + overall), history rows on click. Exactly one open label at a time. Keep Scale/Composition charts.

- [ ] **Step 3: CSS** for absolute labels, colour tokens, expand/collapse motion (~280ms), `prefers-reduced-motion`.

- [ ] **Step 4: Manual check** — diagram loads; labels expand/collapse; no quick-log form.

- [ ] **Step 5: Commit**

```bash
git add js/app/render-body.js js/app/body-controller.js index.html css/app.css
git commit -m "$(cat <<'EOF'
feat(body): anatomical tape labels on full-body diagram

EOF
)"
```

---

### Task 7: Skincare streak fix

**Files:**
- Modify: `js/app/skincare-model.js`
- Modify/create skincare unit tests

- [ ] **Step 1: Failing test** — AM logged 10th+11th, today 12th unlogged → `streaks.am === 2`.

- [ ] **Step 2: Implement streak from most recent logged day ≤ today** (same loop pattern as `calculateWorkoutStreak`).

- [ ] **Step 3: Run skincare unit tests — PASS**

- [ ] **Step 4: Commit**

```bash
git add js/app/skincare-model.js tests/unit
git commit -m "$(cat <<'EOF'
fix(skincare): preserve AM/PM streaks when today is not logged yet

EOF
)"
```

---

### Task 8: Skincare AM/PM beauty drawer

**Files:**
- Modify: `js/app/render-skincare.js`, `index.html`, `css/app.css`, `tests/unit/render-skincare.test.js`

- [ ] **Step 1: Markup** — segmented AM|PM tabs + sliding track with both routine cards.

- [ ] **Step 2: Default to `nowHourKey` / clock (AM before noon). Slide track with ~320ms cubic-bezier; only one routine visible.

- [ ] **Step 3: Reduced-motion → instant swap**

- [ ] **Step 4: Commit**

```bash
git add js/app/render-skincare.js index.html css/app.css tests/unit/render-skincare.test.js
git commit -m "$(cat <<'EOF'
feat(skincare): AM/PM sliding beauty drawer defaulting by time of day

EOF
)"
```

---

### Task 9: Fitness long-term trio + region strength model

**Files:**
- Modify: `js/app/fitness-model.js`
- Modify: `tests/unit/fitness-model.test.js`

- [ ] **Step 1: Add region matchers + failing tests** for best-set Δ kg (~30d), volume % Δ, weekly volume series (~26 weeks), workouts/week, adherence, composite strength %.

```js
export const REGION_KEYS = ['chest', 'arms', 'abs', 'legs', 'back'];
```

Map via `focus` tags first, then exercise-name regex fallbacks (bench/chest, curl/tricep, crunch/plank, squat/deadlift, row/pull-up/lat).

- [ ] **Step 2: Extend `buildFitnessModel` with `longTerm` and `regions[]` (image path `assets/fitness/regions/${key}.png`).

- [ ] **Step 3: Run** `node --test tests/unit/fitness-model.test.js`

- [ ] **Step 4: Commit**

```bash
git add js/app/fitness-model.js tests/unit/fitness-model.test.js
git commit -m "$(cat <<'EOF'
feat(fitness): long-term trio metrics and region strength deltas

EOF
)"
```

---

### Task 10: Fitness UI — trio, region cards, typography

**Files:**
- Modify: `index.html`, `js/app/render-fitness.js`, `js/app/format-exercise.js`, `css/app.css`

- [ ] **Step 1: Replace streak/7-day volume hero** with three long-term cards + `#fitness-region-grid`.

- [ ] **Step 2: Render sparkline (`buildAreaLine` + `animateAreaReveal`) and five illustrated region cards.

- [ ] **Step 3: Bump session/template type to ~0.95–1.05rem; format sets as stacked lines in HTML.

- [ ] **Step 4: Commit**

```bash
git add index.html js/app/render-fitness.js js/app/format-exercise.js css/app.css
git commit -m "$(cat <<'EOF'
feat(fitness): long-term trio, region strength cards, readable session text

EOF
)"
```

---

### Task 11: Nutrition — 14-slot week compare + denser micros

**Files:**
- Modify: `js/app/render-nutrition.js`, optionally `nutrition-model.js`, `css/app.css`, `index.html`, nutrition unit tests

- [ ] **Step 1: Build 14 bars** — prior week 7 days then this week 7 days (`series: 'prior' | 'this'`).

- [ ] **Step 2: Replace area/line week-compare with dual-tone columns + `animateColumnGrow`. Keep avg + % badge. Prefer a local grouped-bar renderer over a broad chart-kit rewrite.

- [ ] **Step 3: Tighten `.nutrition-grid`** padding/ring size; 4-across desktop, 2×2 narrow (not four stacked full-bleed).

- [ ] **Step 4: Commit**

```bash
git add js/app/render-nutrition.js js/app/nutrition-model.js css/app.css index.html tests/unit
git commit -m "$(cat <<'EOF'
feat(nutrition): 14-slot week-compare bars and denser micro row

EOF
)"
```

---

### Task 12: Calendar inline day expand

**Files:**
- Modify: `js/app/render-calendar.js`, `js/app/calendar-model.js`, `js/app/app-controller.js`, `css/app.css`, calendar unit tests

- [ ] **Step 1: Add `eventBrief(event)`** one-line summaries per domain.

- [ ] **Step 2: Controller state `calendarExpandedDate`** — same-day re-click collapses; other day selects+expands; panel under grid with `data-motion="in"`.

- [ ] **Step 3: Tests for toggle + briefs**

- [ ] **Step 4: Commit**

```bash
git add js/app/render-calendar.js js/app/calendar-model.js js/app/app-controller.js css/app.css tests/unit
git commit -m "$(cat <<'EOF'
feat(calendar): inline expand day logs with brief summaries

EOF
)"
```

---

### Task 13: Re-import body history into life-hub-data

**Files:** sibling repo `../life-hub-data`

- [ ] **Step 1: Run import**

```bash
node scripts/import-notion-history.mjs \
  --body-history-csv "/Users/adamrussell/.codex/.chatgpt-projects/g-p-6a77f0eb110c81919b5397fa1bb3b535/outputs/body-records/body_measurements_full_history.csv" \
  --out ../life-hub-data
```

Spot-check multi-year `data/body/**` and a measurements file containing `right_arm_flexed`.

- [ ] **Step 2: Commit in life-hub-data** (do not push unless asked).

---

### Task 14: Cache bump + verification

**Files:**
- Modify: `service-worker.js`

- [ ] **Step 1: Bump SW cache id**

- [ ] **Step 2: Run** `npm run test:unit` — all PASS

- [ ] **Step 3: Manual smoke** against success criteria in the spec (Body points + diagram, Skincare drawer/streak, Fitness trio/cards/type, Nutrition bars/micros, Calendar expand).

- [ ] **Step 4: Commit**

```bash
git add service-worker.js
git commit -m "$(cat <<'EOF'
chore: bump service worker cache after dashboard UX refresh

EOF
)"
```

---

## Spec coverage check

| Spec requirement | Task(s) |
|------------------|---------|
| Long CSV re-import + flexed/relaxed fields | 1, 2, 13 |
| Sync lookback without workout streak | 3 |
| Remove waist/chest quick-log | 6 |
| Anatomical tape labels + dual trends + history | 4, 5, 6 |
| Scale/Composition charts with history | 3, 6 |
| Skincare streak fix | 7 |
| Skincare AM/PM drawer + clock default | 8 |
| Fitness long-term trio | 9, 10 |
| Five region strength cards + images | 5, 9, 10 |
| Readable session/template text | 10 |
| Nutrition 14-slot grouped bars | 11 |
| Dense micro four-up | 11 |
| Calendar inline expand | 12 |
| Smooth motion / reduced-motion | 6, 8, 10, 11, 12 |
| SW cache bump | 14 |

## Consistency notes

- Arm fields: always `*_arm_flexed` / `*_arm_relaxed`
- Lookback cap: `1826` days (= Body 5Y)
- Region images: `assets/fitness/regions/{key}.png`
