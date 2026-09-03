# Teaching Hub — Clinical Glass Dashboard & Create Flows Design

**Date:** 2026-08-09  
**Status:** Approved for implementation planning  
**Product name:** Teaching Hub  
**Slice:** Clinical Glass teacher dashboard redesign + full create persistence + clickable overall Scope timeline + class rail  
**Depends on:** Teacher rail + section shells; Home schedule panels; Classes + scheduled lessons; Scope & Sequence per-subject timeline; Clinical Glass tokens (`src/design/tokens.css`)  
**Style source:** Clinical Glass Dashboard Style Guide (maritime navy, Warm White, Wave, High Sea)

## Goal

Make the teacher workspace look and behave like a Clinical Glass product: spacious tiled glass surfaces, larger type, correct Wave tab / High Sea create colours, a functional Home dashboard (hero clock + dated week calendar + class tiles), a rail that opens class pages, an overall year Scope timeline with click-through everywhere, and **full create** (persist via API, then open the new item) contextual to the current section.

## Broader roadmap (context only)

1. Prior slices (rail shells, home lists, classes/schedule, scope editor, resources) — shipped in varying fidelity  
2. **This slice** — Clinical Glass redesign of Home / Rail / Scope landing / Create + type & tab polish  
3. Follow-ups — Month/Timeline Home views; denser student polish; print/AI unchanged

## Decisions

| Topic | Choice |
|-------|--------|
| Approach | Shared glass shell + create APIs (not visual-only, not full shell rewrite) |
| Home layout | Spacious A+B+classes: hero clock → signal tiles → dated week calendar → class tiles |
| Clock | Hero time (large tabular time + full date); title below; Create top-right — not a jammed header chip |
| Calendar | Week columns with weekday **and** day number; month label; Today / prev / next; lesson cards clickable |
| Home tabs | Week is the shipped view; Month + Timeline tabs may render as Wave/idle but full Month/Timeline canvases are **out of scope** unless already trivial |
| Create (Home) | Menu: Class, Unit, Lesson, Scope & Sequence |
| Create (section) | Classes → New class only; Scope → New scope; Units → New unit; Lessons → New lesson; Rail → + New class |
| Create depth | Full persist (POST) + refresh curriculum + navigate to new item |
| Rail | Replace Year→Subject→Unit→Lesson tree with **Your classes** list; click → `/classes/:id` |
| Scope landing | Overall year timeline of all scopes (spacious rows); not subject-list-first |
| Click-through | Every entity on calendars, timelines, tiles, and lists navigates to that entity |
| Visual system | Clinical Glass tokens; Wave selected tabs; High Sea primary create; larger type scale |
| Student / print / AI | Out of scope except harmless token cascade |

## Out of scope

- Full Month and Timeline Home calendar implementations (tabs may exist as placeholders)  
- Rebuilding student published views, print, or AI panel for glass  
- Drag-from-library onto overall Scope Gantt (per-subject editor keeps existing drag/resize)  
- Creating Years / Subjects from Create (class/unit/lesson/scope only)  
- Replacing the per-subject Scope editor — only polish + keep clickable  

---

## 1. Visual system (Clinical Glass)

### Colour (existing tokens)

| Token | Hex | Use |
|-------|-----|-----|
| Depth | `#0A1536` | Rail, high-importance headings |
| Marine | `#142B51` | Structural dark surfaces |
| Orca | `#424860` | Secondary / inactive nav |
| Shallow | `#A7ABB9` | Dividers, muted meta |
| Wave | `#376FB7` | Selected tabs, links, standard actions |
| High Sea | `#F68620` | Primary Create / decisive actions |
| Shore | `#EAE7DA` | Quiet panels / empty |
| Sand | `#F0CFAC` | Warm callouts |
| Warm White | `#FAF8F2` | Page canvas |

### Glass surfaces

- Warm White panel at ~60–70% opacity  
- Fine Marine/Wave-tinted border  
- Broad cool low-opacity shadow (`--shadow`)  
- Blur only where the panel overlaps colour/imagery  
- Dense content may use more opaque glass  

### Typography scale (teacher UI)

| Role | Target |
|------|--------|
| Page title | ~1.75–2rem |
| Hero clock time | ~2–2.5rem, tabular nums |
| Section headings | ~1.35–1.5rem |
| Signal tile values | ~2rem |
| Body / calendar card title | ≥1rem / ≥0.95rem |
| Meta / eyebrows | ≥0.75rem with stronger weight where needed |

Implement via token updates in `tokens.css` and teacher layout rules in `app.css` so Home, Classes, Scope, and lists all enlarge together.

### Tabs & buttons

- **Selected tab:** solid Wave background, white label  
- **Idle tab:** translucent bordered glass, Orca/ink text  
- **Primary Create:** High Sea solid  
- **Secondary:** translucent bordered glass  

### Shared UI building blocks

- Glass panel / tile helpers (CSS classes or small DOM builders)  
- `SectionTabs` with Wave selected state  
- `CreateControl` (button or menu driven by section context)  
- `CreateModal` (glass dialog, fields, error region, Save)  
- Live `DashboardClock` (updates at least every minute)  

---

## 2. Home (`/`)

### Structure (top → bottom)

1. **Header band**
   - **Hero clock:** large local time + full date (e.g. Sunday 9 August 2026)  
   - Page title **Teaching Dashboard** under the clock  
   - **+ Create ▾** (High Sea) top-right → Home create menu  
2. **Signal tiles** (glass row)
   - Today (count)  
   - Unpublished (count, High Sea emphasis when &gt; 0)  
   - Dashed **+ Create new** (opens same Home create menu)  
3. **Week calendar** (glass panel)
   - Header: month/year label, prev / Today / next, Wave **Week** tab (Month/Timeline idle placeholders)  
   - Columns: Mon–Fri (or Mon–Sun if data warrants); each shows weekday name + **day number**  
   - Lesson cards: time, class/year tags, title; **click → `/lessons/:lessonId`**  
   - Day column “+” opens Home Create menu (same as header Create) — not a separate schedule-only flow in this slice  
4. **Your classes**
   - Glass class tiles → **`/classes/:id`**  
   - Affordance for + New class (same as create class)  

### Clock behaviour

- Wall-clock local time by default  
- When `schedule_anchor_date` / demo anchor is active for “today” highlighting on the calendar, the **date line may still show wall-clock date**; calendar “today” column follows the existing schedule-today resolver so tests stay stable  

### Data

Reuse curriculum `scheduled_lessons`, `classes`, lesson summaries (`updated_at` / `published_at`) and existing home-model selectors where useful. Replace stacked list-only `renderTeacherHome` with the tiled layout above.

### Empty states

Calm Shore/glass copy: nothing scheduled today/week; no classes yet with Create CTA.

---

## 3. Rail + Classes

### Rail

- Keep primary nav: Home, Classes, Scope & Sequences, Units, Lessons, Resource Library  
- **Remove** curriculum expand tree (Year → Subject → Unit → Lesson) from the rail  
- Add **Your classes** list under primary nav:
  - One row per class (code or title)  
  - Click → `navigate('/classes/:id')` — **does not expand**  
  - Active highlight when current route is that class  
  - **+ New class** under the list  

Lesson editing remains reachable via Lessons section, Home calendar, and class page schedule — not the old tree.

### Classes section (`/classes`)

- Glass tile grid of classes (year/subject eyebrow, title, open affordance)  
- **+ Create class** only (High Sea) — not the full Home menu  
- Click tile → class page  

### Class page (`/classes/:id`)

- Keep schedule, homepage editor, units behaviour from prior slice  
- Apply glass + larger type polish so it matches the dashboard  

---

## 4. Scope & Sequences

### Landing (`/scope-sequences`)

Replace subject list with **Overall Scope & Sequence** year timeline:

- Title + academic year + **+ Create scope**  
- One glass panel: term bands across the top; one spacious row per subject/scope  
- **Spacing:** row track ≥64px; ≥20px gap between rows; ~180px label column; bar labels ≥14px; generous panel padding  
- Today marker (High Sea) on the axis when resolvable  

### Click-through

| Target | Navigates to |
|--------|----------------|
| Subject/scope row label | `/scope-sequences/:subjectId` (existing editor) |
| Unit bar | `/units/:unitId` |
| Note bar | `/scope-sequences/:subjectId` with that note selected in the inspector |

### Per-subject editor

Unchanged in capability (week grid, drag/resize, inspector). Visual polish: glass, larger type, keep items clickable (unit → unit page, etc.).

### Data

Aggregate `curriculum.scope_sequences` + subjects + units for the overall Gantt. Map week indices to horizontal positions using existing timeline-week helpers where possible.

---

## 5. Create flows (full persistence)

### Contextual Create matrix

| Location | Create control |
|----------|----------------|
| Home | Menu: Class, Unit, Lesson, Scope & Sequence |
| Classes (+ rail + New class) | New class |
| Scope & Sequences | New scope & sequence |
| Units | New unit |
| Lessons | New lesson |

### New APIs (mock-api + Netlify)

| Method | Path | Result |
|--------|------|--------|
| `POST` | `/api/classes` | Creates Class; returns class; client → `/classes/:id` |
| `POST` | `/api/units` | Creates Unit; → `/units/:id` |
| `POST` | `/api/lessons` | Creates draft Lesson; → `/lessons/:id` |
| `POST` | `/api/scope-sequences` | Creates ScopeSequence for a chosen `subject_id`; always sets that subject’s `scope_id` to the new scope; → subject scope editor |

Request bodies: minimal required fields validated with existing Zod schemas (title, foreign keys such as `year_id` / `subject_id` / `unit_id`, defaults for homepage/status/timestamps/`schema_version`).

After success: invalidate/refresh curriculum cache, then `navigate` to the new entity.

### UI

Glass modal per entity type; High Sea primary submit; inline API errors; Cancel closes without save.

### Seed / tests

Extend mock store + unit/integration tests for each POST; UI tests for Create opening and navigation where the suite pattern already covers teacher flows.

---

## 6. Click-through rule (global)

Any teaching entity rendered on Home calendars, Scope timelines, class tiles, rail class rows, or index lists must be an intentional navigation target to that entity’s route. No decorative-only cards for classes, lessons, units, or scope items.

---

## 7. Architecture notes

- Prefer extending existing modules (`home.ts`, `rail.ts` / `nav.ts`, `scope-sequences.ts`, `app.css`, `tokens.css`) over a framework migration  
- Shared create helpers under e.g. `src/teacher/create/` (menu, modal, API clients)  
- Curriculum refresh path already used after schedule/class patches should be reused after creates  
- Preserve auth on all new POSTs  

### Error handling

- Modal: field/API errors visible without toast-only failure  
- Timeline/Home: failed navigation targets should not appear as clickable if IDs are missing  

### Testing

- Unit: create API handlers; home render structure (clock, dated columns, class tiles); rail lists classes and navigates; overall scope rows/bars  
- Update snapshots/selectors in existing teacher home / rail / scope tests  

---

## Success criteria

1. Home reads as Clinical Glass: hero clock, signal tiles, dated week calendar, class tiles, large type, Wave/High Sea controls  
2. Teacher can create class/unit/lesson/scope from the appropriate Create control and land on the new item  
3. Rail class rows open the class page (no expand tree)  
4. Scope landing shows a spacious overall year timeline; bars and labels navigate correctly  
5. Calendar and timeline entities are clickable end-to-end in mock (and Netlify parity)  

## Non-goals reminder

Month/Timeline Home canvases, student redesign, and Year/Subject create are deferred.
