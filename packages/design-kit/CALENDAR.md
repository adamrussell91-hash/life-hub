# Calendar — locked chrome

**Read this file. Do not hunt Life, Teaching, Professional, or old specs for a calendar look.**

The source of truth is the Tasks Hub calendar (`apps/tasks/src/views/calendar.ts`) painted with `calendar.css`. Same job as `RAIL.md` for the rail: one object, one chrome. Every hub calendar — full page or a month on Home — uses this object. Do not invent a postcard, a five-day week, or a second phone skin.

CSS: `calendar.css` (phone rules live in the same file). Dates: `js/format-display-date.js`. Time-grid geometry: `js/time-grid.js`.

---

## Agent rule

1. Open `packages/design-kit/CALENDAR.md` (this file).
2. Paint `.hub-calendar.hub-calendar--workspace`.
3. Use the locked nav, views, grid, chips, and labels below.
4. Hub data and compose copy stay in the hub. Chrome does not.

Do not add `pro-home__calendar`, `class-calendar` skins, or a parallel month grid. Teaching may keep `.class-calendar` as an extra class on the same root for existing selectors. It must also carry `.hub-calendar`.

New calendar? Same object. Extra product chrome (planning filters, capacity, lesson overflow) sits around it. It does not replace the nav, week shape, or chips.

---

## Locked (do not reinvent)

| Piece | Rule |
|--------|------|
| Root | `.hub-calendar.hub-calendar--workspace` — glass, `--radius-lg`, `--elev-1`, kit padding. |
| Nav | `.hub-calendar__nav`: `‹` + period label + `›` + **Today** + view pills. |
| Views | Day / Week / Month as `.hub-pills.calendar-view-tabs`. Selected tab is `.is-active`. |
| Week | **Seven days, Monday start.** Never Mon–Fri. |
| Day / Week body | `.hub-calendar__timegrid` from `js/time-grid.js`. |
| Month body | `.hub-calendar__grid`. Weekday heads `M T W T F S S`. |
| Day cells | `.hub-calendar__day` + `.hub-calendar__day-num` = **day of month only** (`12`, not `12/09/26`). |
| Today | Red `--danger` pip on `.hub-calendar__day-num`. Not navy. Not a filled cell. |
| Selected | `data-selected="true"` inset Wave ring. |
| Outside month | `data-outside="true"`. |
| Chips | `.event-chip` + `data-tint` (`blue` / `sage` / `peach` / `gold` / `lilac` / `sand`). Overflow `+N more` is `.event-chip-more`. |
| Workspace | `.hub-calendar__workspace` = body + `.hub-calendar__rail`. |
| Period label | Month: `September 2026`. Week: `dd/mm/yy – dd/mm/yy`. Day: `dd/mm/yy`. |
| Visible days | `formatDisplayDate` / `formatDisplayDateRange`. Never `YYYY-MM-DD` on screen. |
| Phone | Same object. `calendar.css` already tightens the grid under 720px. Do not add `.hub-calendar--mobile-*` shells, Now cards, or hide month chips. |

Hub-only extras after the locked three tabs are allowed (Teaching **Timeline**). They must not replace Day / Week / Month or change week length.

---

## Anatomy

```
┌─ .hub-calendar.hub-calendar--workspace ─────────────────────┐
│  .hub-calendar__nav                                         │
│     ‹  22/09/26 – 28/09/26  ›  Today     [Day][Week][Month] │
│  .hub-calendar__workspace                                   │
│     .hub-calendar__body                                     │
│        timegrid (day/week)  or  month grid                  │
│     .hub-calendar__rail                                     │
│        compose + day detail                                 │
└─────────────────────────────────────────────────────────────┘
```

Copy this structure. Do not invent a title-only month postcard.

Dashboard embed (Professional Home): same card, same nav, same month grid, same chips. Day / Week tabs if the hub has times. Do not drop paging or Today to “keep Home small.”

---

## Per-hub only

| Hub may | Hub must not |
|---------|----------------|
| Own event types and tints from the locked pastel set | Invent chip skins (`pro-home__chip`) |
| Compose fields and confirm writes | Hide the rail by restyling the card into a single column as a new calendar |
| Planning filters, capacity, pinch, bloom, drag | Change week to five days |
| One extra view tab after Month | Replace Day / Week / Month |
| Map clicks to hub routes | Show `dd/mm/yy` inside the day-number pip |

---

## Do not

- A second calendar CSS file per hub
- Isolated rounded day cells with gaps (`pro-home__day`)
- `Mon Tue Wed…` month heads (use `M T W T F S S`)
- Navy today pip
- Phone-only Now card / list / FAB calendar
- `toLocaleDateString` for a visible calendar day

---

## Implementation roots

| Piece | Root |
|--------|------|
| **Look** | `packages/design-kit/calendar.css` |
| **Reference paint** | `apps/tasks/src/views/calendar.ts` |
| **Life** | `apps/life/js/app/render-calendar.js` |
| **Teaching** | `apps/teaching/src/teacher/class-calendar.ts` |
| **Professional** | `apps/professional/src/views/home.ts` |

When the locked look changes, change `calendar.css` and this file in the same PR. Do not “fix” one hub with a local skin.
