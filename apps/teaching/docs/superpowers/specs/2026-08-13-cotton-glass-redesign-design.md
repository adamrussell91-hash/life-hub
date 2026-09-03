# Teaching Hub — Cotton Glass Redesign

**Date:** 2026-08-13  
**Status:** Approved for implementation planning  
**Product name:** Teaching Hub  
**Slice:** Whole-app visual redesign (cotton glass canvas + Life Hub navy rail)  
**Depends on:** Existing teacher shell, class calendar model, unit sequence, scope timeline, home dashboard, student published views  
**Inspiration (desktop mocks):** `class_home_page_multiview_v2.html`, `teaching_calendar_mock.html`, `scope_sequence_timeline_mock.html`, `seamus_heaney_thesis_lesson_mock.html`  
**Not a canvas source:** `teaching_dashboard_glassmorphism.html` (dark glass — rejected)

## Goal

Replace Clinical Glass as the product look. Teaching Hub should feel like the cotton-paper mocks: warm, spacious, frosted, navy-on-paper. Keep today’s map of pages and features. Rebuild the home dashboard, class month calendar, scope timeline, and lesson view so they read as real views, not leftover widgets. Apply the same materials to every other teacher surface and to a simpler student published look.

## Locked decisions

| Topic | Choice |
|-------|--------|
| Atmosphere | Cotton glass (warm paper). Not dark dashboard glass. |
| Rail | Life Hub navy labeled rail, ~15rem, icons + names. Not the mocks’ 86px icon-only glass rail. |
| Coverage | Whole teacher app, not tokens-only and not mocked-pages-only. |
| Student | Same paper, type, and cards. No rail. No planning chrome (view switchers, progress meters, publish, edit). |
| Editors | Soft split: same materials, compact top bar, no 42px hero. Block model unchanged. |
| Information architecture | Keep today’s routes and features. Do not add the class-page Home / Calendar / Gallery / Timeline viewbar from the class mock. |
| Calendar & timeline | Rebuild in place to mock quality: class page month calendar; scope-and-sequence year timeline. Home keeps its week strip, restyled. |
| Approach | Design system plus signature views. Not a paint-over. Not a page-by-page mock rewrite. |
| Type | Inter for UI and reading. Drop Source Sans 3 and Source Serif 4. |
| Accents | Navy is the canvas accent. Wave blue and High Sea orange live on the rail only. |
| Colour on chips | Deterministic pastel from unit id (else class id), cycling five tints. Title always present — colour is not the only signal. |
| Data / APIs | No schema, router, or API changes. |

## Out of scope

- Dark-mode canvas
- Icon-only rail
- New class-page view switcher, gallery view, or a dedicated `/calendar` route
- New features the mocks invent (weather card, “quick capture”, student tasks that are not already in the product)
- Redesigning the block data model, AI panel behaviour, print pipeline, or auth
- Visual regression / screenshot suite
- Changing Life Hub itself

---

## 1. Visual language

Closed tokens in `src/design/tokens.css`. Retune values; do not invent a parallel palette in components.

### Canvas colour

| Role | Hex | Use |
|------|-----|-----|
| Cotton | `#f5f1e9` | Page wash |
| Paper | `#fbf8f2` | Canvas base |
| Navy | `#17375e` | Headings, primary buttons, today, assessment pills |
| Navy 2 | `#244f7c` | Navy gradients |
| Ink | `#13233a` | Body text |
| Muted | `#6b7788` | Supporting copy, eyebrows |
| Line | `rgba(23, 55, 94, 0.10)` | Hairlines on paper |
| Glass | `rgba(255, 255, 255, 0.70)` | Frosted panels |

### Pastel tints (events, lesson chips, timeline blocks)

| Tint | Fill | Ink on fill |
|------|------|-------------|
| Blue | `#dceafa` | `#294c71` |
| Sage | `#dfe9e1` | `#3c5949` |
| Peach | `#f2dfd0` | `#7a5038` |
| Gold | `#f1e2b6` | `#6c581f` |
| Lilac | `#e8e0f1` | `#5d4e70` |

Map `unit.id` (fallback `class.id`) through a stable hash to index `0..4`. The same entity is the same tint on home, class calendar, and timeline.

### Rail colour (unchanged family)

Keep `--depth` `#0a1536`, `--marine` `#142b51`, `--on-dark` / `--on-dark-muted` / `--on-dark-line` / `--on-dark-hover`. `--wave` and `--high-sea` may mark active rail state or rail-only emphasis. They must not appear as canvas primary buttons or create-tile fills.

### Type

- Family: Inter (`400/500/600/700`), loaded from Google Fonts in `index.html` and `netlify/public/index.html`.
- Page titles: ~42px (`clamp` from ~32px), weight 700, tracking `-0.045em`, navy.
- Section titles: ~20px, tracking `-0.03em`.
- Body: 16px, line-height 1.5–1.65, ink / muted.
- Eyebrows: 13px, uppercase, tracking `0.08em`, muted.
- Retune `--text-*` so page titles are no longer stuck at 28px. Keep a closed scale (no ad-hoc `rem` in components).

### Surfaces

- Canvas: cotton/paper linear wash plus two faint radials (blue top-left, peach top-right). A faint 34px grid, masked out down the page, quieter than content (as in the calendar/class mocks).
- Glass panel: white ~70%, `blur(22px) saturate(115%)`, 1px near-white rim, inset top highlight, elevation comparable to `0 18px 48px rgba(39, 55, 74, 0.10)`.
- Radius: buttons/inputs ~14px; cards ~20px; page panels ~24–28px. Lift `--radius-*` accordingly; stop using 8–12px boxes as the default card.
- Motion: 150–300ms opacity/transform. Honour `prefers-reduced-motion`.

### What we stop doing

Small Clinical Glass titles, cramped padding, High Sea orange on cream chrome, tiny radius, and glass that is only a slightly transparent white box.

---

## 2. Shell

### Rail

- Grid column remains `--rail-width: 15rem`.
- Fixed/sticky navy gradient (`marine` → `depth`), labeled Life Hub items: glyph + name, 44px min height, active pill (`rgba(255,255,255,0.12)` + light border).
- Search stays in the rail. Class tree stays. Sign out stays, visually secondary.
- Primary nav items gain inline SVG glyphs (Life Hub stroke ~1.8). No new icon package.
- Mobile: rail still collapses; no new navigation model.

### Browsing / planning pages

Remove the thin `teacher-layout__context-bar` strip as the page title.

Replace with an in-canvas **page header**:

- Eyebrow (section or class context)
- Large title
- One supporting line
- Right-side actions (ghost glass + navy primary)

`shell.ts` still mounts rail + main + canvas. The page header is rendered by each section (or a small shared helper) into the canvas, not a second global bar.

### Editors

Lesson editor, homepage editor, and other authoring surfaces use a compact glass top bar: breadcrumb, title, Preview / Save (and existing editor actions). No hero. Cotton canvas and glass block frames. Block insertion, nested blocks, and column behaviour stay as they are.

---

## 3. Signature views

Same data in. Richer layout out. Every rendered entity still links to itself (existing `navigate()` + real `href` pattern).

### Home (`src/teacher/home.ts`)

Keep: clock, today count, unpublished count, create, week strip, class tiles.

Rebuild:

- Eyebrow + large “Teaching Dashboard” title. Clock sits in the left header cluster (time + full date); Create stays top-right.
- Signal tiles as glass. Unpublished uses the gold tint, not High Sea.
- A navy “today” card listing today’s scheduled lessons (title + class + time/period if present).
- Week as day columns with weekday **and** date, pastel lesson chips, click-through.
- Class tiles as frosted cards (cover thumb if set).

### Class page calendar (`src/teacher/class-calendar.ts` + `sections/classes.ts`)

Keep: cover banner, teaching-today, unit progress, unit sequence, side column (announcements / resources / custom), Edit page, View as student, Publish where it already lives.

Rebuild the month calendar to mock quality:

- Month toolbar (prev / label / next / Today)
- Monday-start grid
- Day number in a rounded square; today = navy fill; selected day = ring
- Lessons as pastel chips (title + period/time if present); overflow “+N more”
- Selected-day agenda in a right column at desktop (≥1100px); stacks under the grid below that. Not a hidden-only detail.

Unit sequence stays under the calendar as collapsible frosted disclosures (not a cramped list). Cover banner keeps scrim + gradient fallback; restyle radius/type to cotton glass.

### Scope timeline (`scope-timeline.ts`, `scope-overview.ts`)

Keep: existing timeline item model, drag/resize, add-unit picker, click-through.

Rebuild chrome to mock quality:

- Course identity strip (subject/year, counts)
- Term bands across the top
- Week ticks
- Colored unit blocks with kicker + title
- Assessment items as navy pills
- Today marker
- Summary cards under the year: unit readiness from existing date progress; next assessment from timeline items. Omit a card when its datum is missing. Do not invent fake percentages.

### Lesson view

Teacher **view** (not editor): hero with eyebrow (class / unit), large title, and a lead taken from the first text/paragraph block (omit the lead if there isn’t one). Navy side card shows unit title and scheduled date when those exist; omit the card if neither is available. Do not add a goals/description schema field. In-page section list for blocks that have headings. Blocks sit in frosted cards.

Editor remains the compact bar from Section 2.

---

## 4. The rest of the app

### Indexes

Classes, units, lessons, templates, resources, trash, and search results: frosted rows or cards, same type scale, navy primary actions, ghost glass secondary. Cover thumbs when present. Status pills use sage/gold/navy — not High Sea.

### Student published pages

`student-surface`: cotton wash, Inter, glass cards, simpler hero/banner. No teacher rail, no edit/publish, no progress meters, no view switchers. Empty states stay instructional.

### Sign-in

One frosted card on the cotton wash. Same type and navy submit. No separate brand world.

### Shared chrome pieces (CSS / small helpers, not a new package)

- `.glass-panel` recipe (retuned)
- `.page-header`
- `.btn` primary = navy; ghost = glass; High Sea removed from canvas buttons
- `.event-chip` / timeline block tints
- Rail `.nav-item` Life Hub treatment

---

## 5. Architecture

| Area | Change |
|------|--------|
| `src/design/tokens.css` | Retune closed scale (colour, type, radius, glass, elevation, rail on-dark) |
| `index.html`, `netlify/public/index.html` | Inter instead of Source Sans 3 / Source Serif 4 |
| `src/styles/app.css` | Shell, buttons, glass, page header, signature-view chrome, indexes, student, sign-in |
| `src/teacher/shell.ts` | Drop context-bar as title chrome; canvas is the header host |
| `src/teacher/rail.ts`, `primary-nav.ts` | Markup only as needed for glyphs + Life Hub item structure |
| `src/teacher/home.ts` | Rebuild layout; keep `home-model.ts` |
| `src/teacher/class-calendar.ts` | Rebuild renderer; keep `class-calendar-model.ts` |
| `src/teacher/unit-sequence.ts`, `entity-banner.ts` | Visual recut |
| Scope timeline / overview | Visual recut; keep `timeline-weeks.ts` / `timeline-drag.ts` |
| Lesson view renderer | Hero + glass blocks on view; editor chrome compact |
| Student views | Token cascade + simpler hero/cards |

No new CSS framework. No raw `px`/`rem` in components when a token exists. If a needed step is missing from the scale, add one named token — do not sprinkle literals.

Data flow, persistence, and `navigate()` behaviour are unchanged.

Errors: existing banners/`role="alert"` restyled as glass. Empty states: one sentence + the existing primary action.

---

## 6. Testing and quality

**Gate:** existing Vitest suite. Calendar maths, timeline drag, unit sequence, banners, routers, and student publish tests must still pass.

**Update, do not weaken:** render tests that assert class names or DOM shape for home, class calendar, page header, rail, and lesson view.

**Manual visual pass** (desktop, then rail collapsed at a narrow width):

1. Sign-in
2. Home
3. Class page (banner, calendar chips, selected-day agenda, unit sequence)
4. Scope timeline
5. Lesson view + lesson editor
6. One index (lessons or classes)
7. Search
8. Published student class + lesson

**Accessibility:** body text ≥ 4.5:1 on paper; white on navy buttons; visible focus rings; pastel chips include text; `prefers-reduced-motion` disables decorative motion.

---

## Success criteria

- A teacher can move through Home, a class, the month calendar, a scope timeline, a lesson view, and an editor and feel they are in one product that matches the cotton mocks — with the Life Hub rail still on the left.
- Calendar and timeline are readable at a glance (chips, today, terms, assessments), not cramped Clinical Glass widgets.
- Student pages look related but quieter.
- `npm test` passes.
- No High Sea / Wave chrome on the canvas; no Source Sans 3.

## Implementation order

1. Tokens + Inter + glass/button/page-header recipes  
2. Shell (rail Life Hub treatment, drop context-bar, page headers)  
3. Home  
4. Class calendar + unit sequence + banner  
5. Scope timeline + overview  
6. Lesson view + editor compact bar  
7. Indexes, search, sign-in, student surfaces  
8. Test updates + visual pass  

## Non-goals reminder

This slice does not ship a new calendar product, a gallery, or mock-only widgets. It changes how Teaching Hub looks and how the four signature views are laid out, using data the app already has.
