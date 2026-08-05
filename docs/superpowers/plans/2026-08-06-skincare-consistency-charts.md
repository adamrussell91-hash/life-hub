# Skincare Consistency Charts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dual AM/PM streak hero + 30-day four-state heatmap at the top of Skincare; procedures excluded from consistency; replace the 7-dot strip.

**Architecture:** Extend `buildSkincareModel` with streak + month heatmap; render via CSS heatmap tiles (Hyaluronica tones) in an evolved streak card; drop week-dots render.

**Tech Stack:** Vanilla JS PWA, existing heatmap CSS patterns, node:test.

**Spec:** `docs/superpowers/specs/2026-08-06-skincare-consistency-charts-design.md`

**Deploy:** Local commits only until Adam asks to push (then live-test).

---

## File map

| File | Responsibility |
|------|----------------|
| `js/app/skincare-model.js` | `amStreak`, `pmStreak`, `monthHeatmap`; helpers for routine-day hits |
| `js/app/render-skincare.js` | Render streak numerals + heatmap + legend; remove week-dots render |
| `index.html` | Hero markup (AM/PM streaks, heatmap host, legend) |
| `css/app.css` | Streak layout + `data-skincare-state` tile colours |
| `tests/unit/skincare-routines.test.js` / new model tests | Streaks + heatmap |
| `tests/unit/render-skincare.test.js` | Hero render |
| `service-worker.js` | `v36` → `v37` |

---

### Task 1: Model — AM/PM streaks + 30-day heatmap

**Files:**
- Modify: `js/app/skincare-model.js`
- Test: `tests/unit/skincare-routines.test.js` (or `skincare-model.test.js`)

- [ ] **Step 1: Write failing tests**

```js
test('amStreak and pmStreak count consecutive routine days independently', () => {
  // date 2026-08-05
  // AM logged 05,04,03; missing 02 → amStreak 3
  // PM logged 05,04; missing 03 → pmStreak 2
  // Procedure-only day does not extend either streak
});

test('monthHeatmap encodes miss/am/pm/both over 30 days', () => {
  // 30 entries ending at date; assert states for fixture days
});

test('procedures do not set am/pm heatmap hits', () => {
  // day with only Procedure: body → miss
});
```

Helper idea:

```js
function isRoutineLog(entry, routine) {
  return entry.record?.type === 'skincare'
    && entry.record.routine === routine
    && !String(entry.body ?? '').startsWith('Procedure:');
}

function streakFor(entries, date, routine) {
  let streak = 0;
  let cursor = date;
  while (true) {
    if (!entries.some(e => e.record.date === cursor && isRoutineLog(e, routine))) break;
    streak += 1;
    cursor = addCalendarDays(cursor, -1);
  }
  return streak;
}

function dayState(entries, day) {
  const am = entries.some(e => e.record.date === day && isRoutineLog(e, 'am'));
  const pm = entries.some(e => e.record.date === day && isRoutineLog(e, 'pm'));
  if (am && pm) return 'both';
  if (am) return 'am';
  if (pm) return 'pm';
  return 'miss';
}
```

`MONTH_DAYS = 30`. Keep or remove `weekDots` — if removing, update old weekDots tests to heatmap/streak tests.

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement model**

- [ ] **Step 4: PASS + commit**

```bash
git commit -m "$(cat <<'EOF'
feat: compute Skincare AM/PM streaks and 30-day consistency heatmap

EOF
)"
```

---

### Task 2: Render hero + CSS + HTML

**Files:**
- Modify: `index.html`, `js/app/render-skincare.js`, `css/app.css`
- Test: `tests/unit/render-skincare.test.js`

- [x] **Step 1: Failing render tests**

Assert:
- `[data-skincare="am-streak"]` / `pm-streak` text
- `#skincare-consistency-heatmap` has 30 children with `data-skincare-state`
- Legend present
- `#skincare-week-dots` gone or unused

- [x] **Step 2: FAIL**

- [x] **Step 3: HTML**

Replace week-dots strip with:

```html
<article class="metric-card skincare-consistency-card">
  <div class="skincare-streak-pair">
    <div>
      <p class="metric-label">AM streak</p>
      <p class="metric-value"><strong data-skincare="am-streak">—</strong><span> days</span></p>
    </div>
    <div>
      <p class="metric-label">PM streak</p>
      <p class="metric-value"><strong data-skincare="pm-streak">—</strong><span> days</span></p>
    </div>
  </div>
  <p class="metric-label">Last 30 days</p>
  <div id="skincare-consistency-heatmap" class="heatmap-grid skincare-heatmap" aria-label="AM and PM skincare consistency, last 30 days"></div>
  <ul class="skincare-heatmap-legend" aria-label="Heatmap legend">
    <li data-state="both">Both</li>
    <li data-state="am">AM</li>
    <li data-state="pm">PM</li>
    <li data-state="miss">Miss</li>
  </ul>
</article>
```

Render: set streak texts; `replaceChildren` heatmap tiles with `dataset.skincareState = day.state`; `title = day.date`. Remove week-dots rendering.

CSS: Hyaluronica fills for `[data-skincare-state="am|pm|both|miss"]`; streak pair flex/grid; legend row.

- [x] **Step 4: PASS + commit**

```bash
git commit -m "$(cat <<'EOF'
feat: render Skincare consistency streak hero and heatmap

EOF
)"
```

---

### Task 3: SW bump + full verify

- [x] Bump `life-hub-shell-v36` → `v37`
- [x] `npm test` + browser suite
- [x] Commit: `chore: bump shell cache after Skincare consistency charts`

Stay on feature branch (no detached HEAD).

---

## Spec coverage

| Spec | Task |
|------|------|
| AM/PM streaks | 1 |
| 30-day four-state heatmap | 1–2 |
| Charts first / replace 7-dots | 2 |
| Procedures excluded | 1 |
| SW bump | 3 |
