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

Page header stays kit: uppercase eyebrow → `h1` → optional supporting → actions on the right. Rail brand is `<a class="hub-rail__brand" href="…board…">` (single uppercase line, returns to the board from anywhere). Destinations are `.hub-rail__link` (outline icon + title-case label). Refresh and sign out use `.hub-utilities` / `.hub-icon-btn` at the canvas top-right. Title is `h1` only — never put `.hub-mark` beside it. The tile is the favicon and the sign-in mark. No supporting copy on the gate. See `ICONS.md`.

Agent writes: propose → **confirm card** → apply.

## Surfaces

| Surface | Role |
|---------|------|
| **Board** | Home. Task / project / excursion cards as Teaching tiles (glass, `--hub-tile-gap`). |
| **Graph** | A rail page, not home. Two modes on that page: **blockers** (task nodes, blocked-by edges) and **workstreams** (clustered projects / areas). |
| **Charts** | Blocks on the board (counts, trends). Not a third chrome system. |

Status colour uses existing tokens only: Wave, Marine, Depth, pastel chips. High Sea is accent / decisive, never body text on orange, never focus rings.

## Charts and graphs

Read `CHARTS.md`. That is the library. Do not invent a Tasks graph kit or a new chart look. Do not open Life or Knowledge unless `CHARTS.md` names a specific module.

## Hard rules

- Do not fork `--rail-width`. Every hub, including Tasks and Knowledge, uses the 15rem labeled rail.
- Do not flatten glass to Knowledge/Life’s `glass-panel` override. Tasks keeps Teaching frost.
- Do not start a Tasks colour story “because work is serious.”
- If a size or colour is missing, pick the nearest token.
