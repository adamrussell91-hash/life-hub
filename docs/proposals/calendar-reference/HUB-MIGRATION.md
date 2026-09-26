# Hub calendar migration inventory

Inventory of Teaching, Professional, and Tasks calendars before deleting old skins. Disposition: **KEEP** (port onto the locked Tideline / Day Dial / Term River / Almanac object), **MOVED** (already lives elsewhere — name where), or **DROPPED** (lock forbids; reason required). Nothing is DROPPED silently.

Locked chrome: `packages/design-kit/CALENDAR.md`. Zoom stops: Day · Week · Term · Year · Almanac. Month is not a stop. Standing Add column that bypasses ghosts is forbidden.

**Principle:** every hub calendar can show every Life event type. What differs per hub is only (a) default filter and (b) band fills. Filtering is one shared kit feature.

**Out of scope:** student-facing calendars. Grep of `apps/teaching/src/student/` found no calendar surface. Do not add the shared filter or other hubs' data to any student UI.

---

## Deep links

| Hub | Old route | Disposition |
|---|---|---|
| Tasks | `#/month` | **DROPPED** as a zoom stop — redirect to Week (`#/week`) |
| Tasks | `#/day`, `#/week` | **KEEP** — map Day → Day Dial, Week → Tideline; add Term / Year / Almanac |
| Teaching | Day / Week / Month / Timeline pills on `.class-calendar` | Month **DROPPED** (redirect to Week); Timeline **DROPPED** as a zoom stop (not in the lock — period list stays available only if a hub chrome around the object needs it; default is Week Tideline); Day/Week **KEEP** |
| Professional | Month-only `hub-calendar` on home | Month **DROPPED** — replace with locked five stops defaulting to Week |

---

## Tasks (`apps/tasks/src/views/calendar.ts` + related)

| Feature | Where today | Disposition |
|---|---|---|
| Day / Week / Month nav pills | `renderViewTabs`, shell `#/day` `#/week` `#/month` | Month **DROPPED** (redirect Week). Day/Week **KEEP** as Dial/Tideline; add Term/Year/Almanac pills |
| Time grid (day/week columns, hour gutter, now line) | `renderTimeGrid` | **MOVED** → kit Tideline / Day Dial Linear |
| Month grid + weekday heads | `renderMonthGrid` | **DROPPED** — Month not a zoom stop |
| Drag-reschedule tasks onto a day/hour | `chip.draggable`, `wireDropTarget`, `dropTask` | **KEEP** — port onto Tideline chips (task due / work-block create when Plan work on) |
| Plan-work mode (drag creates work block) | `planWorkMode` + `createWorkBlock` | **KEEP** — Tasks band / planning chrome around the object |
| Pinch points + pressure strips | `detectPinchPoints`, `renderPressureStrips`, column `data-pinch` | **KEEP** — hub chrome around Tideline (CALENDAR.md allows pinch) |
| Live capacity remaining text | `liveCapacityText` | **KEEP** / align with kit `capacity-model` header (do not fork a second capacity truth) |
| Quick-add / compose (rail standing compose on Day) | `renderStandingCompose`, `renderQuickAdd` | Standing Add column **DROPPED** (lock). Compose itself **KEEP** as kit compose / ghost Accept path, not a permanent week Add column |
| Agenda list on Day rail | `renderAgenda` | **KEEP** as optional Day rail chrome, not a second calendar skin |
| Task editor in preview pane | `renderTaskEditor` / `openBacklogTask` | **KEEP** |
| Month bloom drawer | `toggleBloom`, `renderBloomDrawer` | **DROPPED** with Month stop (drawer only exists on month cells). Overflow "+N more" behaviour on Tideline/phone follows the lock, not a parallel bloom skin |
| Daily Dial (`views/daily-dial.ts`) on Today | `dashboard.ts` `mountDailyDial` | **MOVED** → kit Day Dial for calendar Day stop. Tasks Today page may keep other widgets; calendar Day must be the locked Dial |
| Ghost work-block preview | `setCalendarGhostBlocks*` | **KEEP** — unify with kit ghost Accept/Dismiss (`POST { id, decision }` only) |
| Planning lens + layer pills | `sessionFilters.planningLens` / layers | **KEEP** as Tasks planning chrome around the object |
| Filters (done, dates, search) | calendar meta pills | **KEEP** where they are Tasks product; source chips become the shared kit filter (Step 2) |
| Keyboard shortcuts (A add, go-to, …) | `bindCalendarKeys` | **KEEP** where they do not invent chrome the lock forbids |
| Rail widgets (locks, next actions, dump, quick links, deep hours) | week rail helpers | **KEEP** as Tasks chrome beside Tideline — not a second week grid |
| Month-only strips (horizon breadcrumb, stall banner, project pulse, domain activity) | month body | **MOVED** — these are product chrome; host on Tasks surfaces that still need them (Projects/Dashboard), not inside a forbidden Month stop |
| Classic `.hub-calendar` CSS paint | design-kit `calendar.css` | **MOVED** → Tideline/Almanac/Dial/River CSS for calendar routes; classic CSS may remain until unused |

---

## Teaching (`apps/teaching/src/teacher/class-calendar.ts` + presentation)

| Feature | Where today | Disposition |
|---|---|---|
| Shared renderer on dashboard + Classes | `home.ts`, `sections/classes.ts` via `renderClassCalendar` | **KEEP** host surfaces; swap skin for kit object + thin adapter |
| Views: Day / Week / Month / Timeline | `ScheduleCalendarView`, pill tabs | Month **DROPPED** (redirect Week). Timeline **DROPPED** as a zoom stop (not in lock). Day/Week **KEEP**; add Term/Year/Almanac |
| Month grid + `monthDelta` motion | `buildDayCell`, `applyMonthMotion` | **DROPPED** with Month |
| Week/Day time grid + now line | `buildTimeGrid` | **MOVED** → kit Tideline / Day Dial |
| Reschedule drag (lesson → day/hour) | `onRescheduleLesson`, chip `draggable`, drop on hours | **KEEP** |
| Lesson chip links / open lesson | `buildLessonChip`, `resolveLessonHref`, `lessonHref` | **KEEP** via adapter `routeFor(item)` |
| Selected date + selected scheduled lesson | `onSelectDate({ scheduledId })`, `data-selected` | **KEEP** |
| Prev / Next / Today paging | `bindNav`, `shiftView` | **KEEP** — kit period nav |
| Compact presentation (hide rail, one + add) | `calendar-presentation.ts` | Standing per-day Add **DROPPED**. Single nav quick-add **KEEP** as Teaching compose entry (not a standing week Add column) |
| Dashboard calendar section | `teacher/home.ts` | **KEEP** host — mounts kit calendar with Teaching defaults |
| Classes section calendar | `sections/classes.ts` | **KEEP** host — same object, class-scoped sources/filter default |
| `.class-calendar` extra class + local CSS | `app.css` `.class-calendar*` | Skin rules **DROPPED** once nothing imports them; may keep `.class-calendar` as an extra class on `.hub-calendar` / Tideline root for existing selectors (CALENDAR.md) |
| Timeline period list | `buildTimelineBody` | **DROPPED** as a zoom stop; if a lesson list is still needed it is hub chrome, not a fifth paint |

---

## Professional (`apps/professional/src/views/home.ts`)

| Feature | Where today | Disposition |
|---|---|---|
| Month grid of PD events | `renderCalendar` | **DROPPED** Month grid — replace with locked stops (default Week Tideline) |
| Event chip open (`eventRoute`) | chip `href` | **KEEP** via adapter `routeFor` |
| Month paging ‹ › / Today | nav buttons | **KEEP** as kit period nav (week/term/year windows) |
| "+ Log PD event" compose entry | home header `btn` → `#/event/new` | **KEEP** as compose entry — not a standing Add column on the week |
| Accreditation card / year strip / timeline list | siblings on home | **KEEP** as Professional home chrome around the calendar — not part of the calendar skin |
| Isolated day-cell look (`pro-home__day` history) | avoided; uses `.hub-calendar` already | Do not reintroduce `pro-home__chip` / `pro-home__day` (CALENDAR.md Do not) |

---

## Shared kit work (later steps — not hub-local)

| Item | Disposition |
|---|---|
| Tideline / Day Dial / Almanac / Term River renderers + models | **MOVED** in Step 1 → `packages/design-kit/js/calendar/` with Life thin re-exports |
| Event source loaders (teaching, tasks, professional, knowledge, live) | **MOVED** in Step 1 with kit loaders; every hub loads all sources |
| Source filter chips (Teaching · Professional · Tasks · Health · Fitness · Corey) | Step 2 — toggles, one filter state, sessionStorage, a11y; never alter capacity/vitals/walls/bands |
| Hub adapter `{ hub, sources, fills, defaultFilter, routeFor, apiFetch }` | Step 3 — ≤150 lines per hub |
| Default filters / band fills | Teaching: School periods; Professional: meetings; Tasks: After-bell work — Step 4–6 |

---

## Delete only after zero imports

| Skin / module | Delete when |
|---|---|
| Teaching `.class-calendar*` CSS + renderer body | Nothing imports `renderClassCalendar` except the new adapter path (then delete old implementation) |
| Professional month `renderCalendar` in `home.ts` | Home mounts kit calendar |
| Tasks classic month path + `#/month` shell item | Redirects in place; month renderer unused |
| Tasks `daily-dial` as calendar Day | Calendar Day uses kit Day Dial; Today page widgets inventoried separately |

---

## Student / other

| Surface | Disposition |
|---|---|
| `apps/teaching/src/student/*` | **OUT OF SCOPE** — no calendar found; do not touch; do not show cross-hub filter or other hubs' events |
| Knowledge Hub | No calendar today; when added, start from locked object (CALENDAR.md) — not part of this migration PR's hub ports |
