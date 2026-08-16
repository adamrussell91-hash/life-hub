# Mind visual restyle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the Mind board in place so it matches Clinical Glass: no Talk launchers, no cadence heatmap, scan-then-sheet prose, honest-empty charts.

**Architecture:** Keep `packMasonry` and the tile catalogue. Unmount launchers and heatmap markup. Clamp session/insight copy in `render-mind.js`. Gate sparse charts behind a shared honest-empty caption (threshold + count) instead of drawing empty SVGs or hiding tiles.

**Tech Stack:** Vanilla JS, `index.html`, `css/app.css`, Node test runner (`node:test`).

**Spec:** `docs/superpowers/specs/2026-08-16-mind-visual-restyle-design.md`

---

### Task 1: Tests for cuts, scan cards, honest empty

**Files:**
- Modify: `tests/unit/render-mind.test.js`

- [ ] Write / rewrite tests so they fail on current code:
  - `index.html` has no `#mind-launcher-vera`, `#mind-launcher-penelope`, `#mind-cadence`, or `#mind-heatmap-*`
  - Recurring themes chips are names only (no `Theme · 1`)
  - Session card is date + title + one sentence + mood chip; no closing-question wall
  - Insights show at most 3 bodies, each one sentence
  - Sparse chord / sankey / radial / tension keep the tile and show `Need N … M so far` with no chart marks / no month-only radial
  - No launcher click test

- [ ] Run `node --test tests/unit/render-mind.test.js` and confirm RED on the new assertions.

### Task 2: Unmount launchers and cadence; themes stay

**Files:**
- Modify: `index.html` (Mind section)
- Modify: `js/app/render-mind.js`
- Modify: `css/app.css`

- [ ] Remove `.mind-agents` buttons. Move `#mind-themes` onto the board as `mind-tile`. Delete heatmap markup.
- [ ] Remove `renderLaunchers`, `renderCadenceHeatmap`, `paintHeatmapRow`, heatmap import, `#mind-cadence` hide loop.
- [ ] Drop unused `.mind-agent-button` / `.mind-heatmap-*` CSS. Session insight colour: `--marine`, not `--high-sea`.
- [ ] Theme chips: label only.

### Task 3: Scan-then-sheet + honest empty

**Files:**
- Modify: `js/app/render-mind.js`

- [ ] Export `firstSentence(text)` (first clause, cap ~140).
- [ ] Sessions: latest card only; one sentence from insight/observation; mood chip; click opens sheet with full prose.
- [ ] Insights: cap 3 visible; one sentence; “more in sheet” if needed; click opens sheet.
- [ ] `paintHonestEmpty(host, { need, have, unit })` — hide/clear SVG, sentence `Need ${need} ${unit}. ${have} so far.`
- [ ] Gate: chord ≥3 pairs; sankey ≥3 transitions; radial ≥1 mood day else no month labels; tension stay visible when empty; stream/bump/waffle/lexical/horizon/butterfly use the helper when count is 0 (and chord/sankey below threshold).

### Task 4: Verify

- [ ] `node --test tests/unit/render-mind.test.js` green
- [ ] `npm test` green
- [ ] Spec status → approved (implementation)

Do not commit unless Adam asks.
