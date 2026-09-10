# Teaching Hub — Teacher Home Dashboard Design

**Date:** 2026-08-08  
**Status:** Approved for implementation planning  
**Product name:** Teaching Hub  
**Slice:** Teacher Home — Today / week schedule (seeded) + Unpublished / Recently edited  
**Depends on:** Teacher rail + section shells — shipped; builder blocks — shipped; student published nav — shipped

## Goal

Replace the Home canvas’s flat lesson list with a teaching-work dashboard: **Today** and **This week** from a seeded demo schedule, plus **Unpublished changes** and **Recently edited** from real draft metadata. Keep the full lesson list on the Lessons section only.

## Broader roadmap (context only)

1. Teacher rail + section shells — done  
2. Builder blocks — done  
3. Published student nav — done  
4. **This slice** — teacher home dashboard  

Follow-ups after this slice: real Class + Scheduled Lesson models (replace seed schedule), Scope & Sequence editor, Resource Library.

## Decisions

| Topic | Choice |
|-------|--------|
| Home content | Today → This week → Unpublished \| Recently edited (stacked) |
| All-lessons list on Home | No — lives on `/lessons` only |
| Schedule data | Seeded sample schedule (demo class + dated lesson links) |
| Real Class product | Out of scope |
| Week presentation | Mon–Sun day sections; omit empty days |
| Schedule row actions | Class · Lesson · publish state · **Open** only |
| “Today” for demo/tests | Fixed seed anchor date (stable), labelled on the Today panel |
| API shape | Extend `GET /api/curriculum` with `schedule` + richer lesson summaries |
| Architecture | Client builds Home panels from curriculum response; replace `renderTeacherHome` |

## Out of scope

- Editable Classes / Scheduled Lesson CRUD  
- Calendar grid, week navigation, wall-clock “today”  
- Student view / Copy URL / Publish actions on Home rows  
- Quick Create, Search, metrics widgets  
- Changing the Lessons section list behaviour  

## Home layout

Stacked on `/` (teacher-home):

1. **Today** — schedule rows for the seed anchor date  
2. **This week** — day sections for the week containing the anchor date (Mon–Sun); only days with ≥1 item  
3. **Unpublished changes** | **Recently edited** — two columns on wide viewports; stack on narrow  

Context bar / canvas heading: **Home** (not “Lessons”).

### Schedule row

- Demo class title  
- Lesson title (from curriculum summary)  
- Publish state: Draft / Published (from summary `published` flag)  
- Primary control: **Open** → `/lessons/:lessonId`  

### Empty states

| Panel | Copy |
|-------|------|
| Today (no rows) | Nothing scheduled for today. |
| This week (no rows any day) | Nothing scheduled this week. |
| Empty day within week | Omit that day section |
| Unpublished | None right now. |
| Recently edited | None right now. |

## Data

### Schedule entry (seed / curriculum payload)

```ts
{
  class_id: string;
  class_title: string;
  lesson_id: string;
  scheduled_date: string; // YYYY-MM-DD
}
```

Seed includes:

- One demo class (e.g. “12 Eng Adv — Period 3”)  
- Several entries linking existing AOTFW lessons across the anchor date and nearby weekdays  
- A documented **anchor date** used as “today” for Home and tests  

### Curriculum lesson summary — extended fields

Existing fields unchanged (`id`, `title`, `slug`, `unit_id`, `sequence`, `status`, `published`).

Add from draft lesson blobs:

- `updated_at: string` (ISO)  
- `published_at?: string` (ISO; omit or null if never published)  

### Panel membership rules

- **Unpublished changes:** `published_at` is set AND `updated_at` > `published_at`. Sort by `updated_at` desc. Cap ~8. Open → editor.  
- **Recently edited:** top ~8 lessons by `updated_at` desc. Overlap with Unpublished is allowed.  
- **Today / week:** filter `schedule` by date; join `lesson_id` → lesson summary for title + `published`.

## API

`GET /api/curriculum` (auth unchanged) response becomes:

```ts
{
  years, subjects, units,
  lessons: CurriculumLessonSummary[], // with updated_at, published_at?
  schedule: ScheduleEntry[]
}
```

Mock-api and Netlify `curriculum.mts` both:

- Build lesson summaries including `updated_at` / `published_at` from drafts  
- Attach `schedule` from seed (mock) or a schedule blob / seeded keys (Netlify — same seed load path used today)

No new `/api/home` endpoint.

## Implementation touchpoints

| Area | Change |
|------|--------|
| Seed / fixtures | Schedule entries + anchor date; ensure some drafts exercise unpublished rule |
| `src/teacher/nav.ts` | Extend `CurriculumLessonSummary` + `CurriculumResponse` |
| `scripts/mock-api.ts` + Netlify curriculum | Emit new fields + `schedule` |
| `src/teacher/home.ts` (+ helpers as needed) | Stacked dashboard UI |
| `src/styles/app.css` | Home section / row / two-column attention styles |
| Tests | Home panels, unpublished rule, curriculum payload, Lessons index still lists all |

## Testing

- Curriculum response includes `schedule` and `updated_at` / `published_at` on lessons  
- Home Today uses anchor date; week groups by day and omits empty days  
- Unpublished only when edited since publish  
- Recently edited order by `updated_at`  
- Open navigates to `/lessons/:id`  
- `/lessons` still shows the full lesson list  
- Existing rail / publish flows remain green  

## Success criteria

- Teacher opens Home and sees today’s and this week’s seeded teaching plus attention panels  
- Lessons section remains the place for the full lesson list  
- No fake claim of a live school timetable — seed schedule is clearly demo data via class titles / seed docs  
- Ready to swap seed schedule for real Scheduled Lesson records later without redesigning Home layout  

## Follow-ups (not this slice)

- Class + Scheduled Lesson models; Home reads live schedule; wall-clock today  
- Home row actions: Student view, Copy URL, Publish  
- Week picker / adjacent weeks  
- Deduplicate Unpublished vs Recently edited if desired  
