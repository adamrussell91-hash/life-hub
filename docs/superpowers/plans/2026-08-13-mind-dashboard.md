# Mind Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Mind tab into a read-only pane of mood/energy charts, Vera sessions, Mind Insights, Vera/Penelope Cross-Agent lines, and a dual-gap silence chip.

**Architecture:** Extend `mind-model.js` / `render-mind.js` in place. `buildMindModel` also takes `governanceLogMarkdown` and `centralNodeMarkdown` (already on `latestResult`). No new record types. Session-memory may not have shipped — sessions/insights/cross-agent render empty states. Silence uses all-time gaps, not the range window. Cross-Agent is current-state (not range-clipped). Everyday gap copy stays on the session-memory ambient line (not this work).

**Tech Stack:** Existing Life Hub stack — static PWA, vanilla ES modules, `node --test`, no new runtime deps.

**Spec:** `docs/superpowers/specs/2026-08-13-mind-dashboard-design.md`  
**Repo:** `/Users/adamrussell/Documents/Claude/Projects/life-hub`  
**Deploy rule:** Local commits only. **Never `git push`.** Adam pushes himself.  
**Baseline:** `npm test` then `npm run validate:fixtures` after every task. SW cache currently `life-hub-shell-v69`.

---

## File map

| File | Responsibility |
|---|---|
| `js/app/mind-model.js` | `sessionEntries`, `entriesByEnergy`, gap helpers, `silenceFlag`, `mindInsights`, `mindCrossAgentLines`; extend `buildMindModel` |
| `tests/unit/mind-model.test.js` | New helpers + `buildMindModel` return shape |
| `js/app/render-mind.js` | Energy columns, session cards, insight list, cross-agent strip, silence chip |
| `tests/unit/render-mind.test.js` | **Create.** Empty + populated states for the five new surfaces |
| `index.html` | Hosts: `#mind-silence`, `#mind-energy-columns`, `#mind-sessions`, `#mind-insights`, `#mind-cross-agent` |
| `css/app.css` | `.mind-session-card`, energy column colour, silence/insights/cross-agent layout, governance-entry compact styles |
| `js/app/app-controller.js` | Pass `governanceLogMarkdown` + `centralNodeMarkdown` into `buildMindModel` |
| `service-worker.js` | `CACHE_NAME` → `life-hub-shell-v70` |
| `docs/IMPLEMENTATION_STATUS.md` | Phase 35 when the slice ships |

**Hard constraints**

1. Read-only. No write path, no Confirm card, no quick-log form.
2. Do not re-implement `moods[]` counting or the ambient line — those belong to session-memory.
3. Gap helpers use `daysBetween` against the **full** diary/session lists and `date`. Never the range window. `null` gap is not silence.
4. Insights: `parseGovernanceEntries` on the **full** log. Do not call `recentGovernanceTail`.
5. Cross-Agent: `extractCrossAgentCoordination` + prefix filter. Not range-clipped.
6. Names: `daysSinceLastDiary` / `daysSinceLastMindSession`. Do not import or reuse Chadwick's `daysSinceLastSession`.
7. Bump `CACHE_NAME` once on the first client JS/HTML/CSS change. Do not push.

---

### Task 1: Session entries, energy bars, gaps, silence

**Files:**
- Modify: `js/app/mind-model.js`
- Modify: `tests/unit/mind-model.test.js`

- [ ] **Step 1: Write the failing tests**

Add to `tests/unit/mind-model.test.js` (keep existing tests). Import the new names:

```js
import {
  buildMindModel,
  diaryEntries,
  entriesByEnergy,
  entriesByMood,
  moodScoreSeries,
  recurringThemes,
  rangeWindow,
  sessionEntries,
  daysSinceLastDiary,
  daysSinceLastMindSession,
  silenceFlag
} from '../../js/app/mind-model.js';
```

```js
test('sessionEntries maps mind_session records and ignores diary', () => {
  const events = [
    { record: { type: 'diary', date: '2026-08-01', mood: 'good' }, path: 'd' },
    {
      record: {
        type: 'mind_session',
        date: '2026-08-10',
        theme: 'Weekend',
        closing_question: 'What is the weekend for?',
        insight: 'Rest is not a prize.',
        mood_at_open: 'low',
        mood_at_close: 'good',
        cross_agent_note: 'Vera→Penelope: ask what the weekend is actually for.'
      },
      path: 'data/mind/2026/08/2026-08-10-session.md'
    }
  ];
  const sessions = sessionEntries(events);
  assert.equal(sessions.length, 1);
  assert.deepEqual(sessions[0], {
    date: '2026-08-10',
    theme: 'Weekend',
    closingQuestion: 'What is the weekend for?',
    insight: 'Rest is not a prize.',
    moodAtOpen: 'low',
    moodAtClose: 'good',
    crossAgentNote: 'Vera→Penelope: ask what the weekend is actually for.',
    path: 'data/mind/2026/08/2026-08-10-session.md'
  });
});

test('entriesByEnergy counts diary energy in range', () => {
  const entries = diaryEntries([
    { record: { type: 'diary', date: '2026-08-01', energy: 'high' }, path: 'a' },
    { record: { type: 'diary', date: '2026-08-03', energy: 'low' }, path: 'b' },
    { record: { type: 'diary', date: '2026-08-04', energy: 'low' }, path: 'c' },
    { record: { type: 'diary', date: '2026-07-01', energy: 'high' }, path: 'old' }
  ]);
  const byEnergy = entriesByEnergy(entries, rangeWindow('2026-08-05', 'weekly'));
  assert.deepEqual(byEnergy.map(item => item.key), ['high', 'medium', 'low']);
  assert.equal(byEnergy.find(item => item.key === 'high').value, 1);
  assert.equal(byEnergy.find(item => item.key === 'medium').value, 0);
  assert.equal(byEnergy.find(item => item.key === 'low').value, 2);
});

test('daysSinceLastDiary and daysSinceLastMindSession use all-time dates, not the range', () => {
  const entries = diaryEntries([
    { record: { type: 'diary', date: '2026-08-01', mood: 'good' }, path: 'd' }
  ]);
  const sessions = sessionEntries([
    { record: { type: 'mind_session', date: '2026-08-04', theme: 'Anchor' }, path: 's' }
  ]);
  assert.equal(daysSinceLastDiary(entries, '2026-08-13'), 12);
  assert.equal(daysSinceLastMindSession(sessions, '2026-08-13'), 9);
  assert.equal(daysSinceLastDiary([], '2026-08-13'), null);
  assert.equal(daysSinceLastMindSession([], '2026-08-13'), null);
});

test('silenceFlag is true only when both gaps are numbers >= 7', () => {
  assert.equal(silenceFlag(12, 9), true);
  assert.equal(silenceFlag(7, 7), true);
  assert.equal(silenceFlag(6, 9), false);
  assert.equal(silenceFlag(12, 6), false);
  assert.equal(silenceFlag(null, null), false);
  assert.equal(silenceFlag(12, null), false);
  assert.equal(silenceFlag(null, 9), false);
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
node --test tests/unit/mind-model.test.js
```

Expected: FAIL (`sessionEntries` is not exported).

- [ ] **Step 3: Implement**

In `js/app/mind-model.js`, import `daysBetween`:

```js
import { addCalendarDays, daysBetween, isCalendarDate } from '../core/time.js';
```

Add after `MOOD_ORDER`:

```js
export const ENERGY_ORDER = ['high', 'medium', 'low'];
```

Add after `diaryEntries`:

```js
export function sessionEntries(events) {
  return (events ?? [])
    .filter(event => event?.record?.type === 'mind_session' && isCalendarDate(event.record.date))
    .map(event => ({
      date: event.record.date,
      theme: event.record.theme ?? null,
      closingQuestion: event.record.closing_question ?? null,
      insight: event.record.insight ?? null,
      moodAtOpen: event.record.mood_at_open ?? null,
      moodAtClose: event.record.mood_at_close ?? null,
      crossAgentNote: event.record.cross_agent_note ?? null,
      path: event.path
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function entriesByEnergy(entries, bounds) {
  const counts = Object.fromEntries(ENERGY_ORDER.map(level => [level, 0]));
  for (const entry of entries) {
    if (entry.date < bounds.from || entry.date > bounds.to) continue;
    if (entry.energy && Object.hasOwn(counts, entry.energy)) counts[entry.energy] += 1;
  }
  return ENERGY_ORDER.map(level => ({
    key: level,
    label: level[0].toUpperCase() + level.slice(1),
    value: counts[level]
  }));
}

function daysSinceLast(dates, date) {
  if (!isCalendarDate(date)) return null;
  const last = (dates ?? []).filter(isCalendarDate).sort().at(-1);
  if (!last) return null;
  return daysBetween(last, date);
}

export function daysSinceLastDiary(entries, date) {
  return daysSinceLast((entries ?? []).map(entry => entry.date), date);
}

export function daysSinceLastMindSession(sessions, date) {
  return daysSinceLast((sessions ?? []).map(session => session.date), date);
}

export function silenceFlag(diaryGap, sessionGap) {
  return typeof diaryGap === 'number' && typeof sessionGap === 'number'
    && diaryGap >= 7 && sessionGap >= 7;
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
node --test tests/unit/mind-model.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add js/app/mind-model.js tests/unit/mind-model.test.js
git commit -m "$(cat <<'EOF'
feat: add Mind session, energy, and silence model helpers

EOF
)"
```

---

### Task 2: Mind Insights + Cross-Agent line filter

**Files:**
- Modify: `js/app/mind-model.js`
- Modify: `tests/unit/mind-model.test.js`

- [ ] **Step 1: Write the failing tests**

Do **not** use `appendGovernanceEntry` for `Mind Insight` — that type is not in `GOVERNANCE_ENTRY_TYPES` until session-memory ships. Build markdown strings.

```js
test('mindInsights filters Mind Insight entries in range and ignores the 10-entry tail cap', () => {
  const blocks = [];
  for (let i = 0; i < 11; i += 1) {
    const day = String(i + 1).padStart(2, '0');
    blocks.push(`## 2026-07-${day} — Coach's Notes\n\nOld note ${i}.\n`);
  }
  blocks.push(`## 2026-08-02 — Mind Insight\n**Title:** Weekend\n**Status:** Still Active\n\nRest is not a prize.\n`);
  blocks.push(`## 2026-06-01 — Mind Insight\n**Title:** Too old\n\nOutside monthly window.\n`);
  const markdown = `# Governance Log\n\n${blocks.join('\n')}`;
  const insights = mindInsights(markdown, rangeWindow('2026-08-13', 'monthly'));
  assert.equal(insights.length, 1);
  assert.equal(insights[0].entryType, 'Mind Insight');
  assert.equal(insights[0].title, 'Weekend');
  assert.equal(insights[0].body, 'Rest is not a prize.');
  assert.equal(insights[0].status, 'Still Active');
});

test('mindCrossAgentLines keeps Vera/Penelope prefixes and drops others', () => {
  const markdown = `# Purpose
## 🤝 Cross-Agent Coordination
*One-line directives only.*
- Chadwick→Sara: AC flag.
- **Vera→Penelope:** ask what the weekend is actually for.
- Penelope→Vera: the wedding scent came up.
- Hammond→Ann: teaching handoff.
- Brisket→Penelope: skip dessert logging.
`;
  const lines = mindCrossAgentLines(markdown);
  assert.deepEqual(lines, [
    'Vera→Penelope: ask what the weekend is actually for.',
    'Penelope→Vera: the wedding scent came up.',
    'Brisket→Penelope: skip dessert logging.'
  ]);
});
```

Import `mindInsights` and `mindCrossAgentLines`.

- [ ] **Step 2: Run — expect FAIL**

```bash
node --test tests/unit/mind-model.test.js
```

Expected: FAIL (exports missing).

- [ ] **Step 3: Implement**

```js
import { extractCrossAgentCoordination } from '../core/constraints.js';
import { parseGovernanceEntries } from '../core/governance-log.js';
```

```js
const CROSS_AGENT_MARKERS = ['Vera→', 'Penelope→', '→Vera', '→Penelope'];

export function mindInsights(governanceLogMarkdown, bounds) {
  return parseGovernanceEntries(governanceLogMarkdown ?? '')
    .filter(entry => entry.entryType === 'Mind Insight')
    .filter(entry => entry.dateKey && entry.dateKey >= bounds.from && entry.dateKey <= bounds.to);
}

export function mindCrossAgentLines(centralNodeMarkdown) {
  const section = extractCrossAgentCoordination(centralNodeMarkdown ?? '');
  if (!section) return [];
  return section
    .split('\n')
    .map(line => line.replace(/^\s*[-*]\s+/, '').replace(/^\*\*/, '').replace(/\*\*/g, '').trim())
    .filter(line => line && CROSS_AGENT_MARKERS.some(marker => line.includes(marker)));
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
node --test tests/unit/mind-model.test.js
```

Expected: PASS. If the Brisket→Penelope assertion fails because of `→Penelope` matching, that is correct per spec — keep it.

- [ ] **Step 5: Commit**

```bash
git add js/app/mind-model.js tests/unit/mind-model.test.js
git commit -m "$(cat <<'EOF'
feat: filter Mind Insights and Vera/Penelope cross-agent lines

EOF
)"
```

---

### Task 3: `buildMindModel` return shape

**Files:**
- Modify: `js/app/mind-model.js`
- Modify: `tests/unit/mind-model.test.js`

- [ ] **Step 1: Failing test**

```js
test('buildMindModel returns sessions, energy, insights, cross-agent lines, and silence', () => {
  const events = [
    { record: { type: 'diary', date: '2026-08-01', mood_score: 4, mood: 'low', energy: 'low', tags: [] }, path: 'd' },
    { record: { type: 'mind_session', date: '2026-08-04', theme: 'Weekend', closing_question: 'What for?' }, path: 's' }
  ];
  const model = buildMindModel({
    events,
    date: '2026-08-13',
    range: 'monthly',
    governanceLogMarkdown: `# Governance Log\n\n## 2026-08-04 — Mind Insight\n**Title:** Weekend\n\nRest is not a prize.\n`,
    centralNodeMarkdown: `## 🤝 Cross-Agent Coordination\n- Vera→Penelope: ask what the weekend is actually for.\n- Chadwick→Sara: AC flag.\n`
  });
  assert.equal(model.sessions.length, 1);
  assert.equal(model.sessions[0].theme, 'Weekend');
  assert.equal(model.energyByLevel.find(item => item.key === 'low').value, 1);
  assert.equal(model.insights.length, 1);
  assert.equal(model.insights[0].title, 'Weekend');
  assert.deepEqual(model.crossAgentLines, ['Vera→Penelope: ask what the weekend is actually for.']);
  assert.equal(model.daysSinceLastDiary, 12);
  assert.equal(model.daysSinceLastMindSession, 9);
  assert.equal(model.silence, true);
});

test('buildMindModel clips sessions and insights to the range window, not cross-agent or silence', () => {
  const model = buildMindModel({
    events: [
      { record: { type: 'mind_session', date: '2026-06-01', theme: 'Old' }, path: 'old' },
      { record: { type: 'mind_session', date: '2026-08-10', theme: 'New' }, path: 'new' }
    ],
    date: '2026-08-13',
    range: 'weekly',
    governanceLogMarkdown: `# Governance Log\n\n## 2026-06-01 — Mind Insight\n**Title:** Old\n\nGone.\n\n## 2026-08-10 — Mind Insight\n**Title:** New\n\nHere.\n`,
    centralNodeMarkdown: `## 🤝 Cross-Agent Coordination\n- Vera→Penelope: still on the board.\n`
  });
  assert.deepEqual(model.sessions.map(s => s.theme), ['New']);
  assert.deepEqual(model.insights.map(i => i.title), ['New']);
  assert.deepEqual(model.crossAgentLines, ['Vera→Penelope: still on the board.']);
  assert.equal(model.daysSinceLastMindSession, 3);
  assert.equal(model.silence, false);
});
```

- [ ] **Step 2: Run — expect FAIL** (`model.sessions` undefined)

```bash
node --test tests/unit/mind-model.test.js
```

- [ ] **Step 3: Extend `buildMindModel`**

Signature becomes `{ events, date, range = DEFAULT_MIND_RANGE, governanceLogMarkdown, centralNodeMarkdown }`.

After existing `themes` computation:

```js
  const allSessions = sessionEntries(events);
  const sessions = allSessions
    .filter(session => session.date >= bounds.from && session.date <= bounds.to)
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date) || a.path.localeCompare(b.path));
  const energyByLevel = entriesByEnergy(entries, bounds);
  const insights = mindInsights(governanceLogMarkdown, bounds);
  const crossAgentLines = mindCrossAgentLines(centralNodeMarkdown);
  const diaryGap = daysSinceLastDiary(entries, date);
  const sessionGap = daysSinceLastMindSession(allSessions, date);

  return {
    date,
    range: selectedRange,
    rangeLabel: selectedRange === 'weekly' ? 'Weekly' : selectedRange === 'monthly' ? 'Monthly' : '6M',
    entryCount: entries.filter(entry => entry.date >= bounds.from && entry.date <= bounds.to).length,
    moodSeries,
    byMood,
    themes,
    sessions,
    energyByLevel,
    insights,
    crossAgentLines,
    daysSinceLastDiary: diaryGap,
    daysSinceLastMindSession: sessionGap,
    silence: silenceFlag(diaryGap, sessionGap),
    empty: moodSeries.length === 0 && byMood.every(item => item.value === 0) && themes.length === 0
  };
```

Sessions in the returned model are newest-first. Insights keep `parseGovernanceEntries` order (newest-first if the log is newest-first).

- [ ] **Step 4: Run — expect PASS**

```bash
node --test tests/unit/mind-model.test.js
```

- [ ] **Step 5: Commit**

```bash
git add js/app/mind-model.js tests/unit/mind-model.test.js
git commit -m "$(cat <<'EOF'
feat: surface sessions, energy, insights, and silence on the Mind model

EOF
)"
```

---

### Task 4: Render the five new surfaces

**Files:**
- Create: `tests/unit/render-mind.test.js`
- Modify: `js/app/render-mind.js`
- Modify: `index.html`

- [ ] **Step 1: Write failing render tests**

Create `tests/unit/render-mind.test.js` using the same fake-DOM pattern as `tests/unit/render-bloods.test.js` (`el` / `collect` / `matches`). Hosts the fake root must expose:

- `#mind-dashboard`
- `#mind-range-control` (with `querySelectorAll` returning `[]`)
- `[data-mind="entry-count"]`
- `#mind-mood-chart` (with `[data-role="area"]` and `[data-role="line"]` children)
- `#mind-mood-columns`, `#mind-theme-columns`, `#mind-energy-columns`
- `#mind-empty`
- `#mind-silence`, `#mind-sessions`, `#mind-insights`, `#mind-cross-agent`
- `[data-mind-agent]` buttons (optional; `querySelectorAll` can return `[]`)

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderMind } from '../../js/app/render-mind.js';

// ... fake DOM helpers from render-bloods.test.js, adapted ...

function emptyModel(overrides = {}) {
  return {
    date: '2026-08-13',
    range: 'monthly',
    rangeLabel: 'Monthly',
    entryCount: 0,
    moodSeries: [],
    byMood: [],
    themes: [],
    sessions: [],
    energyByLevel: [],
    insights: [],
    crossAgentLines: [],
    daysSinceLastDiary: null,
    daysSinceLastMindSession: null,
    silence: false,
    empty: true,
    ...overrides
  };
}

test('renderMind shows empty states for sessions, insights, and cross-agent', () => {
  const root = fakeRoot();
  renderMind(root, emptyModel());
  assert.match(root._sessions.textContent, /No sessions logged yet/);
  assert.match(root._insights.textContent, /No governance entries yet/);
  assert.match(root._cross.textContent, /No Vera or Penelope coordination lines yet/);
  assert.equal(root._silence.hidden, true);
  assert.equal(root._silence.children.length, 0);
});

test('renderMind renders energy columns, session cards, insights, cross-agent, and silence', () => {
  const root = fakeRoot();
  renderMind(root, emptyModel({
    empty: false,
    entryCount: 1,
    energyByLevel: [
      { key: 'high', label: 'High', value: 1 },
      { key: 'medium', label: 'Medium', value: 0 },
      { key: 'low', label: 'Low', value: 2 }
    ],
    sessions: [{
      date: '2026-08-10',
      theme: 'Weekend',
      closingQuestion: 'What is the weekend for?',
      insight: 'Rest is not a prize.',
      moodAtOpen: 'low',
      moodAtClose: 'good',
      crossAgentNote: null,
      path: 's'
    }],
    insights: [{
      dateKey: '2026-08-10',
      entryType: 'Mind Insight',
      title: 'Weekend',
      status: 'Still Active',
      body: 'Rest is not a prize.'
    }],
    crossAgentLines: ['Vera→Penelope: ask what the weekend is actually for.'],
    silence: true,
    daysSinceLastDiary: 12,
    daysSinceLastMindSession: 9
  }));

  assert.equal(root._energy.children.length, 3);
  const card = root._sessions.querySelector('.mind-session-card');
  assert.ok(card);
  assert.match(card.textContent, /Weekend/);
  assert.match(card.textContent, /What is the weekend for/);
  assert.match(card.textContent, /Rest is not a prize/);
  const insight = root._insights.querySelector('.governance-entry');
  assert.ok(insight);
  assert.match(insight.textContent, /Mind Insight/);
  assert.match(root._cross.textContent, /Vera→Penelope/);
  assert.equal(root._silence.hidden, false);
  assert.match(root._silence.textContent, /12 days since diary/);
  assert.match(root._silence.textContent, /9 days since a Vera session/);
});
```

`fakeRoot` must implement `querySelector` for `#mind-energy-columns` etc. Copy `el`/`matches`/`collect` from `render-bloods.test.js`. For `[data-mind="entry-count"]`, give the caption `dataset.mind = 'entry-count'` and match that selector.

- [ ] **Step 2: Run — expect FAIL** (hosts missing and/or empty copy missing)

```bash
node --test tests/unit/render-mind.test.js
```

- [ ] **Step 3: HTML hosts**

In `index.html`, inside `#mind-dashboard`, after `#mind-range-control` and before `#mind-empty`:

```html
          <div id="mind-silence" class="bloods-flags" hidden></div>
```

After the Mood score article, before Entries by mood:

```html
          <article class="metric-card chart-card">
            <p class="metric-label">Energy</p>
            <div id="mind-energy-columns" class="column-chart" aria-label="Diary entries by energy"></div>
          </article>
```

After Recurring themes, before `.mind-agents`:

```html
          <article class="metric-card" aria-labelledby="mind-sessions-label">
            <p class="metric-label" id="mind-sessions-label">Vera sessions</p>
            <div id="mind-sessions"></div>
          </article>

          <article class="metric-card" aria-labelledby="mind-insights-label">
            <p class="metric-label" id="mind-insights-label">Mind Insights</p>
            <div id="mind-insights"></div>
          </article>

          <article class="metric-card" aria-labelledby="mind-cross-agent-label">
            <p class="metric-label" id="mind-cross-agent-label">Cross-Agent signals</p>
            <div id="mind-cross-agent"></div>
          </article>
```

- [ ] **Step 4: Render functions**

In `js/app/render-mind.js`, after the existing `renderBarHost` calls, add:

```js
  renderBarHost(root, '#mind-energy-columns', model.energyByLevel);
  renderSilenceBanner(root, model);
  renderSessionList(root, model.sessions);
  renderInsightList(root, model.insights);
  renderCrossAgentStrip(root, model.crossAgentLines);
```

Update `renderBarHost` empty copy:

```js
    caption.textContent = selector.includes('theme')
      ? 'No recurring themes in this range yet.'
      : selector.includes('energy')
        ? 'No energy entries in this range yet.'
        : 'No mood entries in this range yet.';
```

Add:

```js
function renderSilenceBanner(root, model) {
  const host = root.querySelector('#mind-silence');
  if (!host) return;
  host.replaceChildren();
  if (!model.silence) {
    host.hidden = true;
    return;
  }
  host.hidden = false;
  const chip = root.createElement('span');
  chip.className = 'body-tape-chip bloods-flag';
  chip.dataset.colour = 'neutral';
  chip.textContent = `${model.daysSinceLastDiary} days since diary · ${model.daysSinceLastMindSession} days since a Vera session.`;
  host.append(chip);
}

function renderSessionList(root, sessions) {
  const host = root.querySelector('#mind-sessions');
  if (!host) return;
  host.replaceChildren();
  if (!sessions?.length) {
    const empty = root.createElement('p');
    empty.className = 'metric-caption';
    empty.textContent = 'No sessions logged yet.';
    host.append(empty);
    return;
  }
  for (const session of sessions) {
    const card = root.createElement('article');
    card.className = 'mind-session-card';
    const date = root.createElement('p');
    date.className = 'mind-session-card__date';
    date.textContent = session.date;
    const title = root.createElement('h3');
    title.className = 'mind-session-card__theme';
    title.textContent = session.theme || 'Vera session';
    card.append(date, title);
    if (session.closingQuestion) {
      const question = root.createElement('p');
      question.className = 'mind-session-card__question';
      question.textContent = session.closingQuestion;
      card.append(question);
    }
    if (session.insight) {
      const insight = root.createElement('p');
      insight.className = 'mind-session-card__insight';
      insight.textContent = session.insight;
      card.append(insight);
    }
    host.append(card);
  }
}

function renderInsightList(root, insights) {
  const host = root.querySelector('#mind-insights');
  if (!host) return;
  host.replaceChildren();
  if (!insights?.length) {
    const empty = root.createElement('p');
    empty.className = 'governance-empty';
    empty.textContent = 'No governance entries yet.';
    host.append(empty);
    return;
  }
  for (const entry of insights) {
    const block = root.createElement('article');
    block.className = 'governance-entry';
    const heading = root.createElement('p');
    heading.className = 'governance-entry-heading';
    heading.textContent = [entry.dateKey, entry.entryType].filter(Boolean).join(' — ');
    block.append(heading);
    if (entry.title) {
      const title = root.createElement('p');
      title.className = 'governance-entry-title';
      title.textContent = entry.title;
      block.append(title);
    }
    if (entry.status) {
      const status = root.createElement('p');
      status.className = 'governance-entry-status';
      status.textContent = entry.status;
      block.append(status);
    }
    if (entry.body) {
      const body = root.createElement('p');
      body.className = 'governance-entry-body';
      body.textContent = entry.body;
      block.append(body);
    }
    host.append(block);
  }
}

function renderCrossAgentStrip(root, lines) {
  const host = root.querySelector('#mind-cross-agent');
  if (!host) return;
  host.replaceChildren();
  if (!lines?.length) {
    const empty = root.createElement('p');
    empty.className = 'metric-caption';
    empty.textContent = 'No Vera or Penelope coordination lines yet.';
    host.append(empty);
    return;
  }
  const list = root.createElement('ul');
  list.className = 'mind-cross-agent';
  for (const line of lines) {
    const item = root.createElement('li');
    item.className = 'mind-cross-agent__line';
    if (line.includes('Vera')) item.dataset.agent = 'vera';
    else if (line.includes('Penelope')) item.dataset.agent = 'penelope';
    item.textContent = line;
    list.append(item);
  }
  host.append(list);
}
```

- [ ] **Step 5: Run — expect PASS**

```bash
node --test tests/unit/render-mind.test.js tests/unit/mind-model.test.js
```

- [ ] **Step 6: Commit**

```bash
git add tests/unit/render-mind.test.js js/app/render-mind.js index.html
git commit -m "$(cat <<'EOF'
feat: render Mind energy, sessions, insights, and silence

EOF
)"
```

---

### Task 5: CSS, controller wiring, cache bump

**Files:**
- Modify: `css/app.css`
- Modify: `js/app/app-controller.js`
- Modify: `service-worker.js`

- [ ] **Step 1: Controller**

In `renderMindSection`, pass the markdown already on `latestResult`:

```js
    const model = buildMindModel({
      events: latestResult.events,
      date: latestResult.date,
      range: mindRange,
      governanceLogMarkdown: latestResult.governanceLogMarkdown,
      centralNodeMarkdown: latestResult.centralNodeMarkdown
    });
```

No new controller test required unless `tests/unit/app-controller.test.js` already stubs `buildMindModel` and would break — if so, extend the stub call, do not add a write path.

- [ ] **Step 2: CSS**

Append to the existing Mind block in `css/app.css` (after `#mind-theme-columns .column-bar`):

```css
#mind-energy-columns .column-bar > span:first-child {
  background: #C85A64;
}
#mind-silence {
  margin: 0 0 1rem;
}
.mind-session-card {
  background: var(--glass);
  border-radius: var(--radius-md);
  padding: 0.9rem 1rem;
  margin: 0 0 0.65rem;
  border-left: 0.28rem solid #263450;
}
.mind-session-card__date {
  margin: 0 0 0.2rem;
  color: var(--wave);
  font-size: 0.67rem;
  font-weight: 800;
  letter-spacing: 0.15em;
  text-transform: uppercase;
}
.mind-session-card__theme {
  margin: 0;
  color: var(--marine);
  font-size: 1.05rem;
}
.mind-session-card__question {
  margin: 0.35rem 0 0;
  color: var(--muted);
  font-size: 0.95rem;
  font-style: italic;
}
.mind-session-card__insight {
  margin: 0.45rem 0 0;
  color: var(--high-sea);
  font-weight: 650;
}
.governance-empty {
  margin: 0;
  color: var(--muted);
  font-size: 0.95rem;
}
.governance-entry {
  margin: 0 0 0.85rem;
}
.governance-entry-heading {
  margin: 0;
  color: var(--wave);
  font-size: 0.67rem;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.governance-entry-title {
  margin: 0.25rem 0 0;
  color: var(--marine);
  font-weight: 700;
}
.governance-entry-status,
.governance-entry-body {
  margin: 0.25rem 0 0;
  color: var(--muted);
  font-size: 0.95rem;
}
.mind-cross-agent {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.45rem;
}
.mind-cross-agent__line {
  margin: 0;
  padding: 0.45rem 0.65rem;
  border-radius: 0.55rem;
  border-left: 0.28rem solid var(--wave);
  background: var(--glass);
  color: var(--ink);
  font-size: 0.95rem;
}
.mind-cross-agent__line[data-agent="vera"] { border-left-color: #263450; }
.mind-cross-agent__line[data-agent="penelope"] { border-left-color: #8F373E; }
```

Also add `#mind-energy-columns` to the existing grouped selector:

```css
#mind-mood-columns .column-bar > span:first-child,
#mind-theme-columns .column-bar > span:first-child,
#mind-energy-columns .column-bar > span:first-child {
  background: #C85A64;
}
```

If you do that, omit the duplicate `#mind-energy-columns` rule above.

- [ ] **Step 3: Cache bump**

In `service-worker.js`:

```js
const CACHE_NAME = 'life-hub-shell-v70';
```

- [ ] **Step 4: Verify**

```bash
node --test tests/unit/mind-model.test.js tests/unit/render-mind.test.js
npm test
npm run validate:fixtures
```

Expected: all passing, 0 failing.

- [ ] **Step 5: Commit**

```bash
git add css/app.css js/app/app-controller.js service-worker.js
git commit -m "$(cat <<'EOF'
feat: style Mind dashboard panels and wire Central Node data

EOF
)"
```

---

### Task 6: Status doc + spec coverage check

**Files:**
- Modify: `docs/IMPLEMENTATION_STATUS.md`

- [ ] **Step 1: Replace the "Next Phase" stub** (keep it below the new section) with:

```md
## Phase 35: Mind dashboard — Complete

Verified on 2026-08-13 (local only — do not push unless asked). Spec: `docs/superpowers/specs/2026-08-13-mind-dashboard-design.md`. Shell cache bumped to `life-hub-shell-v70`.

- Mind tab adds an energy column chart, Vera session cards, Mind Insight feed (`parseGovernanceEntries` on the full log, not the prompt tail), and Vera/Penelope Cross-Agent lines.
- Dual-gap silence chip (both diary and Vera session ≥ 7 days, all-time, `null` is not silence). Everyday gap copy stays on the session-memory ambient line.
- Empty states for sessions / insights / cross-agent so the page holds before session-memory ships.
- Read-only. No write path.
```

- [ ] **Step 2: Spec coverage**

Confirm each layout row has a host and a render path: header count, range, silence, mood line, energy, mood columns, themes, sessions, insights, cross-agent, agent buttons. Confirm `moods[]` and ambient were not re-specified.

- [ ] **Step 3: Full verification**

```bash
npm test && npm run validate:fixtures
```

- [ ] **Step 4: Commit**

```bash
git add docs/IMPLEMENTATION_STATUS.md docs/superpowers/specs/2026-08-13-mind-dashboard-design.md docs/superpowers/plans/2026-08-13-mind-dashboard.md
git commit -m "$(cat <<'EOF'
docs: record Mind dashboard phase and approved spec

EOF
)"
```

---

## Self-review

1. **Spec coverage:** energy columns, session cards, insights (full parse, ranged), cross-agent (unranged, prefix filter), silence chip (both ≥ 7, all-time, null false), HTML hosts, CSS, controller markdown args, CACHE_NAME, empty states, no write path, no ambient duplication, no `moods[]` rewrite.
2. **Placeholders:** none.
3. **Names:** `daysSinceLastDiary` / `daysSinceLastMindSession` / `silenceFlag` consistent across tasks.
