# Skincare Consistency Charts

**Date:** 2026-08-06  
**Status:** Approved  
**Deploy rule:** Local commits only until Adam asks to push. After this ships locally, redeploy and live-test.

## Problem

Skincare logging works, but the tab lacks a real consistency story. The 7-day any-skincare dot strip is too weak. Adam wants charts that show **streaks and consistent AM/PM application**. Body sleep/heart stays out of scope.

## Decisions (locked)

| Topic | Choice |
|-------|--------|
| Approach | Extend `skincare-model` + reuse soft-medical streak/heatmap patterns |
| Consistency tracks | Dual: **AM streak** and **PM streak** separately |
| Surfaces | Streak hero + 30-day dual-state heatmap |
| Placement | Charts first (top of Skincare); logging cards below |
| Heatmap encoding | Four fills: miss / AM only / PM only / both + legend |
| Procedures | Do **not** count toward AM/PM streaks or heatmap fills |
| Out of scope | Week columns, rolling hit-rate line, sleep/heart on Body, Notion sync |

## Design

### Consistency hero (replaces 7-dot strip)

- **AM streak** — consecutive calendar days ending at `date` with an AM routine log (`routine === 'am'`, body not `Procedure:…`).
- **PM streak** — same for PM.
- Numeral + “days” label each, Hyaluronica accent (`#B99EE0`).
- **Last 30 days** heatmap ending today:
  - `miss` — neither AM nor PM
  - `am` — AM only
  - `pm` — PM only
  - `both` — AM and PM
- Compact legend under the grid.
- Remove / replace `#skincare-week-dots` week-only strip with this hero card.

### Model

Extend `buildSkincareModel` to expose:

```js
amStreak: number,
pmStreak: number,
monthHeatmap: Array<{ date, state: 'miss'|'am'|'pm'|'both', isToday }>
```

Keep existing `weekDots` only if something still needs it; prefer dropping weekDots from render once hero ships (can leave model field unused or remove).

Streak algorithm: walk backward from `date`; increment while that routine is logged; stop on first miss. Empty history → `0`.

### Render / CSS

- New hero markup in `#skincare-dashboard` (or evolve `.skincare-streak-card`).
- Heatmap: reuse `.heatmap-grid` / `.heatmap-tile` pattern with `data-skincare-state="miss|am|pm|both"`.
- Soft fill-on-load optional (tile opacity or stagger) respecting `prefers-reduced-motion`.

### Logging cards

Unchanged AM/PM/procedure behaviour below the hero.

## Testing

- Unit: streaks (AM/PM independent), heatmap states, procedures ignored.
- Unit/render: hero shows numerals + 30 tiles + legend.
- Full `npm test`; bump SW shell cache after client HTML/CSS/JS change.
- Manual after deploy: log AM/PM across days → streaks and heatmap update.

## Success criteria

- Skincare opens on a clear AM/PM consistency story.
- Heatmap makes miss vs partial vs full days obvious at a glance.
- Procedures don’t inflate routine consistency.
