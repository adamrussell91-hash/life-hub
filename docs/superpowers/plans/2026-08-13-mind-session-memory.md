# Mind Session Memory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vera conversations leave a durable `mind_session` file (auto-written) that Penelope and Hammond can use; diary gets mixed moods, Energy write-back, and a real Cross-Agent path.

**Architecture:** New `mind_session` record under `data/mind/`. Vera `log_entry` of that type is written in `chat.mjs` (not Confirm). Shared `mind-digest.mjs` injects a bounded 30-day mind window into Vera/Penelope prompts. Cross-Agent lines and Mind Insights persist on write via `central-node-write.js` and the Governance Log.

**Tech Stack:** Existing Life Hub stack — static PWA, Netlify Functions, GitHub-as-database, `node --test`, no new runtime deps.

**Spec:** `docs/superpowers/specs/2026-08-13-mind-session-memory-design.md`  
**Repo:** `/Users/adamrussell/Documents/Claude/Projects/life-hub`  
**Deploy rule:** Local commits only. **Never `git push`.** Adam pushes himself.  
**Baseline:** `npm test` then `npm run validate:fixtures` after every task. SW cache currently `life-hub-shell-v69`.

---

## File map

| File | Responsibility |
|---|---|
| `config/vera-protocol.md` | Restore diagnostic, ACE, session close, logging rules |
| `config/penelope-protocol.md` | Gather-context, multi-mood, `cross_agent_note`, on-this-day |
| `config/hammond-protocol.md` | Mind Insight priority, silence, 5e/6b suggest-don't-write |
| `js/core/records.js` | `TYPE_DOMAINS.mind_session = 'mind'` |
| `js/core/validate.js` | `validateMindSession`; diary `moods` / `system_note` / `cross_agent_note` |
| `netlify/functions/_shared/chat-schema.mjs` | `RECORD_TYPES`, `DOMAIN_PROPERTIES`, stable `session` slug |
| `netlify/functions/_shared/agent-directory.mjs` | Vera `domain: 'psychology'`, `recordTypes: ['mind_session']` |
| `netlify/functions/_shared/mind-digest.mjs` | **Create.** Pure 30-day mind digest + silence + on-this-day excerpt |
| `netlify/functions/_shared/persona.mjs` | Wire digests; Vera may log `mind_session` |
| `netlify/functions/_shared/persist-log.mjs` | **Create.** Shared GitHub + CN + insight write used by chat + confirm |
| `netlify/functions/chat.mjs` | Gated mind-window fetch; Vera auto-write |
| `netlify/functions/chat-confirm.mjs` | Use persist helper; diary Energy already via CN apply |
| `js/core/central-node-write.js` | Energy, Mind status, `appendCrossAgentLine` |
| `js/core/governance-log.js` | `'Mind Insight'` entry type |
| `js/app/mind-model.js` | `moods` bars; ambient observation |
| `js/app/render-mind.js` + `index.html` | Ambient line near Vera |
| `js/app/render-chat.js` | Hide `system_note`; `record_saved` summary |
| `js/app/chat-controller.js` | Handle `record_saved`; retry via confirm on write fail |
| `service-worker.js` | Precache any new client modules; bump `CACHE_NAME` |
| `docs/IMPLEMENTATION_STATUS.md` | One section when the slice ships |

**Hard constraints**

1. Do not widen `chat.mjs` shared `from` (today+yesterday). Mind blobs are a separate gated window.
2. Hammond ordinary turns: silence from **path dates** on the tree he already has. No 30-day diary-body fetch except 5e/6b turns (inject `summarizeDiaryForPrompt` when `hammondDigest` already loads; for v1 inject the silence string always, diary summary only if `parsed.message` matches `/retrospective|monthly brief|pattern synthesis|three-way brief/i` OR leave it protocol-only and skip the extra fetch — **v1: protocol-only for 5e/6b, silence from paths**).
3. Confirm gate stays for every type except Vera `mind_session`.
4. Never quote diary/session prose into Vera/Hammond digests. On-this-day excerpt is Penelope-only.
5. Bump `CACHE_NAME` on any client JS change. Add new `js/` modules to the SW precache list.
6. Do not push.

---

### Task 1: Protocol restoration (text)

**Files:**
- Modify: `config/vera-protocol.md`
- Modify: `config/penelope-protocol.md`
- Modify: `config/hammond-protocol.md`
- Test: `tests/unit/persona.test.js`

- [ ] **Step 1: Replace Vera's "No structured logging" section**

In `config/vera-protocol.md`, replace the entire `## No structured logging` section (through the Cross-Agent paragraph) with:

```markdown
## Logging

At a natural close, or when Adam asks to record / log / keep this, you MUST call `log_entry` with type `mind_session` in that same turn. Fill `theme` (what was brought), `closing_question` (what's worth carrying), and `insight` only when something sharp was actually present. Infer `mood_at_open` / `mood_at_close`. If another agent must act, put one line in `cross_agent_note` (e.g. `Vera→Penelope: ask what the weekend is actually for.`). Chat-only Vera→[Agent] lines are not memory.

Diary logging belongs to Penelope. Do not propose `diary`.

Life Hub writes the `mind_session` file when you call `log_entry` — there is no Confirm card for this type. Do not claim it was logged if the tool returns an error.

## Framework Selection — internal diagnostic (never announced)

CORE RULE: never announce which framework you are using. If it stops serving, drop it.

Before the session, silently answer:

1. What is he presenting? (incident / pattern / unnamed feeling / identity / relationship / illness / existential)
2. What does the last 30 days of diary and mood data show? Gaps are data.
3. What is the nature of the gap? (map below)
4. What stage? Crisis = stabilise. Stable-but-stuck = ACT or narrative. Growing = values/identity.

Gap → framework (lead with one; most sessions blend two):

- Knowing-doing gap → ADHD Coaching (interest, time blindness, dysregulation — not generic productivity)
- Fighting reality (Crohn's, ADHD, load) → ACT
- Shame louder than what happened → Compassion-Focused (Neff), as fact not comfort
- A specific distorted thought driving behaviour → CBT-Informed, sparingly
- Identity outside illness/ADHD/teacher → Narrative
- Part wants X, part keeps doing Y → IFS-adjacent
- Relationships absent or surfacing → IFS-adjacent or ACT; light opening if data shows it and he has not raised it
- Purpose/meaning hollow → Narrative + values (not Hammond goal-setting). Name as a theme only after it appears across 3+ sessions.

## Dropping Anchor (ACE)

When rumination, dysregulation, or panic is in the room, offer ACE unlabelled unless asked: Acknowledge what is here → Connect with the body (feet, spine, breath) → Engage the room. 3–4 slow passes, or a 30-second single pass. A is not optional.

## Closing — always three parts

1. What you brought (one sentence)
2. What I noticed underneath
3. What's worth carrying forward (a question, not a to-do)

Then call `log_entry` `mind_session` using those three parts as `theme` / `insight` / `closing_question`.

## Privacy

Never quote diary or session prose back. Use it to ask better questions. Named insights in the Governance Log may be referenced by the short label you chose.

## Correlation

When a hard stretch follows a taper or flare more than once, test — do not assert — a correlation with Constraints & Priorities. Never on a first occurrence.
```

Keep existing Job / Before every session / Presence / Safety. Delete the old "After a meaningful session" chat-only Cross-Agent instruction (replaced by `cross_agent_note`).

- [ ] **Step 2: Update Penelope protocol**

In `config/penelope-protocol.md`:

1. Under "Glance at context", add: scan recent diary + Cross-Agent for relationship dynamics (Corey, friends, family) and purpose/meaning signals (energy vs hollow). Synthesise; never inventory. Weather/calendar research is out of scope.

2. Replace the `mood` bullet under Metadata with:

```markdown
- `mood` — primary tone (great / good / neutral / low / bad). If ≥70% of the day is one tone, this is the only mood.
- `moods` — 1–3 items from the same list, only for genuinely mixed days; `mood` must be one of them
```

3. Replace Cross-Agent step 4 with: fill `cross_agent_note` on the diary `log_entry` (e.g. `Penelope→Vera: three low days — worth a visit.`). Chat-only lines are not memory. Prefer a recurring image over a fact when one is genuinely present.

4. Add:

```markdown
## On this day

If the prompt includes an excerpt from this calendar date in a prior year, you may open with it — his own words, not a mood label. Do not dump the whole entry.

## Gaps

If days since last entry is 7+, you may notice gently ("been a minute — anything you want to get down?"). Never as an obligation.

## Optional fields

- `system_note` — one line, what this day was actually about, for other agents. Not shown to Adam. Metadata, not a prose summary of `notes`.
- Named insights in the Governance Log may be referenced by Vera's label without re-explaining.
```

- [ ] **Step 3: Hammond protocol additions**

Append to `config/hammond-protocol.md` after Decision Priority Hierarchy:

```markdown
## Mind domain

When a Governance Log **Mind Insight** is open, or the prompt flags diary-vs-session mood divergence, weigh it against priority #1 (health and psychological stability) in triage.

If both diary and Vera sessions have been quiet ≥7 days (silence flag in the prompt), that is a real signal — not a Home nag. One line in assessment is enough.

**Monthly three-way brief:** about every 30 days when new Mind Insights exist, you may *suggest* a brief. Do not auto-write Long-Term Trends. If Adam agrees, `propose_central_node_patch` into Long-Term Trends (Confirm). Inputs: your operational digest, Mind Insights, diary metadata in the prompt — not a vault dump. If data is thin, say so.

**Quarterly two-voice look-back:** when Adam asks, or once ~90 days of diary + Vera sessions exist, you may suggest it. One turn, two voices interleaved (Penelope on the days, Vera on named insights) in chat. If he wants it kept, same Confirm patch into Long-Term Trends. Do not invent a season.
```

- [ ] **Step 4: Persona tests for restored headings**

Add to `tests/unit/persona.test.js`:

```js
import { loadVeraProtocol } from '../../netlify/functions/_shared/load-vera-protocol.mjs';
import { loadPenelopeProtocol } from '../../netlify/functions/_shared/load-penelope-protocol.mjs';
import { loadHammondProtocol } from '../../netlify/functions/_shared/load-hammond-protocol.mjs';

test('vera protocol restore includes diagnostic, ACE, and mind_session logging', () => {
  const text = loadVeraProtocol();
  assert.match(text, /Framework Selection/);
  assert.match(text, /Dropping Anchor/);
  assert.match(text, /mind_session/);
  assert.doesNotMatch(text, /You do not propose `log_entry`/);
});

test('penelope protocol restore includes gather-context, moods, and cross_agent_note', () => {
  const text = loadPenelopeProtocol();
  assert.match(text, /Relationships and social context|relationship dynamic/i);
  assert.match(text, /moods/);
  assert.match(text, /cross_agent_note/);
  assert.match(text, /On this day/);
});

test('hammond protocol includes Mind domain brief and retrospective', () => {
  const text = loadHammondProtocol();
  assert.match(text, /Mind Insight/);
  assert.match(text, /three-way brief/i);
  assert.match(text, /two-voice/i);
});
```

If `loadPenelopeProtocol` / `loadHammondProtocol` already exist (they do, same pattern as Vera), import those. Do not create new loaders.

- [ ] **Step 5: Run tests**

Run: `node --test tests/unit/persona.test.js`

Expected: PASS (including the three new tests). Existing `'vera prompt includes protocol when provided'` still passes because it injects a fixture string, not the file.

- [ ] **Step 6: Commit**

```bash
git add config/vera-protocol.md config/penelope-protocol.md config/hammond-protocol.md tests/unit/persona.test.js
git commit -m "$(cat <<'EOF'
feat: restore Vera/Penelope/Hammond mind protocols

EOF
)"
```

---

### Task 2: Schema — `mind_session` + diary `moods` / notes

**Files:**
- Modify: `js/core/records.js`
- Modify: `js/core/validate.js`
- Modify: `netlify/functions/_shared/chat-schema.mjs`
- Modify: `netlify/functions/_shared/agent-directory.mjs`
- Modify: `tests/unit/records.test.js` (unknown type / diary mood cases)
- Test: `tests/unit/validate.js` or extend existing validate tests in `tests/unit/records.test.js` and `tests/unit/chat-schema.test.js`
- Create: `tests/fixtures/valid/data/mind/2026/07/2026-07-30-session.md`

- [ ] **Step 1: Write failing validate tests**

Add to `tests/unit/records.test.js` (same `validateRecord` import the file already uses — if it only tests via `parseEventDocument`, add `import { validateRecord } from '../../js/core/validate.js';`):

```js
test('validateMindSession requires at least one of theme, insight, closing_question', () => {
  const base = {
    schema_version: 1, id: 'ms-1', type: 'mind_session', date: '2026-08-13',
    created_at: '2026-08-13T17:00:00+10:00', updated_at: '2026-08-13T17:00:00+10:00',
    source: 'chat'
  };
  assert.ok(validateRecord({ ...base, theme: 'Weekend permission' }).length === 0);
  assert.ok(validateRecord({ ...base }).some(e => /theme|insight|closing_question/.test(e)));
  assert.ok(validateRecord({ ...base, theme: 'x', mood_at_open: 'wired' }).some(e => /mood_at_open/.test(e)));
});

test('diary moods is 1–3 MOODS and must include primary mood', () => {
  const diary = {
    schema_version: 1, id: 'd-1', type: 'diary', date: '2026-08-13',
    created_at: '2026-08-13T21:00:00+10:00', updated_at: '2026-08-13T21:00:00+10:00',
    source: 'chat', mood_score: 6, mood: 'low', energy: 'medium', tags: [], dayone_sent: false
  };
  assert.equal(validateRecord(diary).length, 0);
  assert.equal(validateRecord({ ...diary, moods: ['low', 'good'] }).length, 0);
  assert.ok(validateRecord({ ...diary, moods: [] }).some(e => /moods/.test(e)));
  assert.ok(validateRecord({ ...diary, moods: ['low', 'good', 'neutral', 'bad'] }).some(e => /moods/.test(e)));
  assert.ok(validateRecord({ ...diary, mood: 'low', moods: ['good'] }).some(e => /mood/.test(e)));
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `node --test tests/unit/records.test.js`

Expected: FAIL with `Unknown record type: mind_session` and/or moods ignored.

- [ ] **Step 3: Implement schema**

`js/core/records.js` — add to `TYPE_DOMAINS`:

```js
  diary: 'mind',
  mind_session: 'mind',
```

`js/core/validate.js` — extend `validateDiary` and add `validateMindSession`; register in `VALIDATORS`:

```js
function validateDiary(record, errors) {
  finiteNumber(record, 'mood_score', errors, { minimum: 1, maximum: 10 });
  enumeration(record, 'mood', MOODS, errors);
  enumeration(record, 'energy', ENERGY_LEVELS, errors);
  stringArray(record, 'tags', errors);
  optionalString(record, 'highlights', errors);
  optionalString(record, 'challenges', errors);
  optionalString(record, 'system_note', errors);
  optionalString(record, 'cross_agent_note', errors);
  booleanField(record, 'dayone_sent', errors);
  if (record.moods != null) {
    if (!Array.isArray(record.moods) || record.moods.length < 1 || record.moods.length > 3) {
      errors.push('moods must be an array of 1–3 items');
    } else {
      for (const item of record.moods) {
        if (!MOODS.includes(item)) errors.push(`moods items must be one of: ${MOODS.join(', ')}`);
      }
      if (record.mood != null && !record.moods.includes(record.mood)) {
        errors.push('mood must be one of moods when moods is present');
      }
    }
  }
}

function validateMindSession(record, errors) {
  optionalString(record, 'theme', errors);
  optionalString(record, 'closing_question', errors);
  optionalString(record, 'insight', errors);
  optionalString(record, 'cross_agent_note', errors);
  enumeration(record, 'mood_at_open', MOODS, errors);
  enumeration(record, 'mood_at_close', MOODS, errors);
  const hasCore = [record.theme, record.closing_question, record.insight]
    .some(v => typeof v === 'string' && v.trim() !== '');
  if (!hasCore) errors.push('mind_session requires theme, insight, or closing_question');
}
```

Add `mind_session: validateMindSession` to `VALIDATORS`.

`netlify/functions/_shared/chat-schema.mjs`:

- `RECORD_TYPES` add `'mind_session'` (keep bloods out — it is not a chat log type).
- `DOMAIN_PROPERTIES.diary` add:

```js
    moods: { type: 'array', items: { type: 'string', enum: ['great', 'good', 'neutral', 'low', 'bad'] } },
    system_note: { type: 'string' },
    cross_agent_note: { type: 'string' }
```

- `DOMAIN_PROPERTIES.mind_session`:

```js
  mind_session: {
    theme: { type: 'string' },
    closing_question: { type: 'string' },
    insight: { type: 'string' },
    mood_at_open: { type: 'string', enum: ['great', 'good', 'neutral', 'low', 'bad'] },
    mood_at_close: { type: 'string', enum: ['great', 'good', 'neutral', 'low', 'bad'] },
    cross_agent_note: { type: 'string' }
  }
```

- `buildRecordSlug`: if `record.type === 'mind_session'` return `'session'` (one file per day, like meal slots).

`agent-directory.mjs` Vera entry:

```js
    domain: 'psychology',
    recordTypes: ['mind_session'],
```

- [ ] **Step 4: chat-schema tests**

Add to `tests/unit/chat-schema.test.js`:

```js
test('mind_session whitelist and session slug', () => {
  const result = validateLogEntry({
    type: 'mind_session',
    date: '2026-08-13',
    fields: { theme: 'Weekend permission', closing_question: 'What is the weekend for?', mood_at_close: 'low' }
  }, { id: 'ms-1', now: '2026-08-13T17:00:00+10:00' });
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.equal(buildRecordSlug(result.record), 'session');
  assert.equal(
    buildCanonicalPath({ type: 'mind_session', date: '2026-08-13', slug: 'session' }),
    'data/mind/2026/08/2026-08-13-session.md'
  );
});

test('diary whitelist accepts moods, system_note, cross_agent_note', () => {
  const result = validateLogEntry({
    type: 'diary',
    date: '2026-08-13',
    fields: {
      mood_score: 6, mood: 'low', moods: ['low', 'good'], energy: 'medium',
      tags: [], dayone_sent: false, system_note: 'Weekend collapse',
      cross_agent_note: 'Penelope→Vera: worth a visit.'
    }
  }, { id: 'd-1', now: '2026-08-13T21:00:00+10:00' });
  assert.equal(result.valid, true, JSON.stringify(result.errors));
});
```

Extend the existing diary whitelist test fields if it would now fail for missing optional keys (it should not — extra fields in the candidate are what fail, missing optionals are fine).

- [ ] **Step 5: Fixture**

Create `tests/fixtures/valid/data/mind/2026/07/2026-07-30-session.md`:

```markdown
---
schema_version: 1
id: mind-session-1
type: mind_session
date: 2026-07-30
time: "21:40"
created_at: 2026-07-30T21:40:00+10:00
updated_at: 2026-07-30T21:40:00+10:00
source: test_fixture
theme: Weekend permission
closing_question: What is the weekend actually for?
insight: Exhaustion looking like chaos
mood_at_open: low
mood_at_close: low
---
```

- [ ] **Step 6: Run tests**

Run: `node --test tests/unit/records.test.js tests/unit/chat-schema.test.js && npm run validate:fixtures`

Expected: PASS, fixtures valid (count may rise by 1).

- [ ] **Step 7: Commit**

```bash
git add js/core/records.js js/core/validate.js netlify/functions/_shared/chat-schema.mjs netlify/functions/_shared/agent-directory.mjs tests/unit/records.test.js tests/unit/chat-schema.test.js tests/fixtures/valid/data/mind/2026/07/2026-07-30-session.md
git commit -m "$(cat <<'EOF'
feat: add mind_session schema and diary moods

EOF
)"
```

---

### Task 3: `mind-digest.mjs`

**Files:**
- Create: `netlify/functions/_shared/mind-digest.mjs`
- Create: `tests/unit/mind-digest.test.js`
- Modify: `js/app/mind-model.js` (`diaryEntries` include `moods`, `system_note`, `notes`/`body` not required)

- [ ] **Step 1: Write failing tests**

Create `tests/unit/mind-digest.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { addCalendarDays } from '../../js/core/time.js';
import {
  MIND_DIGEST_WINDOW_DAYS,
  getMindDigestWindowStart,
  summarizeDiaryForPrompt,
  summarizeMindSessionsForPrompt,
  simultaneousSilenceFlag,
  divergenceLine,
  excerptOnThisDay,
  selectMindEntries
} from '../../netlify/functions/_shared/mind-digest.mjs';

const TODAY = '2026-08-13';

test('window is 30 inclusive days', () => {
  assert.equal(MIND_DIGEST_WINDOW_DAYS, 30);
  assert.equal(getMindDigestWindowStart(TODAY), addCalendarDays(TODAY, -29));
});

test('empty events produce empty strings, not a crash', () => {
  assert.equal(summarizeDiaryForPrompt([], TODAY), '');
  assert.equal(summarizeMindSessionsForPrompt([], TODAY), '');
  assert.equal(simultaneousSilenceFlag({ tree: [], today: TODAY }), '');
});

test('diary summary uses metadata and system_note, never notes body', () => {
  const events = [{
    record: {
      type: 'diary', date: '2026-08-10', mood: 'low', moods: ['low', 'good'],
      tags: ['weekend'], system_note: 'Weekend collapse', mood_score: 4
    },
    body: 'SECRET PROSE ADAM SHOULD NOT SEE IN VERA DIGEST',
    path: 'data/mind/2026/08/2026-08-10-diary-2100.md'
  }];
  const text = summarizeDiaryForPrompt(events, TODAY);
  assert.match(text, /low/);
  assert.match(text, /Weekend collapse/);
  assert.doesNotMatch(text, /SECRET PROSE/);
  assert.match(text, /days since last entry: 3/i);
});

test('session summary surfaces closing_question as a thread', () => {
  const events = [{
    record: {
      type: 'mind_session', date: '2026-08-12',
      theme: 'Weekend permission', closing_question: 'What is the weekend actually for?'
    },
    body: '',
    path: 'data/mind/2026/08/2026-08-12-session.md'
  }];
  const text = summarizeMindSessionsForPrompt(events, TODAY);
  assert.match(text, /Weekend permission/);
  assert.match(text, /What is the weekend actually for/);
});

test('silence flag only when both gaps >= 7', () => {
  const treeBoth = [];
  assert.match(simultaneousSilenceFlag({ tree: treeBoth, today: TODAY }), /quiet/i);
  const treeDiary = [{
    path: 'data/mind/2026/08/2026-08-12-diary-2100.md', type: 'blob', sha: 'a'
  }];
  assert.equal(simultaneousSilenceFlag({ tree: treeDiary, today: TODAY }), '');
});

test('on-this-day excerpt truncates notes', () => {
  const long = 'First sentence is here. Second sentence follows after. Third should not.';
  const excerpt = excerptOnThisDay({
    date: '2025-08-13',
    mood: 'low',
    tags: ['work'],
    highlights: 'A walk',
    challenges: 'Load',
    notes: long
  });
  assert.match(excerpt, /2025-08-13/);
  assert.match(excerpt, /First sentence/);
  assert.doesNotMatch(excerpt, /Third should not/);
});

test('selectMindEntries filters data/mind in window', () => {
  const tree = [
    { path: 'data/mind/2026/08/2026-08-01-diary-2100.md', type: 'blob', sha: '1' },
    { path: 'data/mind/2026/07/2026-07-01-session.md', type: 'blob', sha: '2' },
    { path: 'data/nutrition/2026/08/2026-08-13-breakfast.md', type: 'blob', sha: '3' }
  ];
  const from = getMindDigestWindowStart(TODAY);
  const selected = selectMindEntries(tree, { from, to: TODAY });
  assert.equal(selected.length, 1);
  assert.equal(selected[0].sha, '1');
});
```

Adjust the on-this-day assertion to match the excerpt helper you write (second sentence boundary **or** 400 chars, whichever is shorter — "Third should not" is the third sentence so it must be absent).

- [ ] **Step 2: Run — expect FAIL (module missing)**

Run: `node --test tests/unit/mind-digest.test.js`

Expected: FAIL `Cannot find module`.

- [ ] **Step 3: Implement `mind-digest.mjs`**

Create `netlify/functions/_shared/mind-digest.mjs`:

```js
import { diaryEntries } from '../../../js/app/mind-model.js';
import { addCalendarDays, daysBetween } from '../../../js/core/time.js';

export const MIND_DIGEST_WINDOW_DAYS = 30;
const MIND_PATH = /^data\/mind\/(?<year>\d{4})\/(?<month>\d{2})\/(?<date>\d{4}-\d{2}-\d{2})-(?<name>[a-z0-9]+(?:-[a-z0-9]+)*)\.md$/;
const SILENCE_DAYS = 7;

export function getMindDigestWindowStart(today) {
  return addCalendarDays(today, -(MIND_DIGEST_WINDOW_DAYS - 1));
}

export function selectMindEntries(tree, { from, to } = {}) {
  if (!Array.isArray(tree)) return [];
  return tree.filter(entry => {
    if (!entry || entry.type !== 'blob' || typeof entry.path !== 'string') return false;
    const match = MIND_PATH.exec(entry.path);
    if (!match) return false;
    if (from && match.groups.date < from) return false;
    if (to && match.groups.date > to) return false;
    return true;
  }).sort((a, b) => a.path.localeCompare(b.path));
}

export function selectOnThisDayEntries(tree, today) {
  if (!Array.isArray(tree) || typeof today !== 'string') return [];
  const [, month, day] = today.split('-');
  const [year] = today.split('-').map(Number);
  const found = [];
  for (let ago = 1; ago <= 3; ago += 1) {
    const y = String(year - ago);
    const prefix = `data/mind/${y}/${month}/${y}-${month}-${day}-diary-`;
    const hit = tree.find(entry => entry?.type === 'blob' && typeof entry.path === 'string' && entry.path.startsWith(prefix));
    if (hit) found.push(hit);
  }
  return found;
}

function lastDate(events, type) {
  const dates = (events ?? [])
    .filter(e => e?.record?.type === type && typeof e.record.date === 'string')
    .map(e => e.record.date)
    .sort();
  return dates.at(-1) ?? null;
}

export function summarizeDiaryForPrompt(events, today) {
  const entries = (events ?? []).filter(e => e?.record?.type === 'diary');
  if (!entries.length) return '';
  const last = lastDate(events, 'diary');
  const gap = last ? daysBetween(last, today) : null;
  const lengths = entries.map(e => (e.body ?? '').trim().split(/\s+/).filter(Boolean).length);
  const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const sorted = [...lengths].sort((a, b) => a - b);
  const q1 = sorted[Math.floor(sorted.length / 4)] ?? 0;
  const shortFlag = lengths.length >= 4 && lengths.filter(n => n <= q1).length
    ? 'Recent entries include some shorter than usual — a hypothesis, not a claim.'
    : '';
  const lines = entries
    .sort((a, b) => a.record.date.localeCompare(b.record.date))
    .slice(-8)
    .map(e => {
      const r = e.record;
      const moods = Array.isArray(r.moods) && r.moods.length ? r.moods.join('/') : (r.mood ?? '');
      const tags = Array.isArray(r.tags) ? r.tags.join(', ') : '';
      const note = typeof r.system_note === 'string' && r.system_note.trim() ? ` system_note: ${r.system_note.trim()}` : '';
      return `${r.date}: mood ${moods}${r.mood_score != null ? ` score ${r.mood_score}` : ''}${tags ? ` tags ${tags}` : ''}${note}`;
    });
  return [
    'Diary (metadata only — do not quote prose):',
    ...lines,
    gap != null ? `Days since last entry: ${gap}.` : 'No diary dates.',
    shortFlag
  ].filter(Boolean).join('\n');
}

export function summarizeMindSessionsForPrompt(events, today) {
  const sessions = (events ?? []).filter(e => e?.record?.type === 'mind_session');
  if (!sessions.length) return '';
  const last = lastDate(events, 'mind_session');
  const gap = last ? daysBetween(last, today) : null;
  const lines = sessions
    .sort((a, b) => a.record.date.localeCompare(b.record.date))
    .slice(-6)
    .map(e => {
      const r = e.record;
      const thread = r.closing_question ? ` thread: ${r.closing_question}` : '';
      return `${r.date}: ${r.theme ?? 'session'}${thread}`;
    });
  return [
    'Vera sessions (do not quote session prose):',
    ...lines,
    gap != null ? `Days since last mind session: ${gap}.` : ''
  ].filter(Boolean).join('\n');
}

function lastMindPathDate(tree, { session }) {
  const dates = [];
  for (const entry of tree ?? []) {
    const match = typeof entry?.path === 'string' ? MIND_PATH.exec(entry.path) : null;
    if (!match) continue;
    const isSession = match.groups.name === 'session';
    if (session ? isSession : !isSession) dates.push(match.groups.date);
  }
  dates.sort();
  return dates.at(-1) ?? null;
}

export function simultaneousSilenceFlag({ tree, today }) {
  const lastDiary = lastMindPathDate(tree, { session: false });
  const lastSession = lastMindPathDate(tree, { session: true });
  const diaryGap = lastDiary ? daysBetween(lastDiary, today) : SILENCE_DAYS + 1;
  const sessionGap = lastSession ? daysBetween(lastSession, today) : SILENCE_DAYS + 1;
  if (diaryGap >= SILENCE_DAYS && sessionGap >= SILENCE_DAYS) {
    return `Mind silence: diary quiet ${lastDiary ? `${diaryGap}d` : 'with no files'} and Vera sessions quiet ${lastSession ? `${sessionGap}d` : 'with no files'} (both ≥${SILENCE_DAYS}).`;
  }
  return '';
}

export function divergenceLine(events, today) {
  const weekFrom = addCalendarDays(today, -6);
  const diaries = (events ?? []).filter(e => e?.record?.type === 'diary' && e.record.date >= weekFrom);
  const sessions = (events ?? []).filter(e => e?.record?.type === 'mind_session' && e.record.date >= weekFrom);
  if (!diaries.length || !sessions.length) return '';
  const diaryMoods = new Set(diaries.flatMap(e => Array.isArray(e.record.moods) && e.record.moods.length
    ? e.record.moods
    : (e.record.mood ? [e.record.mood] : [])));
  const sessionMoods = new Set(sessions.flatMap(e => [e.record.mood_at_open, e.record.mood_at_close].filter(Boolean)));
  const overlap = [...diaryMoods].some(m => sessionMoods.has(m));
  if (overlap || diaryMoods.size === 0 || sessionMoods.size === 0) return '';
  return `Hypothesis only: this week's diary moods (${[...diaryMoods].join(', ')}) and session moods (${[...sessionMoods].join(', ')}) did not overlap.`;
}

export function excerptOnThisDay({ date, mood, moods, tags, highlights, challenges, notes }) {
  const raw = typeof notes === 'string' ? notes.trim() : '';
  let excerpt = '';
  if (raw) {
    const sentences = raw.split(/(?<=[.!?])\s+/);
    excerpt = sentences.slice(0, 2).join(' ');
    if (excerpt.length > 400) excerpt = excerpt.slice(0, 400).replace(/\s+\S*$/, '');
  }
  const moodLabel = Array.isArray(moods) && moods.length ? moods.join('/') : (mood ?? '');
  return [
    `On this day ${date}: mood ${moodLabel}.`,
    Array.isArray(tags) && tags.length ? `Tags: ${tags.join(', ')}.` : '',
    highlights ? `Highlights: ${highlights}` : '',
    challenges ? `Challenges: ${challenges}` : '',
    excerpt ? `Excerpt: ${excerpt}` : ''
  ].filter(Boolean).join(' ');
}
```

Update `diaryEntries` in `js/app/mind-model.js` to pass through `moods` and `system_note`:

```js
      mood: event.record.mood ?? null,
      moods: Array.isArray(event.record.moods) ? event.record.moods : null,
      system_note: event.record.system_note ?? null,
```

Update `entriesByMood` so a `moods` array increments each key:

```js
    const keys = Array.isArray(entry.moods) && entry.moods.length ? entry.moods : [entry.mood];
    for (const key of keys) {
      if (key && Object.hasOwn(counts, key)) counts[key] += 1;
    }
```

Add a unit case in `tests/unit/mind-model.test.js`: mixed `moods: ['low','good']` increments both bars.

- [ ] **Step 4: Run tests**

Run: `node --test tests/unit/mind-digest.test.js tests/unit/mind-model.test.js`

Expected: PASS. Fix excerpt/silence assertions if wording differs — keep the contracts (empty ≠ crash; no prose leak; both-quiet only).

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/_shared/mind-digest.mjs tests/unit/mind-digest.test.js js/app/mind-model.js tests/unit/mind-model.test.js
git commit -m "$(cat <<'EOF'
feat: add bounded mind digest for Vera and Penelope

EOF
)"
```

---

### Task 4: Wire digest into chat + persona

**Files:**
- Modify: `netlify/functions/chat.mjs`
- Modify: `netlify/functions/_shared/persona.mjs`
- Modify: `tests/unit/persona.test.js`
- Modify: `tests/integration/chat-function.test.js` only if a stub breaks (empty tree is fine)

- [ ] **Step 1: Failing persona tests**

```js
test('vera prompt includes mind diary and session digest and lists mind_session', () => {
  const prompt = buildSystemPrompt({
    slug: 'vera',
    mindDiaryDigest: 'Diary (metadata only): 2026-08-10 mood low',
    mindSessionDigest: 'thread: What is the weekend actually for?',
    mindSilence: 'Mind silence: both quiet 8d'
  });
  assert.match(prompt, /mind_session/);
  assert.doesNotMatch(prompt, /You do not propose log_entry/);
  assert.match(prompt, /Diary \(metadata only\)/);
  assert.match(prompt, /What is the weekend actually for/);
  assert.match(prompt, /Mind silence/);
});

test('penelope prompt includes mind diary digest and keeps nutrition digest', () => {
  const prompt = buildSystemPrompt({
    slug: 'penelope',
    digest: 'Today: 1800 kcal',
    mindDiaryDigest: 'Days since last entry: 2',
    onThisDay: 'On this day 2025-08-13: Excerpt: We went to the shops.'
  });
  assert.match(prompt, /1800 kcal/);
  assert.match(prompt, /Days since last entry/);
  assert.match(prompt, /We went to the shops/);
});

test('hammond prompt includes silence flag and not diary excerpt', () => {
  const prompt = buildSystemPrompt({
    slug: 'hammond',
    mindSilence: 'Mind silence: both quiet 8d',
    onThisDay: 'On this day 2025-08-13: Excerpt: SECRET'
  });
  assert.match(prompt, /Mind silence/);
  assert.doesNotMatch(prompt, /SECRET/);
});

test('brisket prompt never receives mind diary digest', () => {
  const prompt = buildSystemPrompt({
    slug: 'brisket',
    mindDiaryDigest: 'Diary leak'
  });
  assert.doesNotMatch(prompt, /Diary leak/);
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `node --test tests/unit/persona.test.js`

Expected: FAIL (unknown params ignored / old "do not propose" line still present).

- [ ] **Step 3: Wire `persona.mjs`**

Add to `buildSystemPrompt` destructure:

```js
  mindDiaryDigest = '',
  mindSessionDigest = '',
  mindSilence = '',
  mindDivergence = '',
  onThisDay = '',
  daysSinceLastEntry = null,
  daysSinceLastMindSession = null
```

Replace Vera's `'You do not propose log_entry...'` with:

```js
    'You MAY propose log_entry for mind_session at a natural close or when Adam asks to record. Diary stays Penelope. Life Hub writes mind_session immediately — a successful tool result means written, not awaiting confirm. Do not claim it was logged if the tool returns an error.',
```

In the **shared** block, after the sentence "specialists never silently auto-save structured records", add: `Exception: Vera mind_session writes immediately (no Confirm card). Every other type still awaits Confirm.`

Vera blocks — append when present:

```js
    mindDiaryDigest ? `Mind diary digest:\n${mindDiaryDigest}` : '',
    mindSessionDigest ? `Mind session digest:\n${mindSessionDigest}` : '',
    mindSilence,
    mindDivergence,
    daysSinceLastMindSession != null ? `Days since last Vera session: ${daysSinceLastMindSession}.` : ''
```

Penelope blocks — append:

```js
    mindDiaryDigest ? `Mind diary digest:\n${mindDiaryDigest}` : '',
    mindSilence,
    onThisDay ? `On this day (his own past writing — you may open with it):\n${onThisDay}` : '',
    daysSinceLastEntry != null ? `Days since last diary entry: ${daysSinceLastEntry}.` : ''
```

Hammond blocks (find existing hammondBlocks array) — append `mindSilence` only. Do not pass `onThisDay`.

- [ ] **Step 4: Wire `chat.mjs` fetch**

Imports:

```js
import {
  getMindDigestWindowStart,
  selectMindEntries,
  selectOnThisDayEntries,
  summarizeDiaryForPrompt,
  summarizeMindSessionsForPrompt,
  simultaneousSilenceFlag,
  divergenceLine,
  excerptOnThisDay
} from './_shared/mind-digest.mjs';
```

After `needsBodyState`:

```js
    const needsMindDigest = slug === 'vera' || slug === 'penelope';
    const mindFrom = needsMindDigest ? getMindDigestWindowStart(today) : null;
```

Select entries from `current.tree` (already fetched):

```js
          const mindEntries = needsMindDigest
            ? selectMindEntries(current.tree, { from: mindFrom, to: today })
            : [];
          const onThisDayEntries = slug === 'penelope'
            ? selectOnThisDayEntries(current.tree, today)
            : [];
```

Add `Promise.all` slots for `mindEntries` and `onThisDayEntries` blobs (same `readBlob` pattern as `hammondCnEntries`). Parse with `parseEventDocument` + `load` like `digest.mjs`. Skip failures.

Then:

```js
          const mindSilence = simultaneousSilenceFlag({ tree: current.tree, today });
          let mindDiaryDigest = '';
          let mindSessionDigest = '';
          let mindDivergence = '';
          let onThisDay = '';
          let daysSinceLastEntry = null;
          let daysSinceLastMindSession = null;
          if (needsMindDigest) {
            const mindFiles = mindEntries
              .map((entry, index) => ({ path: entry.path, content: decodeBlob(mindBlobs[index]) }))
              .filter(file => file.content !== null);
            const mindEvents = [];
            for (const file of mindFiles) {
              try { mindEvents.push(parseEventDocument(file.content, file.path, load)); }
              catch { /* skip */ }
            }
            mindDiaryDigest = summarizeDiaryForPrompt(mindEvents, today);
            mindSessionDigest = summarizeMindSessionsForPrompt(mindEvents, today);
            mindDivergence = slug === 'vera' ? divergenceLine(mindEvents, today) : '';
            const lastDiary = mindEvents.filter(e => e.record.type === 'diary').map(e => e.record.date).sort().at(-1);
            const lastSession = mindEvents.filter(e => e.record.type === 'mind_session').map(e => e.record.date).sort().at(-1);
            if (lastDiary) daysSinceLastEntry = daysBetween(lastDiary, today);
            if (lastSession) daysSinceLastMindSession = daysBetween(lastSession, today);
          }
          if (slug === 'penelope' && onThisDayBlobs?.length) {
            const file = onThisDayEntries
              .map((entry, i) => ({ path: entry.path, content: decodeBlob(onThisDayBlobs[i]) }))
              .find(f => f.content);
            if (file) {
              try {
                const parsed = parseEventDocument(file.content, file.path, load);
                onThisDay = excerptOnThisDay({
                  date: parsed.record.date,
                  mood: parsed.record.mood,
                  moods: parsed.record.moods,
                  tags: parsed.record.tags,
                  highlights: parsed.record.highlights,
                  challenges: parsed.record.challenges,
                  notes: parsed.body
                });
              } catch { /* skip */ }
            }
          }
```

Pass those into `buildSystemPrompt`. Import `daysBetween` from `js/core/time.js` if not already.

Hammond `buildSystemPrompt` call: pass `mindSilence` (computed from `current.tree` even when `!needsMindDigest`). Compute `mindSilence` for vera/penelope/hammond; `''` otherwise.

- [ ] **Step 5: Run tests**

Run: `node --test tests/unit/persona.test.js tests/integration/chat-function.test.js`

Expected: PASS. If `Promise.all` arity changed, fix the destructure to match added blob arrays.

- [ ] **Step 6: Commit**

```bash
git add netlify/functions/chat.mjs netlify/functions/_shared/persona.mjs tests/unit/persona.test.js
git commit -m "$(cat <<'EOF'
feat: inject mind digest into Vera, Penelope, and Hammond prompts

EOF
)"
```

---

### Task 5: Central Node writes

**Files:**
- Modify: `js/core/central-node-write.js`
- Modify: `js/core/governance-log.js`
- Test: `tests/unit/central-node-write.test.js`
- Test: `tests/unit/governance-log.test.js`

- [ ] **Step 1: Failing tests**

In `tests/unit/central-node-write.test.js`:

```js
import { appendCrossAgentLine } from '../../js/core/central-node-write.js';

test('diary confirm upserts Energy as well as Mood', () => {
  const next = applyLogToCentralNode(base, {
    record: { type: 'diary', date: '2026-06-19', mood: 'low', mood_score: 4, energy: 'low' },
    actionLine: '\n**19 Jun:** Penelope: Logged a diary entry.'
  });
  assert.match(next, /\*\*Mood:\*\*/);
  assert.match(next, /\*\*Energy:\*\* low/);
});

test('mind_session upserts Mind status and Cross-Agent line', () => {
  const withXa = `${base}\n## 🤝 Cross-Agent Coordination\n- Old line.\n`;
  const next = applyLogToCentralNode(withXa, {
    record: {
      type: 'mind_session', date: '2026-06-19',
      theme: 'Weekend permission',
      cross_agent_note: 'Vera→Penelope: ask what the weekend is for.'
    },
    actionLine: '\n**19 Jun:** Dr Vera Lenz: Logged a mind session (Weekend permission).'
  });
  assert.match(next, /\*\*Mind:\*\* Weekend permission/);
  assert.match(next, /Vera→Penelope: ask what the weekend is for/);
});

test('appendCrossAgentLine inserts newest-first and trim still caps at 12', () => {
  let content = `${base}\n## 🤝 Cross-Agent Coordination\n`;
  for (let i = 0; i < 12; i += 1) content = appendCrossAgentLine(content, `- Old ${i}.`);
  const next = appendCrossAgentLine(content, '- New line.');
  const trimmed = applyLogToCentralNode(next, {
    record: { type: 'diary', date: '2026-06-19', mood: 'good', energy: 'high' },
    actionLine: '\n**19 Jun:** Penelope: Logged a diary entry.'
  });
  assert.match(trimmed, /New line/);
  const bullets = trimmed.split('\n').filter(l => l.startsWith('- '));
  assert.ok(bullets.length <= 12);
});
```

`base` in that file may lack Cross-Agent — the mind_session test builds `withXa`. If `applyLogToCentralNode` currently returns unchanged for unknown types, the Mind assertion fails until implemented.

Governance:

```js
test('Mind Insight is a valid governance entry type', () => {
  const next = appendGovernanceEntry('', {
    dateKey: '2026-08-13',
    entryType: 'Mind Insight',
    title: 'Weekend permission',
    body: 'Exhaustion looking like chaos'
  });
  assert.match(next, /Mind Insight/);
  assert.match(next, /Weekend permission/);
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `node --test tests/unit/central-node-write.test.js tests/unit/governance-log.test.js`

- [ ] **Step 3: Implement**

`appendCrossAgentLine` (mirror `appendRecentAction` using `CROSS_AGENT_HEADING`):

```js
export function appendCrossAgentLine(content, line) {
  const headingIndex = content.indexOf(CROSS_AGENT_HEADING);
  if (headingIndex === -1) return content;
  const insertAt = headingIndex + CROSS_AGENT_HEADING.length;
  const normalized = line.startsWith('\n') ? line : `\n${line}`;
  const bullet = normalized.includes('- ') ? normalized : `\n- ${line.replace(/^\n/, '')}`;
  return `${content.slice(0, insertAt)}${bullet}${content.slice(insertAt)}`;
}
```

In `applyLogToCentralNode`, diary branch:

```js
  } else if (record.type === 'diary') {
    const mood = record.mood_score != null ? `${record.mood_score}/10` : (record.mood ?? 'logged');
    body = upsertStatusField(body, 'Mood', `**Mood:** ${mood}.`);
    if (record.energy) body = upsertStatusField(body, 'Energy', `**Energy:** ${record.energy}.`);
  } else if (record.type === 'mind_session') {
    const theme = record.theme ? String(record.theme).trim() : 'session logged';
    body = upsertStatusField(body, 'Mind', `**Mind:** ${theme}.`);
```

After the type branches, before `trimCrossAgentSection`:

```js
  if (typeof record.cross_agent_note === 'string' && record.cross_agent_note.trim()) {
    next = appendCrossAgentLine(next, `- ${record.cross_agent_note.trim()}`);
  }
```

Wait: `next` is updated after `replaceTodaysStatus`. Apply Cross-Agent **after** `replaceTodaysStatus` and **before** `trimCrossAgentSection`:

```js
  next = replaceTodaysStatus(next, { dateKey: record.date, body });
  if (typeof record.cross_agent_note === 'string' && record.cross_agent_note.trim()) {
    next = appendCrossAgentLine(next, `- ${record.cross_agent_note.trim()}`);
  }
  next = trimCrossAgentSection(next);
```

Remove the early `return next` in the `else` branch for unknown types **or** keep it only after mind_session is handled. Do not drop meal/workout behaviour.

`js/core/governance-log.js` — add `'Mind Insight'` to `GOVERNANCE_ENTRY_TYPES`.

- [ ] **Step 4: Run tests — expect PASS**

Run: `node --test tests/unit/central-node-write.test.js tests/unit/governance-log.test.js`

- [ ] **Step 5: Commit**

```bash
git add js/core/central-node-write.js js/core/governance-log.js tests/unit/central-node-write.test.js tests/unit/governance-log.test.js
git commit -m "$(cat <<'EOF'
feat: persist Mind status, Energy, and Cross-Agent lines

EOF
)"
```

---

### Task 6: Vera auto-write + persist helper + insight ledger

**Files:**
- Create: `netlify/functions/_shared/persist-log.mjs`
- Modify: `netlify/functions/chat-confirm.mjs` (call persist helper)
- Modify: `netlify/functions/chat.mjs` (Vera `mind_session` writes)
- Test: `tests/integration/chat-function.test.js`
- Test: `tests/integration/chat-confirm-function.test.js` (existing meal tests must still pass)

- [ ] **Step 1: Failing integration test**

Add to `tests/integration/chat-function.test.js` a GitHub stub that accepts PUT (copy confirm-function's `githubFetchStub` pattern: commits + empty tree + PUT 200). Then:

```js
test('Vera mind_session log_entry writes immediately and emits record_saved', async () => {
  const puts = [];
  const fetchImpl = async (url, options) => {
    if (url.includes('/commits/')) {
      return Response.json({ sha: 'c'.repeat(40), commit: { tree: { sha: 'd'.repeat(40) } } });
    }
    if (url.includes('/git/trees/')) return Response.json({ tree: [] });
    if (options?.method === 'PUT') {
      puts.push(url);
      return Response.json({ content: { sha: 'a'.repeat(40) }, commit: { sha: 'b'.repeat(40) } });
    }
    return Response.json({ message: 'not found' }, { status: 404 });
  };
  let toolResult;
  const handler = createChatHandler({
    env: validEnv,
    now: () => Date.parse('2026-08-01T06:00:00Z'),
    fetchImpl,
    createAnthropicClient: () => ({
      streamMessage: async function* ({ executeTools }) {
        toolResult = await executeTools({
          id: 'call_1',
          name: 'log_entry',
          input: {
            type: 'mind_session',
            date: '2026-08-01',
            fields: {
              theme: 'Weekend permission',
              closing_question: 'What is the weekend for?',
              insight: 'Exhaustion looking like chaos',
              mood_at_close: 'low'
            }
          }
        });
        yield { type: 'done' };
      }
    })
  });
  const events = contentEvents(await readSse(await handler(request({
    message: 'Vera, that is enough for today',
    priorAgentSlug: 'vera'
  }))));
  const parsed = JSON.parse(toolResult);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.status, 'written');
  const saved = events.find(e => e.type === 'record_saved');
  assert.ok(saved, JSON.stringify(events.map(e => e.type)));
  assert.equal(saved.record.type, 'mind_session');
  assert.ok(puts.some(url => url.includes('2026-08-01-session.md')));
  assert.equal(events.find(e => e.type === 'record_proposal'), undefined);
});

test('Penelope diary log_entry still awaits confirm', async () => {
  // same executeTools pattern as existing meal test, type diary, priorAgentSlug penelope
  // assert parsed.status === 'awaiting_confirm' and record_proposal exists
});
```

Also assert a PUT to governance log when `insight` is present (path contains `governance`). If the seed CN/governance files are missing in the stub, persist helper must treat CN/governance as best-effort (same as today's confirm: record write success still returns `written`).

- [ ] **Step 2: Run — expect FAIL**

Run: `node --test tests/integration/chat-function.test.js`

Expected: FAIL (`awaiting_confirm` / no PUT).

- [ ] **Step 3: Extract `persist-log.mjs` and switch confirm**

Move `renderMarkdown`, `describeRecordForLog`, `agentNameForType`, `syncCentralNodeAfterLog` (and meal totals helper it needs) from `chat-confirm.mjs` into `netlify/functions/_shared/persist-log.mjs`. Export:

```js
export function renderMarkdown(record, notes) { /* unchanged */ }
export function describeRecordForLog(record, notes) {
  // existing switch plus:
  // case 'mind_session':
  //   return `Logged a mind session${record.theme ? ` (${record.theme})` : ''}.`;
}
export async function persistLogEntry(client, { record, notes, path, existingSha, nowDateKey }) {
  const result = await client.writeFile({
    path,
    content: renderMarkdown(record, notes),
    ...(existingSha ? { sha: existingSha } : {}),
    message: `feat(chat): log ${record.type} for ${record.date}`
  });
  let centralNodeUpdated = false;
  try {
    const cn = await syncCentralNodeAfterLog(client, record, notes);
    centralNodeUpdated = cn?.updated === true;
  } catch {
    centralNodeUpdated = false;
  }
  let governanceUpdated = false;
  if (record.type === 'mind_session' && typeof record.insight === 'string' && record.insight.trim()) {
    try {
      await appendMindInsight(client, record, nowDateKey);
      governanceUpdated = true;
    } catch {
      governanceUpdated = false;
    }
  }
  return { sha: result.sha, commitSha: result.commitSha, centralNodeUpdated, governanceUpdated };
}
```

`appendMindInsight`: load `data/governance/governance-log.md` (use the same `GOVERNANCE_LOG_PATH` constant as `chat.mjs`), `appendGovernanceEntry` with `{ dateKey: nowDateKey, entryType: 'Mind Insight', title: record.theme ?? 'Mind session', body: record.insight }`, writeFile best-effort.

`chat-confirm.mjs` `handle` uses `persistLogEntry` instead of inline writeFile + syncCentralNode. Keep Day One and workout library upserts in confirm (not in persist helper).

- [ ] **Step 4: Vera auto-write in `chat.mjs`**

In the `log_entry` executeTools branch, after `validation.valid`:

```js
                const path = buildCanonicalPath({
                  type: validation.record.type,
                  date: validation.record.date,
                  slug: buildRecordSlug(validation.record)
                });
                const autoWrite = slug === 'vera' && validation.record.type === 'mind_session';
                if (autoWrite) {
                  try {
                    const current = await client.resolveTree();
                    const existingSha = current.tree.find(e => e.path === path && e.type === 'blob')?.sha;
                    const persisted = await persistLogEntry(client, {
                      record: validation.record,
                      notes: validation.notes,
                      path,
                      existingSha,
                      nowDateKey: today
                    });
                    send({
                      type: 'record_saved',
                      record: validation.record,
                      notes: validation.notes,
                      path,
                      summary: describeRecordForLog(validation.record, validation.notes),
                      centralNodeUpdated: persisted.centralNodeUpdated
                    });
                    return JSON.stringify({ ok: true, status: 'written', path });
                  } catch {
                    send({
                      type: 'record_proposal',
                      record: validation.record,
                      notes: validation.notes,
                      path,
                      warnings: [],
                      autoWriteFailed: true
                    });
                    return JSON.stringify({ ok: false, error: 'write_failed' });
                  }
                }
                send({ type: 'record_proposal', /* existing */ });
                return JSON.stringify({ ok: true, status: 'awaiting_confirm' });
```

Mirror the same auto-write in the **stream fallback** `tool_call` / `log_entry` block (~line 737) so both paths behave.

Reject `mind_session` from non-Vera agents via existing `allowedTypes` (Vera is the only one with that `recordTypes` entry).

- [ ] **Step 5: Run tests**

Run: `node --test tests/integration/chat-function.test.js tests/integration/chat-confirm-function.test.js tests/unit/chat-schema.test.js`

Expected: PASS. Confirm meal tests still 200. Vera test emits `record_saved` and PUT. Diary still `awaiting_confirm`.

- [ ] **Step 6: Commit**

```bash
git add netlify/functions/_shared/persist-log.mjs netlify/functions/chat.mjs netlify/functions/chat-confirm.mjs tests/integration/chat-function.test.js
git commit -m "$(cat <<'EOF'
feat: auto-write Vera mind_session logs

EOF
)"
```

---

### Task 7: Client `record_saved` + hide `system_note`

**Files:**
- Modify: `js/app/chat-controller.js`
- Modify: `js/app/render-chat.js`
- Modify: `service-worker.js` (`CACHE_NAME` → `life-hub-shell-v70`)
- Test: `tests/unit/chat-controller.test.js`
- Test: `tests/unit/render-chat.test.js`

- [ ] **Step 1: Failing tests**

In `tests/unit/render-chat.test.js`, after appending a diary proposal whose `record` includes `system_note: 'hidden'` and `cross_agent_note: 'Penelope→Vera: hi'`, assert the card text does not contain `hidden` / `system_note` and does contain `Penelope→Vera`.

In `tests/unit/chat-controller.test.js`, drive a fake SSE stream that yields `{ type: 'record_saved', summary: 'Logged a mind session (Weekend permission).', record: { type: 'mind_session' } }`. Assert the messages list contains that summary and contains no `.record-proposal__confirm`. Assert `onRecordWritten` was called.

- [ ] **Step 2: Implement**

`render-chat.js`:

```js
const HIDDEN_FIELDS = new Set([
  ...existing,
  'system_note'
]);
```

Add `appendRecordSaved(root, { summary, agentSlug })` that appends a status-style line (`summary` or `'Session logged.'`).

`chat-controller.js` stream handler:

```js
        } else if (event.type === 'record_saved') {
          turnSignaled = true;
          gotUsefulOutput = true;
          clearWorkingBubble();
          endTextTurn();
          appendMessage(root, {
            role: 'assistant',
            agentSlug: assistantSlug,
            text: event.summary || 'Session logged.'
          });
          onRecordWritten?.(event);
```

If `autoWriteFailed` on `record_proposal`, keep existing Confirm card (retry via `/api/chat/confirm` — allowed for `mind_session` as the failure path).

Bump `CACHE_NAME` to `life-hub-shell-v70`. If you add a new client module, add it to the precache array; these edits are existing files already listed.

- [ ] **Step 3: Run**

Run: `node --test tests/unit/chat-controller.test.js tests/unit/render-chat.test.js`

Expected: PASS.

- [ ] **Step 4: Browser**

Do not change `tests/browser/chat.spec.mjs` in this task. Integration tests own the `record_saved` contract; existing browser specs must still pass Confirm for meals. Run `npm run test:browser` after the client change if time allows; not a gate for the commit if unit tests pass.

- [ ] **Step 5: Commit**

```bash
git add js/app/chat-controller.js js/app/render-chat.js service-worker.js tests/unit/chat-controller.test.js tests/unit/render-chat.test.js
git commit -m "$(cat <<'EOF'
feat: show Vera session saved without a Confirm card

EOF
)"
```

---

### Task 8: Mind tab ambient line + Hammond cadence test

**Files:**
- Modify: `js/app/mind-model.js`
- Modify: `js/app/render-mind.js`
- Modify: `index.html`
- Modify: `tests/unit/mind-model.test.js`
- Modify: `tests/unit/hammond-digest.test.js`
- Modify: `service-worker.js` only if not already bumped in Task 7

- [ ] **Step 1: Failing tests**

```js
test('buildMindModel includes an ambient observation', () => {
  const model = buildMindModel({
    events: [
      { record: { type: 'diary', date: '2026-08-01', mood_score: 4, mood: 'low', tags: [] }, body: '', path: 'd' },
      { record: { type: 'mind_session', date: '2026-08-10', theme: 'Weekend' }, body: '', path: 's' }
    ],
    date: '2026-08-13',
    range: 'monthly'
  });
  assert.match(model.ambient, /diary/i);
  assert.match(model.ambient, /session/i);
});
```

`hammond-digest.test.js`:

```js
test('a mind_session file counts as mind-domain presence', () => {
  const tree = [{
    path: 'data/mind/2026/08/2026-08-01-session.md',
    type: 'blob',
    sha: 'sha-session'
  }];
  const summary = summarizeHammondDigest({ tree, fitnessRecords: [], today: TODAY });
  assert.match(summary, /mind: 1\/90 days/);
});
```

(`TODAY` in that file is `2026-08-11` — use a session date inside that 90-day window.)

- [ ] **Step 2: Implement ambient**

In `buildMindModel`, compute:

```js
  const lastDiary = entries.map(e => e.date).sort().at(-1);
  const sessionDates = (events ?? [])
    .filter(e => e?.record?.type === 'mind_session')
    .map(e => e.record.date)
    .sort();
  const lastSession = sessionDates.at(-1);
  const diaryGap = lastDiary ? daysBetween(lastDiary, date) : null;
  const sessionGap = lastSession ? daysBetween(lastSession, date) : null;
  const trend = moodSeries.length >= 2
    ? (moodSeries.at(-1).value - moodSeries[0].value)
    : 0;
  const trendWord = trend > 0.5 ? 'Mood scores ticked up' : trend < -0.5 ? 'Mood scores eased down' : 'Mood scores held';
  const ambient = [
    trendWord,
    diaryGap == null ? 'no diary in range yet' : `last diary ${diaryGap}d ago`,
    sessionGap == null ? 'no Vera session yet' : `last Vera session ${sessionGap}d ago`
  ].join(' · ') + '.';
```

Import `daysBetween` from `js/core/time.js`.

`index.html` — inside `.mind-agents`, before the Vera button:

```html
<p class="metric-caption" data-mind="ambient" hidden></p>
```

`render-mind.js`:

```js
  const ambient = root.querySelector('[data-mind="ambient"]');
  if (ambient) {
    ambient.hidden = !model.ambient;
    ambient.textContent = model.ambient ?? '';
  }
```

- [ ] **Step 3: Run**

Run: `node --test tests/unit/mind-model.test.js tests/unit/hammond-digest.test.js`

Expected: PASS. Ambient string is on the model; `renderMind` copies it into `[data-mind="ambient"]` (no separate render-mind unit file today — do not create one unless the copy is non-trivial).

- [ ] **Step 4: Full verification**

Run: `npm test && npm run validate:fixtures`

Expected: all passing, 0 failing.

If client JS changed after the Task 7 cache bump, keep `v70` (one bump per ship is enough if Tasks 7–8 land together; if Task 7 already committed v70, this task does not bump again unless you add a **new** file to precache).

- [ ] **Step 5: IMPLEMENTATION_STATUS**

Append a Phase section matching existing style: what shipped, test counts, deviations (auto-write exception; 5e/6b protocol-only with no extra Hammond blob window; leave-flush not built).

- [ ] **Step 6: Commit**

```bash
git add js/app/mind-model.js js/app/render-mind.js index.html tests/unit/mind-model.test.js tests/unit/hammond-digest.test.js docs/IMPLEMENTATION_STATUS.md
git commit -m "$(cat <<'EOF'
feat: show Mind ambient line and count Vera sessions in Hammond cadence

EOF
)"
```

---

## Spec coverage (self-review)

| Spec item | Task |
|---|---|
| `mind_session` record + one file/day | 2 |
| Auto-write Vera only; diary Confirm | 6, 7 |
| Mind digest 30d Vera/Penelope | 3, 4 |
| Hammond silence from paths; no extra diary blobs | 3, 4 |
| On this day excerpt (Penelope, 3 years) | 3, 4 |
| Multi-mood + primary `mood` | 2, 3 |
| Energy write-back | 5 |
| `system_note` hidden | 2, 7 |
| `cross_agent_note` → CN | 5 |
| Mind Insight governance | 5, 6 |
| Protocol restore (diagnostic, ACE, gather-context) | 1 |
| Ambient Mind line | 8 |
| Hammond 6a cadence test | 8 |
| Hammond 6c / 5e / 6b | 1 (protocol); 4 (silence in prompt) |
| Leave-flush / transcripts | Follow-ups — not tasked |
| 12-property session DB | Out of scope |

**5e/6b v1:** protocol + existing `propose_central_node_patch` Confirm. No new record type, no extra Hammond diary-blob window. Enough for Hammond to suggest; Adam Confirm writes Long-Term Trends.

---

## Notes for the implementing agent

- TDD: red test first on every schema/digest/write task.
- Never `git push`.
- `CACHE_NAME` is `life-hub-shell-v69` at plan time; bump once to `v70` on first client JS change.
- Do not bulk-copy Vera's Psychological Baseline Notion page into the repo.
- `buildRecordSlug` for `mind_session` **must** be `'session'` or same-day replace and Hammond path silence break.
