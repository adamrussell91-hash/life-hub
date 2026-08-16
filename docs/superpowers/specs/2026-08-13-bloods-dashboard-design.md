# Bloods dashboard — design spec

Status: approved for implementation (Cursor). Not to be built in this session.

## Goal

Add a bloods/pathology dashboard as a hidden sub-page of the Body tab. Shows historical blood test results (Notion "Blood Test Tracker" database) with trend charts, reference-range bands, and out-of-range flags — visual language matches the existing Body tape-measurement cards.

## Scope

- Read-only display. No manual quick-log form (Adam will write new results via the AI chat protocol later, same `chatApi.confirm` path Scale/Composition already use — not built now).
- Reached only via a "View bloods →" link/tile on the existing Body page. Not added to `.rail-nav` or the mobile `.more-sheet__nav`.
- Source data: Notion database `collection://7245730b-cdc5-4c8d-8e9a-de8bd412b29d` ("🩸 Blood Test Tracker"). 298 rows currently, 12 test dates (2019-07-19 → 2026-05-22), categories: Inflammation Markers, Iron Studies, Liver Function, Full Blood Count, Lipid Studies, Vitamins & Nutrients, Biochemistry/Electrolytes, Thyroid, Glucose/Diabetes.

## Data model

New record `type: "bloods"`, one file per test date at `data/body/YYYY/MM/YYYY-MM-DD-bloods.md`, same frontmatter convention as existing body records (`schema_version`, `id`, `date`, `time`, `created_at`, `updated_at`, `source: "notion_import"`). Unlike `weight`/`composition` (flat fields), bloods needs a `markers` array — nested-array frontmatter already has precedent in this repo (fitness `exercises: [{...}]`), and `renderFrontmatter()` already serializes any field via `JSON.stringify`, so no new writer logic is needed.

```yaml
---
schema_version: 1
id: "notion-bloods-2026-05-19"
type: "bloods"
date: "2026-05-19"
time: "12:00"
created_at: "2026-05-19T12:00:00+10:00"
updated_at: "2026-05-19T12:00:00+10:00"
source: "notion_import"
markers: [{"key":"haemoglobin","label":"Haemoglobin","category":"Full Blood Count","value":151,"unit":"g/L","ref_low":130,"ref_high":180,"status":"Normal"},{"key":"alt","label":"ALT","category":"Liver Function","value":42,"unit":"U/L","ref_low":null,"ref_high":40,"status":"High"}]
---
```

Qualitative results (serology antibodies with no numeric value, e.g. Hep B/C markers) carry `value: null`, `unit: "Qualitative"`, and a text `status` if present — these render as a status-only line, never fed into a chart.

`ref_low`/`ref_high` are stored per-result, not hardcoded in code — the same marker's reference range legitimately differs between pathology providers/visits.

## Marker name normalization

Notion marker names drift across lab visits: `Gamma GT` (consistent name, but ref range varies by lab), `Adj. Calcium` vs `Adjusted Calcium`, `Alk. Phosphatase` vs `Alkaline Phosphatase`, `Fasting Glucose` vs `Glucose Fasting`, `CRP` vs `C-Reactive Protein (CRP)` vs `C-Reactive Protein`, `Bilirubin` vs `Bilirubin Total`. Note `HbA1c (NGSP)` (%) and `HbA1c (IFCC)` (mmol/mol) are genuinely different units of the same test, not duplicates — do not merge these into one key.

Add `scripts/lib/bloods-marker-map.mjs` exporting `canonicalMarkerKey(rawName)`. Seed it with the aliases above (and any others found once the full 298-row export is reviewed). Any marker name not in the map should **not** be silently slugified into a new key — log a warning (`console.warn`) so unmapped names get triaged and added to the map, keeping trend grouping correct. Fall back to a deterministic slug only after warning, so the importer never hard-fails on new data.

## Import pipeline

Extend `scripts/import-notion-history.mjs` with a `--bloods-csv <path>` flag (mirrors the existing `--body-csv`/`--body-history-csv` flags), backed by new `scripts/lib/bloods-csv-import.mjs` exporting `parseBloodsCsv(text) -> events[]` (same `{slug, notes, record}` shape as `parseBodyHistoryCsv`). Groups CSV rows by Test Date, builds one `bloods` record per date via `eventPath('body', dateKey, 'bloods')`, reuses the existing `writeEvent()`/`renderFrontmatter()` helpers already in that script (including the "skip if existing file has `source: chat`" overwrite guard — preserves future AI-logged entries).

CSV columns expected (matches the Notion "All Results" view export): `Marker, Category, Test Date, Value, Unit, Status, Ref Low, Ref High, Notes`. Adam re-exports this CSV from Notion whenever new results land and re-runs the import — same workflow as the existing body-history import. Claude will hand Cursor an initial CSV export (already pulled via Notion MCP) as a working fixture so the importer is testable immediately.

## App layer

- `js/app/bloods-model.js` — `buildBloodsModel({ events, date, range })`. Filters `events` by `record.type === 'bloods'`, flattens all records' `markers` into one series per canonical marker key, computes range-windowed series (reuse `seriesInRange`/`aggregateSeries` from `body-model.js` if practical, or a local equivalent), and per-marker latest value + `getTrend()`-based Last/Overall trend chips (same shape as `tapeMetricModel` in `body-model.js`). Also computes a flat "flagged" list: every marker whose latest `status !== 'Normal'`, across all categories, most recent first.
- `js/app/render-bloods.js` — mirrors `render-body.js`'s `tapeFigure`/`tapeLabel`/`trendChip` pattern for structure and DOM-building style (`root.createElement`, no innerHTML).
- No new controller — no writes in this scope. Wire the new section into `app-controller.js` alongside the existing `showSection`/`setSectionVisibility` mechanism as `body-bloods` (or similar), but do **not** add a `[data-section="body-bloods"]` button to `.rail-nav` or `.more-sheet__nav`. The only entry point is a click handler on the new "View bloods →" tile inside `render-body.js`'s output, calling the same `showSection('body-bloods')` used elsewhere. Include a visible back-link on the bloods page to return to Body.

## Chart-kit extension

`buildAreaLine` (`js/app/chart-kit/area-line.js`) already computes an internal `scaleY` and supports a single `guideValue` → `guideY`. Extend it minimally:
- Accept an optional `includeValues: number[]` — extra values (i.e. `ref_low`, `ref_high`) folded into the `padded` yDomain min/max calculation, so the chart auto-scales to always show the reference band even when all points sit inside it.
- Expose `scaleY` on the returned object (it's already computed, just not returned) so callers can convert `ref_low`/`ref_high` to y-coordinates for a band `<rect>` using the exact same scale as the line/area.

No new chart-kit module needed — a reference-range band is a `<rect>` drawn behind the existing area/line paths in `render-bloods.js`, using `scaleY(ref_low)`/`scaleY(ref_high)` for its y/height.

## Visual design

**Superseded for the read surface (16 Aug 2026).** Chart and chrome rules now live in Life Hub Design → Charts and `2026-08-16-bloods-visual-restyle-design.md`. Do not implement the maroon status colours or `.body-tape-chip` flags from the original pass.

Summary of the current look: kit semantics (`--success` in range, `--danger` High, `--high-sea-ink` Low); Wave chrome; every category expanded; one-line meaning on each tile; series charts use a sage band plus a dot on every vertex; sparse markers use a shore/sage range track with ghost previous + Wave arrow; flag pills are centred capsules, not tape chips.

## Testing

Follow existing conventions:
- `tests/unit/bloods-marker-map.test.js` — alias resolution + unmapped-name warning behaviour.
- `tests/unit/bloods-csv-import.test.js` — mirrors `tests/unit/body-history-csv-import.test.js`.
- `tests/unit/bloods-model.test.js` — mirrors `tests/unit/body-model.test.js`.
- `tests/unit/render-bloods.test.js` — mirrors relevant parts of existing render tests.
- `tests/unit/chart-kit-area-line.test.js` — extend for `includeValues`/`scaleY`.

## Out of scope (future work)

- Manual/AI-chat logging of new results (writes via `chatApi.confirm`, same as Scale/Composition) — data model already supports it (`source: "chat"` records are respected by the importer's overwrite guard), just no UI for it yet.
- Single test-date "lab report replica" panel view — not requested this round.
