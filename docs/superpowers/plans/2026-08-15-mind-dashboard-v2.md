# Mind Dashboard v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Mind tab as a Clinical Glass masonry analysis board on conversational `diary` / `mind_session` / Mind Insight data, with a one-shot Notion export import so charts populate from day one.

**Architecture:** Extend existing records (no new `type`). Derive all chart series in `mind-model.js`. Render a JS masonry packer + overlay thread sheet. Vendor small d3 layout modules in-repo for stream/sankey/chord/force. Import writes Git markdown under `data/mind/`. Conversation-first logging stays: Vera auto-write `mind_session`, Penelope confirm `diary`.

**Tech Stack:** Static PWA, vanilla ES modules, existing `chart-kit`, `node --test`. Vendored `d3-shape` / `d3-sankey` / `d3-chord` / `d3-force` under `js/app/chart-kit/vendor/` (no runtime CDN, no bundler).

**Spec:** `docs/superpowers/specs/2026-08-15-mind-dashboard-v2-design.md`  
**Repo:** `/Users/adamrussell/Documents/Claude/Projects/life-hub`  
**Deploy rule:** Local commits only. **Never `git push`.** Adam pushes himself.  
**Baseline:** After every task: `npm test` (and `npm run validate:fixtures` when records/fixtures change). `CACHE_NAME` is currently `life-hub-shell-v77` — bump once on the first client HTML/JS/CSS change, then again if later tasks add precache paths.

**Slice note:** Tasks 1–8 are the data layer (PWA still works with empty/fixture data). Tasks 9–16 are the dashboard. Tasks 17–19 are import + agent prompts. Each slice is shippable.

---

## File map

| File | Responsibility |
|---|---|
| `js/core/validate.js` | Optional `source_agent`, `themes[]`, `pattern_tags[]`, `session_type`, `framework`, `observation`, `title`; core field may be `title` or `themes` |
| `tests/unit/records.test.js` | New field accept/reject cases |
| `netlify/functions/_shared/chat-schema.mjs` | `DOMAIN_PROPERTIES.diary` + `mind_session` new keys |
| `js/app/mind-model.js` | Mapping + all derived series |
| `tests/unit/mind-model.test.js` | Derived-series tests |
| `js/app/chart-kit/masonry.js` | Column packer |
| `js/app/chart-kit/vendor/*` | d3 layout builds |
| `js/app/chart-kit/stream.js`, `sankey-flow.js`, `chord.js`, `bump.js`, `horizon.js`, `radial-year.js`, `factor-bars.js` | Pure SVG path/layout helpers |
| `js/app/mind-thread-sheet.js` | Overlay sheet |
| `js/app/render-mind.js` | Tiles, packer, animations, wiring |
| `tests/unit/render-mind.test.js` | Launchers, overlay, hosts |
| `tests/unit/masonry.test.js` | Packer |
| `index.html` | Masonry board hosts; launchers at top |
| `css/app.css` | Tile chrome, masonry, overlay |
| `js/core/mind-import.js` | CSV/markdown → records (pure) |
| `scripts/import-mind-notion.mjs` | CLI over an export folder |
| `tests/unit/mind-import.test.js` | Field map |
| `config/vera-protocol.md`, `config/penelope-protocol.md` | Write new fields |
| `netlify/functions/_shared/mind-digest.mjs` | Theme/streak/tension metadata |
| `service-worker.js` | Precache new modules; bump `CACHE_NAME` |
| `docs/IMPLEMENTATION_STATUS.md` | Note the slice when it ships |

**Hard constraints**

1. No logging form. No runtime read of Downloads or Notion.
2. Intake page is not daily `diary` points.
3. Vera/Hammond prompts still do not receive raw diary prose.
4. Overlay sheet on click — do not insert a full-width row into the masonry.
5. Clinical Glass tokens only. Masonry is packing, not a new look.
6. `prefers-reduced-motion` → no entrance animation.
7. Never `git push`.

---

### Task 1: Schema — diary `source_agent` and richer `mind_session`

**Files:**
- Modify: `js/core/validate.js`
- Modify: `tests/unit/records.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/records.test.js`:

```js
test('diary source_agent is penelope, import, or omitted', () => {
  const diary = {
    schema_version: 1, id: 'd-1', type: 'diary', date: '2026-08-13',
    time: '21:00',
    created_at: '2026-08-13T21:00:00+10:00', updated_at: '2026-08-13T21:00:00+10:00',
    source: 'chat', mood_score: 6, mood: 'low', energy: 'medium', tags: [], dayone_sent: false
  };
  assert.equal(validateRecord(diary).length, 0);
  assert.equal(validateRecord({ ...diary, source_agent: 'penelope' }).length, 0);
  assert.equal(validateRecord({ ...diary, source_agent: 'import' }).length, 0);
  assert.ok(validateRecord({ ...diary, source_agent: 'vera' }).some(e => /source_agent/.test(e)));
});

test('mind_session accepts title, themes, pattern_tags, session_type, and title-only core', () => {
  const base = {
    schema_version: 1, id: 'ms-1', type: 'mind_session', date: '2026-08-13',
    time: '17:00',
    created_at: '2026-08-13T17:00:00+10:00', updated_at: '2026-08-13T17:00:00+10:00',
    source: 'chat'
  };
  assert.equal(validateRecord({ ...base, title: 'The Filter' }).length, 0);
  assert.equal(validateRecord({
    ...base,
    themes: ['ADHD Reality', 'Self-Compassion'],
    pattern_tags: ['shame-loop'],
    session_type: 'deep-dive',
    framework: 'Compassion-Focused',
    observation: 'The filter activated.',
    source_agent: 'vera'
  }).length, 0);
  assert.ok(validateRecord({ ...base, session_type: 'workshop' }).some(e => /session_type/.test(e)));
  assert.ok(validateRecord({ ...base, source_agent: 'penelope' }).some(e => /source_agent/.test(e)));
  assert.ok(validateRecord({ ...base, themes: 'ADHD' }).some(e => /themes/.test(e)));
});
```

Update the existing `validateMindSession requires at least one of theme, insight, closing_question` test name/assertion so a record with only `themes: ['x']` is valid, and a record with none of title/theme/themes/insight/closing_question still fails.

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/unit/records.test.js`

Expected: FAIL — `source_agent` / `session_type` / title-only core not implemented.

- [ ] **Step 3: Write minimal implementation**

In `js/core/validate.js`:

```js
const SESSION_TYPES = ['check-in', 'deep-dive', 'pattern-review', 'historical'];
const DIARY_SOURCE_AGENTS = ['penelope', 'import'];
const SESSION_SOURCE_AGENTS = ['vera', 'import'];
```

In `validateDiary`, after existing fields:

```js
enumeration(record, 'source_agent', DIARY_SOURCE_AGENTS, errors);
```

In `validateMindSession`:

```js
optionalString(record, 'title', errors);
optionalString(record, 'framework', errors);
optionalString(record, 'observation', errors);
stringArray(record, 'themes', errors);
stringArray(record, 'pattern_tags', errors);
enumeration(record, 'session_type', SESSION_TYPES, errors);
enumeration(record, 'source_agent', SESSION_SOURCE_AGENTS, errors);
const hasCore = [record.title, record.theme, record.closing_question, record.insight]
  .some(v => typeof v === 'string' && v.trim() !== '')
  || (Array.isArray(record.themes) && record.themes.some(t => String(t).trim()));
if (!hasCore) errors.push('mind_session requires title, theme, themes, insight, or closing_question');
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/unit/records.test.js`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add js/core/validate.js tests/unit/records.test.js
git commit -m "$(cat <<'EOF'
Validate Mind session themes and diary source_agent.

EOF
)"
```

---

### Task 2: Chat schema for the new fields

**Files:**
- Modify: `netlify/functions/_shared/chat-schema.mjs`
- Modify: the existing chat-schema unit test if one asserts exact `mind_session` keys (search `DOMAIN_PROPERTIES` / `mind_session` in `tests/`)

- [ ] **Step 1: Write the failing test**

If `tests/unit/chat-schema.test.js` (or similar) snapshots keys, extend it. If none exists, add `tests/unit/chat-schema.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { DOMAIN_PROPERTIES } from '../../netlify/functions/_shared/chat-schema.mjs';

test('mind_session schema includes themes, session_type, and observation', () => {
  const keys = Object.keys(DOMAIN_PROPERTIES.mind_session);
  for (const key of ['themes', 'pattern_tags', 'session_type', 'framework', 'observation', 'title', 'source_agent']) {
    assert.ok(keys.includes(key), key);
  }
});

test('diary schema includes source_agent', () => {
  assert.ok(Object.hasOwn(DOMAIN_PROPERTIES.diary, 'source_agent'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/unit/chat-schema.test.js`

Expected: FAIL missing keys (or FAIL file not found if you must create it — then Step 3 adds both test and schema).

- [ ] **Step 3: Write minimal implementation**

In `DOMAIN_PROPERTIES.diary` add:

```js
source_agent: { type: 'string', enum: ['penelope', 'import'] }
```

In `DOMAIN_PROPERTIES.mind_session` add:

```js
title: { type: 'string' },
themes: { type: 'array', items: { type: 'string' } },
pattern_tags: { type: 'array', items: { type: 'string' } },
session_type: { type: 'string', enum: ['check-in', 'deep-dive', 'pattern-review', 'historical'] },
framework: { type: 'string' },
observation: { type: 'string' },
source_agent: { type: 'string', enum: ['vera', 'import'] }
```

Keep existing `theme`, `closing_question`, `insight`, moods, `cross_agent_note`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/unit/chat-schema.test.js tests/unit/records.test.js`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/_shared/chat-schema.mjs tests/unit/chat-schema.test.js
git commit -m "$(cat <<'EOF'
Expose Mind session theme arrays on the log_entry schema.

EOF
)"
```

---

### Task 3: Map new fields on diary and session entries

**Files:**
- Modify: `js/app/mind-model.js` (`diaryEntries`, `sessionEntries`)
- Modify: `tests/unit/mind-model.test.js`

- [ ] **Step 1: Write the failing tests**

Add a helper export test. Update the existing `sessionEntries maps mind_session` `assert.deepEqual` to include the new keys (null/[] when absent) **or** add a second test so the old exact object does not break:

Prefer a second test so Task 3 can update `sessionEntries` and fix the old deepEqual in the same change:

```js
test('sessionEntries maps themes, pattern tags, and title', () => {
  const sessions = sessionEntries([{
    record: {
      type: 'mind_session',
      date: '2026-04-07',
      title: 'The Filter',
      theme: 'ADHD Reality',
      themes: ['ADHD Reality', 'Self-Compassion'],
      pattern_tags: ['shame-loop'],
      session_type: 'deep-dive',
      framework: 'Compassion-Focused',
      observation: 'The filter activated.',
      source_agent: 'import'
    },
    path: 'data/mind/2026/04/2026-04-07-the-filter.md'
  }]);
  assert.equal(sessions[0].title, 'The Filter');
  assert.deepEqual(sessions[0].themes, ['ADHD Reality', 'Self-Compassion']);
  assert.deepEqual(sessions[0].patternTags, ['shame-loop']);
  assert.equal(sessions[0].sessionType, 'deep-dive');
  assert.equal(sessions[0].observation, 'The filter activated.');
  assert.equal(sessions[0].sourceAgent, 'import');
});

test('sessionThemes falls back to singular theme', () => {
  const sessions = sessionEntries([{
    record: { type: 'mind_session', date: '2026-08-10', theme: 'Weekend' },
    path: 's'
  }]);
  assert.deepEqual(sessionThemes(sessions[0]), ['Weekend']);
});
```

Export `sessionThemes`. When `themes` is missing, use `[theme]` if that string is non-empty, else `[]`.

Also map `diaryEntries` `sourceAgent` and keep `body` from `event.body` (needed for lexical + overlay excerpts):

```js
test('diaryEntries includes body and sourceAgent', () => {
  const entries = diaryEntries([{
    record: { type: 'diary', date: '2026-03-03', mood: 'low', source_agent: 'import' },
    body: 'Flat, fatigued day.',
    path: 'd'
  }]);
  assert.equal(entries[0].body, 'Flat, fatigued day.');
  assert.equal(entries[0].sourceAgent, 'import');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/unit/mind-model.test.js`

Expected: FAIL `sessionThemes is not defined` / missing mapped fields.

- [ ] **Step 3: Write minimal implementation**

Extend `diaryEntries` map with `body: event.body ?? ''`, `sourceAgent: event.record.source_agent ?? null`.

Extend `sessionEntries` map with `title`, `themes` (array or []), `patternTags`, `sessionType`, `framework`, `observation`, `sourceAgent`.

```js
export function sessionThemes(session) {
  const listed = Array.isArray(session?.themes) ? session.themes.map(String).map(s => s.trim()).filter(Boolean) : [];
  if (listed.length) return listed;
  const one = typeof session?.theme === 'string' ? session.theme.trim() : '';
  return one ? [one] : [];
}
```

Fix the old `deepEqual` in `sessionEntries maps mind_session` by adding the new keys with defaults (`title: null`, `themes: []`, etc.) so it stays exact.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/unit/mind-model.test.js`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add js/app/mind-model.js tests/unit/mind-model.test.js
git commit -m "$(cat <<'EOF'
Map Mind session themes and diary body for analysis.

EOF
)"
```

---

### Task 4: Theme co-occurrence and nodes

**Files:**
- Modify: `js/app/mind-model.js`
- Modify: `tests/unit/mind-model.test.js`

- [ ] **Step 1: Write the failing tests**

```js
test('themeCooccurrence counts unordered pairs and nodes keep mean mood', () => {
  const bounds = rangeWindow('2026-08-10', 'monthly');
  const entries = diaryEntries([
    { record: { type: 'diary', date: '2026-08-01', mood_score: 4, tags: ['work', 'sleep'] }, path: 'a' },
    { record: { type: 'diary', date: '2026-08-02', mood_score: 8, tags: ['work', 'sleep'] }, path: 'b' },
    { record: { type: 'diary', date: '2026-08-03', mood_score: 6, tags: ['work'] }, path: 'c' }
  ]);
  const sessions = sessionEntries([
    { record: { type: 'mind_session', date: '2026-08-04', themes: ['work', 'shame-loop'] }, path: 's' }
  ]);
  const pairs = themeCooccurrence(entries, sessions, bounds);
  const workSleep = pairs.find(p => p.themeA === 'sleep' && p.themeB === 'work');
  assert.equal(workSleep.count, 2);
  const nodes = themeNodes(entries, sessions, bounds);
  const work = nodes.find(n => n.key === 'work');
  assert.equal(work.count, 4);
  assert.equal(work.meanMood, 6);
});
```

Pair keys: lowercase trim, `themeA < themeB` lexicographically. Node `meanMood` is mean of diary `mood_score` on dates that theme appears (sessions without a same-day diary score do not pull the mean unless that date also has a score).

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/unit/mind-model.test.js`

Expected: FAIL `themeCooccurrence is not a function`

- [ ] **Step 3: Write minimal implementation**

Implement `themeCooccurrence(entries, sessions, bounds)` and `themeNodes(entries, sessions, bounds)` in `js/app/mind-model.js`. Skip items outside `bounds.from`/`bounds.to`. For pairs, every unordered combo in a record’s tag/theme list. `entry_ids` optional as `paths` array on the pair object.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/unit/mind-model.test.js`

Expected: PASS (`meanMood` 6 from scores 4, 8, 6 on work days)

- [ ] **Step 5: Commit**

```bash
git add js/app/mind-model.js tests/unit/mind-model.test.js
git commit -m "$(cat <<'EOF'
Derive theme co-occurrence for the Mind constellation.

EOF
)"
```

---

### Task 5: Factor effects, consistency ring, cadence dates

**Files:**
- Modify: `js/app/mind-model.js`
- Modify: `tests/unit/mind-model.test.js`

- [ ] **Step 1: Write the failing tests**

```js
test('factorEffects requires three with and three without', () => {
  const bounds = rangeWindow('2026-08-10', 'monthly');
  const scored = [];
  for (let i = 1; i <= 6; i += 1) {
    scored.push({
      record: {
        type: 'diary',
        date: `2026-08-0${i}`,
        mood_score: i <= 3 ? 8 : 4,
        tags: i <= 3 ? ['walk'] : ['desk']
      },
      path: String(i)
    });
  }
  const effects = factorEffects(diaryEntries(scored), sessionEntries([]), bounds);
  const walk = effects.find(e => e.key === 'walk');
  assert.equal(walk.effect, 4);
  assert.equal(walk.direction, 'positive');
  assert.equal(effects.find(e => e.key === 'desk'), undefined);
});

test('consistencyRing counts unique mind dates in last 30 days and streak', () => {
  const entries = diaryEntries([
    { record: { type: 'diary', date: '2026-08-09' }, path: 'a' },
    { record: { type: 'diary', date: '2026-08-10' }, path: 'b' }
  ]);
  const sessions = sessionEntries([
    { record: { type: 'mind_session', date: '2026-08-10', theme: 'x' }, path: 's' }
  ]);
  const ring = consistencyRing(entries, sessions, '2026-08-10');
  assert.equal(ring.daysWithEntry, 2);
  assert.equal(ring.windowDays, 30);
  assert.equal(ring.streak, 2);
});
```

`desk` has 3 with (scores 4) and 3 without (scores 8) → effect −4, but n-with for `desk` is 3 and n-without is 3 so it *would* show. Adjust the test: only tag `walk` on first three days, leave last three **untagged**. Then `walk` qualifies (3/3), `desk` does not exist.

`streak`: consecutive calendar days ending at `date` that have diary or session.

Also export `cadenceHits(entries, sessions)` → `{ diary: string[], vera: string[], penelope: string[] }` where Penelope dates are diary dates (all diaries count as Penelope unless `source_agent` is something else — in this app diaries are Penelope/import; put import diaries in `penelope` as well because they are diary cadence).

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/unit/mind-model.test.js`

Expected: FAIL missing exports

- [ ] **Step 3: Write minimal implementation**

`factorEffects`: unique dates in bounds with `mood_score`. Factor present if that date’s diary tags or session themes include the key. `effect = meanPresent − meanAbsent`. `direction` is `positive` if effect > 0 else `negative`. Skip if `presentDates < 3` or `absentDates < 3`.

`consistencyRing`: from `addCalendarDays(date, -29)` through `date`, unique dates with any mind record. `streak` walk backward from `date`.

If workout events are in `events`, a later optional factor `workout` is `record.type === 'workout' && status completed` on that date — only if `buildMindModel` passes full `events`. Add `factorEffectsFromEvents(events, bounds)` used by `buildMindModel` that unions diary/session factors with workout-present dates.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/unit/mind-model.test.js`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add js/app/mind-model.js tests/unit/mind-model.test.js
git commit -m "$(cat <<'EOF'
Compute mood factor effects and a 30-day Mind streak.

EOF
)"
```

---

### Task 6: Transitions, weekly ranks, lexical, butterfly, resurfacing, waffle, insight tension

**Files:**
- Modify: `js/app/mind-model.js`
- Modify: `tests/unit/mind-model.test.js`

- [ ] **Step 1: Write the failing tests**

```js
test('moodTransitions counts consecutive primary moods', () => {
  const entries = diaryEntries([
    { record: { type: 'diary', date: '2026-08-01', mood: 'low' }, path: 'a' },
    { record: { type: 'diary', date: '2026-08-02', mood: 'good' }, path: 'b' },
    { record: { type: 'diary', date: '2026-08-03', mood: 'good' }, path: 'c' }
  ]);
  const flows = moodTransitions(entries, rangeWindow('2026-08-10', 'monthly'));
  assert.equal(flows.find(f => f.from === 'low' && f.to === 'good').count, 1);
  assert.equal(flows.find(f => f.from === 'good' && f.to === 'good').count, 1);
});

test('themeWeekly and themeRanks bucket by Sydney week start', () => {
  const bounds = rangeWindow('2026-08-10', 'monthly');
  const entries = diaryEntries([
    { record: { type: 'diary', date: '2026-08-03', tags: ['work', 'sleep'] }, path: 'a' },
    { record: { type: 'diary', date: '2026-08-10', tags: ['work'] }, path: 'b' }
  ]);
  const weekly = themeWeekly(entries, sessionEntries([]), bounds, { limit: 8 });
  assert.ok(weekly.themes.includes('work'));
  const ranks = themeRanks(weekly);
  assert.equal(ranks[0].rankByTheme.work, 1);
});

test('lexicalSeries counts watchlist terms per week', () => {
  const bounds = rangeWindow('2026-08-10', 'monthly');
  const entries = diaryEntries([{
    record: { type: 'diary', date: '2026-08-03' },
    body: 'I should be fine. I should rest.',
    path: 'a'
  }]);
  const series = lexicalSeries(entries, sessionEntries([]), bounds, ['should', 'flake']);
  const should = series.find(s => s.term === 'should');
  assert.equal(should.points.reduce((n, p) => n + p.count, 0), 2);
  assert.equal(series.find(s => s.term === 'flake').points.reduce((n, p) => n + p.count, 0), 0);
});

test('butterfly compares vera session themes to diary tags', () => {
  const bounds = rangeWindow('2026-08-10', 'monthly');
  const rows = butterfly(
    diaryEntries([{ record: { type: 'diary', date: '2026-08-01', tags: ['work'], mood_score: 6 }, path: 'd' }]),
    sessionEntries([{ record: { type: 'mind_session', date: '2026-08-02', themes: ['work'], source_agent: 'vera', mood_at_open: 'low', mood_at_close: 'good' }, path: 's' }]),
    bounds
  );
  const work = rows.find(r => r.theme === 'work');
  assert.equal(work.veraCount, 1);
  assert.equal(work.penelopeCount, 1);
  assert.equal(work.veraDelta, 2);
});

test('resurfacing finds a theme older than seven days', () => {
  const card = resurfacing(
    diaryEntries([
      { record: { type: 'diary', date: '2026-07-01', tags: ['shame-loop'] }, body: 'Old mention.', path: 'old' },
      { record: { type: 'diary', date: '2026-08-10', tags: ['shame-loop'] }, body: 'Again today.', path: 'new' }
    ]),
    sessionEntries([]),
    '2026-08-10'
  );
  assert.equal(card.theme, 'shame-loop');
  assert.equal(card.priorDate, '2026-07-01');
  assert.match(card.excerpt, /Old mention/);
});

test('waffleEntries one cell per diary or session in range', () => {
  const bounds = rangeWindow('2026-08-10', 'weekly');
  const cells = waffleEntries(
    diaryEntries([{ record: { type: 'diary', date: '2026-08-09', mood: 'low' }, path: 'd' }]),
    sessionEntries([{ record: { type: 'mind_session', date: '2026-08-10', theme: 'x', mood_at_close: 'good' }, path: 's' }]),
    bounds
  );
  assert.equal(cells.length, 2);
});

test('parseInsightExtras reads tension and source session from body', () => {
  const extras = parseInsightExtras(`**Source session:** data/mind/2026/04/2026-04-07-the-filter.md
**Tension:** stated rule — actual behaviour
**Stated:** 0.2
**Revealed:** 0.75
The rest of the insight.`);
  assert.equal(extras.sourceSession, 'data/mind/2026/04/2026-04-07-the-filter.md');
  assert.equal(extras.tension.poleA, 'stated rule');
  assert.equal(extras.tension.poleB, 'actual behaviour');
  assert.equal(extras.tension.stated, 0.2);
  assert.equal(extras.tension.revealed, 0.75);
});
```

`veraDelta`: `moodShiftRank` lives in `render-mind.js` today. **Move** `moodShiftRank` / `MOOD_ORDER` usage for delta into `mind-model.js` (`moodDelta(open, close) = rank(open) - rank(close)` so improved → positive). Do not import `render-mind.js` from the model.

Lexical: word-boundary `RegExp(\`\\b${term}\\b\`, 'gi')` on diary `body` and session `insight`, `observation`, `closing_question`, `title`.

`themeWeekly` uses `getSydneyWeekStart` from `js/core/time.js`. Limit themes by total frequency; remainder bucket `other`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/unit/mind-model.test.js`

Expected: FAIL missing functions

- [ ] **Step 3: Write minimal implementation**

Add the functions in `js/app/mind-model.js`. Re-export `moodDelta` using `MOOD_ORDER` already in that file (`indexOf`, lower index is better mood, so delta = openIndex - closeIndex).

Keep `parseInsightExtras` in `mind-model.js` so `governance-log.js` tests stay exact.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/unit/mind-model.test.js tests/unit/render-mind.test.js`

Expected: PASS. If `render-mind.test.js` imports `moodShiftRank` from `render-mind.js`, keep that export as a wrapper around `moodDelta` / `MOOD_ORDER` so existing tests still pass:

```js
export function moodShiftRank(mood) {
  return MOOD_ORDER.indexOf(mood);
}
```

(already in `render-mind.js` — do not break it. Model gets its own `moodDelta`.)

- [ ] **Step 5: Commit**

```bash
git add js/app/mind-model.js tests/unit/mind-model.test.js
git commit -m "$(cat <<'EOF'
Add Mind analysis series: transitions, lexical, butterfly.

EOF
)"
```

---

### Task 7: `buildMindModel` return shape + launchers

**Files:**
- Modify: `js/app/mind-model.js` `buildMindModel`
- Modify: `tests/unit/mind-model.test.js`

- [ ] **Step 1: Write the failing test**

```js
test('buildMindModel exposes launchers and analysis series', () => {
  const events = [
    { record: { type: 'diary', date: '2026-08-09', mood_score: 6, mood: 'good', tags: ['work'], source_agent: 'penelope' }, body: 'I should rest.', path: 'd' },
    { record: { type: 'mind_session', date: '2026-08-10', title: 'Filter', themes: ['work'], mood_at_open: 'low', mood_at_close: 'good', source_agent: 'vera' }, path: 's' }
  ];
  const model = buildMindModel({
    events,
    date: '2026-08-10',
    range: 'monthly',
    governanceLogMarkdown: `## 2026-08-10 — Mind Insight
**Title:** Gap
**Tension:** stated — revealed
**Stated:** 0.2
**Revealed:** 0.8

Body here.
`,
    centralNodeMarkdown: ''
  });
  assert.equal(model.launchers.vera.title, 'Filter');
  assert.equal(model.launchers.penelope.daysAgo, 1);
  assert.ok(Array.isArray(model.factorEffects));
  assert.equal(model.consistency.windowDays, 30);
  assert.ok(model.themeNodes.length);
  assert.ok(model.tensions.length === 1);
  assert.equal(model.tensions[0].stated, 0.2);
  assert.ok(Array.isArray(model.waffle));
  assert.ok(Array.isArray(model.lexical));
  assert.equal(model.empty, false);
});
```

`empty` is true only when there are no diary entries **and** no sessions in range (update the old empty rule).

Launcher copy: `daysAgo` via `daysBetween`. `outcome` uses `moodShiftDirection` logic: if both moods set, `mood lifted` / `mood eased` / `mood held`; else session `title` or `'logged'`.

Default lexical watchlist constant:

```js
export const DEFAULT_MIND_WATCHLIST = ['should', 'just', 'fine', 'unfulfilled', 'flake'];
```

`buildMindModel` accepts optional `watchlist`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/unit/mind-model.test.js`

Expected: FAIL `model.launchers` undefined

- [ ] **Step 3: Write minimal implementation**

Wire every helper from Tasks 3–6 into the return object. Compute `insights` as today, then map `parseInsightExtras(entry.body)` onto `{ ...entry, ...extras }`. `tensions` = insights with `tension`.

`launchers.vera` from newest session (any `source_agent` except none — all sessions count as Vera unless we later have Penelope sessions). `launchers.penelope` from newest diary.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/unit/mind-model.test.js`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add js/app/mind-model.js tests/unit/mind-model.test.js
git commit -m "$(cat <<'EOF'
Assemble Mind v2 model launchers and analysis fields.

EOF
)"
```

---

### Task 8: Masonry packer

**Files:**
- Create: `js/app/chart-kit/masonry.js`
- Create: `tests/unit/masonry.test.js`

- [ ] **Step 1: Write the failing test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { packMasonry } from '../../js/app/chart-kit/masonry.js';

test('packMasonry fills short columns and never leaves a hole', () => {
  const packed = packMasonry(
    [
      { id: 'a', height: 80, span: 1 },
      { id: 'b', height: 40, span: 1 },
      { id: 'c', height: 40, span: 1 }
    ],
    { columns: 2, gap: 12, columnWidth: 100 }
  );
  assert.equal(packed.length, 3);
  const b = packed.find(p => p.id === 'b');
  const c = packed.find(p => p.id === 'c');
  assert.equal(b.y, 0);
  assert.equal(c.y, 40 + 12);
  assert.equal(packed.find(p => p.id === 'a').x, 0);
});

test('span 2 occupies two columns when it fits', () => {
  const packed = packMasonry(
    [{ id: 'wide', height: 60, span: 2 }],
    { columns: 4, gap: 12, columnWidth: 100 }
  );
  assert.equal(packed[0].width, 100 * 2 + 12);
  assert.equal(packed[0].span, 2);
});
```

Place each item in the shortest column (for span 1). For span 2, pick the shortest adjacent pair. `span` greater than `columns` clamps to `columns`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/unit/masonry.test.js`

Expected: FAIL cannot find module

- [ ] **Step 3: Write minimal implementation**

`js/app/chart-kit/masonry.js` — column height array, greedy placement, return `{ id, x, y, width, height, span }`. `x = columnIndex * (columnWidth + gap)`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/unit/masonry.test.js`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add js/app/chart-kit/masonry.js tests/unit/masonry.test.js
git commit -m "$(cat <<'EOF'
Add a masonry packer for the Mind dashboard tiles.

EOF
)"
```

---

### Task 9: Overlay thread sheet

**Files:**
- Create: `js/app/mind-thread-sheet.js`
- Create: `tests/unit/mind-thread-sheet.test.js`

- [ ] **Step 1: Write the failing test**

Reuse the lightweight `el()` harness from `tests/unit/render-mind.test.js` (copy the helpers into this test file — do not import from the other test file).

```js
import { openMindThreadSheet, closeMindThreadSheet } from '../../js/app/mind-thread-sheet.js';

test('openMindThreadSheet lists rows and continue action', () => {
  const root = makeRootWithSheet();
  openMindThreadSheet(root, {
    title: 'shame-loop',
    rows: [{ date: '2026-04-07', title: 'The Filter', excerpt: 'The filter activated.' }],
    continueAgent: 'vera'
  });
  const sheet = root.querySelector('#mind-thread-sheet');
  assert.equal(sheet.hidden, false);
  assert.match(sheet.textContent, /The Filter/);
  assert.match(sheet.textContent, /Continue with Vera/);
});

test('closeMindThreadSheet hides the overlay', () => {
  const root = makeRootWithSheet();
  openMindThreadSheet(root, { title: 'x', rows: [], continueAgent: null });
  closeMindThreadSheet(root);
  assert.equal(root.querySelector('#mind-thread-sheet').hidden, true);
});
```

`makeRootWithSheet` must include `#mind-thread-sheet` with `[data-role="title"]`, `[data-role="rows"]`, `[data-role="continue"]`, `[data-role="close"]`, and a scrim.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/unit/mind-thread-sheet.test.js`

Expected: FAIL module not found

- [ ] **Step 3: Write minimal implementation**

`openMindThreadSheet(root, { title, rows, continueAgent, onContinue, onClose })` unhides, fills rows, binds close on `[data-role="close"]`, scrim click, and `Escape` (add listener once via `dataset.bound`). Continue button hidden when `continueAgent` is null; otherwise label `Continue with Vera` / `Penelope` and call `onContinue(slug)`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/unit/mind-thread-sheet.test.js`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add js/app/mind-thread-sheet.js tests/unit/mind-thread-sheet.test.js
git commit -m "$(cat <<'EOF'
Add the Mind thread overlay sheet.

EOF
)"
```

---

### Task 10: HTML/CSS board shell and launchers at the top

**Files:**
- Modify: `index.html` (`#mind-dashboard`)
- Modify: `css/app.css`
- Modify: `js/app/render-mind.js`
- Modify: `tests/unit/render-mind.test.js`
- Modify: `tests/unit/page-headings.test.js` if heading text changes (keep `#mind-heading` unless the spec’s “Mind” label already matches)
- Modify: `service-worker.js` — bump `CACHE_NAME` to `life-hub-shell-v78` and add `js/app/chart-kit/masonry.js`, `js/app/mind-thread-sheet.js`

- [ ] **Step 1: Write the failing tests**

In `tests/unit/render-mind.test.js`, extend the root fixture with:

- `#mind-board`
- `#mind-launcher-vera`, `#mind-launcher-penelope` (buttons `data-mind-agent`)
- `#mind-thread-sheet` (hidden)
- tile hosts: `#mind-tile-insights`, `#mind-mood-chart` (keep), plus `#mind-tile-factors`, `#mind-tile-streak`, `#mind-heatmap-penelope`

Test:

```js
test('renderMind writes launcher context and keeps agent clicks', () => {
  const root = mindRoot();
  const opens = [];
  renderMind(root, modelWithLaunchers(), {
    onOpenAgent: slug => opens.push(slug),
    agentsConfig: {}
  });
  assert.match(root.querySelector('#mind-launcher-vera').textContent, /Filter|mood lifted|Vera/i);
  const vera = root.querySelector('[data-mind-agent="vera"]');
  vera.listeners.find(([type]) => type === 'click')[1]();
  assert.deepEqual(opens, ['vera']);
});
```

`mindRoot()` must still provide every selector `renderMind` already uses (`#mind-dashboard`, range control, charts, sessions, insights, cross-agent) **and** the new ones, or existing tests fail.

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/unit/render-mind.test.js`

Expected: FAIL missing `#mind-launcher-vera` or empty text

- [ ] **Step 3: Write minimal implementation**

Restructure `#mind-dashboard` in `index.html`:

1. heading / range / ambient / silence (silence can stay)
2. two launcher buttons (move the existing `.mind-agents` buttons here; delete the bottom row)
3. `#mind-board` wrapping existing hero/cadence cards **and** empty hosts for new tiles
4. `#mind-thread-sheet.mind-thread-sheet` at end of the section (`hidden`)

CSS (Clinical Glass):

```css
.mind-board { position: relative; }
.mind-tile {
  background: var(--glass);
  border: 1px solid var(--line);
  border-radius: var(--radius-card, 12px);
  padding: var(--space-md, 16px);
}
.mind-tile__question {
  margin: 0 0 4px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-size: var(--text-xs, 0.7rem);
  color: var(--wave);
}
.mind-tile__legend { color: var(--muted); margin: 0 0 12px; }
.mind-thread-sheet[hidden] { display: none; }
.mind-thread-sheet:not([hidden]) {
  position: fixed;
  inset: 0;
  z-index: 40;
}
```

Use existing spacing/type tokens where they already exist; do not invent a Pinterest palette.

`renderLaunchers(root, model)` fills the two buttons’ inner `.mind-launcher__meta` with relative time + outcome.

Call `packMasonry` after render: measure tile `offsetHeight` if present, else use `data-mind-span` and a fallback height so jsdom tests don’t need layout. In tests, skip packing when `getBoundingClientRect().width === 0` (already true in the harness) — packer no-ops, tiles stay in DOM order. That keeps unit tests stable; browser will pack.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/unit/render-mind.test.js tests/unit/page-headings.test.js`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add index.html css/app.css js/app/render-mind.js tests/unit/render-mind.test.js service-worker.js
git commit -m "$(cat <<'EOF'
Move Mind agent launchers to the top of the board.

EOF
)"
```

---

### Task 11: Factor bars, streak ring, Penelope cadence row

**Files:**
- Create: `js/app/chart-kit/factor-bars.js` (optional — HTML widths are enough)
- Modify: `js/app/render-mind.js`
- Modify: `index.html`
- Modify: `tests/unit/render-mind.test.js`

- [ ] **Step 1: Write the failing test**

```js
test('renderMind paints factor bars and streak label', () => {
  const root = mindRoot();
  renderMind(root, {
    ...emptyModel(),
    empty: false,
    factorEffects: [{ key: 'walk', label: 'walk', effect: 1.5, direction: 'positive' }],
    consistency: { daysWithEntry: 10, windowDays: 30, streak: 3 }
  });
  assert.match(root.querySelector('#mind-tile-factors').textContent, /walk/);
  assert.match(root.querySelector('#mind-tile-streak').textContent, /3/);
});
```

Each factor is a button. Click opens the thread sheet with `title: factor.label` (rows can be empty until Task 12 wires `entriesForTheme`).

Streak: reuse `applyRingTarget` on `#mind-streak-ring` with `{ value: daysWithEntry, target: windowDays }`.

Cadence: third `paintHeatmapRow` for `#mind-heatmap-penelope` using `model.cadence.penelope`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/unit/render-mind.test.js`

Expected: FAIL missing factor text

- [ ] **Step 3: Write minimal implementation**

`renderFactorPanel`, `renderStreak`, extend `renderCadenceHeatmap` with Penelope hits from `cadenceHits` on the model (`model.cadence`).

Question/legend copy (hard-code in HTML):

- Factors: “What’s moving my mood?” / “Bar = mean mood with this minus without. Need 3 days each side.”
- Streak: “Am I showing up?” / “Ring = days with a diary or session in the last 30.”

Animate ring with existing `applyRingTarget` (already animates). Factor bars: width `%` of max |effect|, `animateColumnGrow` on an inner fill **or** CSS transform scaleX from 0 — prefer `transform: scaleX` so we do not animate `width`. Add class `mind-factor-fill` and CSS `transition: transform 700ms cubic-bezier(.2,.8,.2,1)`; start `scaleX(0)` then `scaleX(1)`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/unit/render-mind.test.js`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add index.html css/app.css js/app/render-mind.js tests/unit/render-mind.test.js js/app/chart-kit/factor-bars.js
git commit -m "$(cat <<'EOF'
Render Mind factor effects, streak ring, and Penelope cadence.

EOF
)"
```

---

### Task 12: Thread query + constellation + tension

**Files:**
- Modify: `js/app/mind-model.js` (add `entriesForTheme`)
- Modify: `js/app/render-mind.js`
- Modify: `index.html`
- Modify: `tests/unit/mind-model.test.js`
- Modify: `tests/unit/render-mind.test.js`

- [ ] **Step 1: Write the failing tests**

```js
test('entriesForTheme lists diary and sessions newest last', () => {
  const rows = entriesForTheme(
    diaryEntries([{ record: { type: 'diary', date: '2026-08-01', tags: ['work'] }, body: 'School day.', path: 'd' }]),
    sessionEntries([{ record: { type: 'mind_session', date: '2026-08-10', themes: ['work'], title: 'Filter', insight: 'A filter.' }, path: 's' }]),
    'work'
  );
  assert.equal(rows.length, 2);
  assert.equal(rows[0].date, '2026-08-01');
  assert.match(rows[1].excerpt, /filter/i);
});
```

Constellation: host `#mind-constellation` SVG. For tests, assert a node with `data-theme="work"` exists when `model.themeNodes` is non-empty. Click calls `openMindThreadSheet`.

Tension: host `#mind-tension`. If `model.tensions` is empty, hide the tile (`hidden`). If present, SVG has two circles. Click opens sheet with the insight body as a single row.

Hand-layout nodes on a circle when `themeNodes.length <= 15`. Edges from `themeCooccurrence` where `count >= 2`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/unit/mind-model.test.js tests/unit/render-mind.test.js`

Expected: FAIL `entriesForTheme` missing / no `data-theme`

- [ ] **Step 3: Write minimal implementation**

`entriesForTheme`: filter tags/themes (case-insensitive), sort by date ascending, excerpt = first 140 chars of `body` or `insight` or `observation`.

`renderConstellation`: nodes as SVG circles + labels. Node fill from mean mood via `--mood-*` tokens (map score 1–10 to ramp: ≤3 bad, ≤5 low, ≤6 neutral, ≤8 good, else great). Radius 6–16 from count.

`renderTension`: hide tile when no tensions; else first tension (most recent insight).

Wire factor click to `entriesForTheme` as well.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/unit/mind-model.test.js tests/unit/render-mind.test.js`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add js/app/mind-model.js js/app/render-mind.js index.html tests/unit/mind-model.test.js tests/unit/render-mind.test.js
git commit -m "$(cat <<'EOF'
Add Mind constellation, tension map, and theme threads.

EOF
)"
```

---

### Task 13: Vendor d3 layout builds

**Files:**
- Create: `js/app/chart-kit/vendor/d3-shape.min.js`
- Create: `js/app/chart-kit/vendor/d3-sankey.min.js`
- Create: `js/app/chart-kit/vendor/d3-chord.min.js`
- Create: `js/app/chart-kit/vendor/d3-force.min.js`
- Create: `js/app/chart-kit/vendor/README.md` (versions + URLs)
- Modify: `service-worker.js` precache those four files

- [ ] **Step 1: No unit test** (binary vendor). Document versions in README.

- [ ] **Step 2: Download**

```bash
mkdir -p js/app/chart-kit/vendor
curl -fsSL -o js/app/chart-kit/vendor/d3-shape.min.js https://cdnjs.cloudflare.com/ajax/libs/d3-shape/3.2.0/d3-shape.min.js
curl -fsSL -o js/app/chart-kit/vendor/d3-sankey.min.js https://cdnjs.cloudflare.com/ajax/libs/d3-sankey/0.12.3/d3-sankey.min.js
curl -fsSL -o js/app/chart-kit/vendor/d3-chord.min.js https://cdnjs.cloudflare.com/ajax/libs/d3-chord/3.0.1/d3-chord.min.js
curl -fsSL -o js/app/chart-kit/vendor/d3-force.min.js https://cdnjs.cloudflare.com/ajax/libs/d3-force/3.0.0/d3-force.min.js
```

If a URL 404s, pin the current cdnjs versions listed on those package pages — do not load from cdnjs at runtime.

These UMD builds attach `d3` / `d3shape` globals. Wrap with thin ESM facades:

Create `js/app/chart-kit/d3-layout.js`:

```js
import './vendor/d3-shape.min.js';
import './vendor/d3-sankey.min.js';
import './vendor/d3-chord.min.js';
import './vendor/d3-force.min.js';

export function d3api() {
  return globalThis.d3;
}
```

If the min files do not share a `d3` global, switch to the official ESM builds from jsDelivr (`d3-shape/+esm`) saved as `.js` and import named `stack`, `sankey`, `chord`, `forceSimulation`. Prefer ESM saves if UMD fails in `node --test`.

- [ ] **Step 3: Smoke import**

Add `tests/unit/d3-layout.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { d3api } from '../../js/app/chart-kit/d3-layout.js';

test('vendored d3 layout api loads', () => {
  const d3 = d3api();
  assert.equal(typeof d3, 'object');
});
```

If ESM named exports work instead, assert `typeof stack === 'function'`.

- [ ] **Step 4: Run test**

Run: `node --test tests/unit/d3-layout.test.js`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add js/app/chart-kit/vendor js/app/chart-kit/d3-layout.js tests/unit/d3-layout.test.js service-worker.js
git commit -m "$(cat <<'EOF'
Vendor d3 layout modules for Mind analysis charts.

EOF
)"
```

---

### Task 14: Stream, transitions, bump, chord, radial year, horizon, butterfly, lexical, waffle, sessions

**Files:**
- Create: `js/app/chart-kit/stream.js`, `sankey-flow.js`, `bump.js`, `chord-layout.js`, `radial-year.js`, `horizon.js`
- Modify: `js/app/render-mind.js`, `index.html`, `css/app.css`
- Modify: `tests/unit/render-mind.test.js`
- Create: `tests/unit/chart-kit-mind.test.js` for path builders
- Modify: `service-worker.js` precache new chart-kit files

Each builder is pure: `{ path, nodes, ... }` from data. Render functions attach SVG and call `animateAreaReveal` or stagger.

- [ ] **Step 1: Write failing builder tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStreamPaths } from '../../js/app/chart-kit/stream.js';
import { buildSankeyFlow } from '../../js/app/chart-kit/sankey-flow.js';
import { buildBumpLines } from '../../js/app/chart-kit/bump.js';
import { buildRadialYear } from '../../js/app/chart-kit/radial-year.js';
import { buildHorizonBands } from '../../js/app/chart-kit/horizon.js';

test('buildStreamPaths returns one path per theme', () => {
  const paths = buildStreamPaths({
    weeks: ['2026-08-03'],
    series: [{ key: 'work', values: [2] }, { key: 'other', values: [1] }]
  }, { width: 320, height: 80 });
  assert.equal(paths.length, 2);
  assert.ok(paths[0].d.startsWith('M') || paths[0].d.includes('L'));
});

test('buildSankeyFlow returns links with width', () => {
  const chart = buildSankeyFlow(
    [{ from: 'low', to: 'good', count: 3 }],
    { width: 320, height: 80 }
  );
  assert.ok(chart.links[0].width > 0);
});

test('buildBumpLines uses rank as y', () => {
  const lines = buildBumpLines(
    [{ week: '2026-08-03', rankByTheme: { work: 1, sleep: 2 } }],
    ['work', 'sleep'],
    { width: 320, height: 80 }
  );
  assert.equal(lines.length, 2);
});

test('buildRadialYear has 365 ticks', () => {
  const ticks = buildRadialYear({ year: 2026, byDate: { '2026-03-01': 'low' } });
  assert.equal(ticks.length, 365);
  assert.equal(ticks[59].mood, 'low');
});

test('buildHorizonBands one band per metric', () => {
  const bands = buildHorizonBands([
    { key: 'mood', points: [{ date: '2026-08-01', value: 6 }] }
  ], { width: 320, height: 24 });
  assert.equal(bands.length, 1);
});
```

For leap years `buildRadialYear` uses 366 when `year % 4 === 0` (2026 → 365).

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/unit/chart-kit-mind.test.js`

Expected: FAIL missing modules

- [ ] **Step 3: Write minimal implementations**

`stream.js`: if `d3.stack` + `stackOffsetWiggle` load, use them; else stacked areas from zero (still valid paths).  
`sankey-flow.js`: use `d3.sankey` when present; else two-column nodes (unique `from` left, `to` right) and rectangles whose height ∝ count.  
`chord-layout.js`: `d3.chord` or skip ribbons and draw an arc per theme (still clickable).  
`bump.js`: `buildAreaLine` per theme with `value: maxRank + 1 - rank`.  
`radial-year.js`: polar ticks, colour from mood token.  
`horizon.js`: map values to 0–1 opacity rects along x.

Then `renderMind` calls each when the host exists. Every tile includes question + legend in `index.html`. Hover: `title` attribute on marks (keyboard: `tabindex="0"` + Enter opens sheet). Click: overlay with `entriesForTheme` or date filter.

Waffle: CSS grid of buttons, `data-mood`.  
Butterfly: two `div` bars per theme.  
Lexical: `buildAreaLine` per term; a `<input>` + button to push terms into `localStorage` `life-hub-mind-watchlist` and `onWatchlistChange` callback from `renderMind` options so `app-controller.js` rebuilds the model.

Insights: keep timeline; prepend resurfacing card from `model.resurfacing` unless `localStorage` dismissed id matches.  
Sessions: keep cards.  
Cross-Agent: keep strip.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/unit/chart-kit-mind.test.js tests/unit/render-mind.test.js tests/unit/mind-model.test.js`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add js/app/chart-kit js/app/render-mind.js index.html css/app.css tests/unit/chart-kit-mind.test.js tests/unit/render-mind.test.js service-worker.js js/app/app-controller.js
git commit -m "$(cat <<'EOF'
Render the Mind analysis chart suite with load-in motion.

EOF
)"
```

`app-controller.js`: pass `watchlist` from `JSON.parse(localStorage.getItem('life-hub-mind-watchlist') || 'null') ?? DEFAULT_MIND_WATCHLIST` into `buildMindModel`. Pass `onWatchlistChange` that writes localStorage and re-renders.

---

### Task 15: Insights extras, resurfacing dismiss, reduced motion

**Files:**
- Modify: `js/app/render-mind.js`
- Modify: `tests/unit/render-mind.test.js`
- Modify: `tests/unit/` existing reduced-motion tests if any (`animate.js`)

- [ ] **Step 1: Write the failing test**

```js
test('resurfacing card dismisses and stays gone', () => {
  const store = {};
  globalThis.localStorage = {
    getItem: k => store[k] ?? null,
    setItem: (k, v) => { store[k] = String(v); }
  };
  const root = mindRoot();
  renderMind(root, {
    ...emptyModel(),
    resurfacing: { id: 'shame-loop-2026-08-10', theme: 'shame-loop', priorDate: '2026-07-01', excerpt: 'Old mention.' }
  });
  assert.match(root.querySelector('#mind-tile-insights').textContent, /came up again/i);
  root.querySelector('[data-mind-resurfacing-dismiss]').listeners.find(([t]) => t === 'click')[1]();
  renderMind(root, {
    ...emptyModel(),
    resurfacing: { id: 'shame-loop-2026-08-10', theme: 'shame-loop', priorDate: '2026-07-01', excerpt: 'Old mention.' }
  });
  assert.doesNotMatch(root.querySelector('#mind-tile-insights').textContent, /came up again/i);
});
```

Copy: `"[theme] came up again. Last time was [date]: [excerpt]"` — distinct class `mind-resurfacing`, not `governance-entry`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/unit/render-mind.test.js`

Expected: FAIL no dismiss control

- [ ] **Step 3: Write minimal implementation**

Dismiss key `life-hub-mind-resurfacing-dismissed` JSON array of ids.

Ensure `animateAreaReveal` / ring / factor scale skip when `prefersReducedMotion()` — already true for chart-kit; add `mind-tile { animation: none }` inside `@media (prefers-reduced-motion: reduce)`.

- [ ] **Step 4: Run tests**

Run: `node --test tests/unit/render-mind.test.js`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add js/app/render-mind.js css/app.css tests/unit/render-mind.test.js
git commit -m "$(cat <<'EOF'
Add dismissable Mind resurfacing and reduced-motion tile rules.

EOF
)"
```

---

### Task 16: Vera and Penelope protocols + mind digest

**Files:**
- Modify: `config/vera-protocol.md`
- Modify: `config/penelope-protocol.md`
- Modify: `netlify/functions/_shared/mind-digest.mjs`
- Modify: `tests/unit/mind-digest.test.js`

- [ ] **Step 1: Write the failing tests**

In `tests/unit/mind-digest.test.js` add:

```js
test('summarizeMindSessionsForPrompt includes themes and session_type', () => {
  const text = summarizeMindSessionsForPrompt([
    { record: { type: 'mind_session', date: '2026-08-10', themes: ['work'], session_type: 'deep-dive', title: 'Filter' } }
  ], '2026-08-10');
  assert.match(text, /work/);
  assert.match(text, /deep-dive|Filter/);
});
```

If `summarizeMindSessionsForPrompt` already exists, extend it. If not, add it and wire in `chat.mjs` / `persona.mjs` only if those params already exist from session-memory — do not invent a new chat.mjs digest path if `mindSessionDigest` is already passed.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/unit/mind-digest.test.js`

Expected: FAIL missing themes in output

- [ ] **Step 3: Write minimal implementation**

Digest lines: date, title, themes joined, session_type, mood open→close. Still no diary prose.

Vera protocol additions (plain instructions, no sample diary quotes):

- At close, `log_entry` `mind_session` with `title`, `themes` (primary + follow-ups), `pattern_tags`, `session_type` (`check-in` | `deep-dive` | `pattern-review`), `mood_at_open`, `mood_at_close`, `insight`, `observation`, `closing_question`.
- When the session is dialectic, also write a Governance Mind Insight whose body starts with `**Tension:** pole a — pole b`, `**Stated:**` 0–1, `**Revealed:**` 0–1, `**Source session:**` path if known.
- Never announce the framework name to Adam; `framework` field is internal.

Penelope: when the day clearly continues a known thread, reuse that theme string in `tags`. `source_agent` is not something she must set (server can default `penelope` on confirm if easy; otherwise omit).

- [ ] **Step 4: Run tests**

Run: `node --test tests/unit/mind-digest.test.js tests/unit/persona.test.js`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add config/vera-protocol.md config/penelope-protocol.md netlify/functions/_shared/mind-digest.mjs tests/unit/mind-digest.test.js
git commit -m "$(cat <<'EOF'
Teach Vera and Penelope to persist Mind analysis fields.

EOF
)"
```

---

### Task 17: Notion export → records (pure mapper)

**Files:**
- Create: `js/core/mind-import.js`
- Create: `tests/unit/mind-import.test.js`

- [ ] **Step 1: Write the failing tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseCsv,
  sessionTypeFromNotion,
  recordFromSessionRow,
  recordFromDiaryMarkdown,
  recordFromHistoricalMarkdown
} from '../../js/core/mind-import.js';

test('parseCsv respects quoted commas', () => {
  const rows = parseCsv('a,b\n"x, y",z\n');
  assert.deepEqual(rows[0], { a: 'x, y', b: 'z' });
});

test('recordFromSessionRow maps Vera CSV columns', () => {
  const rec = recordFromSessionRow({
    'Session Title': 'The Filter',
    Date: '7 April 2026',
    'Session Type': 'Deep Dive',
    'Primary Theme': 'ADHD Reality',
    'Follow-up Themes': 'Relationships, Self-Compassion',
    'Framework Used': 'Compassion-Focused',
    'Mood at Opening': 'Neutral',
    'Mood at Close': 'Good',
    'Key Insight': 'A filter converts good things into obligations.',
    "Vera's Observation": 'The filter activated.',
    'Closing Question': 'Stay ten seconds longer.',
    'Pattern Tags': 'shame-loop, identity'
  });
  assert.equal(rec.type, 'mind_session');
  assert.equal(rec.date, '2026-04-07');
  assert.equal(rec.session_type, 'deep-dive');
  assert.deepEqual(rec.themes, ['ADHD Reality', 'Relationships', 'Self-Compassion']);
  assert.equal(rec.mood_at_open, 'neutral');
  assert.equal(rec.source_agent, 'import');
  assert.equal(rec.source, 'notion_import');
});

test('recordFromDiaryMarkdown maps mood list and score', () => {
  const rec = recordFromDiaryMarkdown(`# Daily Diary: 03 Mar 2026
Date: 3 March 2026
Mood: Low, Neutral
Mood Score: 4
Energy: Low
Tags: Evening, Health
`);
  assert.equal(rec.type, 'diary');
  assert.equal(rec.date, '2026-03-03');
  assert.equal(rec.mood, 'low');
  assert.deepEqual(rec.moods, ['low', 'neutral']);
  assert.equal(rec.mood_score, 4);
  assert.equal(rec.energy, 'low');
});

test('recordFromHistoricalMarkdown sets session_type historical', () => {
  const rec = recordFromHistoricalMarkdown('# Country Teaching Posting\nDate: 2018-10-01\nA long era note.\n');
  assert.equal(rec.session_type, 'historical');
  assert.equal(rec.type, 'mind_session');
});

test('sessionTypeFromNotion maps labels', () => {
  assert.equal(sessionTypeFromNotion('Check-in'), 'check-in');
  assert.equal(sessionTypeFromNotion('Pattern Review'), 'pattern-review');
});
```

Mood labels capitalize in Notion (`Low` → `low`). Date parser must accept `7 April 2026`, `7 April 2026 14:02 (GMT+10)`, `3 March 2026`, ISO.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/unit/mind-import.test.js`

Expected: FAIL module not found

- [ ] **Step 3: Write minimal implementation**

`js/core/mind-import.js` — no fs. `id` = `notion-mind-` + slug of title + date. `validateRecord` is **not** called here; the CLI task validates before write.

Split follow-up themes on commas. Primary theme first in `themes` if not already included.

Historical: `title` from first markdown heading, `insight` from remaining text truncated to a reasonable length (e.g. 2000 chars) so files stay small; full body in markdown body below frontmatter.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/unit/mind-import.test.js`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add js/core/mind-import.js tests/unit/mind-import.test.js
git commit -m "$(cat <<'EOF'
Map Notion Vera CSV and diary pages onto Mind records.

EOF
)"
```

---

### Task 18: Import CLI

**Files:**
- Create: `scripts/import-mind-notion.mjs`
- Modify: `package.json` optional script `"import:mind": "node scripts/import-mind-notion.mjs"`

- [ ] **Step 1: Write a failing integration-style test using a temp dir**

Create `tests/unit/mind-import-cli.test.js` that writes a tiny CSV + markdown into `os.tmpdir()`, calls an exported `importMindExport({ sourceDir, destRoot, existingIds })` from `js/core/mind-import.js` (keep fs I/O in the script, but export `planImport(files)` that returns `{ records, insights }` from in-memory `{ name, text }[]`).

Prefer testing `planImport` in the core module:

```js
test('planImport skips existing ids and ignores intake filenames', () => {
  const plan = planImport([
    { name: 'Vera — Session Database.csv', text: 'Session Title,Date,Session Type,Primary Theme,Follow-up Themes,Framework Used,Mood at Opening,Mood at Close,Key Insight,Vera\'s Observation,Closing Question,Pattern Tags\nFilter,7 April 2026,Deep Dive,ADHD Reality,,ACT,Low,Good,Insight,Obs,Q,tag\n' },
    { name: 'Adam — Psychological Baseline.md', text: '# Intake\nNot a record.\n' }
  ], { existingIds: new Set() });
  assert.equal(plan.records.length, 1);
  assert.equal(plan.records[0].type, 'mind_session');
});
```

Filename detect:

- `*Session Database*.csv` → session rows  
- `Daily Diary*` or frontmatter-like `Type: Note` + `Mood Score` → diary  
- `@*` dated files with session fields → session markdown  
- `Historical*` or era titles without Daily Diary / Session CSV → historical session  
- `/Psychological Baseline|Vera Intake/i` → skip  

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/unit/mind-import.test.js`

Expected: FAIL `planImport` missing

- [ ] **Step 3: Write `planImport` + CLI**

CLI:

```js
// scripts/import-mind-notion.mjs
// Usage: node scripts/import-mind-notion.mjs "/path/to/ExportBlock-..."
```

Reads files from the folder (not recursive beyond one level unless needed). Writes `data/mind/YYYY/MM/YYYY-MM-DD-<slug>.md` using the same frontmatter convention as fixtures. Appends Mind Insight blocks to `data/governance/governance-log.md` only for historical files whose heading/body looks like a synthesis (length > 400 chars **and** filename starts with `Historical` or contains `Pattern Review`). Skip intake.

Idempotent: if `id` already appears in dest files, skip.

Do **not** run the CLI against Adam’s real Downloads folder in CI. Document the command in `docs/IMPLEMENTATION_STATUS.md` when you actually import locally.

- [ ] **Step 4: Run tests**

Run: `node --test tests/unit/mind-import.test.js && npm run validate:fixtures`

Expected: PASS (fixtures unchanged until a local import)

- [ ] **Step 5: Commit**

```bash
git add js/core/mind-import.js scripts/import-mind-notion.mjs tests/unit/mind-import.test.js package.json
git commit -m "$(cat <<'EOF'
Add a Notion Mind export importer CLI.

EOF
)"
```

---

### Task 19: Status, fixtures, full verification

**Files:**
- Modify: `docs/IMPLEMENTATION_STATUS.md`
- Modify: `tests/fixtures/valid/data/mind/2026/07/2026-07-30-session.md` to include `themes` / `title` as a valid example (optional; old files must remain valid)

- [ ] **Step 1: Run the full suite**

```bash
npm test
npm run validate:fixtures
```

Expected: all tests pass.

- [ ] **Step 2: Manual checklist (do not claim done without it)**

- Mind tab: launchers at top with context strings  
- Masonry: 2/3/4 columns, ~12px gaps, no large holes  
- Each tile: question + legend  
- Hover/focus shows a number; click opens overlay; Esc closes  
- Charts animate once on load/range change; reduced-motion skips  
- Still reads as Clinical Glass  
- Empty data: launchers + captions, no throw  

- [ ] **Step 3: Local import (Adam’s machine)**

```bash
node scripts/import-mind-notion.mjs "/Users/adamrussell/Downloads/ExportBlock-65d09965-7b8e-476c-b443-c34df88140c6-Part-1"
```

Then `npm run validate:fixtures` if imported files are in-repo, or validate records individually. Commit imported `data/mind` **only if Adam asks** (sensitive). Default: importer runs locally, Adam reviews `git status` before any data commit.

- [ ] **Step 4: IMPLEMENTATION_STATUS note**

Match existing style. One short paragraph: Mind dashboard v2 masonry analysis board + Notion import mapper.

- [ ] **Step 5: Commit status only**

```bash
git add docs/IMPLEMENTATION_STATUS.md
git commit -m "$(cat <<'EOF'
Note Mind dashboard v2 in implementation status.

EOF
)"
```

---

## Spec coverage

| Spec section | Task |
|---|---|
| Schema diary/session | 1–2 |
| Mapping + co-occurrence | 3–4 |
| Factors, streak, cadence | 5, 11 |
| Transitions, stream, bump, lexical, butterfly, waffle, tension parse | 6–7, 14 |
| Launchers + masonry + overlay | 7–10 |
| Constellation, tension, threads | 12 |
| d3 vendor | 13 |
| Full chart suite + motion | 14–15 |
| Agent write-path + digest | 16 |
| Import + CLI | 17–18 |
| Intake not charted | 17 skip rule |
| SW precache | 10, 13, 14 |
| Privacy (no diary in Vera prompt) | 16 digest still metadata-only |

## Placeholder scan

No TBD. d3 load has a concrete fallback (hand layout) if UMD globals fail. Import does not commit private files unless Adam asks.
