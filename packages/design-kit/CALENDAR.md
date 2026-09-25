# Calendar — locked chrome

**Read this file. Do not hunt Life, Teaching, Professional, or old specs for a calendar look.**

The calendar is one object across hubs. Zoom stops, chrome, and shared modules are locked here. Life’s Tideline week is the reference paint for Week; Almanac is the fifth stop. Do not invent a postcard, a five-day week, or a second phone skin.

CSS: `calendar.css`, `calendar-tideline.css`, `calendar-almanac.css`. Dates: `js/format-display-date.js`. Geometry: `js/calendar-bands.js`, `js/calendar-tideline-geometry.js`, `js/almanac-geometry.js`. Motion: `js/hub-motion-engine.js`.

Visual contracts (how it looks and moves):

- Tideline: `docs/proposals/calendar-reference/VISUAL-SPEC.md`
- Almanac: `docs/proposals/calendar-reference/almanac/VISUAL-SPEC.md`

---

## Agent rule

1. Open `packages/design-kit/CALENDAR.md` (this file).
2. Paint the locked zoom stops and the Tideline / Almanac object as specified.
3. Use the shared modules below. Do not fork capacity, ghosts, bands, or openings into a hub.
4. Hub data and compose copy stay in the hub. Chrome does not.

Do not add `pro-home__calendar`, `class-calendar` skins, or a parallel month grid. Teaching may keep `.class-calendar` as an extra class on the same root for existing selectors. It must also carry `.hub-calendar` where the classic Day/Week/Month object still applies.

New calendar surface? Same zoom language. Extra product chrome (planning filters, capacity, lesson overflow) sits around it. It does not replace the stops, week shape, or chips.

---

## Zoom stops

| Stop | Job |
|------|-----|
| **Day** | One day, time grid, compose |
| **Week** | **Tideline** — elastic bands, capacity, ghosts, walls |
| **Term** | Term river (reference folder before build) |
| **Year** | Year scale (reference folder before build) |
| **Almanac** | Lead lines, forecast tide, openings |

Nav pills: Day · Week · Term · Year · Almanac (`.hub-pills`). Selected tab is `.is-active`. Week pressed shows the Tideline. Almanac pressed shows the Almanac chart.

Do not replace these five with Day / Week / Month. Month is not a zoom stop in this lock.

---

## Tideline object

Week view on Life. Structure and motion follow the Tideline VISUAL-SPEC.

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
| `calendar-bands.js` | Band stack, expand targets, hour ↔ y | `packages/design-kit/js/` |
| `capacity-model.js` | Day % / note / soften / forecast / load | `apps/life/js/app/` |
| `ghost-writes.js` | `validateGhost`, `acceptPlan`, `dismissPlan` | `apps/life/js/app/` |
| `ghost-proposer.js` | Deterministic morning proposals (no LLM) | `apps/life/js/app/` |
| `lead-lines.js` | Almanac lead math | `packages/design-kit/js/` |
| `openings.js` | `findOpenings` | `packages/design-kit/js/` |
| `hub-motion-engine.js` | One motion engine for Tideline + Almanac | `packages/design-kit/js/` |
| `almanac-rules.js` | Adam’s lead rules + wants | `apps/life/js/app/` |

Ghost queue: `pending-calendar-ghosts.json`. Decisions: `calendar-ghost-decisions.jsonl`. Proposals (scheduled or `propose_calendar_ghost`) **only append to the queue**. Accept performs the real writes through `acceptPlan`.

---

## What each hub may add

| Hub may | Hub must not |
|---------|----------------|
| Own event types and tints from the locked pastel set | Invent chip skins (`pro-home__chip`) |
| Compose fields and confirm writes | Invent a standing week Add column that bypasses ghosts |
| Fill School with periods (Teaching), meetings (Professional), work windows in After bell (Tasks) | Fork bands, capacity, ghosts, or openings |
| Planning filters, capacity chrome, pinch, bloom, drag | Change week to five days |
| Map clicks to hub routes | Show `YYYY-MM-DD` on screen |
| Use classic `.hub-calendar` Day/Week/Month where still shipping until migrated | Invent a second Tideline or Almanac skin |

Teaching, Tasks, and Professional are **not** migrated to Tideline/Almanac in the phase-5 PR. When they move, they reuse these modules — they do not copy them.

---

## Do not

- A second calendar CSS file per hub for the same object
- A standing Add column on week that writes Life/Tasks without Accept
- Isolated rounded day cells with gaps (`pro-home__day`)
- `Mon Tue Wed…` month heads (use `M T W T F S S` where a month grid remains)
- Navy today pip (Tideline today is `--danger`)
- Phone-only Now card / list / FAB calendar
- `toLocaleDateString` for a visible calendar day
- LLM proposals that write Life, Central Node, or Tasks directly (queue only)
- Silent ghost accept from the client (server builds `acceptPlan`)

---

## Implementation roots

| Piece | Root |
|--------|------|
| **Look (classic)** | `packages/design-kit/calendar.css` |
| **Tideline CSS** | `packages/design-kit/calendar-tideline.css` |
| **Almanac CSS** | `packages/design-kit/calendar-almanac.css` |
| **Life Week** | `apps/life/js/app/render-tideline.js` |
| **Life Almanac** | `apps/life/js/app/render-almanac.js` |
| **Ghosts API** | `netlify/functions/calendar-ghosts.mjs` |
| **Morning propose** | `netlify/functions/calendar-ghosts-propose-scheduled.mjs` |
| **Tasks reference paint (classic)** | `apps/tasks/src/views/calendar.ts` |

When the locked look changes, change the kit CSS and this file in the same PR. Do not “fix” one hub with a local skin.
