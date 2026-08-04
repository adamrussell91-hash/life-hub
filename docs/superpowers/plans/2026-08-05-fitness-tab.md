# Fitness Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Fitness dashboard (streak strip + session hero + week volume + focus hits + vs-last/e1RM PRs + month heatmap + Chadwick chat) and append Chadwick→Brisket Day Type Cross-Agent lines on completed workout confirms.

**Architecture:** Mirror Nutrition’s model/render/controller/chat-panel pattern with Fitness-first content. Reuse `chart-kit` and soft-medical CSS. Extend `central-node-write.js` + `chat-confirm.mjs` so one Central Node sync applies Status, Recent Actions, and Cross-Agent Day Type together.

**Tech Stack:** Vanilla ES modules, `node:test`, Playwright browser specs, existing chart-kit SVG helpers — no chart library.

**Spec:** `docs/superpowers/specs/2026-08-04-fitness-tab-design.md`

**Deploy rule:** Local commits only. Do **not** `git push` unless Adam explicitly asks.

**Baseline:** Run `npm test` before Task 1 (expect green on current `main`).

---

## File Structure

| File | Responsibility |
|---|---|
| `js/app/fitness-model.js` | Pure model: streak, hero, week volume, focusHits, comparisons/PRs, month |
| `tests/unit/fitness-model.test.js` | Model unit tests |
| `js/app/render-fitness.js` | DOM apply for `#fitness-dashboard` |
| `css/app.css` | Fitness layout (streak strip, hero, focus strip, PR badges) |
| `index.html` | `#fitness-dashboard` markup + Chadwick floating button |
| `js/app/app-controller.js` | Wire `fitness` section like Nutrition |
| `js/app/main.js` | Import model/render; default agent `chadwick` |
| `js/core/central-node-write.js` | Cross-Agent Day Type upsert; fold into `applyLogToCentralNode` |
| `js/core/constraints.js` | Export `CROSS_AGENT_HEADING` |
| `tests/unit/central-node-write.test.js` | Cross-Agent helper tests |
| `netlify/functions/chat-confirm.mjs` | Pass completed workout into Cross-Agent path (via applyLog) |
| `tests/integration/chat-confirm-function.test.js` | Assert Day Type line on workout confirm |
| `service-worker.js` | Precache fitness modules; bump to `v19` |
| `tests/browser/fitness.spec.mjs` | Browser acceptance |
| `package.json` | Add fitness browser spec to `test:browser` |
| `docs/IMPLEMENTATION_STATUS.md` | Phase note |

---

### Task 1: Epley + fitness helpers in fitness-model (TDD core)

**Files:**
- Create: `js/app/fitness-model.js`
- Create: `tests/unit/fitness-model.test.js`

- [ ] **Step 1: Write failing tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFitnessModel,
  estimateOneRepMax,
  sessionVolume,
  normalizeExerciseName
} from '../../js/app/fitness-model.js';

const workout = (overrides) => ({
  type: 'workout',
  date: '2026-07-30',
  title: 'Chest and Curls',
  focus: ['chest', 'arms'],
  duration_min: 26,
  day_type: 'workout_30',
  status: 'completed',
  recovery_flag_next_day: false,
  exercises: [
    { name: 'Chest Press', sets: [{ reps: 10, weight_kg: 32 }, { reps: 8, weight_kg: 34 }] },
    { name: 'Bicep Curl', sets: [{ reps: 12, weight_kg: 12 }] }
  ],
  pain_flags: [],
  ...overrides
});

const events = (records) => records.map(record => ({ record, body: '', path: '', legacy: false }));

test('estimateOneRepMax uses Epley', () => {
  assert.equal(estimateOneRepMax(100, 1), 100);
  assert.ok(Math.abs(estimateOneRepMax(100, 5) - (100 * (1 + 5 / 30))) < 1e-9);
  assert.equal(estimateOneRepMax(null, 5), null);
});

test('sessionVolume sums reps * weight for valid sets only', () => {
  assert.equal(sessionVolume(workout()), 10 * 32 + 8 * 34 + 12 * 12);
});

test('normalizeExerciseName trims and lowercases', () => {
  assert.equal(normalizeExerciseName('  Chest Press '), 'chest press');
});

test('hero prefers today planned over older completed', () => {
  const model = buildFitnessModel({
    events: events([
      workout({ date: '2026-07-29', status: 'completed', title: 'Yesterday' }),
      workout({ date: '2026-07-30', status: 'planned', title: 'Planned Pump', exercises: [] })
    ]),
    date: '2026-07-30'
  });
  assert.equal(model.heroSession.title, 'Planned Pump');
  assert.equal(model.heroSession.status, 'planned');
});

test('hero falls back to latest completed on or before display date', () => {
  const model = buildFitnessModel({
    events: events([
      workout({ date: '2026-07-28', title: 'Older' }),
      workout({ date: '2026-07-30', title: 'Chest and Curls' })
    ]),
    date: '2026-07-30'
  });
  assert.equal(model.heroSession.title, 'Chest and Curls');
});

test('weekVolume and month consistency ignore planned/skipped', () => {
  const model = buildFitnessModel({
    events: events([
      workout({ date: '2026-07-30' }),
      workout({ date: '2026-07-29', status: 'planned', exercises: [{ name: 'X', sets: [{ reps: 10, weight_kg: 10 }] }] }),
      workout({ date: '2026-07-28', status: 'skipped', exercises: [{ name: 'Y', sets: [{ reps: 10, weight_kg: 10 }] }] })
    ]),
    date: '2026-07-30'
  });
  assert.equal(model.weekVolume.find(d => d.date === '2026-07-30').volume, 10 * 32 + 8 * 34 + 12 * 12);
  assert.equal(model.weekVolume.find(d => d.date === '2026-07-29').volume, 0);
  assert.equal(model.month.find(d => d.date === '2026-07-30').completed, true);
  assert.equal(model.month.find(d => d.date === '2026-07-29').completed, false);
});

test('comparisons flag PR when e1rm beats all prior history for that exercise name', () => {
  const model = buildFitnessModel({
    events: events([
      workout({
        date: '2026-07-20',
        exercises: [{ name: 'Chest Press', sets: [{ reps: 10, weight_kg: 30 }] }]
      }),
      workout({
        date: '2026-07-30',
        exercises: [{ name: 'Chest Press', sets: [{ reps: 10, weight_kg: 34 }] }]
      })
    ]),
    date: '2026-07-30'
  });
  const row = model.comparisons.find(c => c.name === 'Chest Press');
  assert.equal(row.isPr, true);
  assert.equal(row.firstLogged, false);
  assert.ok(row.e1rm > row.previousE1rm);
});

test('first logged exercise is not a PR', () => {
  const model = buildFitnessModel({
    events: events([workout({ date: '2026-07-30' })]),
    date: '2026-07-30'
  });
  assert.equal(model.comparisons.every(c => c.firstLogged && !c.isPr), true);
});

test('rejects missing display date', () => {
  assert.throws(() => buildFitnessModel({ events: [], date: null }), /display date/i);
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `node --test tests/unit/fitness-model.test.js`  
Expected: FAIL (module not found)

- [ ] **Step 3: Implement `js/app/fitness-model.js`**

```js
import { calculateWorkoutStreak, resolveDayType } from '../core/aggregate.js';
import { addCalendarDays, enumerateDateKeys } from '../core/time.js';

const WEEK_DAYS = 7;
const MONTH_DAYS = 30;

export function normalizeExerciseName(name) {
  return String(name ?? '').trim().toLowerCase();
}

export function estimateOneRepMax(weightKg, reps) {
  const w = Number(weightKg);
  const r = Number(reps);
  if (!Number.isFinite(w) || !Number.isFinite(r) || w <= 0 || r <= 0) return null;
  return w * (1 + r / 30);
}

export function bestSet(exercise) {
  let best = null;
  for (const set of exercise?.sets ?? []) {
    const e1rm = estimateOneRepMax(set.weight_kg, set.reps);
    if (e1rm == null) continue;
    if (!best || e1rm > best.e1rm) {
      best = { reps: set.reps, weight_kg: set.weight_kg, e1rm };
    }
  }
  return best;
}

export function sessionVolume(record) {
  if (!record || record.status !== 'completed') return 0;
  let total = 0;
  for (const exercise of record.exercises ?? []) {
    for (const set of exercise.sets ?? []) {
      const reps = Number(set.reps);
      const weight = Number(set.weight_kg);
      if (!Number.isFinite(reps) || !Number.isFinite(weight)) continue;
      total += reps * weight;
    }
  }
  return total;
}

function workoutRecords(events) {
  return events
    .map(event => event.record)
    .filter(record => record?.type === 'workout');
}

function completedOn(records, date) {
  return records.some(record => record.date === date && record.status === 'completed');
}

function selectHeroSession(records, date) {
  const planned = records.find(record => record.date === date && record.status === 'planned');
  if (planned) return planned;
  return records
    .filter(record => record.status === 'completed' && record.date <= date)
    .sort((a, b) => b.date.localeCompare(a.date) || String(b.time ?? '').localeCompare(String(a.time ?? '')))
    .at(0) ?? null;
}

function buildComparisons(hero, records) {
  if (!hero?.exercises?.length) return [];
  const prior = records
    .filter(record => record.status === 'completed' && record.date < hero.date)
    .sort((a, b) => b.date.localeCompare(a.date));

  return hero.exercises.map(exercise => {
    const name = exercise.name;
    const key = normalizeExerciseName(name);
    const currentBest = bestSet(exercise);

    let previousBest = null;
    for (const session of prior) {
      const match = (session.exercises ?? []).find(ex => normalizeExerciseName(ex.name) === key);
      if (!match) continue;
      previousBest = bestSet(match);
      break;
    }

    let historicalBestE1rm = null;
    for (const session of prior) {
      for (const candidate of session.exercises ?? []) {
        if (normalizeExerciseName(candidate.name) !== key) continue;
        const set = bestSet(candidate);
        if (set && (historicalBestE1rm == null || set.e1rm > historicalBestE1rm)) {
          historicalBestE1rm = set.e1rm;
        }
      }
    }

    const firstLogged = historicalBestE1rm == null;
    const isPr = !firstLogged && currentBest != null && currentBest.e1rm > historicalBestE1rm;
    return {
      name,
      currentBest,
      previousBest,
      e1rm: currentBest?.e1rm ?? null,
      previousE1rm: previousBest?.e1rm ?? null,
      isPr: Boolean(isPr),
      firstLogged
    };
  });
}

function focusHits(records, weekDates) {
  const counts = new Map();
  for (const record of records) {
    if (record.status !== 'completed' || !weekDates.includes(record.date)) continue;
    for (const tag of record.focus ?? []) {
      const key = String(tag).trim().toLowerCase();
      if (!key) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([key, count]) => ({ key, label: key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

export function buildFitnessModel({ events, date }) {
  if (!date) throw new RangeError('Fitness display date is unavailable');
  const records = workoutRecords(events);
  const weekDates = enumerateDateKeys(addCalendarDays(date, -(WEEK_DAYS - 1)), date);
  const monthDates = enumerateDateKeys(addCalendarDays(date, -(MONTH_DAYS - 1)), date);
  const heroSession = selectHeroSession(records, date);

  return {
    date,
    dayType: resolveDayType(events, date),
    streak: calculateWorkoutStreak(events, date),
    weekDots: weekDates.map(day => ({
      date: day,
      completed: completedOn(records, day),
      isToday: day === date
    })),
    heroSession,
    weekVolume: weekDates.map(day => ({
      date: day,
      volume: records
        .filter(record => record.date === day && record.status === 'completed')
        .reduce((sum, record) => sum + sessionVolume(record), 0)
    })),
    focusHits: focusHits(records, weekDates),
    comparisons: buildComparisons(heroSession, records),
    month: monthDates.map(day => ({
      date: day,
      completed: completedOn(records, day)
    }))
  };
}
```

Clean up is already done in `buildComparisons` above — keep a single previousBest pass and a single historicalBestE1rm pass.

- [ ] **Step 4: Run — expect PASS**

Run: `node --test tests/unit/fitness-model.test.js`

- [ ] **Step 5: Commit locally (no push)**

```bash
git add js/app/fitness-model.js tests/unit/fitness-model.test.js
git commit -m "$(cat <<'EOF'
feat: add fitness model with hero session, volume, and e1RM PRs

EOF
)"
```

---

### Task 2: Cross-Agent Day Type helper

**Files:**
- Modify: `js/core/constraints.js` — export `CROSS_AGENT_HEADING`
- Modify: `js/core/central-node-write.js`
- Modify: `tests/unit/central-node-write.test.js`
- Modify: `netlify/functions/chat-confirm.mjs` (if applyLog signature changes)
- Modify: `tests/integration/chat-confirm-function.test.js`

- [ ] **Step 1: Export heading**

In `js/core/constraints.js`:

```js
export {
  RECENT_ACTIONS_HEADING,
  TODAYS_STATUS_HEADING,
  CROSS_AGENT_HEADING
};
```

- [ ] **Step 2: Failing tests for Cross-Agent upsert**

```js
import {
  appendCrossAgentDayType,
  applyLogToCentralNode,
  humanizeDayType
} from '../../js/core/central-node-write.js';

test('humanizeDayType matches Home labels', () => {
  assert.equal(humanizeDayType('workout_30'), '30-min Workout');
  assert.equal(humanizeDayType('workout_45_60'), '45–60 min Workout');
  assert.equal(humanizeDayType('movement'), 'Movement day');
});

test('appendCrossAgentDayType inserts under Cross-Agent heading and is idempotent', () => {
  const base = [
    '## 🤝 Cross-Agent Coordination',
    '- Old directive.',
    '---',
    '## 📝 Recent Agent Actions'
  ].join('\n');
  const record = {
    type: 'workout',
    date: '2026-07-30',
    status: 'completed',
    title: 'Chest and Curls',
    day_type: 'workout_30'
  };
  const once = appendCrossAgentDayType(base, record);
  assert.match(once, /Chadwick→Brisket: 30 Jul session completed, Chest and Curls\. Set Day Type to 30-min Workout\./);
  const twice = appendCrossAgentDayType(once, record);
  assert.equal(twice, once);
});

test('applyLogToCentralNode adds Cross-Agent line for completed workouts', () => {
  const base = [
    '# Purpose',
    '---',
    "## ⚡ Today's Status (Wednesday 30 July 2026)",
    '**Exercise:** prior.',
    '---',
    '## 🤝 Cross-Agent Coordination',
    '- Keep me.',
    '---',
    '## 📝 Recent Agent Actions'
  ].join('\n');
  const record = {
    type: 'workout',
    date: '2026-07-30',
    status: 'completed',
    title: 'Chest and Curls',
    day_type: 'workout_30',
    duration_min: 26
  };
  const next = applyLogToCentralNode(base, {
    record,
    actionLine: '\n**30 Jul:** Chadwick Flexington: Logged a session.'
  });
  assert.match(next, /Chadwick→Brisket: 30 Jul session completed/);
  assert.match(next, /\*\*30 Jul:\*\* Chadwick Flexington/);
});
```

- [ ] **Step 3: Implement helpers in `central-node-write.js`**

```js
import {
  RECENT_ACTIONS_HEADING,
  TODAYS_STATUS_HEADING,
  CROSS_AGENT_HEADING
} from './constraints.js';

export function humanizeDayType(dayType) {
  switch (dayType) {
    case 'workout_30': return '30-min Workout';
    case 'workout_45_60': return '45–60 min Workout';
    case 'movement': return 'Movement day';
    default: return dayType ?? 'Workout';
  }
}

export function buildCrossAgentDayTypeLine(record) {
  const title = record.title?.trim() || 'session';
  return `- Chadwick→Brisket: ${formatLogDate(record.date)} session completed, ${title}. Set Day Type to ${humanizeDayType(record.day_type)}.`;
}

export function appendCrossAgentDayType(content, record) {
  if (record?.type !== 'workout' || record.status !== 'completed') return content;
  const line = buildCrossAgentDayTypeLine(record);
  const headingIndex = content.indexOf(CROSS_AGENT_HEADING);
  if (headingIndex === -1) return content;
  // Idempotency: same date + Set Day Type already present
  const dateToken = formatLogDate(record.date);
  const sectionStart = headingIndex + CROSS_AGENT_HEADING.length;
  const after = content.slice(sectionStart);
  const endRel = after.search(/\n## /);
  const section = endRel === -1 ? after : after.slice(0, endRel);
  if (section.includes(dateToken) && section.includes('Set Day Type to') && section.includes('Chadwick→Brisket')) {
    return content;
  }
  const insertAt = sectionStart;
  return `${content.slice(0, insertAt)}\n${line}${content.slice(insertAt)}`;
}
```

At end of `applyLogToCentralNode`, after Status updates:

```js
  next = appendCrossAgentDayType(next, record);
  return next;
```

(Only completed workouts get the Cross-Agent line; meals unchanged.)

- [ ] **Step 4: Integration test — workout confirm writes Day Type**

Extend `tests/integration/chat-confirm-function.test.js` with a completed workout candidate and central-node fixture that includes Cross-Agent heading; assert PUT body matches `Chadwick→Brisket` + `Set Day Type`.

Workout candidate example:

```js
const workoutCandidate = {
  type: 'workout',
  date: '2026-08-01',
  fields: {
    title: 'Chest and Curls',
    day_type: 'workout_30',
    status: 'completed',
    duration_min: 26,
    focus: ['chest', 'arms'],
    recovery_flag_next_day: false,
    exercises: [{ name: 'Chest Press', sets: [{ reps: 10, weight_kg: 32 }] }],
    pain_flags: []
  }
};
```

- [ ] **Step 5: Run**

Run: `node --test tests/unit/central-node-write.test.js tests/integration/chat-confirm-function.test.js`  
Expected: PASS

- [ ] **Step 6: Commit locally (no push)**

```bash
git add js/core/constraints.js js/core/central-node-write.js tests/unit/central-node-write.test.js netlify/functions/chat-confirm.mjs tests/integration/chat-confirm-function.test.js
git commit -m "$(cat <<'EOF'
feat: append Chadwick→Brisket Day Type on workout confirm

EOF
)"
```

---

### Task 3: Fitness dashboard markup + CSS

**Files:**
- Modify: `index.html`
- Modify: `css/app.css`

- [ ] **Step 1: Add `#fitness-dashboard` before or after nutrition section** (hidden by default), including:

- Streak strip: `[data-fitness="streak"]`, `#fitness-week-dots`, `[data-fitness="day-type"]`
- Hero: `[data-fitness-hero]`, title/duration/status empty-state `[data-fitness="hero-empty"]`, `#fitness-exercise-list`, `#fitness-pain-flags`, `[data-fitness="hero-notes"]`
- Week volume: `#fitness-week-volume` (column-chart host)
- Focus hits: `#fitness-focus-strip`
- Comparisons: `#fitness-comparisons`
- Heatmap: `#fitness-heatmap`
- Button: `#fitness-chat-button` class `floating-chat-button`

Skeleton (abridged — expand fully in implementation):

```html
<section id="fitness-dashboard" class="dashboard" aria-labelledby="fitness-heading" hidden>
  <div class="section-heading">
    <div>
      <p class="section-kicker">Fitness</p>
      <h2 id="fitness-heading">Training</h2>
    </div>
  </div>

  <article class="metric-card fitness-streak-card">
    <div class="fitness-streak-strip">
      <div>
        <p class="metric-label">Streak</p>
        <p class="metric-value"><strong data-fitness="streak">—</strong><span> day streak</span></p>
      </div>
      <p class="fitness-day-type" data-fitness="day-type">—</p>
      <div id="fitness-week-dots" class="fitness-week-dots" aria-label="Last 7 days of sessions"></div>
    </div>
  </article>

  <article class="metric-card fitness-hero-card" aria-labelledby="fitness-hero-label">
    <p class="metric-label" id="fitness-hero-label">Session</p>
    <p data-fitness="hero-empty" hidden>No session yet — talk to Chadwick</p>
    <div data-fitness-hero>
      <h3 data-fitness="hero-title">—</h3>
      <p class="metric-caption">
        <span data-fitness="hero-duration">—</span>
        · <span data-fitness="hero-status">—</span>
      </p>
      <div id="fitness-focus-tags" class="fitness-tags"></div>
      <div id="fitness-exercise-list" class="fitness-exercise-list"></div>
      <div id="fitness-pain-flags" class="fitness-tags"></div>
      <p class="metric-caption" data-fitness="hero-notes"></p>
    </div>
  </article>

  <article class="metric-card chart-card">
    <p class="metric-label">7-day volume</p>
    <div id="fitness-week-volume" class="column-chart" aria-label="Training volume last 7 days"></div>
  </article>

  <article class="metric-card">
    <p class="metric-label">Focus this week</p>
    <div id="fitness-focus-strip" class="fitness-focus-strip"></div>
  </article>

  <article class="metric-card">
    <p class="metric-label">Vs last time</p>
    <div id="fitness-comparisons" class="fitness-comparisons"></div>
  </article>

  <article class="metric-card chart-card">
    <p class="metric-label">30-day consistency</p>
    <div id="fitness-heatmap" class="heatmap-grid" aria-label="Completed workouts last 30 days"></div>
  </article>

  <button id="fitness-chat-button" class="floating-chat-button" type="button" aria-label="Chat with Chadwick">💬</button>
</section>
```

- [ ] **Step 2: CSS** — soft-medical fitness layout using existing tokens (`--ring-protein`, `--chart-label`, etc.). Include `.fitness-week-dots span[data-hit]`, `.fitness-hero-card .fitness-exercise-list` max-height + overflow, `.pr-badge`, `.fitness-focus-strip`.

- [ ] **Step 3: Commit locally (no push)**

```bash
git add index.html css/app.css
git commit -m "$(cat <<'EOF'
feat: add Fitness dashboard markup and soft-medical styles

EOF
)"
```

---

### Task 4: `render-fitness.js`

**Files:**
- Create: `js/app/render-fitness.js`

- [ ] **Step 1: Implement renderer**

```js
import { animateColumnGrow } from './chart-kit/animate.js';
import { buildColumns } from './chart-kit/columns.js';

const DAY_TYPE_LABELS = {
  movement: 'Movement day',
  workout_30: '30-minute workout',
  workout_45_60: '45–60 minute workout'
};

const setText = (root, selector, value) => {
  const element = root.querySelector(selector);
  if (element) element.textContent = String(value);
};

const weekdayLetter = date => new Intl.DateTimeFormat('en-AU', {
  weekday: 'narrow'
}).format(new Date(`${date}T12:00:00+10:00`));

export function renderFitness(root, model) {
  setText(root, '[data-fitness="streak"]', model.streak);
  setText(root, '[data-fitness="day-type"]', DAY_TYPE_LABELS[model.dayType] ?? model.dayType);

  const dots = root.querySelector('#fitness-week-dots');
  if (dots) {
    dots.replaceChildren();
    for (const day of model.weekDots) {
      const el = root.createElement('span');
      el.dataset.hit = String(day.completed);
      if (day.isToday) el.dataset.today = 'true';
      el.title = day.date;
      dots.append(el);
    }
  }

  const empty = root.querySelector('[data-fitness="hero-empty"]');
  const heroWrap = root.querySelector('[data-fitness-hero]');
  if (!model.heroSession) {
    empty?.removeAttribute('hidden');
    heroWrap?.setAttribute('hidden', '');
  } else {
    empty?.setAttribute('hidden', '');
    heroWrap?.removeAttribute('hidden');
    renderHero(root, model.heroSession);
  }

  renderWeekVolume(root, model.weekVolume);
  renderFocusStrip(root, model.focusHits);
  renderComparisons(root, model.comparisons);
  renderHeatmap(root, model.month);

  root.querySelector('#fitness-dashboard')?.removeAttribute('hidden');
}

function renderHero(root, session) {
  setText(root, '[data-fitness="hero-title"]', session.title ?? 'Session');
  setText(root, '[data-fitness="hero-duration"]', session.duration_min != null ? `${session.duration_min} min` : '—');
  setText(root, '[data-fitness="hero-status"]', session.status ?? '—');
  // tags, exercises, pain_flags, notes — createElement text only
}

function renderWeekVolume(root, weekVolume) {
  const host = root.querySelector('#fitness-week-volume');
  if (!host) return;
  const chart = buildColumns(weekVolume.map(day => ({
    key: day.date,
    label: weekdayLetter(day.date),
    value: day.volume
  })));
  host.replaceChildren();
  for (const bar of chart.bars) {
    const col = root.createElement('div');
    col.className = 'column-bar';
    const fill = root.createElement('span');
    col.append(fill);
    const label = root.createElement('span');
    label.textContent = bar.label;
    col.append(label);
    host.append(col);
    animateColumnGrow(fill, bar.heightPct);
  }
}

function renderFocusStrip(root, focusHits) { /* pills with count */ }
function renderComparisons(root, comparisons) {
  // rows: name, current vs previous, PR badge or "first logged"
}
function renderHeatmap(root, month) {
  const grid = root.querySelector('#fitness-heatmap');
  if (!grid) return;
  grid.replaceChildren();
  for (const day of month) {
    const tile = root.createElement('span');
    tile.className = 'heatmap-tile';
    tile.dataset.hit = String(day.completed);
    tile.title = day.date;
    grid.append(tile);
  }
}
```

Fill `renderHero` / focus / comparisons completely (no placeholders) using `createElement` + `textContent` only.

- [ ] **Step 2: Commit locally (no push)**

```bash
git add js/app/render-fitness.js
git commit -m "$(cat <<'EOF'
feat: render Fitness dashboard from fitness model

EOF
)"
```

---

### Task 5: Wire app-controller + main + service worker

**Files:**
- Modify: `js/app/app-controller.js`
- Modify: `js/app/main.js`
- Modify: `service-worker.js`
- Modify: `tests/unit/app-controller.test.js`

- [ ] **Step 1: Controller changes**

- Export `FITNESS_AGENT_SLUG = 'chadwick'`
- Accept `buildFitnessModel`, `renderFitness` deps
- Remove `fitness` from the “later phase” catch-all (only bind later-phase for remaining stubs: skincare, mind, body, etc.)
- `showSection`: hide/show `#fitness-dashboard`; call `renderFitnessSection` when `name === 'fitness'`
- `SECTION_TITLES.fitness = { eyebrow: 'Fitness', title: 'Fitness' }`
- On refresh when `currentSection === 'fitness'`, re-render
- Wire `#fitness-chat-button` like nutrition (open panel on `#fitness-dashboard` with Chadwick colour)

- [ ] **Step 2: `main.js`**

```js
import { buildFitnessModel } from './fitness-model.js';
import { renderFitness } from './render-fitness.js';
// pass into createAppController
DEFAULT_AGENT_BY_SECTION.fitness = FITNESS_AGENT_SLUG;
```

- [ ] **Step 3: Service worker**

`CACHE_NAME = 'life-hub-shell-v19'` and add:

```js
'js/app/fitness-model.js',
'js/app/render-fitness.js',
```

Also add `js/core/central-node-write.js` only if any browser module imports it (it should not — server-only). Do **not** precache it unless a client import appears.

- [ ] **Step 4: Update `app-controller.test.js`** — fitness no longer “later phase”; mirror nutrition section tests lightly.

- [ ] **Step 5: Run**

Run: `npm test`  
Expected: PASS

- [ ] **Step 6: Commit locally (no push)**

```bash
git add js/app/app-controller.js js/app/main.js service-worker.js tests/unit/app-controller.test.js
git commit -m "$(cat <<'EOF'
feat: wire Fitness tab into app controller and shell cache

EOF
)"
```

---

### Task 6: Browser acceptance + docs

**Files:**
- Create: `tests/browser/fitness.spec.mjs`
- Modify: `package.json` `test:browser` script
- Modify: `docs/IMPLEMENTATION_STATUS.md`

- [ ] **Step 1: Browser spec** (pattern from `nutrition.spec.mjs`)

```js
test('the Fitness tab renders the fixture workout and opens Chadwick chat', async () => {
  // sign in → click data-section=fitness
  // assert hero title matches Chest and Curls (fixture)
  // assert streak / heatmap present
  // open #fitness-chat-button → --agent-accent #2E7BD6
});
```

- [ ] **Step 2: package.json**

```json
"test:browser": "node --test --test-concurrency=1 tests/browser/home.spec.mjs tests/browser/chat.spec.mjs tests/browser/nutrition.spec.mjs tests/browser/central-node.spec.mjs tests/browser/fitness.spec.mjs"
```

- [ ] **Step 3: Run**

Run: `npm test && npm run test:browser`  
Expected: all PASS

- [ ] **Step 4: Status doc** — Phase 10 Fitness tab complete; note Day Type Cross-Agent; remind push deferred.

- [ ] **Step 5: Commit locally (no push)**

```bash
git add tests/browser/fitness.spec.mjs package.json docs/IMPLEMENTATION_STATUS.md
git commit -m "$(cat <<'EOF'
test: add Fitness browser coverage and record phase status

EOF
)"
```

---

## Self-review (plan vs spec)

| Spec requirement | Task |
|---|---|
| Fitness-first streak + hero | Tasks 1, 3, 4 |
| planned → else last completed | Task 1 |
| Week volume, focus strip, vs-last, e1RM PRs, heatmap | Tasks 1, 3, 4 |
| Chadwick chat accent/default | Task 5, 6 |
| Cross-Agent Day Type on completed workout | Task 2 |
| Soft-medical / chart-kit | Tasks 3–4 |
| No push unless asked | Header + every commit step |

**Placeholder scan:** Task 4 notes say fill hero/focus/comparisons completely — implementer must expand those functions fully (no stub bodies in the final commit).

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-05-fitness-tab.md`.

Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — run tasks in this session with checkpoints  

Which approach?
