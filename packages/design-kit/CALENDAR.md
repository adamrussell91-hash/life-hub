# Calendar — locked chrome

**Read this file. Do not hunt Life, Teaching, Professional, or old specs for a calendar look.**

The calendar is one object across hubs. Zoom stops, chrome, and shared modules are locked here. Life’s Tideline week is the reference paint for Week; Almanac is the fifth stop. Do not invent a postcard, a five-day week, or a second phone skin.

**Principle:** every hub calendar can show every Life event type. What differs per hub is only (a) default filter and (b) band fills. Filtering is one shared kit feature (`calendar-filter.js`). Student-facing calendars are out of scope.

CSS: `calendar.css`, `calendar-tideline.css`, `calendar-almanac.css`, `calendar-day-dial.css`, `calendar-term-river.css`. Dates: `js/format-display-date.js`. Geometry: `js/calendar-bands.js`, `js/calendar-tideline-geometry.js`, `js/almanac-geometry.js`, `js/dial-geometry.js`, `js/day-dial-geometry.js`. Motion: `js/hub-motion-engine.js`.

Visual contracts (how it looks and moves):

- Tideline: `docs/proposals/calendar-reference/VISUAL-SPEC.md`
- Almanac: `docs/proposals/calendar-reference/almanac/VISUAL-SPEC.md`

Hub migration inventory (historical dispositions): `docs/proposals/calendar-reference/HUB-MIGRATION.md`.

---

## Agent rule

1. Open `packages/design-kit/CALENDAR.md` (this file).
2. Paint the locked zoom stops and the Tideline / Day Dial / Term River / Almanac object as specified.
3. Use the shared modules below. Do not fork capacity, ghosts, bands, or openings into a hub.
4. Hub data and compose copy stay in the hub. Chrome does not.
5. Hub mounts go through `mountHubCalendar` + a thin adapter (`hub`, `fills`, `defaultFilter`, `routeFor`, `apiFetch`). Adapters stay ≤150 lines. Do not import Tideline / Dial / River / Almanac renderers from a hub.

Do not add `pro-home__calendar`, `class-calendar` skins, or a parallel month grid. Teaching may keep `.class-calendar` as an extra class on the same kit root for existing selectors. It must also carry the kit mount (`data-part="hub-calendar-mount"`).

New calendar surface? Same zoom language. Extra product chrome (planning filters, capacity, lesson overflow) sits around it. It does not replace the stops, week shape, or chips.

---

## Zoom stops

| Stop | Job |
|------|-----|
| **Day** | **Day Dial** — one 24-hour circle; Linear is the Tideline one-day view |
| **Week** | **Tideline** — elastic bands, capacity, ghosts, walls |
| **Term** | **Term River** — term-scale lane |
| **Year** | **Term River** at year scale |
| **Almanac** | Lead lines, forecast tide, openings |

Nav pills: Day · Week · Term · Year · Almanac (`.hub-pills`). Selected tab is `.is-active`. Day pressed shows the Day Dial (Dial · Linear). Week pressed shows the Tideline. Term / Year show the Term River. Almanac pressed shows the Almanac chart.

Do not replace these five with Day / Week / Month. Month is not a zoom stop in this lock. Legacy `#/month` (Tasks) redirects to Week.

---

## Tideline object

Week view. Structure and motion follow the Tideline VISUAL-SPEC.

| Piece | Rule |
|--------|------|
| Root | `.cal` (Tideline) inside the hub workspace — kit glass, tokens only |
| Nav | `‹` + period (`T4 W3 · …` / `Hol W1 · holidays`) + range `dd/mm/yy – dd/mm/yy` + `›` + **Today** + zoom pills + Focus pills |
| Bands | Morning · School · After bell · Yours (+ fixed sleep strip). Heights from `calendar-bands.js` / planning profile |
| Capacity header | % + note from `capacity-model.js`; forecast days dashed; over wash when load exceeds budget |
| Vitals | Sleep h, energy, meals, symptom — logs never become grid chips |
| Walls | Hatch + lock pill; nothing proposes into a wall |
| Ghosts | Dashed chips / `overItem` decorations from `GET /api/calendar-ghosts`; Accept/Dismiss → `POST { id, decision }` only |
| Popover | Receipt from `acceptPlan()`; client never builds writes |
| Free evening | Dashed “N h free” when the Yours band is open enough |
| Phone | One day + week strip under 720px |

Period labels: term weeks `T4 W3` (and `· last week of term` when that week ends a term). Holiday weeks `Hol W1 · holidays` / `Hol W2 · holidays` via school-time `weekLabel`. Never bare `"Week"` when terms are known.

---

## Almanac object

Fifth zoom. Lead lines, capacity forecast series, openings, world lane. See Almanac VISUAL-SPEC.

Openings that have been held (`calendar_block` from `alm-hold-<wantId>`) return `{ held: true, dates }` from `GET /api/almanac`. The card shows `Held · Fri 02/10` with the held tint — it does not offer the next free evening until that date has passed.

---

## Shared modules and ownership

| Module | Owns | Lives |
|--------|------|--------|
| `mount-hub-calendar.js` | Shared mount + zoom paint | `packages/design-kit/js/calendar/` |
| `load-hub-sources.js` | Per-source load / live / error | `packages/design-kit/js/calendar/` |
| `calendar-filter.js` | Source chips, sessionStorage, defaults per hub | `packages/design-kit/js/calendar/` |
| `calendar-bands.js` | Band stack, expand targets, hour ↔ y | `packages/design-kit/js/` |
| `capacity-model.js` | Day % / note / soften / forecast / load | `packages/design-kit/js/calendar/` (Life re-exports) |
| `ghost-writes.js` | `validateGhost`, `acceptPlan`, `dismissPlan` | `packages/design-kit/js/calendar/` (Life re-exports) |
| `ghost-proposer.js` | Deterministic morning proposals (no LLM) | `apps/life/js/app/` |
| `lead-lines.js` | Almanac lead math | `packages/design-kit/js/` |
| `openings.js` | `findOpenings` | `packages/design-kit/js/` |
| `hub-motion-engine.js` | One motion engine for Tideline + Almanac | `packages/design-kit/js/` |
| `almanac-rules.js` | Adam’s lead rules + wants | `apps/life/js/app/` |
| `load-live-events.js` | Life record/governance parsers | `apps/life/` — not kit-portable without injection |

Ghost queue: `pending-calendar-ghosts.json`. Decisions: `calendar-ghost-decisions.jsonl`. Proposals (scheduled or `propose_calendar_ghost`) **only append to the queue**. Accept performs the real writes through `acceptPlan`.

---

## What each hub may add

| Hub may | Hub must not |
|---------|----------------|
| Own event types and tints from the locked pastel set | Invent chip skins (`pro-home__chip`) |
| Compose fields and confirm writes | Invent a standing week Add column that bypasses ghosts |
| Fill School with periods (Teaching), meetings (Professional), work windows in After bell (Tasks) | Fork bands, capacity, ghosts, or openings |
| Planning filters, capacity chrome, pinch, drag as hub chrome around the mount | Change week to five days |
| Map clicks to hub routes via adapter `routeFor` | Show `YYYY-MM-DD` on screen |
| Thin adapter + `mountHubCalendar` | Import Tideline / Dial / River / Almanac renderers in a hub |

### Hub defaults (filter + fills)

| Hub | Default filter | Band fills |
|-----|----------------|------------|
| Life | Life sources as today | (Life planning profile) |
| Teaching | Classes on | `school: 'periods'` |
| Professional | PD + Meetings on | `school: 'meetings'` |
| Tasks | Tasks on | `after: 'work'` |

Teaching, Tasks, and Professional mount the locked object through kit adapters. They do not copy Tideline / Almanac / Dial / River paint.

---

## Do not

- A second calendar CSS file per hub for the same object
- A standing Add column on week that writes Life/Tasks without Accept
- Isolated rounded day cells with gaps (`pro-home__day`)
- `Mon Tue Wed…` month heads (Month is not a zoom stop)
- Navy today pip (Tideline today is `--danger`)
- Phone-only Now card / list / FAB calendar
- `toLocaleDateString` for a visible calendar day
- LLM proposals that write Life, Central Node, or Tasks directly (queue only)
- Silent ghost accept from the client (server builds `acceptPlan`)

---

## Implementation roots

| Piece | Root |
|--------|------|
| **Look (classic leftovers)** | `packages/design-kit/calendar.css` — retire when unused |
| **Tideline CSS** | `packages/design-kit/calendar-tideline.css` |
| **Almanac CSS** | `packages/design-kit/calendar-almanac.css` |
| **Day Dial CSS** | `packages/design-kit/calendar-day-dial.css` |
| **Term River CSS** | `packages/design-kit/calendar-term-river.css` |
| **Tideline / Dial / Almanac / River renderers** | `packages/design-kit/js/calendar/` (`render-*.js`) |
| **Life thin re-exports** | `apps/life/js/app/render-tideline.js` (etc.) |
| **Hub mount** | `packages/design-kit/js/calendar/mount-hub-calendar.js` |
| **Teaching adapter** | `apps/teaching/src/teacher/hub-calendar.ts` |
| **Professional adapter** | `apps/professional/src/calendar/hub-calendar.ts` |
| **Tasks adapter** | `apps/tasks/src/views/hub-calendar.ts` |
| **Ghosts API** | `netlify/functions/calendar-ghosts.mjs` |
| **Morning propose** | `netlify/functions/calendar-ghosts-propose-scheduled.mjs` |

When the locked look changes, change the kit CSS and this file in the same PR. Do not “fix” one hub with a local skin.
