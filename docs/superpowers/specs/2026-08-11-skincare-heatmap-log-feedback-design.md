# Skincare Heatmap Contrast + Log Button Feedback

**Date:** 2026-08-11  
**Status:** Approved  
**Deploy rule:** Local commits only until Adam asks to push.

## Problem

1. The 30-day skincare consistency heatmap encodes AM / PM / both in similar purple fills, so partial vs full days are hard to tell apart at a glance.
2. Tapping **Log** / **Log again** gives little immediate button feedback; the only clear change is after save succeeds and the label becomes **Log again**.

## Decisions (locked)

| Topic | Choice |
|-------|--------|
| Heatmap approach | CSS-only remapping of existing `data-skincare-state` values |
| AM tile | Light purple fill, no special border |
| PM tile | Dark purple fill, no special border |
| Both tile | Same dark purple fill as PM + gold border ring |
| Miss tile | Keep existing faint lavender wash |
| Brand accent | `#B99EE0` stays on cards/chips/now-chip; heatmap encoding only changes |
| Legend | Swatches match tile fills; “both” swatch includes the gold ring |
| Log feedback | Press animation **and** button-local pending state |
| Pending UX | Label → **Logging…**, `disabled`, slightly dimmed until save settles |
| Failure | Restore prior label (**Log** / **Log again**), re-enable; status keeps error text |
| Scope | Routine Log buttons + procedure log button; no model/API changes |

## Design

### Heatmap encoding

Keep `monthHeatmap` states: `miss` | `am` | `pm` | `both`.

Update `.skincare-heatmap` (and matching legend `::before` rules) only:

| State | Fill | Border |
|-------|------|--------|
| miss | Existing faint lavender wash | none |
| am | Light purple (clearly brighter than brand mid) | none |
| pm | Dark purple (clearly darker than brand mid) | none |
| both | Same dark purple as PM | Gold ring (~2px), inset so adjacent tiles don’t collide |

Today’s outline (`data-today`) stays; gold “both” ring must remain distinguishable beside it (e.g. inset box-shadow / outline on the fill, not competing outer glow).

Exact hex values chosen at implementation for clear AM↔PM contrast while staying in the Hyaluronica purple family; gold chosen to read as “complete” without looking like an error.

### Log button feedback

On click of `.skincare-done` (AM/PM) and the procedure log button:

1. Keep global `button:active` scale/press.
2. Immediately set text to **Logging…**, set `disabled`, apply a slight dim (CSS `:disabled` or pending class).
3. Call existing `onLogRoutine` / `onLogProcedure` → `save()`; `#skincare-status` may still show **Saving…** / **Logged ✨** / error.
4. Success → existing re-render path → **Log again** (routines) or unchanged procedure UI.
5. Failure → restore the pre-click label (**Log** or **Log again**), re-enable.

Guard against double-submit while pending. Respect `prefers-reduced-motion` (no new motion beyond existing global rules).

Implementation note: wire pending state in the click handler in `render-skincare.js` (or a thin helper), not by inventing a new save API. Prefer awaiting the save promise from the controller so failure can restore the button; today `onLogRoutine` fires `void save(payload)` — adjust the handoff so the render layer can await settle without changing confirm/API behaviour.

### Out of scope

- Model/heatmap state machine changes
- New heatmap dimensions or charts
- Changing brand purple on non-heatmap skincare chrome
- Optimistic flip to **Log again** before network success

## Testing

- Unit/render: legend and tiles still use `data-skincare-state`; optional assert CSS classes/attrs unchanged.
- Unit: Log click enters pending (**Logging…**, disabled); success path still yields **Log again** after re-render; failure restores prior label.
- Full `npm test`; bump SW shell cache after client HTML/CSS/JS change.
- Manual: AM-only / PM-only / both days readable in the grid; tap Log feels immediate before network returns.

## Success criteria

- At a glance, AM-only, PM-only, and both days are distinguishable without reading the legend first.
- Tapping Log gives immediate button feedback (press + **Logging…**) before the post-save **Log again** label.
