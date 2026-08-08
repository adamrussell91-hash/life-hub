# Tile Spacing & Chrome Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every dashboard comfortable card gaps and clearer small-tile gaps, with quieter Clinical Glass chrome so tiles never sit flush.

**Architecture:** CSS-token driven spacing (`--space-stack`, `--space-grid`, `--space-tile`) plus `.dashboard` as a vertical grid; remove redundant card `margin-top`; soften shared card border/shadow. No HTML structure rewrite.

**Tech Stack:** Vanilla CSS (`css/app.css`), service worker cache bump (`service-worker.js`).

**Spec:** `docs/superpowers/specs/2026-08-09-tile-spacing-chrome-design.md`

---

### Task 1: Spacing tokens + dashboard stack

**Files:**
- Modify: `css/app.css` (`:root`, `.dashboard`, `.section-heading`, card grids, redundant margins)

- [ ] **Step 1:** Add to `:root`:
  - `--space-stack: 1.15rem`
  - `--space-grid: 1.15rem`
  - `--space-tile: 0.5rem`
  - `--shadow-card: 0 0.65rem 1.75rem rgba(31, 53, 91, 0.06)`
- [ ] **Step 2:** Add `.dashboard { display: grid; gap: var(--space-stack); }`
- [ ] **Step 3:** Set `.section-heading { margin-bottom: 0; }` (stack gap separates heading from first card)
- [ ] **Step 4:** Set `gap: var(--space-grid)` on `.hero-grid`, `.support-grid`, `.nutrition-grid`, `.skincare-grid`, `.trend-pair`, `.nutrition-week-charts`, `.body-sections` (if it is a card stack at `gap: 1rem`)
- [ ] **Step 5:** Remove `margin-top: 1rem` from `.week-card`, `.meal-log-card`, `.meal-breakdown-card`, `.chart-card`. Remove `margin-top: 1rem` from `.support-grid` if stack already separates it from `.hero-grid`. Adjust `.warning-panel, .unavailable-panel { margin-bottom }` so it does not double with stack gap (prefer `margin-bottom: 0`).
- [ ] **Step 6:** Spot-check that nested cards inside a grid do not lose their grid gap.

### Task 2: Small-tile gaps

**Files:**
- Modify: `css/app.css` (heatmap / calendar / related)

- [ ] **Step 1:** `.heatmap-grid { gap: var(--space-tile); }`
- [ ] **Step 2:** `.calendar-month-grid { gap: var(--space-tile); }`
- [ ] **Step 3:** Any skincare heatmap override / calendar week grid using ≤0.4rem cell gap → `var(--space-tile)`
- [ ] **Step 4:** Optional: `.heatmap-tile { border-radius: 0.4rem; }`

### Task 3: Light chrome

**Files:**
- Modify: `css/app.css` (shared card rule)

- [ ] **Step 1:** On `.metric-card, .week-card, .warning-panel, .unavailable-panel`:
  - Remove `outline: 1px solid var(--line)`
  - Set `border: 1px solid rgba(20, 43, 81, 0.08)` (or `color-mix` / `--line` at lower opacity)
  - Set `box-shadow: var(--shadow-card)`
- [ ] **Step 2:** Leave glass `background` + `backdrop-filter` unchanged
- [ ] **Step 3:** Leave sign-in card / chat surfaces on existing `--shadow` unless they share the same selector

### Task 4: Cache bump + verify

**Files:**
- Modify: `service-worker.js` (`CACHE_NAME` v51 → v52)
- Test: `npm test` (or targeted CSS-safe suite if full suite is long)

- [ ] **Step 1:** Bump `life-hub-shell-v51` → `life-hub-shell-v52`
- [ ] **Step 2:** Run `npm test`
- [ ] **Step 3:** Manual mental check: no flush cards; heatmaps ~8px; glass preserved
- [ ] **Step 4:** Commit when Adam asks (do not push)

## Out of scope

Palette, fonts, rail, FAB, chart SVG internals, HTML wrappers, solid-white theme.
