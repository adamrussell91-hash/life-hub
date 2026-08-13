# Bloods Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. REQUIRED: superpowers:test-driven-development — no production code without a failing test first.

**Goal:** Add a read-only bloods/pathology sub-page of Body, fed by a Notion CSV import of the Blood Test Tracker, with trend charts, per-visit reference-range bands, and out-of-range flags.

**Architecture:** Import groups CSV rows by test date into `type: "bloods"` records (one file per date, `markers` array). `buildBloodsModel` flattens markers into per-canonical-key series. `render-bloods.js` draws the flags strip + collapsible category cards using existing Body visual language. Hidden section `body-bloods` is reached only from a "View bloods →" tile on Body — not rail-nav / more-sheet. Chart-kit `buildAreaLine` gains `includeValues` + returned `scaleY` so reference bands share the line's y-scale.

**Tech Stack:** Vanilla JS PWA, SVG chart-kit, Node `scripts/*.mjs`, `node:test`, js-yaml frontmatter.

**Spec:** `docs/superpowers/specs/2026-08-13-bloods-dashboard-design.md`

**Deploy:** Local commits only; do not push unless Adam asks. Real CSV import writes to sibling `../life-hub-data`, not this repo. Do **not** commit Adam's full pathology CSV or imported markdown into `life-hub`. Tests use a small synthetic sample.

---

## File map

| File | Responsibility |
|------|----------------|
| `scripts/lib/bloods-marker-map.mjs` | `canonicalMarkerKey(rawName)` + seeded alias map from the 298-row Notion export |
| `scripts/lib/bloods-csv-import.mjs` | `parseBloodsCsv(text) -> events[]` grouped by Test Date |
| `scripts/import-notion-history.mjs` | `--bloods-csv` flag; write via existing `writeEvent`/`eventPath` |
| `js/core/validate.js` | `validateBloods` + register `bloods` (imported files will not load without this) |
| `js/core/records.js` | `TYPE_DOMAINS.bloods = 'body'` |
| `js/core/search.js` | `CATEGORY.bloods = 'body'` so calendar dots stay on Body |
| `js/app/calendar-model.js` | Title/brief for `bloods` events |
| `js/app/chart-kit/area-line.js` | `includeValues` folded into padded domain; return `scaleY` |
| `js/app/bloods-model.js` | `buildBloodsModel({ events, date, range })` |
| `js/app/render-bloods.js` | Flags strip, category cards, marker charts with ref-range `<rect>` |
| `js/app/render-body.js` | "View bloods →" tile; `onViewBloods` hook |
| `js/app/app-controller.js` | `body-bloods` section visibility + render; keep Body nav active |
| `js/app/main.js` | Wire `buildBloodsModel` / `renderBloods` |
| `index.html` | `#body-bloods-dashboard` (no nav button) |
| `css/app.css` | Bloods layout + `data-colour="low"` orange (`--high-sea`) |
| `service-worker.js` | Bump cache; add `js/app/bloods-model.js` + `js/app/render-bloods.js` |

---

### Task 1: Marker name normalization

**Files:**
- Create: `scripts/lib/bloods-marker-map.mjs`
- Create: `tests/unit/bloods-marker-map.test.js`

- [ ] **Step 1: Write the failing test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalMarkerKey } from '../../scripts/lib/bloods-marker-map.mjs';

test('canonicalMarkerKey merges known aliases', () => {
  assert.equal(canonicalMarkerKey('Adj. Calcium'), 'adjusted_calcium');
  assert.equal(canonicalMarkerKey('Adjusted Calcium'), 'adjusted_calcium');
  assert.equal(canonicalMarkerKey('Calcium (Adjusted)'), 'adjusted_calcium');
  assert.equal(canonicalMarkerKey('Corrected Calcium'), 'adjusted_calcium');
  assert.equal(canonicalMarkerKey('Alk. Phosphatase'), 'alp');
  assert.equal(canonicalMarkerKey('Alkaline Phosphatase'), 'alp');
  assert.equal(canonicalMarkerKey('ALP'), 'alp');
  assert.equal(canonicalMarkerKey('Bilirubin'), 'bilirubin_total');
  assert.equal(canonicalMarkerKey('Bilirubin Total'), 'bilirubin_total');
  assert.equal(canonicalMarkerKey('CRP'), 'crp');
  assert.equal(canonicalMarkerKey('C-Reactive Protein'), 'crp');
  assert.equal(canonicalMarkerKey('C-Reactive Protein (CRP)'), 'crp');
  assert.equal(canonicalMarkerKey('Fasting Glucose'), 'fasting_glucose');
  assert.equal(canonicalMarkerKey('Glucose Fasting'), 'fasting_glucose');
  assert.equal(canonicalMarkerKey('Gamma GT'), 'ggt');
  assert.equal(canonicalMarkerKey('GGT'), 'ggt');
  assert.equal(canonicalMarkerKey('Haematocrit'), 'haematocrit');
  assert.equal(canonicalMarkerKey('HCT'), 'haematocrit');
  assert.equal(canonicalMarkerKey('HDL'), 'hdl');
  assert.equal(canonicalMarkerKey('HDL-c'), 'hdl');
  assert.equal(canonicalMarkerKey('LDL'), 'ldl');
  assert.equal(canonicalMarkerKey('LDL-c'), 'ldl');
  assert.equal(canonicalMarkerKey('RBC'), 'rbc');
  assert.equal(canonicalMarkerKey('Red Cell Count'), 'rbc');
  assert.equal(canonicalMarkerKey('Triglyceride'), 'triglycerides');
  assert.equal(canonicalMarkerKey('Triglycerides'), 'triglycerides');
  assert.equal(canonicalMarkerKey('WBC'), 'wcc');
  assert.equal(canonicalMarkerKey('WCC'), 'wcc');
  assert.equal(canonicalMarkerKey('White Cells'), 'wcc');
  assert.equal(canonicalMarkerKey('25-OH Vitamin D'), 'vitamin_d');
  assert.equal(canonicalMarkerKey('Vitamin D (25-hydroxyvitamin D)'), 'vitamin_d');
});

test('canonicalMarkerKey keeps HbA1c NGSP and IFCC as separate keys', () => {
  assert.equal(canonicalMarkerKey('HbA1c'), 'hba1c_ngsp');
  assert.equal(canonicalMarkerKey('HbA1c (NGSP)'), 'hba1c_ngsp');
  assert.equal(canonicalMarkerKey('HbA1c (IFCC)'), 'hba1c_ifcc');
  assert.notEqual(canonicalMarkerKey('HbA1c (NGSP)'), canonicalMarkerKey('HbA1c (IFCC)'));
});

test('canonicalMarkerKey does not merge Calcium with adjusted calcium', () => {
  assert.equal(canonicalMarkerKey('Calcium'), 'calcium');
  assert.notEqual(canonicalMarkerKey('Calcium'), canonicalMarkerKey('Adjusted Calcium'));
});

test('canonicalMarkerKey warns then slugifies unmapped names', () => {
  const warnings = [];
  const original = console.warn;
  console.warn = (...args) => warnings.push(args.join(' '));
  try {
    const key = canonicalMarkerKey('Brand New Marker (XYZ)');
    assert.equal(key, 'brand_new_marker_xyz');
    assert.ok(warnings.some(msg => /unmapped blood marker/i.test(msg) && /Brand New Marker \(XYZ\)/.test(msg)));
  } finally {
    console.warn = original;
  }
});

test('canonicalMarkerKey is case- and whitespace-insensitive for aliases', () => {
  assert.equal(canonicalMarkerKey('  crp  '), 'crp');
  assert.equal(canonicalMarkerKey('gamma  gt'), 'ggt');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/unit/bloods-marker-map.test.js`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement marker map**

Create `scripts/lib/bloods-marker-map.mjs`. Seed **every** marker name from the 298-row Notion export so a current import produces zero warnings. Aliases share a canonical key; unique names map to themselves.

```js
function slugify(name) {
  return String(name)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'unknown';
}

function normalize(name) {
  return String(name ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

// Values are canonical keys. Keys are normalize(rawName).
const MARKER_ALIASES = {
  '25-oh vitamin d': 'vitamin_d',
  'vitamin d (25-hydroxyvitamin d)': 'vitamin_d',
  'adj. calcium': 'adjusted_calcium',
  'adjusted calcium': 'adjusted_calcium',
  'calcium (adjusted)': 'adjusted_calcium',
  'corrected calcium': 'adjusted_calcium',
  'afp': 'afp',
  'albumin': 'albumin',
  'alk. phosphatase': 'alp',
  'alkaline phosphatase': 'alp',
  'alp': 'alp',
  'alpha 1 globulin': 'alpha_1_globulin',
  'alpha 2 globulin': 'alpha_2_globulin',
  'alt': 'alt',
  'anion gap': 'anion_gap',
  'ast': 'ast',
  'basophils': 'basophils',
  'beta 1 globulin': 'beta_1_globulin',
  'beta 2 globulin': 'beta_2_globulin',
  'bicarbonate': 'bicarbonate',
  'bilirubin': 'bilirubin_total',
  'bilirubin total': 'bilirubin_total',
  'c-reactive protein': 'crp',
  'c-reactive protein (crp)': 'crp',
  'crp': 'crp',
  'caeruloplasmin': 'caeruloplasmin',
  'calcium': 'calcium',
  'calprotectin': 'calprotectin',
  'chloride': 'chloride',
  'cholesterol': 'cholesterol',
  'ck': 'ck',
  'copper': 'copper',
  'creatinine': 'creatinine',
  'egfr': 'egfr',
  'eosinophils': 'eosinophils',
  'esr': 'esr',
  'fasting glucose': 'fasting_glucose',
  'glucose fasting': 'fasting_glucose',
  'ferritin': 'ferritin',
  'gamma globulin': 'gamma_globulin',
  'gamma gt': 'ggt',
  'ggt': 'ggt',
  'globulin': 'globulin',
  'glucose': 'glucose',
  'haematocrit': 'haematocrit',
  'hct': 'haematocrit',
  'haemoglobin': 'haemoglobin',
  'hba1c': 'hba1c_ngsp',
  'hba1c (ngsp)': 'hba1c_ngsp',
  'hba1c (ifcc)': 'hba1c_ifcc',
  'hdl': 'hdl',
  'hdl-c': 'hdl',
  'hepb core totalab': 'hepb_core_total_ab',
  'hepb sag': 'hepb_sag',
  'hepb surface ab': 'hepb_surface_ab',
  'hepc ab': 'hepc_ab',
  'homocysteine': 'homocysteine',
  'igg1': 'igg1',
  'igg2': 'igg2',
  'igg3': 'igg3',
  'igg4': 'igg4',
  'insulin': 'insulin',
  'iron': 'iron',
  'ldl': 'ldl',
  'ldl-c': 'ldl',
  'lipase': 'lipase',
  'lkm ab': 'lkm_ab',
  'lymphocytes': 'lymphocytes',
  'magnesium': 'magnesium',
  'mch': 'mch',
  'mchc': 'mchc',
  'mcv': 'mcv',
  'mitochondrial ab': 'mitochondrial_ab',
  'monocytes': 'monocytes',
  'mpv': 'mpv',
  'neutrophils': 'neutrophils',
  'non-hdl-c': 'non_hdl',
  'phosphate': 'phosphate',
  'platelets': 'platelets',
  'potassium': 'potassium',
  'procalcitonin': 'procalcitonin',
  'rbc': 'rbc',
  'red cell count': 'rbc',
  'rdw': 'rdw',
  'serum folate': 'serum_folate',
  'sma-v ab': 'sma_v_ab',
  'sodium': 'sodium',
  'tc/hdl-c ratio': 'tc_hdl_ratio',
  'testosterone (total)': 'testosterone_total',
  'total protein': 'total_protein',
  'transferrin': 'transferrin',
  'transferrin saturation': 'transferrin_saturation',
  'triglyceride': 'triglycerides',
  'triglycerides': 'triglycerides',
  'tsh': 'tsh',
  'ttg-iga': 'ttg_iga',
  'urea': 'urea',
  'uric acid': 'uric_acid',
  'vitamin b12': 'vitamin_b12',
  'wbc': 'wcc',
  'wcc': 'wcc',
  'white cells': 'wcc'
};

export function canonicalMarkerKey(rawName) {
  const trimmed = String(rawName ?? '').trim();
  if (!trimmed) {
    console.warn('Unmapped blood marker: (empty)');
    return 'unknown';
  }
  const key = MARKER_ALIASES[normalize(trimmed)];
  if (key) return key;
  console.warn(`Unmapped blood marker: ${trimmed}`);
  return slugify(trimmed);
}
```

Do **not** merge `Glucose` with fasting glucose. Do **not** merge `Calcium` with adjusted calcium. Do **not** merge HbA1c NGSP (%) with IFCC (mmol/mol).

- [ ] **Step 4: Run tests and confirm they pass**

Run: `node --test tests/unit/bloods-marker-map.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/bloods-marker-map.mjs tests/unit/bloods-marker-map.test.js
git commit -m "$(cat <<'EOF'
feat: normalize blood marker aliases for trend grouping

Keep lab-name drift on one key so charts don't split, without merging
tests that genuinely differ (HbA1c units, calcium vs adjusted).
EOF
)"
```

---

### Task 2: Bloods CSV parser

**Files:**
- Create: `scripts/lib/bloods-csv-import.mjs`
- Create: `tests/unit/bloods-csv-import.test.js`

Mirrors `tests/unit/body-history-csv-import.test.js` and `scripts/lib/body-history-csv-import.mjs`. Copy the local `parseCsv` / `splitCsvLine` helpers (same as body-history — do not extract a shared CSV module).

- [ ] **Step 1: Write the failing test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBloodsCsv } from '../../scripts/lib/bloods-csv-import.mjs';

const SAMPLE = `Marker,Category,Test Date,Value,Unit,Status,Ref Low,Ref High,Notes
Haemoglobin,Full Blood Count,2026-05-19,151,g/L,Normal,130,180,4Cyte Pathology
ALT,Liver Function,2026-05-19,42,U/L,High,,40,Marginally elevated
HepB sAg,Liver Function,2026-05-19,,Qualitative,,,
CRP,Inflammation Markers,19 May 2026,2.2,mg/L,Normal,0,5,
Adj. Calcium,Biochemistry/Electrolytes,2026-02-01,2.41,mmol/L,Normal,2.1,2.6,
Adjusted Calcium,Biochemistry/Electrolytes,2026-05-19,2.45,mmol/L,Normal,2.1,2.6,
`;

test('parseBloodsCsv groups rows by test date into one bloods record', () => {
  const events = parseBloodsCsv(SAMPLE);
  const may = events.find(e => e.record.date === '2026-05-19');
  assert.ok(may);
  assert.equal(may.slug, 'bloods');
  assert.equal(may.record.type, 'bloods');
  assert.equal(may.record.id, 'notion-bloods-2026-05-19');
  assert.equal(may.record.time, '12:00');
  assert.equal(may.record.source, 'notion_import');
  assert.equal(may.record.schema_version, 1);
  const hb = may.record.markers.find(m => m.key === 'haemoglobin');
  assert.equal(hb.label, 'Haemoglobin');
  assert.equal(hb.category, 'Full Blood Count');
  assert.equal(hb.value, 151);
  assert.equal(hb.unit, 'g/L');
  assert.equal(hb.ref_low, 130);
  assert.equal(hb.ref_high, 180);
  assert.equal(hb.status, 'Normal');
});

test('parseBloodsCsv keeps per-visit reference ranges and qualitative rows', () => {
  const events = parseBloodsCsv(SAMPLE);
  const may = events.find(e => e.record.date === '2026-05-19');
  const alt = may.record.markers.find(m => m.key === 'alt');
  assert.equal(alt.ref_low, null);
  assert.equal(alt.ref_high, 40);
  assert.equal(alt.status, 'High');
  const hep = may.record.markers.find(m => m.key === 'hepb_sag');
  assert.equal(hep.value, null);
  assert.equal(hep.unit, 'Qualitative');
});

test('parseBloodsCsv canonicalizes aliases across dates onto the same key', () => {
  const events = parseBloodsCsv(SAMPLE);
  const feb = events.find(e => e.record.date === '2026-02-01');
  const may = events.find(e => e.record.date === '2026-05-19');
  assert.equal(feb.record.markers[0].key, 'adjusted_calcium');
  assert.ok(may.record.markers.some(m => m.key === 'adjusted_calcium'));
});

test('parseBloodsCsv parses Notion-style dates and skips rows without a date or marker', () => {
  const events = parseBloodsCsv(SAMPLE);
  assert.ok(events.some(e => e.record.date === '2026-05-19'));
  const extra = parseBloodsCsv(`${SAMPLE},,2026-05-19,1,g/L,Normal,0,1,\nNoDate,Liver Function,,1,U/L,Normal,0,1,\n`);
  assert.equal(extra.length, events.length);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/unit/bloods-csv-import.test.js`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement parser**

Create `scripts/lib/bloods-csv-import.mjs`:

```js
import { sydneyLocalStamp } from '../../js/core/time.js';
import { canonicalMarkerKey } from './bloods-marker-map.mjs';

const BODY_TIME = '12:00';

export function parseBloodsCsv(text) {
  const rows = parseCsv(text);
  const byDate = new Map();

  for (const row of rows) {
    const dateKey = parseDateKey(row['Test Date'] ?? row.test_date ?? row.date);
    const rawName = String(row.Marker ?? row.marker ?? '').trim();
    if (!dateKey || !rawName) continue;

    if (!byDate.has(dateKey)) {
      byDate.set(dateKey, { markers: [], notes: [] });
    }
    const day = byDate.get(dateKey);
    const note = String(row.Notes ?? row.notes ?? '').trim();
    if (note && !day.notes.includes(note)) day.notes.push(note);

    const statusRaw = String(row.Status ?? row.status ?? '').trim();
    day.markers.push({
      key: canonicalMarkerKey(rawName),
      label: preferredLabel(rawName),
      category: String(row.Category ?? row.category ?? '').trim() || 'Other',
      value: num(row.Value ?? row.value),
      unit: String(row.Unit ?? row.unit ?? '').trim() || null,
      ref_low: num(row['Ref Low'] ?? row.ref_low),
      ref_high: num(row['Ref High'] ?? row.ref_high),
      status: statusRaw || null
    });
  }

  const events = [];
  for (const [dateKey, day] of [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (!day.markers.length) continue;
    const stamp = sydneyLocalStamp(dateKey, BODY_TIME);
    events.push({
      slug: 'bloods',
      notes: day.notes.join('\n\n'),
      record: {
        schema_version: 1,
        id: `notion-bloods-${dateKey}`,
        type: 'bloods',
        date: dateKey,
        time: BODY_TIME,
        created_at: stamp,
        updated_at: stamp,
        source: 'notion_import',
        markers: day.markers
      }
    });
  }
  return events;
}

function preferredLabel(rawName) {
  const key = canonicalMarkerKey(rawName);
  const LABELS = {
    adjusted_calcium: 'Adjusted calcium',
    alp: 'ALP',
    bilirubin_total: 'Bilirubin',
    crp: 'CRP',
    fasting_glucose: 'Fasting glucose',
    ggt: 'GGT',
    haematocrit: 'Haematocrit',
    hdl: 'HDL',
    ldl: 'LDL',
    rbc: 'RBC',
    triglycerides: 'Triglycerides',
    vitamin_d: 'Vitamin D',
    wcc: 'WCC',
    hba1c_ngsp: 'HbA1c (NGSP)',
    hba1c_ifcc: 'HbA1c (IFCC)'
  };
  return LABELS[key] ?? rawName.trim();
}

function parseDateKey(value) {
  if (!value) return null;
  const trimmed = String(value).trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed);
  if (dmy) {
    return `${dmy[3]}-${String(Number(dmy[2])).padStart(2, '0')}-${String(Number(dmy[1])).padStart(2, '0')}`;
  }
  const months = {
    january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
    july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
    jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12
  };
  const named = /(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/.exec(trimmed)
    || /([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/.exec(trimmed);
  if (!named) return null;
  if (months[named[1].toLowerCase()]) {
    const month = months[named[1].toLowerCase()];
    return `${named[3]}-${String(month).padStart(2, '0')}-${String(Number(named[2])).padStart(2, '0')}`;
  }
  const month = months[named[2].toLowerCase()];
  if (!month) return null;
  return `${named[3]}-${String(month).padStart(2, '0')}-${String(Number(named[1])).padStart(2, '0')}`;
}

function num(value) {
  if (value == null || value === '') return null;
  const n = Number(String(value).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

function parseCsv(text) {
  const lines = text.replace(/^\ufeff/, '').split(/\r?\n/).filter(line => line.length > 0);
  if (lines.length === 0) return [];
  const headers = splitCsvLine(lines[0]);
  return lines.slice(1).map(line => {
    const cells = splitCsvLine(line);
    const row = {};
    headers.forEach((header, index) => { row[header] = cells[index] ?? ''; });
    return row;
  });
}

function splitCsvLine(line) {
  const cells = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      cells.push(current);
      current = '';
    } else current += ch;
  }
  cells.push(current);
  return cells;
}
```

`preferredLabel` calls `canonicalMarkerKey` — that will **not** warn for mapped names. Avoid calling it twice per row in a way that double-warns unmapped names: compute `key` once in the loop and pass it into label lookup. Adjust the implementation so `canonicalMarkerKey` is invoked **once** per row.

- [ ] **Step 4: Run tests and confirm they pass**

Run: `node --test tests/unit/bloods-csv-import.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/bloods-csv-import.mjs tests/unit/bloods-csv-import.test.js
git commit -m "$(cat <<'EOF'
feat: parse Notion bloods CSV into per-date records

Group All Results rows by test date so each lab visit becomes one
bloods markdown event with a markers array.
EOF
)"
```

---

### Task 3: Wire `--bloods-csv` into the Notion importer

**Files:**
- Modify: `scripts/import-notion-history.mjs`

- [ ] **Step 1: Write the failing test**

There is no CLI argv test today (`bodyEventsFromRow` is the only export). Add a small export-level test that `parseArgs` accepts `--bloods-csv`, **or** skip a dedicated test and verify by importing `parseBloodsCsv` usage via grep after wiring. Prefer exporting `parseArgs` only if it is already easy; otherwise add this assertion in a new test file that imports the module and checks the flag is recognized by simulating argv through a tiny exported helper.

Simplest path that stays TDD: export `parseArgs` from `import-notion-history.mjs` (it is currently a private function). Add `tests/unit/import-notion-bloods-flag.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs } from '../../scripts/import-notion-history.mjs';

test('parseArgs reads --bloods-csv', () => {
  const args = parseArgs(['--bloods-csv', '/tmp/bloods.csv', '--out', '/tmp/out']);
  assert.equal(args.bloodsCsv, '/tmp/bloods.csv');
  assert.equal(args.out, '/tmp/out');
});
```

This currently fails because `parseArgs` is not exported.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/unit/import-notion-bloods-flag.test.js`

Expected: FAIL — `parseArgs` is not exported / unknown option ignored.

- [ ] **Step 3: Wire the flag**

1. Add `export` to `parseArgs`.
2. In `parseArgs`, add: `else if (arg === '--bloods-csv') out.bloodsCsv = argv[++i];`
3. At the top of the `isMain` block, resolve `bloodsCsv` like the other CSV flags.
4. Update the "Provide --workouts..." error to include `--bloods-csv`.
5. After the `bodyHistoryCsv` block, add:

```js
if (bloodsCsv) {
  const { parseBloodsCsv } = await import('./lib/bloods-csv-import.mjs');
  const events = parseBloodsCsv(readFileSync(bloodsCsv, 'utf8'));
  for (const event of events) {
    const path = eventPath('body', event.record.date, event.slug);
    writeEvent(outRoot, path, event.record, event.notes);
    bodyCount += 1;
  }
}
```

Prefer a static import at the top of the file (alongside `parseBodyHistoryCsv`) rather than a dynamic import:

```js
import { parseBloodsCsv } from './lib/bloods-csv-import.mjs';
```

`writeEvent` already skips existing files with `source: chat` unless `--force`. Do not change that.

Also add `bloodsCsv` to the JSON summary log object.

- [ ] **Step 4: Run tests**

Run: `node --test tests/unit/import-notion-bloods-flag.test.js tests/unit/import-notion-body-csv.test.js`

Expected: PASS. Existing body CSV tests still pass (`bodyEventsFromRow` export unchanged).

- [ ] **Step 5: Commit**

```bash
git add scripts/import-notion-history.mjs tests/unit/import-notion-bloods-flag.test.js
git commit -m "$(cat <<'EOF'
feat: import bloods CSV through the Notion history script

Reuse writeEvent so chat-sourced bloods files are never overwritten
on a later Notion re-export.
EOF
)"
```

---

### Task 4: Validate `type: "bloods"` so imported files load

Without this, `parseEventDocument` throws `Unknown record type: bloods` and the dashboard stays empty.

**Files:**
- Modify: `js/core/validate.js`
- Modify: `js/core/records.js`
- Modify: `tests/unit/records.test.js`

- [ ] **Step 1: Write the failing test**

Add to `tests/unit/records.test.js` inside the existing "accepts each known record type" array, plus a dedicated markers test:

```js
test('accepts bloods records with a markers array', () => {
  const record = {
    ...common,
    type: 'bloods',
    markers: [
      {
        key: 'alt',
        label: 'ALT',
        category: 'Liver Function',
        value: 42,
        unit: 'U/L',
        ref_low: null,
        ref_high: 40,
        status: 'High'
      },
      {
        key: 'hepb_sag',
        label: 'HepB sAg',
        category: 'Liver Function',
        value: null,
        unit: 'Qualitative',
        ref_low: null,
        ref_high: null,
        status: null
      }
    ]
  };
  assert.deepEqual(validateRecord(record), []);
});

test('rejects bloods records with a non-array markers field', () => {
  assert.match(
    validateRecord({ ...common, type: 'bloods', markers: 'nope' }).join('; '),
    /markers/
  );
});

test('parses a canonical bloods event path', () => {
  const text = `---
schema_version: 1
id: "notion-bloods-2026-05-19"
type: "bloods"
date: "2026-05-19"
time: "12:00"
created_at: "2026-05-19T12:00:00+10:00"
updated_at: "2026-05-19T12:00:00+10:00"
source: "notion_import"
markers: [{"key":"alt","label":"ALT","category":"Liver Function","value":42,"unit":"U/L","ref_low":null,"ref_high":40,"status":"High"}]
---
`;
  const event = parseEventDocument(text, 'data/body/2026/05/2026-05-19-bloods.md', load);
  assert.equal(event.record.type, 'bloods');
  assert.equal(event.record.markers[0].key, 'alt');
});
```

Also add `{ ...common, type: 'bloods', markers: [] }` to the existing valid-types loop in that file.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/unit/records.test.js`

Expected: FAIL — `Unknown record type: bloods`.

- [ ] **Step 3: Implement validation**

In `js/core/records.js`, add `bloods: 'body'` to `TYPE_DOMAINS`.

In `js/core/validate.js`:

```js
function validateBloods(record, errors) {
  const markers = record.markers;
  if (!Array.isArray(markers)) {
    errors.push('markers must be an array');
    return;
  }
  for (const marker of markers) {
    if (!isObject(marker)) {
      errors.push('markers entries must be objects');
      continue;
    }
    if (typeof marker.key !== 'string' || marker.key.trim() === '') {
      errors.push('marker key must be a non-empty string');
    }
    if (marker.value != null && (typeof marker.value !== 'number' || !Number.isFinite(marker.value))) {
      errors.push('marker value must be a finite number or null');
    }
    for (const bound of ['ref_low', 'ref_high']) {
      if (marker[bound] != null && (typeof marker[bound] !== 'number' || !Number.isFinite(marker[bound]))) {
        errors.push(`marker ${bound} must be a finite number or null`);
      }
    }
  }
}
```

Register `bloods: validateBloods` on `VALIDATORS`.

Do **not** add `bloods` to chat `RECORD_TYPES` — writes are out of scope.

- [ ] **Step 4: Run tests**

Run: `node --test tests/unit/records.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add js/core/validate.js js/core/records.js tests/unit/records.test.js
git commit -m "$(cat <<'EOF'
feat: accept bloods records in the event schema

Imported pathology files must validate or loadLiveEvents drops them
before the dashboard can render.
EOF
)"
```

---

### Task 5: Calendar and search treat bloods as Body

**Files:**
- Modify: `js/core/search.js`
- Modify: `js/app/calendar-model.js`
- Modify: `tests/unit/search.test.js`
- Modify: `tests/unit/calendar-model.test.js` (add one case)

- [ ] **Step 1: Write the failing test**

In `tests/unit/search.test.js`, extend the unsupported-types test (or add):

```js
test('calendar markers map bloods onto the body category', () => {
  const markers = buildCalendarMarkers([
    { record: { id: 'bloods', type: 'bloods', date: '2026-05-19' } }
  ]);
  assert.deepEqual(markers, { '2026-05-19': ['body'] });
});
```

In `tests/unit/calendar-model.test.js` add:

```js
test('bloods events title as Body with a marker count brief', () => {
  const record = { type: 'bloods', markers: [{ key: 'alt' }, { key: 'crp' }] };
  assert.equal(eventDetailTitle(record), 'Body');
  assert.equal(eventBrief({ record }), '2 markers');
});
```

(Import `eventDetailTitle` / `eventBrief` if not already imported.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/unit/search.test.js tests/unit/calendar-model.test.js`

Expected: FAIL — bloods omitted from calendar markers / title falls through to `"bloods"`.

- [ ] **Step 3: Implement**

`js/core/search.js` — add `bloods: 'body'` to `CATEGORY`.

`js/app/calendar-model.js` — in `eventDetailTitle`, add `case 'bloods':` next to weight/composition/measurements returning `'Body'`. In `eventBrief`:

```js
case 'bloods': {
  const n = Array.isArray(record.markers) ? record.markers.length : 0;
  return n ? `${n} marker${n === 1 ? '' : 's'}` : '';
}
```

- [ ] **Step 4: Run tests**

Run: `node --test tests/unit/search.test.js tests/unit/calendar-model.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add js/core/search.js js/app/calendar-model.js tests/unit/search.test.js tests/unit/calendar-model.test.js
git commit -m "$(cat <<'EOF'
feat: show bloods lab visits as Body on the calendar

Pathology days should share the existing body marker, not a new
calendar category.
EOF
)"
```

---

### Task 6: Chart-kit reference-band scale

**Files:**
- Modify: `js/app/chart-kit/area-line.js`
- Modify: `tests/unit/chart-kit-area-line.test.js`

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/chart-kit-area-line.test.js`:

```js
test('buildAreaLine padded domain folds includeValues into min/max', () => {
  const chart = buildAreaLine(
    [
      { date: '2026-01-01', value: 42 },
      { date: '2026-02-01', value: 44 }
    ],
    { yDomain: 'padded', height: 168, width: 320, includeValues: [5, 40] }
  );
  assert.equal(typeof chart.scaleY, 'function');
  const yLow = chart.scaleY(5);
  const yHigh = chart.scaleY(40);
  const yPoint = chart.points[0].y;
  assert.ok(yLow > yPoint, 'ref_low below the series should sit lower on screen (higher y)');
  assert.ok(Math.abs(yHigh - chart.scaleY(40)) < 0.01);
  const without = buildAreaLine(
    [
      { date: '2026-01-01', value: 42 },
      { date: '2026-02-01', value: 44 }
    ],
    { yDomain: 'padded', height: 168, width: 320 }
  );
  const spreadWith = Math.abs(chart.scaleY(5) - chart.scaleY(44));
  const spreadWithout = Math.abs(without.scaleY(42) - without.scaleY(44));
  assert.ok(spreadWith > spreadWithout, 'including the reference floor should widen the domain');
});

test('buildAreaLine returns scaleY for the default domain too', () => {
  const chart = buildAreaLine(
    [
      { date: '2026-01-01', value: 0 },
      { date: '2026-01-02', value: 100 }
    ],
    { height: 120, width: 320, padding: 12 }
  );
  assert.equal(chart.scaleY(100), 12);
  assert.equal(chart.scaleY(0), 108);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/unit/chart-kit-area-line.test.js`

Expected: FAIL — `scaleY` undefined / includeValues ignored.

- [ ] **Step 3: Implement**

In `buildAreaLine` options, add `includeValues = []`.

When `yDomain === 'padded'`:

```js
const extras = (includeValues ?? []).map(Number).filter(Number.isFinite);
const finite = [...values.filter(Number.isFinite), ...extras];
const rawMin = finite.length ? Math.min(...finite) : 0;
const rawMax = finite.length ? Math.max(...finite) : 1;
```

Always attach `scaleY` to `result`.

Empty series: still return a `scaleY` that maps via a 0–1 fallback so callers don't throw.

- [ ] **Step 4: Run tests**

Run: `node --test tests/unit/chart-kit-area-line.test.js`

Expected: PASS. Existing padded/zero-based tests still pass.

- [ ] **Step 5: Commit**

```bash
git add js/app/chart-kit/area-line.js tests/unit/chart-kit-area-line.test.js
git commit -m "$(cat <<'EOF'
feat: scale bloods charts to include reference-range bounds

Keep the band visible even when every reading sits inside the range
by folding ref_low/ref_high into the padded y-domain.
EOF
)"
```

---

### Task 7: Bloods view model

**Files:**
- Create: `js/app/bloods-model.js`
- Create: `tests/unit/bloods-model.test.js`

Reuse `rangeWindow`, `seriesInRange`, `DEFAULT_BODY_RANGE`, `BODY_RANGES` from `body-model.js`. Reuse `getTrend` from `js/core/trends.js`.

- [ ] **Step 1: Write the failing test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBloodsModel } from '../../js/app/bloods-model.js';

function bloodsEvent(date, markers) {
  return { record: { type: 'bloods', date, markers } };
}

test('buildBloodsModel groups markers by canonical key and category', () => {
  const model = buildBloodsModel({
    date: '2026-08-13',
    range: 'five_year',
    events: [
      bloodsEvent('2026-02-01', [
        { key: 'alt', label: 'ALT', category: 'Liver Function', value: 50, unit: 'U/L', ref_low: 5, ref_high: 40, status: 'High' }
      ]),
      bloodsEvent('2026-05-19', [
        { key: 'alt', label: 'ALT', category: 'Liver Function', value: 42, unit: 'U/L', ref_low: null, ref_high: 40, status: 'High' },
        { key: 'crp', label: 'CRP', category: 'Inflammation Markers', value: 2.2, unit: 'mg/L', ref_low: 0, ref_high: 5, status: 'Normal' },
        { key: 'hepb_sag', label: 'HepB sAg', category: 'Liver Function', value: null, unit: 'Qualitative', ref_low: null, ref_high: null, status: null }
      ])
    ]
  });
  assert.equal(model.range, 'five_year');
  const liver = model.categories.find(c => c.id === 'Liver Function');
  assert.ok(liver);
  const alt = liver.markers.find(m => m.key === 'alt');
  assert.equal(alt.latest.value, 42);
  assert.equal(alt.latest.status, 'High');
  assert.equal(alt.latest.ref_high, 40);
  assert.equal(alt.latest.unit, 'U/L');
  assert.ok(alt.series.length >= 2);
  assert.equal(alt.qualitative, false);
  assert.ok(alt.lastDelta < 0);
  const hep = liver.markers.find(m => m.key === 'hepb_sag');
  assert.equal(hep.qualitative, true);
  assert.equal(hep.series.length, 0);
  assert.equal(hep.latest.status, null);
});

test('buildBloodsModel flagged list is latest High/Low only, most recent first', () => {
  const model = buildBloodsModel({
    date: '2026-08-13',
    range: 'five_year',
    events: [
      bloodsEvent('2026-02-01', [
        { key: 'vit_d', label: 'Vitamin D', category: 'Vitamins & Nutrients', value: 58, unit: 'nmol/L', status: 'Normal', ref_low: 50, ref_high: 140 }
      ]),
      bloodsEvent('2026-05-22', [
        { key: 'alt', label: 'ALT', category: 'Liver Function', value: 44, unit: 'U/L', status: 'High', ref_low: 5, ref_high: 40 },
        { key: 'vit_d', label: 'Vitamin D', category: 'Vitamins & Nutrients', value: 48, unit: 'nmol/L', status: 'Low', ref_low: 50, ref_high: 140 },
        { key: 'crp', label: 'CRP', category: 'Inflammation Markers', value: 2.4, unit: 'mg/L', status: 'Normal', ref_low: 0, ref_high: 5 }
      ])
    ]
  });
  assert.deepEqual(model.flagged.map(f => f.key), ['alt', 'vit_d']);
  assert.equal(model.flagged[0].status, 'High');
  assert.equal(model.flagged[1].status, 'Low');
  assert.ok(!model.flagged.some(f => f.key === 'crp'));
});

test('buildBloodsModel empty flagged when everything is Normal', () => {
  const model = buildBloodsModel({
    date: '2026-08-13',
    events: [
      bloodsEvent('2026-05-19', [
        { key: 'crp', label: 'CRP', category: 'Inflammation Markers', value: 2.2, unit: 'mg/L', status: 'Normal', ref_low: 0, ref_high: 5 }
      ])
    ]
  });
  assert.deepEqual(model.flagged, []);
});

test('buildBloodsModel ignores non-bloods events and requires a date', () => {
  assert.throws(() => buildBloodsModel({ events: [] }), /date/i);
  const model = buildBloodsModel({
    date: '2026-08-13',
    events: [{ record: { type: 'weight', date: '2026-08-01', weight_kg: 88 } }]
  });
  assert.equal(model.categories.length, 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/unit/bloods-model.test.js`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `js/app/bloods-model.js`**

Category order (Notion schema option order):

```js
export const BLOODS_CATEGORY_ORDER = [
  'Inflammation Markers',
  'Iron Studies',
  'Liver Function',
  'Full Blood Count',
  'Lipid Studies',
  'Vitamins & Nutrients',
  'Biochemistry/Electrolytes',
  'Thyroid',
  'Glucose/Diabetes'
];
```

Algorithm:

1. Filter `events` where `record.type === 'bloods'` and `Array.isArray(record.markers)`.
2. Flatten to observations `{ date, key, label, category, value, unit, ref_low, ref_high, status }`.
3. Group by `key`. For each key:
   - Sort observations by date.
   - Latest = last observation.
   - `qualitative` if `latest.value == null` OR `latest.unit === 'Qualitative'`.
   - Numeric series = observations with finite `value`.
   - Windowed `series` via `seriesInRange(numericObs mapped to {date,value}, bounds, range)` — skip for qualitative.
   - `lastDelta` / `overallDelta` from numeric observations (not range-windowed — same as tape: full history).
   - Colour: High → good is `down`; Low → good is `up`; otherwise `neutral` (never paint Normal movement red).
   ```js
   function bloodsColour(delta, good) {
     if (delta == null || !Number.isFinite(delta) || delta === 0 || !good) return 'neutral';
     const direction = delta > 0 ? 'up' : 'down';
     return good === direction ? 'green' : 'red';
   }
   ```
   - `secondaryTrend` via `getTrend` with `{ field: 'value', unit: latest.unit || '', good, thresholds: [0.2, 0.5, 1.0] }` when two numeric points exist.
4. Group markers into categories; sort categories by `BLOODS_CATEGORY_ORDER`, unknown categories alphabetically after.
5. `flagged`: markers whose latest `status` is `'High'` or `'Low'` (not merely `!== 'Normal'` — null qualitative status is not a flag). Sort by latest date descending, then High before Low, then label.
6. Return `{ date, range, rangeLabel, flagged, categories: [{ id, title, markers, hasFlags }] }`.

`hasFlags` is true when any marker in the category is in `flagged` — used to default that accordion open.

- [ ] **Step 4: Run tests**

Run: `node --test tests/unit/bloods-model.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add js/app/bloods-model.js tests/unit/bloods-model.test.js
git commit -m "$(cat <<'EOF'
feat: build the bloods dashboard model from lab-visit events

Flatten per-date marker arrays into trend series and a flagged
strip so the renderer stays presentational.
EOF
)"
```

---

### Task 8: Render bloods dashboard

**Files:**
- Create: `js/app/render-bloods.js`
- Create: `tests/unit/render-bloods.test.js`
- Modify: `css/app.css`

Visual rules from the spec + existing Body tokens:

- `createElement` / `createElementNS` only — no `innerHTML`.
- Flags strip chips reuse `.body-tape-chip`. High → `data-colour="red"`. Low → `data-colour="low"` (new, `--high-sea` orange). Empty: "Everything in range."
- Categories: collapsible `.metric-card.body-section`. Categories with `hasFlags` start open; others start collapsed.
- Marker cards: label, latest value+unit, Last/Overall chips (copy `trendChip`/`formatDeltaChip` locally — do not import from `render-body.js`, it does not export them). Qualitative: status text only, no SVG.
- Chart: `viewBox 0 0 320 168`, `buildAreaLine(series, { height: 168, yDomain: 'padded', includeValues: [ref_low, ref_high].filter(Number.isFinite) })`. Draw `<rect data-role="ref-band">` **behind** area/line using `scaleY(ref_high)` as y and `scaleY(ref_low) - scaleY(ref_high)` as height. If only `ref_high`, skip the band (or draw from plot bottom to high — skip; band requires both bounds **or** one bound: if only high, y=scaleY(high) to plot bottom is misleading. Require both finite bounds to draw a band).
- Back link `#bloods-back` is in HTML (Task 9); renderer should not destroy it. Range buttons live in HTML like Body.

- [ ] **Step 1: Write the failing test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderBloods } from '../../js/app/render-bloods.js';

function el(tag = 'div') {
  const node = {
    tagName: String(tag).toUpperCase(),
    className: '',
    textContent: '',
    hidden: false,
    dataset: {},
    children: [],
    attributes: {},
    listeners: [],
    style: {},
    append(...nodes) { this.children.push(...nodes); },
    replaceChildren(...nodes) { this.children = [...nodes]; },
    addEventListener(type, fn) { this.listeners.push([type, fn]); },
    setAttribute(name, value) { this.attributes[name] = String(value); },
    getAttribute(name) { return this.attributes[name]; },
    removeAttribute(name) {
      delete this.attributes[name];
      if (name === 'hidden') this.hidden = false;
    },
    querySelector(selector) {
      return find(this, selector);
    },
    querySelectorAll(selector) {
      const out = [];
      walk(this, child => {
        if (matches(child, selector)) out.push(child);
      });
      return out;
    }
  };
  return node;
}

function walk(node, visit) {
  for (const child of node.children ?? []) {
    visit(child);
    walk(child, visit);
  }
}

function matches(node, selector) {
  if (selector.startsWith('.')) return String(node.className).split(/\s+/).includes(selector.slice(1));
  if (selector.startsWith('#')) return node.id === selector.slice(1);
  if (selector.startsWith('[data-role=')) {
    const role = selector.slice(12, -2);
    return node.attributes?.['data-role'] === role || node.dataset?.role === role;
  }
  return false;
}

function find(node, selector) {
  let found = null;
  walk(node, child => { if (!found && matches(child, selector)) found = child; });
  return found;
}

function fakeRoot() {
  const dashboard = el('section');
  dashboard.id = 'body-bloods-dashboard';
  dashboard.hidden = true;
  const flags = el('div');
  flags.id = 'bloods-flags';
  const host = el('div');
  host.id = 'bloods-sections';
  const ranges = el('div');
  ranges.id = 'bloods-range-control';
  ranges.querySelectorAll = () => [];
  const ns = (uri, tag) => {
    const node = el(tag);
    node.namespaceURI = uri;
    return node;
  };
  return {
    createElement: tag => el(tag),
    createElementNS: ns,
    querySelector(selector) {
      if (selector === '#body-bloods-dashboard') return dashboard;
      if (selector === '#bloods-flags') return flags;
      if (selector === '#bloods-sections') return host;
      if (selector === '#bloods-range-control') return ranges;
      return null;
    },
    _dashboard: dashboard,
    _flags: flags,
    _host: host
  };
}

const model = {
  date: '2026-08-13',
  range: 'six_month',
  rangeLabel: '6M',
  flagged: [
    { key: 'alt', label: 'ALT', value: 42, unit: 'U/L', status: 'High', date: '2026-05-19' }
  ],
  categories: [
    {
      id: 'Liver Function',
      title: 'Liver Function',
      hasFlags: true,
      markers: [
        {
          key: 'alt',
          label: 'ALT',
          qualitative: false,
          latest: { date: '2026-05-19', value: 42, unit: 'U/L', status: 'High', ref_low: 5, ref_high: 40 },
          series: [{ date: '2026-02-01', value: 50 }, { date: '2026-05-19', value: 42 }],
          lastDelta: -8,
          overallDelta: -8,
          lastColour: 'green',
          overallColour: 'green'
        },
        {
          key: 'hepb_sag',
          label: 'HepB sAg',
          qualitative: true,
          latest: { date: '2026-05-19', value: null, unit: 'Qualitative', status: null },
          series: [],
          lastDelta: null,
          overallDelta: null,
          lastColour: 'neutral',
          overallColour: 'neutral'
        }
      ]
    }
  ]
};

test('renderBloods paints flags, category cards, and a ref-band chart', () => {
  const root = fakeRoot();
  renderBloods(root, model);
  assert.equal(root._dashboard.hidden, false);
  assert.ok(root._flags.children.length >= 1);
  const chip = root._flags.children[0];
  assert.match(chip.className, /body-tape-chip/);
  assert.equal(chip.dataset.colour, 'red');
  assert.match(chip.textContent, /ALT/);
  const section = root._host.children[0];
  assert.match(section.className, /body-section/);
  const chart = section.querySelector('.body-chart');
  assert.ok(chart);
  const band = chart.querySelector('[data-role="ref-band"]');
  assert.ok(band);
});

test('renderBloods empty flags copy and skips charts for qualitative markers', () => {
  const root = fakeRoot();
  renderBloods(root, {
    ...model,
    flagged: [],
    categories: [{
      id: 'Liver Function',
      title: 'Liver Function',
      hasFlags: false,
      markers: [model.categories[0].markers[1]]
    }]
  });
  assert.match(root._flags.textContent, /Everything in range/);
  assert.equal(root._host.querySelector('.body-chart'), null);
});
```

Keep the fake-root helpers as small as needed for the assertions. If `querySelector` matching is too brittle, assert via `children` walks (`host.children[0].children...`) instead of a mini-DOM.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/unit/render-bloods.test.js`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement renderer + CSS**

`renderBloods(root, model, { onRangeChange } = {})`:

- Bind `#bloods-range-control` the same way `renderBody` binds `#body-range-control` (`dataset.bound`, `data-bloods-range` buttons).
- Fill `#bloods-flags` and `#bloods-sections`.
- Unhide `#body-bloods-dashboard`.

CSS additions at the end of the body block in `css/app.css`:

```css
.body-tape-chip[data-colour="low"] {
  color: var(--high-sea);
  background: rgba(246, 134, 32, 0.14);
}
.bloods-flags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin: 0 0 1rem;
}
.bloods-flag {
  cursor: default;
}
.bloods-sections {
  display: grid;
  gap: var(--space-stack);
}
.bloods-back {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  margin: 0 0 0.85rem;
  padding: 0;
  border: 0;
  background: none;
  color: var(--wave);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}
.bloods-category__toggle {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  cursor: pointer;
  min-height: 44px;
}
.bloods-category.is-collapsed .bloods-category__body {
  display: none;
}
.body-chart [data-role="ref-band"] {
  fill: rgba(55, 111, 183, 0.12);
}
```

Toggle button must have `aria-expanded`. Do not use `innerHTML`.

- [ ] **Step 4: Run tests**

Run: `node --test tests/unit/render-bloods.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add js/app/render-bloods.js tests/unit/render-bloods.test.js css/app.css
git commit -m "$(cat <<'EOF'
feat: render the bloods flags strip and marker charts

Match Body tape-chip language and draw reference-range bands behind
each trend so out-of-range readings are obvious at a glance.
EOF
)"
```

---

### Task 9: Hidden section, View bloods tile, controller

**Files:**
- Modify: `index.html`
- Modify: `js/app/render-body.js`
- Modify: `js/app/app-controller.js`
- Modify: `js/app/main.js`
- Modify: `tests/unit/app-controller.test.js` (add `#body-bloods-dashboard` to FakeDocument if visibility tests exist; otherwise add a focused render-body test for the tile)

**Do not** add a `[data-section="body-bloods"]` button to `.rail-nav` or `.more-sheet__nav`.

- [ ] **Step 1: Write the failing tests**

Add `tests/unit/render-body-bloods-link.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderBody } from '../../js/app/render-body.js';

function el() {
  return {
    className: '',
    textContent: '',
    dataset: {},
    children: [],
    hidden: false,
    attributes: {},
    listeners: [],
    append(...nodes) { this.children.push(...nodes); },
    replaceChildren(...nodes) { this.children = [...nodes]; },
    addEventListener(type, fn) { this.listeners.push([type, fn]); },
    setAttribute(name, value) { this.attributes[name] = String(value); },
    removeAttribute(name) { delete this.attributes[name]; if (name === 'hidden') this.hidden = false; },
    querySelectorAll() { return []; }
  };
}

test('renderBody appends a View bloods control that calls onViewBloods', () => {
  const dashboard = el();
  dashboard.id = 'body-dashboard';
  const host = el();
  host.id = 'body-sections';
  const ranges = el();
  ranges.id = 'body-range-control';
  ranges.querySelectorAll = () => [];
  const root = {
    createElement: () => el(),
    querySelector(selector) {
      if (selector === '#body-dashboard') return dashboard;
      if (selector === '#body-sections') return host;
      if (selector === '#body-range-control') return ranges;
      return null;
    }
  };
  let viewed = false;
  const emptySection = { id: 'scale', title: 'Scale', metrics: [] };
  renderBody(root, {
    range: 'six_month',
    scale: { ...emptySection, id: 'scale' },
    composition: { ...emptySection, id: 'composition' },
    tape: { ...emptySection, id: 'tape' }
  }, { onViewBloods: () => { viewed = true; } });
  const tile = host.children.at(-1);
  assert.match(tile.textContent, /View bloods/);
  const button = tile.listeners?.length
    ? tile
    : tile.children.find(child => child.listeners?.length);
  button.listeners[0][1]();
  assert.equal(viewed, true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/unit/render-body-bloods-link.test.js`

Expected: FAIL — no View bloods control.

- [ ] **Step 3: Implement HTML, tile, controller, main**

**index.html** — immediately after `</section>` of `#body-dashboard`, add:

```html
        <section id="body-bloods-dashboard" class="dashboard" aria-labelledby="bloods-heading" hidden>
          <button type="button" id="bloods-back" class="bloods-back">← Body</button>
          <div class="section-heading">
            <div>
              <p class="section-kicker">Body</p>
              <h2 id="bloods-heading">Bloods</h2>
            </div>
          </div>
          <div id="bloods-range-control" class="body-range" role="group" aria-label="Bloods time range">
            <button type="button" data-bloods-range="monthly" aria-pressed="false">Month</button>
            <button type="button" data-bloods-range="six_month" class="is-active" aria-pressed="true">6M</button>
            <button type="button" data-bloods-range="year" aria-pressed="false">Year</button>
            <button type="button" data-bloods-range="five_year" aria-pressed="false">5Y</button>
          </div>
          <div id="bloods-flags" class="bloods-flags" aria-live="polite"></div>
          <div id="bloods-sections" class="bloods-sections"></div>
        </section>
```

No floating chat button on this sub-page (read-only; Sara write path is out of scope).

**render-body.js** — after appending tape, append a tile:

```js
    host.append(bloodsTile(root, onViewBloods));
```

Add `onViewBloods` to `renderBody` options. `bloodsTile` is a `button.metric-card` (or `article` + inner button) with text `View bloods →`. Min height 44px.

**app-controller.js**:
- Destructure `buildBloodsModel`, `renderBloods`.
- `setSectionVisibility`: `body.hidden = name !== 'body'`; query `#body-bloods-dashboard` and hide unless `name === 'body-bloods'`.
- `showSection`: if `name === 'body-bloods'` call `renderBloodsSection()`. Body nav stays active when `name === 'body-bloods'`:
  ```js
  const active = section === name
    || (section === 'more' && MORE_SECTIONS.has(name))
    || (section === 'body' && name === 'body-bloods');
  ```
- `SECTION_TITLES['body-bloods'] = { eyebrow: 'Body', title: 'Bloods' };`
- Do **not** add `body-bloods` to `MORE_SECTIONS` (that would light up the More tab).
- `renderBodySection` passes `onViewBloods: () => showSection('body-bloods')`.
- `renderBloodsSection` uses the same `bodyRange` so the two pages stay in sync.
- Bind `#bloods-back` click → `showSection('body')` once at controller setup (alongside other binds).
- On live refresh, if `currentSection === 'body-bloods'` re-render bloods (next to the existing `if (currentSection === 'body')` branch).

**main.js** — import and pass `buildBloodsModel`, `renderBloods`.

Add `#body-bloods-dashboard` to the FakeDocument map in `tests/unit/app-controller.test.js` so existing visibility tests don't break if they query it (optional; `querySelector` returns null today).

- [ ] **Step 4: Run tests**

Run: `node --test tests/unit/render-body-bloods-link.test.js tests/unit/app-controller.test.js tests/unit/render-bloods.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add index.html js/app/render-body.js js/app/app-controller.js js/app/main.js tests/unit/render-body-bloods-link.test.js tests/unit/app-controller.test.js
git commit -m "$(cat <<'EOF'
feat: open bloods as a hidden Body sub-page

Keep it off the rail and More sheet so Body stays the only way in,
with a back link to return.
EOF
)"
```

---

### Task 10: Service worker cache bump

**Files:**
- Modify: `service-worker.js`

- [ ] **Step 1: No unit test** (shell file list is not covered by tests). Manually confirm the two new modules are listed.

- [ ] **Step 2: Edit**

- `CACHE_NAME`: `life-hub-shell-v68` → `life-hub-shell-v69`
- Insert `'js/app/bloods-model.js'` after `'js/app/body-model.js'`
- Insert `'js/app/render-bloods.js'` after `'js/app/render-body.js'`

- [ ] **Step 3: Run the full unit suite**

Run: `npm test`

Expected: all unit + integration tests PASS.

- [ ] **Step 4: Commit**

```bash
git add service-worker.js
git commit -m "$(cat <<'EOF'
chore: cache the bloods dashboard shell files

Bump the shell cache so installed PWAs pick up the new sub-page
modules on next load.
EOF
)"
```

---

### Task 11: Import real Notion export into life-hub-data (operator step)

Not committed to `life-hub`. After the importer lands, Adam (or this session if `../life-hub-data` is present) runs:

```bash
node scripts/import-notion-history.mjs \
  --bloods-csv "/path/to/Blood-Test-Tracker-All-Results.csv" \
  --out "../life-hub-data"
```

Expected: files at `data/body/YYYY/MM/YYYY-MM-DD-bloods.md` for each of the 12 test dates (2019-07-19 → 2026-05-22). Re-run is idempotent; `--force` overwrites notion_import files but still skips `source: chat`.

If this session has Notion MCP, it may write a **temporary** CSV under `/tmp` from a SQL dump to run the importer — do not add that CSV to git.

Watch importer stderr for `Unmapped blood marker:` warnings; add any stragglers to `MARKER_ALIASES` (Task 1) and commit that follow-up.

---

## Self-review

**Spec coverage**

| Spec requirement | Task |
|------------------|------|
| `type: bloods` records, one file per date, markers array | 2, 3, 4 |
| Qualitative markers not charted | 7, 8 |
| Per-result ref_low/ref_high | 2, 7, 8 |
| `canonicalMarkerKey` + warn on unmapped | 1 |
| `--bloods-csv` + parseBloodsCsv + writeEvent skip chat | 2, 3 |
| `buildBloodsModel` series + flags + trends | 7 |
| `render-bloods` Body visual language, no innerHTML | 8 |
| Hidden sub-page, View bloods tile only, back link | 9 |
| `includeValues` + returned `scaleY` + band `<rect>` | 6, 8 |
| Low status uses `--high-sea` | 8 |
| Tests listed in spec | 1, 2, 6, 7, 8 |
| No chat write UI / no lab-report replica | out of scope |
| Files actually load (`validateRecord`) | 4 (spec gap, required) |
| Calendar body dots | 5 (spec gap, required for existing calendar) |

**Placeholder scan:** none.

**Type consistency:** `buildBloodsModel`, `renderBloods`, `canonicalMarkerKey`, `parseBloodsCsv`, section name `body-bloods`, slug `bloods`, range keys identical to `BODY_RANGES`.
