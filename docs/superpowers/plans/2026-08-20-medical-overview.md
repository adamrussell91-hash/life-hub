# Medical Overview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. REQUIRED: superpowers:test-driven-development — no production code without a failing test first.

**Goal:** Add a Medical Overview sub-page of Body: Notion CSV import, left-spine timeline, right-hand sheet, episode bands, density zoom, lab visits that reuse Bloods charts, Add/Edit via confirm, and Sara as the full medical agent.

**Architecture:** Mirror Bloods. `type: "medical"` events live under `data/body/YYYY/MM/YYYY-MM-DD-medical-<slug>.md`. `parseMedicalCsv` feeds `import-notion-history.mjs --medical-csv`. `buildMedicalModel` filters/orders/bands/joins labs. `render-medical.js` draws the timeline + sheet. Hidden section `body-medical` is reached only from a Body tile. Writes use existing `/api/chat/confirm` with `log_entry` type `medical`. Sara protocol and Central Node compact writes update in the same ship.

**Tech Stack:** Vanilla JS PWA, existing Bloods chart-kit, Node `scripts/*.mjs`, `node:test`, js-yaml frontmatter, hub filter primitives (`.hub-search`, `.hub-filter`, `.hub-chips`).

**Spec:** `docs/superpowers/specs/2026-08-20-medical-overview-design.md`

**Deploy:** Local commits only; do not push unless Adam asks. Do not commit Adam’s full private CSV or imported markdown. Tests use a small synthetic sample. Runtime never reads `~/Downloads`.

---

## File map

| File | Responsibility |
|------|----------------|
| `scripts/lib/medical-csv-import.mjs` | Parse Notion Medical Records CSV → `{ slug, notes, record }[]` |
| `scripts/import-notion-history.mjs` | `--medical-csv` flag; write via `writeEvent` / `eventPath('body', date, slug)` |
| `js/core/validate.js` | `validateMedical` + register `medical` |
| `js/core/records.js` | `TYPE_DOMAINS.medical = 'body'` |
| `js/core/search.js` | `CATEGORY.medical = 'body'` |
| `js/app/calendar-model.js` | Title/brief for medical events |
| `js/app/medical-model.js` | Filters, today marker, episode bands, lab join, density, payloads |
| `js/app/render-medical.js` | Toolbar, timeline, sheet (read + write), no innerHTML |
| `js/app/medical-controller.js` | Selection, filters, density, add/edit confirm |
| `js/app/render-bloods.js` | Export `renderBloodsSnapshot(root, host, model)` for the sheet |
| `js/app/render-body.js` | Second tile `View medical →` |
| `js/app/app-controller.js` | `body-medical` section + header |
| `js/app/main.js` | Wire model / render / controller |
| `index.html` | `#body-medical-dashboard` (no rail button) |
| `css/app.css` | Timeline, sheet, lanes, bands — kit tokens only |
| `netlify/functions/_shared/chat-schema.mjs` | `medical` in RECORD_TYPES + DOMAIN_PROPERTIES + slug |
| `netlify/functions/_shared/agent-directory.mjs` | Sara `recordTypes` includes `medical` |
| `netlify/functions/_shared/persona.mjs` | Sara may log medical |
| `netlify/functions/_shared/persist-log.mjs` | Describe medical logs |
| `js/core/central-node-write.js` | Medical branch for Health/Flags |
| `config/sara-protocol.md` | Owns Medical Overview |
| `central-node.md` | Constraints pointer: history lives in Life Hub |
| `service-worker.js` | Bump cache; add new JS files |
| Tests | CSV, validate, model, render, schema, protocol, Body tile |

---

### Task 1: CSV parser

**Files:**
- Create: `scripts/lib/medical-csv-import.mjs`
- Create: `tests/unit/medical-csv-import.test.js`

- [ ] **Step 1: Write the failing test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMedicalCsv } from '../../scripts/lib/medical-csv-import.mjs';

const SAMPLE = `Record Name,Person,Date,Record Type,Doctor/Provider,Location,Notes,Follow-up Date,Cost,Insurance Claim Status,Files,Meeting Name,Notes and Follow Up
"Follow Up - Eye Exam (https://app.notion.com/p/x)",Adam,11 April 2028,,,,,,,Not Started,,,
Gastroenterologist Follow-up (Dr Chris Keily),Adam,27 May 2026 15:45 (GMT+10),Appointment,Dr Chris Keily,Northern Gastroenterology,Review Entocort.,,,Not Started,,,
Therapy Session with Kate Semple,Adam,8 July 2026 09:00 (GMT+10),Appointment,Kate Semple,"26 Ridge St, North Sydney NSW Australia",,,A$160.00,Not Started,,,
Dental Check-up — Forum Dentistry,Adam,18 April 2026,Appointment,Dr Homer Kefaladelis,"1 Sergeants Ln, St Leonards",,,A$268.00,Complete,Medical%20Records/x.pdf,,
Head Cold,Adam,22 May 2026 → 28 May 2026,Consultation,Self-reported,,Onset Friday.,,,Not Started,,,
Stelara Infusion,Adam,2 July 2026,Prescription,Dr Chris Keily,,Biologic started.,27 August 2026,,Not Started,,,
EP Session 8,Adam,30 April 2026,Appointment,Veronica Morlotti,Movement 101,,,A$196.00,Complete,,,
EP Session 8,Adam,30 April 2026,Appointment,Veronica Morlotti,Movement 101,,,A$196.00,Complete,,,
Telehealth GP,Adam,10 February 2026,Appointment,Dr Nerida McDonald,Walker Street Doctors (Telehealth),,,,Not Applicable,,,
Unknown Visit,Adam,1 January 2020,Wizardry,Merlin,,,,,Not Started,,,
`;

test('parseMedicalCsv skips Follow Up relation stubs with empty record type', () => {
  const events = parseMedicalCsv(SAMPLE);
  assert.equal(events.some(e => /Follow Up/.test(e.record.title)), false);
});

test('parseMedicalCsv parses datetime, cost, telehealth, range, and lane', () => {
  const events = parseMedicalCsv(SAMPLE);
  const gastro = events.find(e => e.record.date === '2026-05-27');
  assert.equal(gastro.record.type, 'medical');
  assert.equal(gastro.record.time, '15:45');
  assert.equal(gastro.record.record_type, 'Appointment');
  assert.equal(gastro.record.lane, 'appointment');
  assert.equal(gastro.record.location_kind, 'place');
  assert.equal(gastro.slug.startsWith('medical-'), true);

  const therapy = events.find(e => e.record.date === '2026-07-08');
  assert.equal(therapy.record.lane, 'therapy');
  assert.equal(therapy.record.cost_aud, 160);
  assert.equal(therapy.record.location_kind, 'place');

  const dental = events.find(e => e.record.date === '2026-04-18');
  assert.equal(dental.record.lane, 'dental');
  assert.equal(dental.notes.includes('Medical%20Records'), false);

  const cold = events.find(e => e.record.date === '2026-05-22');
  assert.equal(cold.record.date_end, '2026-05-28');

  const stelara = events.find(e => e.record.date === '2026-07-02');
  assert.equal(stelara.record.lane, 'prescription');
  assert.equal(stelara.record.follow_up_date, '2026-08-27');

  const tele = events.find(e => e.record.date === '2026-02-10');
  assert.equal(tele.record.location_kind, 'telehealth');
});

test('parseMedicalCsv dedupes same date+title+provider and coerces unknown types', () => {
  const events = parseMedicalCsv(SAMPLE);
  assert.equal(events.filter(e => e.record.date === '2026-04-30').length, 1);
  const wizard = events.find(e => e.record.date === '2020-01-01');
  assert.equal(wizard.record.record_type, 'Appointment');
  assert.equal(wizard.record.lane, 'appointment');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/unit/medical-csv-import.test.js`  
Expected: FAIL (module not found)

- [ ] **Step 3: Implement `parseMedicalCsv`**

Export `parseMedicalCsv(text)`. Reuse CSV split logic from bloods (copy locally — do not import private helpers). Skip rows whose name starts with `Follow Up -` and `Record Type` is empty. Parse dates with the bloods day-first / ISO logic; for `A → B` set `date` / `date_end`. Parse `HH:MM` from the date cell. Cost: strip `A$` and commas. `location_kind`: telehealth if location/title matches `/telehealth|zoom|video|phone/i`. Lane map per spec. Slug: `medical-` + slugified title, uniqued with `-2`. Dedup by `date|normalised title|provider`. Unknown type → warn, coerce Appointment. Concatenate Notes + Meeting Name + Notes and Follow Up into `notes`. Ignore Files and Person. `source: notion_import`, `schema_version: 1`, `id: notion-medical-${date}-${slug-without-medical-prefix}`. `episode: null`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/unit/medical-csv-import.test.js`  
Expected: PASS

---

### Task 2: Validate + path domain

**Files:**
- Modify: `js/core/validate.js`
- Modify: `js/core/records.js`
- Modify: `js/core/search.js`
- Create: `tests/unit/medical-validate.test.js`

- [ ] **Step 1: Failing tests** — valid medical record passes; missing title fails; unknown `record_type` fails; `episode` must be null or `{ id, title }`; `TYPE_DOMAINS.medical === 'body'`.

- [ ] **Step 2: Run** `node --test tests/unit/medical-validate.test.js` — FAIL

- [ ] **Step 3: Add `MEDICAL_RECORD_TYPES` and `MEDICAL_LANES` constants, `validateMedical`, register in `VALIDATORS`. `TYPE_DOMAINS.medical = 'body'`. `CATEGORY.medical = 'body'`.**

- [ ] **Step 4: PASS** `node --test tests/unit/medical-validate.test.js`

---

### Task 3: Import flag

**Files:**
- Modify: `scripts/import-notion-history.mjs`
- Modify: `tests/unit/import-notion-bloods-flag.test.js` (add medical cases) or create `tests/unit/import-notion-medical-flag.test.js`

- [ ] **Step 1: Test `parseArgs` reads `--medical-csv`.**

- [ ] **Step 2: FAIL**

- [ ] **Step 3: Add flag; when set, `parseMedicalCsv` + `writeEvent` via `eventPath('body', date, slug)` like bloods. Include `--medical-csv` in the “nothing to do” guard.**

- [ ] **Step 4: PASS**

---

### Task 4: Model

**Files:**
- Create: `js/app/medical-model.js`
- Create: `tests/unit/medical-model.test.js`

`buildMedicalModel({ events, query, recordType, provider, density, selectedId, today })`.

Density default `'months'`. Filter AND. Sort: future dates descending above today, past descending below? Spec: “Future above a Today marker, past below.” Order: future soonest-first (ascending toward today), then today marker, then past newest-first.

Wait — “time flows down. Future above Today, past below.” So top of list = furthest future? Or nearest future?

Clinical “what’s next” wants nearest future just above Today. Spec: default scroll puts Today in the upper third. So:

1. Future visits, soonest first (next appointment nearest the Today marker)
2. Today marker
3. Past visits, newest first

Lab join: if `events` has `type === 'bloods'` for that date, attach `{ inRange, total, flags }` from a lightweight count of that visit’s markers (status Normal vs High/Low). Also attach `bloodsDate` for the sheet.

Episode bands: walk visible visits in display order; wrap contiguous runs sharing `episode.id` when length ≥ 2. Output `items: [{ kind: 'today' } | { kind: 'band', episode, visits } | { kind: 'visit', visit }]`.

Also export `mapsUrl(location)`, `buildMedicalPayload(fields)` for confirm (`candidate.type = 'medical'`, slug from `buildMedicalSlug`).

- [ ] Tests: filter AND; skip non-medical; future-above-today order; band only for 2+ contiguous; lab join; density does not drop records; `mapsUrl` encodes place.

---

### Task 5: Body tile

**Files:**
- Modify: `js/app/render-body.js`
- Modify: `tests/unit/render-body-bloods-link.test.js`

Append a `View medical →` tile after bloods. New hook `onViewMedical`. Wrap both tiles in `.body-medical-links` so they sit side by side.

---

### Task 6: Render timeline + sheet (read)

**Files:**
- Create: `js/app/render-medical.js`
- Create: `tests/unit/render-medical.test.js`
- Modify: `index.html`
- Modify: `css/app.css`

Markup in `#body-medical-dashboard`:

- back button `#medical-back`
- toolbar: search `#medical-search` (`.hub-search`), type filter host, provider filter host, density range `#medical-density`, Today `#medical-today`, Add `#medical-add`
- chips `#medical-chips`
- layout `.medical-layout`: timeline `#medical-timeline` + sheet `#medical-sheet`
- sheet close `#medical-sheet-close`

`renderMedical(root, model, hooks)` uses `createElement`. Cards: title, date, provider. `data-lane`. Selected class `is-selected`, no height jump. Lab chips when `visit.lab`. Band wrapper with episode title. Sheet: fields per spec; Maps `<a>` only when `location_kind === 'place'`. Write mode later.

iPhone: CSS — below `40rem`, sheet is a popup (fixed overlay, close X). Mac: CSS grid two columns.

Density: `input type="range" min="0" max="2"` mapped weeks/months/years; class on timeline `is-density-weeks|months|years` changes gap.

---

### Task 7: Wire section

**Files:**
- Modify: `js/app/app-controller.js`
- Modify: `js/app/main.js`
- Modify: `service-worker.js` (CACHE_NAME v96 + new files)
- Create: `js/app/medical-controller.js` (selection/filters/density first; writes in Task 9)

Mirror `body-bloods`: `SECTION_TITLES['body-medical'] = { eyebrow: 'History', title: 'Medical Overview' }`. Keep Body nav active. Back → body.

---

### Task 8: Bloods snapshot in sheet

**Files:**
- Modify: `js/app/render-bloods.js` — export `renderBloodsSnapshot(root, host, model)`
- Modify: `js/app/render-medical.js`
- Modify: `tests/unit/render-medical.test.js`
- Modify: `tests/unit/render-bloods.test.js` if needed

Extract category drawing so a host element can receive the same instruments. Medical sheet, when `visit.lab`, calls `buildBloodsModel({ events, date: visit.date, range: 'five_year' })` then `renderBloodsSnapshot`.

---

### Task 9: Add / Edit confirm

**Files:**
- Modify: `js/app/medical-model.js` — `buildMedicalPayload`
- Modify: `js/app/medical-controller.js`
- Modify: `js/app/render-medical.js` — write-mode fields
- Create: `tests/unit/medical-controller.test.js` (mirror body-controller / skincare-controller)

Add opens empty sheet. Edit opens populated. Save → `chatApi.confirm({ candidate, slug, overwrite: true })`. Candidate `type: 'medical'`, fields match schema, `notes` from overview textarea.

---

### Task 10: Chat schema + Sara tools

**Files:**
- Modify: `netlify/functions/_shared/chat-schema.mjs`
- Modify: `netlify/functions/_shared/agent-directory.mjs`
- Modify: `netlify/functions/_shared/persona.mjs`
- Modify: `netlify/functions/_shared/persist-log.mjs`
- Modify: `tests/unit/chat-schema.test.js`
- Modify: `tests/unit/agent-directory.test.js`

Add `medical` to `RECORD_TYPES` and `DOMAIN_PROPERTIES`:

```
title, record_type (enum), lane (enum), date_end, provider, location, location_kind (enum), follow_up_date, cost_aud, insurance_status, episode ({ id, title })
```

`notes` stay on the log_entry top-level `notes` param (record body), not in fields.

`buildRecordSlug`: if medical, `medical-${slugify(title)}-${time}` so two visits that day do not collide.

Sara `recordTypes`: `['weight', 'composition', 'measurements', 'medical']`.

Persona: Sara may propose medical create/update/group/brief.

`describeRecordForLog`: `Logged medical visit: ${title}.`

---

### Task 11: Central Node + protocol

**Files:**
- Modify: `js/core/central-node-write.js`
- Modify: `tests/unit/central-node-write.test.js` (or existing CN tests)
- Modify: `config/sara-protocol.md`
- Modify: `tests/unit/load-sara-protocol.test.js`
- Modify: `central-node.md` Constraints intro URL line

Medical write: Health/Flags from notes verdict when present; Recent Action line; no visit essay. Protocol: Life Hub is the medical record; confirm required; not Notion. Constraints: “Full medical history lives in Life Hub Medical Overview.” Keep other Notion URLs.

---

### Task 12: Calendar brief

**Files:**
- Modify: `js/app/calendar-model.js`
- Modify: matching calendar unit test if present

`eventTitle` for medical → record.title or 'Medical'. `eventBrief` → provider or record_type.

---

## Spec coverage

| Spec item | Task |
|-----------|------|
| CSV import, skip stubs/files, lanes, cost, ranges | 1, 3 |
| validate + body domain path | 2 |
| Model filters, bands, today, lab join, density | 4 |
| Body tile | 5 |
| Timeline, sheet, filters chrome, iPhone popup | 6, 7 |
| Bloods snapshot | 8 |
| Add/Edit confirm | 9 |
| Sara log_entry medical | 10 |
| CN + protocol | 11 |
| Calendar | 12 |
| Maps link only | 4, 6 |
| No paper files | 1 |
| Not on rail | 7 |

## Notes for the engineer

- TDD on every task. No `innerHTML` in renderers.
- Kit tokens only. Filter controls use `.hub-search` / `.hub-filter` / `.hub-chips`. No view pills.
- Do not add Medical or Bloods to `.rail-nav`.
- `prefers-reduced-motion: reduce` → no transform on the sheet.
- Language: new UI copy never uses stool/faecal/fecal.
- Import command (local data sibling, not this repo):

```
node scripts/import-notion-history.mjs --medical-csv "/Users/adamrussell/Downloads/Private & Shared 2/Medical Records 22cf794f847680229ea6dc5e1c9f26e2.csv" --out ../life-hub-data
```

Only run that when Adam asks; tests must not require the private file.
