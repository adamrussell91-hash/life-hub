# Design kit compliance report

**Date:** 2026-09-05  
**Scope:** Life, Teaching, Knowledge, Tasks against `packages/design-kit`  
**Source of truth:** `packages/design-kit/` (`AGENTS.md`, `RAIL.md`, `MOBILE.md`, `ICONS.md`, `TASKS.md`)

## Verdict

| Hub | Overall | Notes |
|-----|---------|-------|
| Life | **Pass** (chrome) | Favicon + sign-in mark only. No `.hub-mark` beside page titles (locked; do not re-add). Confirm-card actions, display dates fixed. Product chart hex retained as domain colour. |
| Teaching | **Pass** (chrome) | Gate mark only; **no** title-row `.hub-mark`; labeled rail only; utilities in header actions; 720px breakpoint; confirm-card replaces `window.confirm`. |
| Knowledge | **Pass** (chrome) | Gate mark only; **no** title-row `.hub-mark`; capture titles `dd/mm/yy`; tidy confirm-card; primary `.btn` on quiz/podcast submits. |
| Tasks | **Pass** (chrome) | Gate mark only; **no** title-row `.hub-mark`; reminder labels via `formatDisplayDate`; dead mobile-rail CSS removed. |

Locked chrome gaps from the prior audit are closed. Remaining hex lives in **product canvases** (charts, maps, quiz dump nodes, agent identity colours), not shared chrome — allowed as domain UI under kit rules (“product UI stays in the hub”).

---

## Scorecard (15 categories)

Legend: **P** = Pass · **~** = Partial (product-only debt) · **F** = Fail

| # | Category | Life | Teaching | Knowledge | Tasks |
|---|----------|:----:|:--------:|:---------:|:-----:|
| 1 | `data-hub` on `<html>` | P | P | P | P |
| 2 | Kit CSS loading | P | P | P | P |
| 3 | Passphrase / sign-in gate | P | P | P | P |
| 4 | Left rail | P | P | P | P |
| 5 | Page header | P | P | P | P |
| 6 | Buttons (`.btn` variants) | P | P | P | P |
| 7 | Display dates (`dd/mm/yy`) | P | P | P | P |
| 8 | Fonts (Inter only) | P | P | P | P |
| 9 | Tokens / no ad-hoc hex | ~ | ~ | ~ | ~ |
| 10 | Mobile chrome (≤720px) | P | P | P | P |
| 11 | Confirm cards / agent UX | P | P | P | P |
| 12 | Favicon / hub marks | P | P | P | P |
| 13 | Motion (`startHubMotion`) | P | P | P | P |
| 14 | Local kit vs `packages/design-kit` | P | P | P | P |
| 15 | UI/UX polish | P | P | P | P |

Category 9 stays Partial on purpose: product viz / map / dump / agent brand colours still use intentional hex. New chrome must use tokens.

---

## What changed (this remediation)

### Kit SoT (prior commit)
- Sign-in requires `.sign-in__mark`; supporting copy forbidden
- Flat path docs; `prepare-web` publishes `icons/`

### Life
- Favicon + `.sign-in__mark` on the gate. **No** `.hub-mark` in `.page-header__title-row` on any hub. Do not “fix” this.
- Proposals use `.confirm-card` + `.btn.btn--primary` / `.btn.btn--ghost`
- Mind / fitness display dates via `formatDisplayDate`
- Removed dead brand-mark / nav-dot chrome CSS

### Teaching
- Removed mark `display: none !important`
- Gate mark only; no title-row `.hub-mark`; utilities in `.page-header__actions`
- Removed collapsed 5.75rem icon rail; rail hide at 720px
- `askConfirmCard` modal for trash/archive/publish/AI stale accepts/history restore/bulk actions
- Calendar day labels via `formatDisplayDate`

### Knowledge
- Gate mark only; no title-row `.hub-mark`; capture titles `dd/mm/yy`
- Reader tidy uses `.confirm-card` before write
- Removed icon-column rail CSS; quiz/podcast submits use `.btn.btn--primary`

### Tasks
- Gate mark only; no title-row `.hub-mark`; reminder labels via `formatDisplayDate`
- Removed dead mobile-rail restyle CSS under 720px

---

## Verification

- Life: unit suites for web assets + render-chat (33 pass)
- Teaching: page-header, sign-in-haze, teacher-shell, optimistic-lifecycle (10 pass)
- Knowledge: main.rail, main.signin, appendBlock (24 pass)
- Tasks: shell, sign-in-haze, recurrence-reminders (20 pass)
