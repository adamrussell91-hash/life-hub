# Tasks Hub — agent design notes

Read `AGENTS.md` first. This file is the extra brief for **Tasks Hub only**. It does not unlock a new palette, type scale, rail, or button system.

Chrome is Teaching. Board / Graph / Charts are Tasks surfaces; their **look** comes from `CHARTS.md`, not a Tasks-only viz kit. Data models and persistence are out of scope here.

Canonical kit: `/Users/adamrussell/Projects/hub-design-kit`  
Tasks Hub: `/Users/adamrussell/Projects/tasks-hub`

## Shell

```html
<html lang="en" data-hub="tasks">
```

Load Inter, then kit `tokens.css`, `overlays.css`, `chrome.css` (new hub), then Tasks Hub CSS.

`data-hub="tasks"` **clones Teaching**: more glass, more tiles, the same 15rem labeled rail as every other hub. Values live in `overlays.css` — do not retune them in the hub. Rail rules: `RAIL.md`.

Page header stays kit: uppercase eyebrow → `h1` → optional supporting → actions on the right. Rail brand is `<a class="hub-rail__brand" href="…board…">` (single uppercase line, returns to the board from anywhere). Destinations are `.hub-rail__link` (outline icon + title-case label). Refresh and sign out use `.hub-utilities` / `.hub-icon-btn` at the canvas top-right. Title is `h1` only — never put `.hub-mark` beside it. No favicon tile, no sign-in mark. No supporting copy on the gate. See `ICONS.md`.

Agent writes: propose → **confirm card** → apply.

## Surfaces

| Surface | Role |
|---------|------|
| **Board** | Home. Task / project / excursion cards as Teaching tiles (glass, `--hub-tile-gap`). |
| **Calendar** | Reference paint for every hub. Day / Week / Month, 7-day Monday week, `.event-chip`. See `CALENDAR.md`. |
| **Goals** | `#/goals` Term Runway: three lanes (Life / Work / Professional), week cells from `goals.css` (never red for a miss), Hammond strip, Direction strip, active-projects meter. `#/goal/:id`: structure card, if-then, next start, hosting, `@` tags, Hammond panel with `.confirm-card` proposals. Reference: `docs/proposals/goals-reference/`. |
| **Plan next term** | Full-screen sheet from the Goals landing. Card-swipe deck over unfinished active goals in the current term; keys 1–4 = Carry / Park / Achieved / Drop; summary then `POST /api/goals/plan-term`. Kit: `card-swipe.js`. |
| **Sunday check-in** | Hammond strip button (prominent Sat–Mon). Three steps via `createStepIndicator` + card-swipe: what moved → stuck why → one move. Persists `goal_checkins/<date>`. |
| **Year** | Term ↔ Year zoom on the Goals landing (`createMotion` placers, same rules as Term River). Phone (<720) becomes a list by term (`runway--year-list`). |
| **Graph** | A rail page, not home. Three views: **Lines** (project transit), **Branch** (dependency flowchart), **Orbit** (due-date radar). |
| **Charts** | Blocks on the board (counts, trends). Not a third chrome system. |

Status colour uses existing tokens only: Wave, Marine, Depth, pastel chips. High Sea is accent / decisive, never body text on orange, never focus rings.

## Charts and graphs

Read `CHARTS.md`. That is the library. Do not invent a Tasks graph kit or a new chart look. Do not open Life or Knowledge unless `CHARTS.md` names a specific module.

## Hard rules

- Do not fork `--rail-width`. Every hub, including Tasks and Knowledge, uses the 15rem labeled rail.
- Do not flatten glass to Knowledge/Life’s `glass-panel` override. Tasks keeps Teaching frost.
- Do not start a Tasks colour story “because work is serious.”
- If a size or colour is missing, pick the nearest token.
