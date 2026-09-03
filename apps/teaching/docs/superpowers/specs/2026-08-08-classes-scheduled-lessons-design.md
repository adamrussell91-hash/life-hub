# Teaching Hub — Classes & Scheduled Lessons (Browse) Design

**Date:** 2026-08-08  
**Status:** Approved for implementation planning  
**Product name:** Teaching Hub  
**Slice:** Class + Scheduled Lesson models, seed, Classes browse UI, Home schedule from real records  
**Depends on:** Teacher home dashboard — shipped (Today/Week UI); teacher rail — shipped

## Goal

Introduce real **Class** and **Scheduled Lesson** data (seeded), replace the demo `home_schedule` so Home Today/Week reads scheduled lessons, and ship browsable `/classes` plus a hybrid `/classes/:classId` page with generated sections live and manual regions as placeholders.

## Broader roadmap (context only)

Chrome track complete (rail → blocks → student nav → home). This slice starts **Phase 6/7** foundations:

1. **This slice** — Class + Scheduled Lesson browse  
2. Schedule-a-unit / edit schedule tools  
3. Class homepage block editor  
4. Student Class page + prev/next from schedule order  
5. Scope & Sequence editor · Resource Library  

## Decisions

| Topic | Choice |
|-------|--------|
| Depth | Models + seed + browse; no create/edit UI |
| Class page | Hybrid: generated sections live; manual regions placeholders |
| API | Extend `GET /api/curriculum` with `classes` + `scheduled_lessons` |
| Demo `meta/home_schedule` | Remove; Home uses scheduled lessons |
| “Today” | Keep fixed `schedule_anchor_date` (seed) for stable demos/tests |
| Architecture | Zod schemas + blob keys; curriculum builders emit entities; client Home/Classes views |

## Out of scope

- Create / edit / delete Class  
- Assign Unit to Class / generate or reschedule Scheduled Lessons in UI  
- Editable Class homepage blocks (announcements, resources, custom blocks)  
- Student Class page; student prev/next from schedule  
- Wall-clock “today”; delivery-status workflows beyond seeded values  
- Class-specific lesson overrides  

## Routes

| Path | Surface |
|------|---------|
| `/classes` | Class list (replaces placeholder) |
| `/classes/:classId` | Hybrid Class page |
| `/` | Home — same stacked layout; schedule from `scheduled_lessons` |

Router gains `teacher-class` with `{ classId }`. Active section for `/classes/*` remains **Classes**.

## Data

### Class

```ts
{
  id: string;
  type: 'class';
  code: string;
  title: string;
  display_name?: string;
  academic_year: number;
  year_id: string;
  subject_id: string;
  active_unit_ids: string[];
  current_unit_id?: string;
  current_scheduled_lesson_id?: string;
  status: 'active' | 'archived' | 'trashed';
  created_at: string;
  updated_at: string;
  schema_version: 1;
}
```

Storage key: `classes/{id}`.

### Scheduled Lesson

```ts
{
  id: string;
  type: 'scheduled_lesson';
  class_id: string;
  lesson_id: string;
  unit_id: string;
  date: string; // YYYY-MM-DD
  schedule_order: number;
  delivery_status: 'planned' | 'current' | 'delivered' | 'skipped' | 'rescheduled';
  created_at: string;
  updated_at: string;
  schema_version: 1;
}
```

Storage key: `scheduled_lessons/{id}`.

### Seed

- One Class (e.g. code `12ENGADV1`, Year 12 English Advanced, `unit_aotfw` active)  
- Scheduled lessons across the week of **`2026-08-12`** (anchor), linking existing AOTFW lessons  
- Set `current_unit_id` / `current_scheduled_lesson_id` sensibly for the Class page  
- `schedule_anchor_date: '2026-08-12'` remains on curriculum response  
- Remove `home_schedule` from `fixtures/seed.json` and stop writing `meta/home_schedule`

### Curriculum response

```ts
{
  years, subjects, units,
  lessons, // still includes updated_at / published_at?
  classes: Class[],
  scheduled_lessons: ScheduledLesson[],
  schedule_anchor_date: string
}
```

No `schedule: ScheduleEntry[]`. Mock-api + Netlify curriculum list class/scheduled_lesson prefixes (or seed ids) like other entities. `seed-blobs` writes class + scheduled_lesson keys.

## Home

- Today: `scheduled_lessons` where `date === schedule_anchor_date`  
- This week: Mon–Sun week containing anchor; omit empty days (reuse `groupWeekSchedule`-style helpers adapted to Scheduled Lesson)  
- Row: class code/title · lesson title · Draft/Published · Open → `/lessons/:id`  
- Unpublished / Recently edited: unchanged  

Adapt or replace `ScheduleEntry` / home-model inputs to use `ScheduledLesson` + Class lookup.

## Classes UI

### List (`/classes`)

- Heading: Classes  
- Rows: code · title · subject (from curriculum) · Open → `/classes/:id`  
- Empty: “No classes yet.”

### Hybrid Class page (`/classes/:classId`)

**Generated (live)**

1. **Header** — code, title, year/subject context  
2. **Current unit** — from `current_unit_id` (title + link to `/units/:unitId` if present)  
3. **Current lesson** — from `current_scheduled_lesson_id` if set; else first scheduled lesson on/after anchor date for this class; Open → editor  
4. **Schedule** — this class’s scheduled lessons ordered by `schedule_order` (then date); each row date · lesson title · status · Open  
5. **Units** — `active_unit_ids` titles linking to unit stubs  

**Manual (placeholders)**

- Announcements · Resources · Custom blocks — short “Coming next” copy; no editor  

**Errors:** unknown id → “Class not found.”

## Implementation touchpoints

| Area | Change |
|------|--------|
| `src/schemas/class.ts`, `scheduled-lesson.ts` | Zod schemas |
| `src/storage/keys.ts` | `classKey`, `scheduledLessonKey`; remove or stop using `homeScheduleKey` |
| Seed / mock-store / seed-blobs | Classes + scheduled lessons; drop home_schedule |
| Curriculum (mock + Netlify) | Emit new arrays; drop schedule entries |
| `src/teacher/home-model.ts` / `home.ts` | Consume scheduled lessons |
| `src/teacher/sections/classes.ts` (new) | List + Class page |
| Router + `main.ts` + section map | `teacher-class` route |
| CSS | Class list / hybrid page layout |
| Tests | Schemas, curriculum, Home, Classes UI |

## Testing

- Class / ScheduledLesson schema accept/reject  
- Curriculum includes classes + scheduled_lessons; no home_schedule payload  
- Home Today/Week from scheduled lessons for anchor week  
- Classes list + Class page generated sections; placeholders present  
- Open links to lesson editor  
- Existing publish / student / Lessons list flows green  

## Success criteria

- Teacher can open Classes, view a Class hybrid page with real schedule rows, and see the same teaching on Home Today/Week without demo schedule blobs  
- Manual Class regions clearly deferred  
- Ready for a follow-up slice to add schedule editing and Class homepage blocks  

## Follow-ups (not this slice)

- Schedule Unit onto Class; reschedule UI  
- Class homepage block editor  
- Student Class page + prev/next  
- Wall-clock today  
- Multiple classes / Standard subject class in seed  
