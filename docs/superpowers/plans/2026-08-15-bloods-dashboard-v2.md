# Bloods Dashboard v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. REQUIRED: superpowers:test-driven-development.

**Goal:** Rebuild the Bloods tab: hybrid category layout, Pulse chrome, brick/copper/High Sea status, signal strip, chart types by sparsity, in-app explainers, quiet appointment sheet, optional flare ticks.

**Architecture:** Extend `buildBloodsModel` in place. New `bloods-explainers.js` and `bloods-charts.js`. `render-bloods.js` rebuilds the DOM against new hosts in `index.html`. No Notion.

**Tech Stack:** Static PWA, vanilla ES modules, `node --test`, existing chart-kit.

**Spec:** `docs/superpowers/specs/2026-08-15-bloods-dashboard-v2-design.md`  
**Repo worktree:** `.worktrees/bloods-dashboard`  
**Deploy:** Local commits only. Never `git push`.  
**Baseline:** `npm test` / `npm run validate:fixtures`. SW cache on this branch is `life-hub-shell-v75` → bump to `v76` on first client asset change.

---

## File map

| File | Responsibility |
|---|---|
| `js/app/bloods-model.js` | Counts, flag-first sort, tones, chartKind, combined, flare, appointment |
| `js/app/bloods-explainers.js` | Marker + category copy |
| `js/app/bloods-charts.js` | Range bar, combined, zoned SVG builders |
| `js/app/render-bloods.js` | Strip, sections, cards, drawer, sheet, search, scrub |
| `js/app/main.js` | Import new modules only if render needs them (render imports charts) |
| `index.html` | Strip, toolbar, sheet, drawer hosts |
| `css/app.css` | Tokens, overflow, grid, Pulse scope |
| `service-worker.js` | Cache + new files |
| `tests/unit/bloods-model.test.js` | Model behaviour |
| `tests/unit/bloods-explainers.test.js` | Catalog |
| `tests/unit/bloods-charts.test.js` | SVG helpers |
| `tests/unit/render-bloods.test.js` | DOM |
| `tests/unit/page-headings.test.js` | No duplicate kicker |

---

### Task 1: Model — counts, sort, tones, chartKind

**Files:** `tests/unit/bloods-model.test.js`, `js/app/bloods-model.js`

- [ ] Failing tests for `inRangeCount`/`markerCount`, flag-first category order, `statusTone` + HDL invert, `chartKind` (≥3 line, else range-bar, glucose zoned), first-reading tone, 90-day delta label
- [ ] Implement in `bloods-model.js`
- [ ] `node --test tests/unit/bloods-model.test.js`

### Task 2: Model — combined series, flare marks, appointment lines

- [ ] Tests for Iron combined normalised series, flare tags `flare`/`ibd`, appointment sentences + notes
- [ ] Implement
- [ ] Tests pass

### Task 3: Explainer catalog

- [ ] `tests/unit/bloods-explainers.test.js`
- [ ] `js/app/bloods-explainers.js` with seed copy from the spec/plan
- [ ] Tests pass

### Task 4: Chart helpers

- [ ] `tests/unit/bloods-charts.test.js` — range bar x, clamp, zoned band count, combined y in 0–1
- [ ] `js/app/bloods-charts.js`
- [ ] Tests pass

### Task 5: CSS + HTML hosts + heading

- [ ] `page-headings.test.js` if missing
- [ ] Fix `.line-chart.body-chart { aspect-ratio: 320 / 168 }`
- [ ] Pulse tokens and Bloods layout CSS
- [ ] `index.html` hosts: `#bloods-signal`, `#bloods-in-range`, `#bloods-flags`, `#bloods-last-collected`, `#bloods-toolbar`, `#bloods-search`, `#bloods-appointment-open`, `#bloods-appointment-sheet`, `#bloods-explainer`

### Task 6: Render rebuild

- [ ] Tests: strip, collapsed normal categories, `data-status` on charts, info button, quiet appointment control, search, flag `data-bloods-marker`
- [ ] Implement `render-bloods.js`
- [ ] Wire SW cache v76 + new files
- [ ] `npm test` && `npm run validate:fixtures`

---

Hard constraints

1. No Notion.
2. No innerHTML.
3. Green only on the in-range ring.
4. Appointment control must not look like a primary CTA.
5. Flare overlay default off.
6. Do not push.
