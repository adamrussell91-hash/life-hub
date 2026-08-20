# Medical Overview — design spec

**Date:** 2026-08-20  
**Status:** Approved for implementation (20 Aug 2026)  
**Approach:** Mirror Bloods. Hidden Body subpage, `type: "medical"` events under the body domain, Sara owns create/edit/interpret, Central Node stays compact.

## Goal

Move medical history out of Notion into Life Hub. Body gains a sibling tile to Bloods that opens a timeline of every visit (past and future). Cards stay compact. Details open in a sheet. Labs reuse Bloods charts. Sara has full authority over the store. Paper files are not stored — text and charts only, from now on.

## Locked decisions

| Topic | Choice |
|-------|--------|
| Placement | Body tile next to Bloods → hidden `body-medical` page. Not on the rail. |
| Spine | Left line, cards to the right |
| Details (Mac) | Right-hand Medical overview sheet. Cards highlight; they never grow over neighbours |
| Details (iPhone) | Same sheet as a large popup card with close X |
| Grouping | Shared pastel band + episode title. Children stay real cards |
| Zoom | Density slider weeks → years. Default **months**. Focus **today** |
| Add | Page Add form **and** Sara chat. Both go through a confirm card. Sara has the last word |
| Sara v1 | Full medical agent: create, edit, read, group, interpret, synthesise briefs, Central Node read/write |
| Labs | On this timeline. Compact signal on the card. Interactive Bloods snapshot in the sheet |
| Maps | Street address → Google Maps search link. Telehealth/Zoom/phone stay a label. Embed later |
| Files | Do not import. Do not store PDFs, images, or receipts |
| Architecture | Mirror Bloods: importer flag, model, render, `showSection('body-medical')` |

## Out of scope

- Google Maps embed
- In-sheet PDF/image preview or R2 medical file archive
- A second chart library (labs use existing Bloods instruments)
- Adding Medical Overview or Bloods to `.rail-nav` / `.more-sheet__nav`
- Rewriting Body scale / composition / tape
- Clare Appointment Prep rebuild (she can keep reading CN This Week)

## Data model

New record `type: "medical"`. Domain stays `body` so the canonical path regex does not grow a new tree. Many visits per day, unique slug:

`data/body/YYYY/MM/YYYY-MM-DD-medical-<slug>.md`

`TYPE_DOMAINS.medical = 'body'`. Add `validateMedical` in `js/core/validate.js`.

```yaml
---
schema_version: 1
id: "notion-medical-2026-05-27-gastro-keily"
type: "medical"
date: "2026-05-27"
date_end: null
time: "15:45"
created_at: "2026-05-27T15:45:00+10:00"
updated_at: "2026-05-27T15:45:00+10:00"
source: "notion_import"
title: "Gastroenterologist Follow-up"
record_type: "Appointment"
lane: "appointment"
provider: "Dr Chris Keily"
location: "Northern Gastroenterology"
location_kind: "place"
notes: "Review Entocort response, calprotectin results."
follow_up_date: null
cost_aud: null
insurance_status: "Not Started"
episode: null
---
```

### Field rules

| Field | Rule |
|-------|------|
| `title` | Required non-empty string |
| `record_type` | One of: `Appointment`, `Consultation`, `Lab Work`, `Test Result`, `Imaging`, `Surgery/Hospital`, `Prescription`, `Referral`, `Vaccination` |
| `lane` | Colour key. See Colour. Importer sets it; Sara may override |
| `date` | Visit start (`YYYY-MM-DD`). Required |
| `date_end` | Optional. Set when the CSV date is a range (`22 May 2026 → 28 May 2026`) |
| `time` | `HH:MM` or omit. Parsed from `6 August 2026 10:45 (GMT+10)` |
| `provider` | String or omit |
| `location` | String or omit |
| `location_kind` | `place` \| `telehealth` \| `unknown`. Telehealth if location/title matches Zoom, video, phone, telehealth |
| `notes` | Body text. Overview lives here. `Meeting Name` / `Notes and Follow Up` columns append if they add new text |
| `follow_up_date` | `YYYY-MM-DD` or omit. This is a date on the same record, not a second event |
| `cost_aud` | Finite number or omit. Parse `A$160.00` → `160` |
| `insurance_status` | String or omit |
| `episode` | `null` or `{ id, title }`. Import does not invent episodes |

No `files` field. Ignore CSV `Person` (always Adam). Ignore CSV `Files`.

### Colour (`lane`)

Kit pastels only. Connector, spine dot, and card left rule use the pastel fill; type on the card stays `--ink`.

| Lane | Pastel | How it is assigned |
|------|--------|--------------------|
| `hospital` | `--pastel-peach` | `record_type` is `Surgery/Hospital` |
| `lab` | `--pastel-sage` | `Lab Work` or `Test Result` |
| `imaging` | `--pastel-gold` | `Imaging` |
| `prescription` | `--pastel-sage` | `Prescription` (same family as lab; distinguished by `record_type` label) |
| `referral` | `--pastel-lilac` | `Referral` |
| `vaccine` | `--pastel-gold` | `Vaccination` |
| `dental` | `--pastel-gold` | Title/provider/location matches dentist, dentistry, dental |
| `therapy` | `--pastel-lilac` | Title/provider matches therapy, psychologist, psychology, Kate Semple |
| `eye` | `--pastel-blue` | Title/provider/location matches eye, optom, eyecare |
| `appointment` | `--pastel-blue` | Default for `Appointment` / `Consultation` |

Dental / therapy / eye beat the default appointment lane so a dentist visit is not the same colour as a GP. Sara can set `lane` explicitly on edit.

## Import

Extend `scripts/import-notion-history.mjs` with `--medical-csv <path>`, backed by `scripts/lib/medical-csv-import.mjs` exporting `parseMedicalCsv(text) -> events[]` in the same `{ slug, notes, record }` shape as bloods.

Source: Notion Medical Records export (the CSV Adam pointed at in Downloads). Re-export and re-run when history needs a refresh. After the first import, Life Hub is the store; Notion is not required at runtime.

Skip a row when:

- `Record Name` starts with `Follow Up -` **and** `Record Type` is empty (Notion relation stubs, not visits)
- Date cannot be parsed — `console.warn` and continue; do not abort the CSV
- Duplicate of another row in the same file: same `date` + normalised title + provider

Unknown `Record Type` on a dated row: warn, keep the row, set `record_type` to `Appointment` and `lane` to `appointment`.

Overwrite guard: if the target file exists and `source` is `chat`, skip. Sara’s edits win. All Sara / Add-form writes use `source: "chat"`, same as Body logs.

Slug: `medical-` + slugified title, uniqued with `-2` if the same day already has that slug.

Working fixture: copy a trimmed slice of the export into `tests/fixtures/` (no binary attachments). Do not commit the full private dump from `~/Downloads`.

## App layer

- `js/app/medical-model.js` — `buildMedicalModel({ events, query, recordType, provider, density, selectedId, today })`. Filters `type === 'medical'`. AND filters: keyword over title, notes, provider, location; `record_type`; provider. Density is `weeks` \| `months` \| `years`. Output: every matching visit (density does not drop records), today index, episode bands, lab join by `date` to `type === 'bloods'`. Episode bands wrap each **contiguous** run of two or more visible cards that share `episode.id`. If unrelated visits sit in the middle, the same episode title may appear as more than one band. Do not reorder out of date order.
- `js/app/render-medical.js` — `root.createElement`, no `innerHTML`. Timeline + sheet + toolbar.
- `js/app/medical-controller.js` — selection, filters, density, add/edit confirm, sheet close. Keep it small; do not dump this into `app-controller.js`.
- Wire `showSection('body-medical')` in `app-controller.js`. Entry: a second tile on Body beside Bloods (`View medical →`). Bloods tile stays. Back control on the medical page returns to Body. Page header while this section is active: **Medical Overview**.

Lab join: if a bloods record exists for that date, the model attaches `{ inRange, total, flags[] }` for the card and the full bloods model slice for the sheet. If none, the visit is still a text card; the sheet has no chart.

Reuse Bloods chart renderers inside the sheet host (`render-bloods.js` / `bloods-charts.js` extract or call with a visit-scoped model). Do not duplicate instrument drawing.

## Page surface

**Chrome:** kit tokens only. Life overlay (`data-hub="life"`). Inter. `.btn` for Add and back.

**Toolbar:** this page is a new library, not a restyle of Body. It is allowed to have search + filters because they are the product. Style them with hub filter primitives — `.hub-search`, `.hub-filter`, `.hub-chips`. Do not add view pills (timeline is the only view). Do not add this toolbar to Body, Bloods, or Mind.

- Search: keyword
- Filter: medical type (`record_type`, default All)
- Filter: practitioner (unique `provider` values plus All)
- Active filters as `.hub-chips`
- Add: `.btn.btn--primary` — opens the sheet in write mode
- Density: labelled range control, ticks Weeks / Months / Years, default Months. Not a Body range pill group. Changes vertical gap and heading frequency only
- Today: a quiet control that scrolls the timeline so the Today marker sits in the upper third

**Timeline:** left spine (`--wave` line). Cards to the right. Time flows down. **Future above a Today marker, past below.** Default scroll puts Today in the upper third. Density changes vertical gap and whether month/year labels appear (weeks: day labels; months: month labels; years: year labels). Cards never overlap. `prefers-reduced-motion`: no slide, instant sheet swap.

**Collapsed card:** title, date (and time if present), provider or location label. Lab cards also show in-range count and High/Low chips (Bloods flag styling). Selected: Wave outline / pastel fill, not a size change.

**Episode band:** wrapping container, pastel wash at ~low mix, episode title above the children. Click a child, not the band, to open that visit. Sara assigns `episode` via confirm; the Add/Edit sheet has an optional episode title field that joins an existing id or creates one.

**Sheet (Mac):** right column, larger than a timeline card. Sections in order: title; date; type + lane; provider; overview (`notes`); follow-up date; cost; insurance; location (Maps link if `location_kind === 'place'`, else plain text); lab snapshot if joined. Edit control on the sheet. Close returns to no selection (timeline still visible).

**Sheet (iPhone):** same content as a large popup card, close X, Wave focus. Backdrop dismisses.

**Add / Edit:** same sheet, write mode. Fields match the record. Save proposes `log_entry` type `medical` (create or update by `id`) on the existing `/api/chat/confirm` path and shows Sara’s confirm card. Cancel leaves the store unchanged.

**Empty:** “No visits yet” plus Add. Filter miss: “No visits match” — do not empty the spine into a fake state.

**Language:** new UI copy follows Bloods — never “stool” / “faecal” / “fecal”. Imported `notes` render as stored; Sara-authored notes follow the same language rule.

## Sara and Central Node

Rewrite `config/sara-protocol.md`:

- Delete “Life Hub is not Notion. You do not maintain Medical Records.”
- Life Hub Medical Overview is the medical record. Sara may create, edit, group, interpret, and synthesise from it.
- Still not prescribing or diagnosing. Still never invent labs, diagnoses, or medications Adam has not provided.
- Every mutation is a confirm card. No silent writes.
- After a medical write she may update Constraints (protocols, meds, diagnoses — compact, no visit essays), Today’s Status Health/Flags, This Week upcoming appointments, and one Recent Agent Action line. Cross-agent one-liners when another agent must change behaviour.
- Appointment briefs: chat (and optional `notes` append), not a CN essay.
- Constraints intro that currently points at the Notion medical database URL is replaced with: full history lives in Life Hub Medical Overview. Other Notion URLs (skincare, nutrition, exercise, recipes) stay until those domains move.

`central-node-write.js` gains a `medical` branch: Health/Flags from her `notes` verdict when present, plus the action line. Do not copy the full visit into Today’s Status.

Chat tools: medical create, update (any field including `episode` and `lane`), list/filter, and “brief for appointment on DATE” that reads matching visits + joined bloods.

## Errors

- Bad CSV date or duplicate: warn, skip row, continue
- Unknown `record_type` on a dated row: coerce to Appointment + warn
- Lab date with no bloods record: text only, no chart
- Missing provider/location: omit the line
- Maps: only `location_kind === 'place'`
- Confirm reject: store unchanged, sheet stays in write mode with the draft

## Implementation sequence

One spec, one plan, ordered so the page exists before the agent work:

1. Schema, importer, model, Body tile, read-only timeline + sheet + filters + density
2. Lab join + Bloods snapshot in the sheet
3. Add/Edit form → confirm card
4. Sara protocol, chat tools, Central Node write, Constraints pointer

Do not ship a Notion-dependent runtime. Do not split Sara’s authority into a later spec.

## Testing

- `tests/unit/medical-csv-import.test.js` — date parse, range → `date_end`, skip Follow Up stubs, skip Files, cost parse, lane inference, dedupe, unknown type warn
- `tests/unit/medical-model.test.js` — AND filters, future-above-today order, episode bands only for 2+, lab join, density does not drop records
- `tests/unit/render-medical.test.js` — Body tile opens section, card does not expand, sheet opens on select, band wraps grouped cards, lab card shows chips, Maps link only for places
- `tests/unit/validate.test.js` (or dedicated) — `type: medical` accepts the fields above; rejects unknown `record_type`
- Protocol/config test: Sara manual no longer forbids medical records; CN medical write path exists
- Manual: import fixture, open a May 2026 lab sheet and confirm Bloods charts, add via form and via Sara, iPhone popup, density weeks vs years

## Files (expected)

`js/core/validate.js`, `js/core/records.js`, `js/core/search.js`, `js/core/central-node-write.js`, `scripts/import-notion-history.mjs`, `scripts/lib/medical-csv-import.mjs`, `js/app/medical-model.js`, `js/app/render-medical.js`, `js/app/medical-controller.js`, `js/app/render-body.js`, `js/app/app-controller.js`, `index.html`, `css/app.css`, `config/sara-protocol.md`, `central-node.md` (Constraints pointer), unit tests, service worker cache bump on the same path other Life Hub UI changes use.
