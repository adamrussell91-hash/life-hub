# Design kit compliance report

**Date:** 2026-09-04  
**Scope:** Life, Teaching, Knowledge, Tasks against `packages/design-kit`  
**Source of truth:** `packages/design-kit/` (see `AGENTS.md`, `RAIL.md`, `MOBILE.md`, `ICONS.md`, `TASKS.md`)  
**Kit updates in this pass:** reconciled sign-in SoT (tile required, supporting copy forbidden), flat path docs, icon publish in `prepare-web`, README/AGENTS alignment.

## Verdict

| Hub | Overall | Notes |
|-----|---------|-------|
| Life | **Partial** | Strong kit wiring (CSS, dates, motion, mobile, utilities). Fails locked marks + confirm-card; parallel button skins; hex-heavy product CSS. |
| Teaching | **Partial** | Kit CSS/motion/rail base present. **Actively hides** hub marks; collapsed icon-rail; header utilities placement drift; hex debt. |
| Knowledge | **Partial** | Kit CSS/rail/mobile/motion present. Missing title-row mark + sign-in mark; parallel button systems; capture dates as `YYYY-MM-DD`. |
| Tasks | **Partial** | Closest Teaching-clone chrome; confirm cards widely used. Missing title-row mark + sign-in mark (tests lock absence); date + hex debt. |

No hub is fully compliant. Chrome foundations are largely adopted; locked identity (marks) and token discipline are the shared gaps.

---

## Scorecard (15 categories)

Legend: **P** = Pass · **~** = Partial · **F** = Fail

| # | Category | Life | Teaching | Knowledge | Tasks |
|---|----------|:----:|:--------:|:---------:|:-----:|
| 1 | `data-hub` on `<html>` | P | P | P | P |
| 2 | Kit CSS loading | ~ | P | P | P |
| 3 | Passphrase / sign-in gate | ~ | ~ | ~ | ~ |
| 4 | Left rail | ~ | ~ | ~ | P |
| 5 | Page header | ~ | F | F | F |
| 6 | Buttons (`.btn` variants) | F | P | F | P |
| 7 | Display dates (`dd/mm/yy`) | ~ | ~ | ~ | ~ |
| 8 | Fonts (Inter only) | P | P | P | P |
| 9 | Tokens / no ad-hoc hex | F | F | F | F |
| 10 | Mobile chrome (≤720px) | P | P | P | ~ |
| 11 | Confirm cards / agent UX | F | ~ | ~ | P |
| 12 | Favicon / hub marks | F | F | F | F |
| 13 | Motion (`startHubMotion`) | P | P | P | P |
| 14 | Local kit vs `packages/design-kit` | P | P | P | P |
| 15 | UI/UX polish | ~ | ~ | ~ | ~ |

---

## Kit source-of-truth fixes (this change)

| Issue | Resolution |
|-------|------------|
| `snippets/sign-in.html` + `sign-in.css` said “no tile” and included supporting copy, contradicting `AGENTS.md` / `ICONS.md` | Snippet requires `.sign-in__mark`; supporting copy removed; CSS styles the mark and force-hides `.sign-in__supporting` |
| Docs pointed at non-existent `css/*.css` paths | `AGENTS.md`, `RAIL.md`, `TASKS.md`, `README.md` updated to flat kit layout |
| `prepare-web` published CSS + JS but not `icons/` | `copyDesignKitIcons()` added; remount unit test asserts it |
| Teaching / Tasks / Knowledge unit tests assert marks are **absent** | Documented as hub regressions against SoT (hub fix follow-up) |

---

## Cross-hub findings (UI / UX)

### Blockers (locked chrome)

1. **Hub marks missing or suppressed** (`ICONS.md`)
   - Life: no favicon SVG tile, no `.sign-in__mark`, no `.hub-mark` in `.page-header__title-row`.
   - Teaching: favicon OK; CSS force-hides `.hub-mark, .sign-in__mark { display: none !important; }` in `apps/teaching/src/styles/app.css`; tests assert absence.
   - Knowledge / Tasks: favicon OK; gate + title-row marks omitted; tests assert absence.
2. **Agent confirm pattern**
   - Life: custom `.record-proposal` + High Sea white-on-orange confirms instead of `.confirm-card` + `.btn`.
   - Teaching: kit confirm cards for some AI flows; many writes still use `window.confirm`.
   - Knowledge: kit confirm cards for some chat flows; reader “Clean up” writes without confirm.
   - Tasks: generally uses `.confirm-card` (pass).

### Major

3. **Parallel button systems** — Life (FAB / quick-log / proposal skins) and Knowledge (quiz / dump / graph mode pills) invent non-`.btn` chrome.
4. **Rail drift** — Life dual `.desktop-rail` / `.hub-rail` styling + status coloured dot; Teaching collapsed **5.75rem** icon rail (forbidden second width); Knowledge leftover icon-column CSS under `.rail__btn`.
5. **Hardcoded hex** — all hubs carry substantial non-token colour in product and sometimes chrome CSS (Life ~85 CSS hex hits; Teaching/Knowledge ~57; Tasks ~40). Product canvases may keep domain colour with documentation; chrome and new surfaces must use tokens.
6. **Display dates** — `formatDisplayDate` widely used, but gaps remain (Life mind aria `YYYY-MM-DD`; Knowledge capture titles; Teaching trash/`toLocaleString`; Tasks reminders/`toLocaleDateString`).

### Minor / UX

7. Floating chat FABs beside locked mobile bar (Life, Knowledge).
8. Dead mobile “top-strip rail” CSS left behind after rail `display: none` (Teaching, Knowledge, Tasks mobile rail branch).
9. Teaching shell breakpoint `768px` vs kit `720px`.
10. Board vs Dashboard naming inconsistency on Tasks.
11. Page-header utilities absolutely positioned outside `.page-header__actions` on Teaching.

---

## Per-hub detail

### Life (`apps/life`, `data-hub="life"`)

| Strengths | Gaps |
|-----------|------|
| Loads tokens/overlays/actions/filters/sign-in/motion/morphing-popover/rail/mobile | No `chrome.css` (OK if pieces loaded) |
| Sign-in structure + Enter submit; no supporting copy | Missing `.sign-in__mark` + favicon tile |
| Rail brand link + mobile bottom bar + `startHubMotion` + `formatDisplayDate` | No `.hub-mark`; proposal UI not `.confirm-card`; custom buttons; hex in `app.css` |

### Teaching (`apps/teaching`, `data-hub="teaching"`)

| Strengths | Gaps |
|-----------|------|
| Kit CSS barrel + Inter + motion + mobile mount + favicon tile | Marks CSS-hidden; no title-row mark |
| `.btn` usage strong; confirm cards for some AI | Collapsed icon rail; Wave selection on rail; utilities not in header actions; hex; `window.confirm` |

### Knowledge (`apps/knowledge`, `data-hub="knowledge"`)

| Strengths | Gaps |
|-----------|------|
| Kit imports + 15rem rail + mobile mount + motion + favicon | No title-row / sign-in mark; tests forbid mark |
| Confirm cards in chat retag / archive | Parallel quiz/dump buttons; hex; capture titles `YYYY-MM-DD`; silent tidy |

### Tasks (`apps/tasks`, `data-hub="tasks"`)

| Strengths | Gaps |
|-----------|------|
| Teaching overlay clone; board home; confirm cards; motion; utilities | No title-row / sign-in mark; tests forbid mark |
| `TASKS.md` product shape largely met | Reminder dates; map/agent hex; dead mobile-rail CSS |

---

## Priority remediation (hubs)

1. **Marks everywhere** — favicon + `.sign-in__mark` + `.hub-mark` in `.page-header__title-row`; delete Teaching hide rule; flip unit tests that lock absence.
2. **Life confirm cards** — map `.record-proposal` actions to `.confirm-card` + `.btn--ghost` / `.btn--primary` (or kit high-sea).
3. **Remove Teaching collapsed icon-rail**; keep labeled 15rem rail only.
4. **Date sweep** — all calendar days through `formatDisplayDate`.
5. **Token sweep** — replace chrome/new-surface hex with nearest tokens; document intentional product exceptions (graphs, agent identity colours).
6. **Delete dead mobile top-strip / parallel mobile-rail CSS.**

---

## Evidence method

- Static audit of each hub’s HTML/CSS/TS/JS against kit locked rules
- Automated repo scan for kit imports, mark classes, confirm cards, `toLocaleDateString`, `--rail-width` overrides, hex in CSS
- Kit unit tests: `tests/unit/design-kit-source.test.js`, `tests/unit/design-kit-remount.test.js` (pass)

## Out of scope this pass

Implementing the hub remediations above (large, multi-app UI change). This pass makes the kit internally consistent and records compliance so hub PRs can close gaps against a single SoT.
