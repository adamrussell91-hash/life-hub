# Bloods dashboard v2 — design spec

**Date:** 2026-08-15  
**Status:** Approved for implementation  
**Supersedes (dashboard UI only):** `2026-08-13-bloods-dashboard-design.md`  
**Does not supersede:** import pipeline, `type: bloods` records, marker canonical keys, or the Body → Bloods entry point.

## Goal

Rebuild the Body → Bloods tab so it is readable, contained, and clinically scannable. Same data. New information architecture, chart types that match sparse vs repeated markers, a Pulse/brick/copper language, in-app explainers, and a quiet appointment sheet.

## Locked decisions

| Topic | Choice |
|---|---|
| Scope | Full brief, including flare overlay from Mind diary tags |
| Layout | Hybrid: category headers, mixed-span packing inside each section |
| Chrome colour | Pulse `#8C2A2A` on filters, back link, headers, links |
| In-range ring | Quiet green (only place green appears) |
| Marker status | Brick `#7A3B32` Normal, copper `#C2661C` Low, High Sea `#F68620` High |
| First reading | Neutral grey, outside the red/orange family |
| HDL-class markers | Invert colour: High → brick, Low → copper/High Sea. Text still High/Low |
| Explainers | In-app catalog keyed by marker. No Notion, ever |
| Appointment summary | Overlay sheet, very subtle entry (header text control). Print/copy on the sheet |
| Next due | Omit |
| Code shape | Split by job: model, explainers, chart helpers, render |
| Duplicate heading | Global topbar only. No local Body/Bloods kicker |

## Out of scope

- Notion sync, Notion fields, or importer changes
- Rail-nav entry (still Body tile only)
- Write/log path for new bloods
- Invented composite health scores

---

## Page architecture

`#body-bloods-dashboard` remains the section. Topbar: Labs / Bloods (existing `SECTION_TITLES`). Back: `← Body`. Range: Month / 6M / Year / 5Y. Selected range uses Pulse, scoped to this dashboard.

**Header row:** back, range, quiet “Summary for appointment” text button (`bloods-appointment-open`).

**Signal strip**

1. Markers in range — ring via `applyRingTarget`, e.g. “24 of 28 in range”. Count of latest numeric markers whose `status === 'Normal'` (after invert list does **not** change this count; invert is display-only). Green stroke on the ring only.
2. Flags this test — existing chips. Tap scrolls to `#bloods-marker-{key}` and highlights briefly.
3. Last collected — latest `bloods` record date. If older than 90 days vs `model.date`, add a quiet stale caption. Lab name if `record.lab` exists; otherwise omit.

No Next due card.

**Category sections**

- Sort: `hasFlags` first, then `BLOODS_CATEGORY_ORDER`.
- Default: flagged categories expanded; fully-normal collapsed.
- Header (Depth): title, grouping note from explainer catalog, “N markers, all normal” / “N markers, 1 high”.
- Summary strip: one compact range-position bar per numeric marker; tap jumps to that card.
- Expand/collapse all + case-insensitive marker name filter above the list.
- Iron Studies: combined multi-series chart (normalised 0–1 against each marker’s ref band) spanning the section, then individual cards.
- Liver Function: combined chart when ALT, AST, and GGT all have at least one numeric point.
- Inside the section: CSS grid, 2 columns from 720px up, 1 column below. Combined charts and markers with `span: 'wide'` occupy two columns. Do not auto-span from history length.

**Metric card**

1. Name + info button (opens drawer)
2. Value + unit (tabular nums)
3. Status pill using `statusTone`
4. Trend chips only when a previous numeric observation exists. If previous date is >90 days before latest, label includes the prior date (`↓12 since 14 Feb`).
5. Chart (see chart types)
6. Last tested date, small, bottom right

Empty category: “Not yet tested”, never a zero line.

---

## Colour

Scoped under `#body-bloods-dashboard`:

| Token | Hex | Use |
|---|---|---|
| `--bloods-pulse` | `#8C2A2A` | Active range, back, links, default chart chrome |
| `--bloods-normal` | `#7A3B32` | Normal pill / line |
| `--bloods-low` | `#C2661C` | Low pill / line |
| `--bloods-high` | `#F68620` | High pill / line / flag chips |
| `--bloods-first` | `#9aa3ad` | First reading |
| `--bloods-in-range` | existing muted green / `#7a9f72` | Signal-strip ring only |
| Ref band | `rgba(140, 42, 42, 0.10)` | Behind line charts, always Pulse tint |

`data-status` on charts: `normal` | `low` | `high` | `first`.

**Favourable-high keys** (invert tone): `hdl`, `hdl_cholesterol`. Extend the array later; do not special-case in render.

---

## Chart types

| Condition | Chart |
|---|---|
| Qualitative or no numeric latest | No chart; status/empty copy |
| Glucose/Diabetes + `hba1c` / `hba1c_ngsp` / `fasting_glucose` / `glucose_fasting` | Zoned threshold (normal / at-risk / diabetic). Zones in model, labelled on the SVG |
| Numeric series length ≥ 3 | Line + ref band (`viewBox 0 0 320 168`), line colour from `statusTone` |
| Else | Range position bar: ref_low–ref_high track, dot at current value. If value is outside, clamp the dot to the end and show overflow in the label |

**Overflow:** `.line-chart.body-chart` aspect-ratio `320 / 168` globally (delete the `#body-dashboard`-only override). Bloods charts `overflow: hidden` on the card/chart host.

**Scrub:** pointer/touch on line charts shows value + date for the nearest point. No compare-two-points in v1 if it blocks shipping; include a simple two-click diff on the same line when cheap (second tap pins a delta callout).

**Flare overlay:** toggle on Inflammation and Iron only, default off. Diary events whose `tags` include `flare` or `ibd` (case-insensitive) become vertical ticks on line charts in range. Tooltip: diary date + first tag. Missing Mind data → toggle hidden.

---

## Explainers

`js/app/bloods-explainers.js` exports `explainerFor(key)` and `categoryNote(categoryId)`.

Drawer (desktop: popover; ≤720px: bottom sheet): What it measures, Why tracked here, If high, If low, related markers as jump links, “General information, not medical advice.”

Seed copy: the marker texts from the 2026-08-15 Bloods design plan (Inflammation through Glucose). Category grouping notes as specified there.

Optional `notes` on a `bloods` record or marker surfaces in the appointment sheet only, not as explainer override.

---

## Model

`buildBloodsModel({ events, date, range })` still the entry. Add:

- `inRangeCount`, `markerCount` (numeric latest only)
- `lastCollected` `{ date, lab, stale }`
- `flareMarks` `{ date, label }[]`
- per marker: `chartKind`, `statusTone`, `span` (`'narrow'` default), `previousDate`, `lastDeltaLabel`
- per category: `summary`, `note`, `collapsed`, `combined` (null or `{ kind: 'iron'|'liver', series: [...] }`)
- `appointmentLines`: flagged markers plus markers with a non-null lastDelta whose colour is `'red'` (unfavourable move), as plain sentences. Include `notes` when present.

Pass diary events into the same `events` list (already on `latestResult.events`).

---

## Modules

| File | Job |
|---|---|
| `js/app/bloods-model.js` | Aggregation, sort, tones, chartKind, appointment, flare marks |
| `js/app/bloods-explainers.js` | Catalog |
| `js/app/bloods-charts.js` | Range bar, combined normalised lines, zoned chart, scrub overlay |
| `js/app/render-bloods.js` | DOM |
| `css/app.css` | Pulse scope, strip, grid, drawer, sheet |
| `index.html` | Strip hosts, filter, sheet dialog, search |
| `js/app/app-controller.js` | Unchanged contract except render still `buildBloodsModel` + `renderBloods` |
| `service-worker.js` | Cache bump + new module URLs |

No innerHTML. `root.createElement` / SVG NS as today.

---

## Testing

- Model: flag-first sort, in-range counts, HDL invert, first-reading tone, 90-day delta label, chartKind thresholds, iron combined series, flare tag filter, appointment lines, empty thyroid.
- Explainers: known key, unknown key fallback, category note.
- Charts: range bar position, clamp outside range, zoned bands, combined normalisation.
- Render: strip ring + flags, collapsed normal categories, Pulse-active range is a class not Wave globally, drawer open, quiet appointment control exists, flag chip scroll target, search filters cards.
- Heading: `#body-bloods-dashboard` has no `.section-kicker` (add `tests/unit/page-headings.test.js` if missing on this branch).

## Definition of done

Desktop 2-up, mobile 1-up, no chart paint outside cards, one title, signal strip filled, explainers from catalog, appointment sheet ignorable, flare toggle off by default. `npm test` and `npm run validate:fixtures` pass. Do not push.
