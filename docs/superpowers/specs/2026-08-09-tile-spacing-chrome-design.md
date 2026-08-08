# Tile Spacing & Chrome Polish — Design

**Date:** 2026-08-09  
**Status:** Approved  
**Deploy rule:** Local commits only until Adam asks to push.

## Problem

Dashboard metric cards often stack with no shared vertical gap (`.dashboard` has no layout rule). Spacing relies on scattered `margin-top` on some card classes (e.g. `.chart-card`, `.week-card`), so many Fitness / Skincare / Calendar / Central Node tiles sit flush edge-to-edge. Heatmaps and calendar cells use ~0.3–0.35rem gaps and feel packed. Card chrome uses a double edge (`border` + `outline`) that reads heavy when tiles are close.

## Decisions (locked)

| Topic | Choice |
|-------|--------|
| Scope | Everywhere — stacked cards and small tiles |
| Density | Comfortable — ~18–20px card gaps, ~8px small tiles |
| Polish depth | Spacing + light chrome (keep Clinical Glass) |
| Approach | Spacing tokens + `.dashboard` stack grid |

## Design

### 1. Spacing tokens

Add to `:root` in `css/app.css`:

| Token | Value | Use |
|-------|-------|-----|
| `--space-stack` | `1.15rem` (~18px) | Vertical gap between dashboard children that are cards/panels |
| `--space-grid` | `1.15rem` | Gap inside multi-column card grids |
| `--space-tile` | `0.5rem` (~8px) | Heatmap cells, calendar day cells, dense micro-grids |

### 2. Dashboard stack

- `.dashboard { display: grid; gap: var(--space-stack); }`
- Section headings, kickers, status lines, dialogs, and floating chat buttons remain children of `.dashboard`; the stack gap applies between all direct children. That is intentional and preferred over wrapping only cards (less HTML churn). If a heading + first card feels too airy, keep `.section-heading { margin-bottom: 0 }` so the stack gap alone separates heading from first card (replace the current `margin-bottom: 1rem` to avoid double spacing).
- Apply `gap: var(--space-grid)` to: `.hero-grid`, `.support-grid`, `.nutrition-grid`, `.skincare-grid`, `.trend-pair`, `.nutrition-week-charts` (and any other sibling card grids currently at `1rem` / `0.85rem` that should match).
- Remove redundant stacked-card `margin-top` rules that would double with the new stack gap, including at least: `.week-card`, `.meal-log-card`, `.meal-breakdown-card`, `.chart-card`, and any similar `margin-top: 1rem` on full-bleed cards that are direct `.dashboard` children. Nested margins inside a card stay.

### 3. Small-tile gaps

Set `gap: var(--space-tile)` on:

- `.heatmap-grid`
- `.calendar-month-grid`
- `.skincare-heatmap` (if it overrides gap separately)
- Related dense strips where cells currently sit under ~0.4rem (e.g. calendar week strip inside cards if it uses the same visual language)

Slightly increase heatmap tile radius if needed for the larger gap (optional, keep subtle — e.g. `0.35rem` → `0.4rem`). Do not enlarge week-dot diameters beyond readability.

### 4. Light chrome

On shared `.metric-card, .week-card, .warning-panel, .unavailable-panel` (and matching surfaces):

- Drop the double-edge pattern: remove `outline: 1px solid var(--line)`; keep a single quiet border `1px solid rgba(20, 43, 81, 0.08)` (or equivalent using `--line` at lower opacity).
- Soften shadow: replace heavy `--shadow` for these surfaces with a quieter token, e.g. `--shadow-card: 0 0.65rem 1.75rem rgba(31, 53, 91, 0.06)` (keep existing `--shadow` if used elsewhere, or redefine carefully).
- Keep glass background + backdrop-filter; do not go solid-white editorial.
- Radius: keep `--radius-lg` / `--radius-md` unless a one-step reduction improves edge calm; do not redesign the radius scale.

Out of scope for chrome: new color palette, font change, rail redesign, FAB, chart internals, motion system.

### 5. Responsive

- Stack gap stays comfortable on mobile; do not shrink below `--space-tile` for card stacks.
- Existing single-column breakpoints for hero/support/nutrition grids unchanged except gap token swap.

## Edge cases

| Case | Behavior |
|------|----------|
| Dialogs / templates sheet inside a dashboard | Still a direct child → gets stack gap above/below; acceptable |
| Floating chat button | Extra gap above FAB from stack; acceptable (already floats) |
| Warning / unavailable panels | Participate in stack gap; chrome update applies |
| Nested `.chart-card` that is not a direct dashboard child | No extra stack gap from parent; internal spacing unchanged |
| Reduced motion | No new motion |

## Testing

- Visual: Home, Nutrition, Fitness, Skincare, Calendar, Body, Mind, Central Node — no flush card edges; heatmaps/calendars show clear cell separation.
- CSS regression: no double gap (card + margin-top) creating huge voids.
- Existing unit/browser suite still passes (`npm test`); bump service-worker shell cache if HTML/CSS/JS shell assets change (CSS only → still bump if SW precaches `css/app.css`).
- Manual desktop + narrow viewport spot-check.

## Success criteria

- No two dashboard cards share a touching border.
- Heatmap/calendar cells read as a grid with breathing room (~8px).
- Cards still feel like Clinical Glass, not a new theme.
- Spacing is driven by tokens, not one-off margins.
