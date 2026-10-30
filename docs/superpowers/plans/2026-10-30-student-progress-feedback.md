# Student Progress and Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Students see their returned feedback and their progress patterns over time on `/s/classes/:id/profile`. The teacher marks typed work with codes and rubric steps, and sees a To mark queue and an Analysis panel.

**Architecture:**
- A pure pattern module (`progress-patterns.mjs`) turns a student's marked pieces into chart cells, stories, code counts and next steps. Teacher and student views share it.
- Feedback on a piece (written work or a viva set) lives in `piece_feedback/{class}/{student}/{piece}`.
- Rubric placements live on the Markbook mark (`steps`), and a Markbook assessment column linked to a lesson block (`piece`) is what makes that block markable.
- The student route stays the existing claim-gated `published-profile` handler.

**Tech Stack:**
- Netlify Functions (ESM `.mjs`) and Netlify Blobs (`teaching-hub-content`).
- Zod schemas in `apps/teaching/src/**/schema.ts`, bundled to `netlify/functions/_shared/*-schema.mjs` by `scripts/generate-alchemy-schema.mjs`.
- Vanilla TS DOM through `el()` and `button()` from `@/quiz/dom`.
- Tests: `node --test` for `tests/unit/*.test.js` (server) and Vitest for `apps/teaching/tests/unit/*.test.ts` (client).

**Spec:** `docs/superpowers/specs/2026-10-30-student-progress-feedback-design.md`
**Mockup:** `docs/mockups/student-progress/student-progress.html`
**Worktree:** `/Users/adamrussell/Projects/life-hub-student-progress` on branch `claude/student-progress`. Another session works in `life-hub-quiz-initials`: never switch branches there.

**House rules that apply to every task:**
- This repo is public. Use invented students in tests and the mock (Ava Nguyen, Noah Patel, Ella Chen, Jack Lee, Mia Torres).
- No deficit words in student-facing strings: weak, struggling, not, never, lacks, without, dropped.
- One PR at the end. Commit after each task. Run `npm run pre-pr-check` once, at the end (Task 14).
- Per the token-saving rule, run only the tests named in each task, not the full suite, until Task 14.

---

## File map

| File | Status | Responsibility |
|---|---|---|
| `netlify/functions/_shared/progress-steps.mjs` | new | Step and rung ids, names, mark→step, mark→rung, lower step |
| `netlify/functions/_shared/progress-patterns.mjs` | new | Pure: rows, stories, code grid, next steps, class patterns |
| `apps/teaching/src/markbook/schema.ts` | modify | `concepts[]` and `steps{}` on criteria, `piece` on columns, `steps` on marks |
| `apps/teaching/src/schemas/outcome.ts` | modify | Optional `short` |
| `netlify/functions/_shared/feedback-codes.mjs` | modify | Optional `resource` on a code |
| `netlify/functions/_shared/lesson-work.mjs` | modify | `handin` action and `handin_blocks` in status |
| `netlify/functions/_shared/piece-feedback.mjs` | new | Teacher list, load, save, return, take back; student reads; seen |
| `netlify/functions/class-pieces.mjs` | new | `POST /api/classes/:id/pieces` (operator) |
| `netlify/functions/_shared/to-mark.mjs` + `netlify/functions/to-mark.mjs` | new | Queue across classes, `GET /api/to-mark` |
| `netlify/functions/_shared/profile-feedback.mjs` | new | Student payload: progress, returned, piece, seen |
| `netlify/functions/_shared/profile.mjs` | modify | New actions delegate to `profile-feedback.mjs`; drop the bars |
| `netlify/functions/_shared/voice-submissions.mjs` | modify | Save `class_id`/`student_id` from the claim; teacher `set_student` |
| `netlify/functions/_shared/teaching-feedback.mjs` | modify | Optional `class_id`/`student_id` on documents; student list |
| `apps/teaching/src/progress/` (new folder) | new | Client: `types.ts`, `story-text.ts`, `step-chart.ts`, `skill-path.ts`, `code-grid.ts`, `progress.css` |
| `apps/teaching/src/student/profile-view.ts` | modify | Tabs, progress sections, Returned work, piece view |
| `apps/teaching/src/marking/` (new folder) | new | Teacher `mark-piece.ts`, `to-mark-view.ts`, `marking.css` |
| `apps/teaching/src/markbook/analysis-panel.ts` | new | Analysis section in the student panel and class patterns |
| `apps/teaching/scripts/mock-api.ts` | modify | Mock routes and invented data for the browser walk |

---

### Task 1: Steps and rungs

**Files:**
- Create: `netlify/functions/_shared/progress-steps.mjs`
- Test: `tests/unit/progress-steps.test.js`

- [ ] **Step 1: Write the failing test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { STEPS, RUNGS, stepForShare, rungForShare, lowerOf, isTop, ladderFor, stepName } from '../../netlify/functions/_shared/progress-steps.mjs';

test('outcome steps follow the evidence boundaries', () => {
  assert.deepEqual(STEPS, ['starting', 'building', 'secure', 'extending']);
  assert.equal(stepForShare(0), 'starting');
  assert.equal(stepForShare(0.49), 'starting');
  assert.equal(stepForShare(0.5), 'building');
  assert.equal(stepForShare(0.79), 'building');
  assert.equal(stepForShare(0.8), 'secure');
  assert.equal(stepForShare(0.9), 'extending');
  assert.equal(stepForShare(Number.NaN), null);
});

test('skill rungs use the continuum thresholds; below Capable has its own name', () => {
  assert.deepEqual(RUNGS, ['below', 'capable', 'skilled', 'accomplished', 'excellent']);
  assert.equal(rungForShare(0.64), 'below');
  assert.equal(rungForShare(0.65), 'capable');
  assert.equal(rungForShare(14 / 20), 'capable');
  assert.equal(rungForShare(0.95), 'excellent');
  assert.equal(stepName('below'), 'On the way to Capable');
});

test('lower step wins and the top step is never holding', () => {
  assert.equal(lowerOf('secure', 'building'), 'building');
  assert.equal(lowerOf('skilled', 'accomplished'), 'skilled');
  assert.equal(isTop('extending'), true);
  assert.equal(isTop('excellent'), true);
  assert.equal(isTop('secure'), false);
  assert.equal(ladderFor('secure'), STEPS);
  assert.equal(ladderFor('skilled'), RUNGS);
});
```

- [ ] **Step 2: Run it and check it fails**

Run: `node --test tests/unit/progress-steps.test.js`
Expected: FAIL with `Cannot find module`.

- [ ] **Step 3: Write the module**

```js
/**
 * The two ladders a piece is placed on. Outcomes and concepts use steps that
 * describe how secure the learning is; skills use the HSC skills continuum's
 * rungs. Secure is the standard. Names are what students read.
 */
export const STEPS = ['starting', 'building', 'secure', 'extending'];
export const RUNGS = ['below', 'capable', 'skilled', 'accomplished', 'excellent'];

const NAMES = {
  starting: 'Starting', building: 'Building', secure: 'Secure', extending: 'Extending',
  below: 'On the way to Capable', capable: 'Capable', skilled: 'Skilled', accomplished: 'Accomplished', excellent: 'Excellent'
};
export const stepName = (id) => NAMES[id] ?? '';

/** Matches the evidence constants: weak below 0.5, secure from 0.8. */
export function stepForShare(share) {
  if (!Number.isFinite(share) || share < 0) return null;
  const s = share + 1e-9;
  if (s >= 0.9) return 'extending';
  if (s >= 0.8) return 'secure';
  if (s >= 0.5) return 'building';
  return 'starting';
}

/** Matches RUNG_THRESHOLDS in apps/teaching/src/skills/model.ts. */
export function rungForShare(share) {
  if (!Number.isFinite(share) || share < 0) return null;
  const s = share + 1e-9;
  if (s >= 0.95) return 'excellent';
  if (s >= 0.85) return 'accomplished';
  if (s >= 0.75) return 'skilled';
  if (s >= 0.65) return 'capable';
  return 'below';
}

export const ladderFor = (id) => (STEPS.includes(id) ? STEPS : RUNGS);
export const rankOf = (id) => ladderFor(id).indexOf(id);
export const lowerOf = (a, b) => (rankOf(a) <= rankOf(b) ? a : b);
export const isTop = (id) => id === 'extending' || id === 'excellent';
export const isStep = (id) => STEPS.includes(id);
export const isRung = (id) => RUNGS.includes(id);
```

- [ ] **Step 4: Run it and check it passes**

Run: `node --test tests/unit/progress-steps.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/_shared/progress-steps.mjs tests/unit/progress-steps.test.js
git commit -m "Progress: step and rung ladders"
```

---

### Task 2: Pattern engine

**Files:**
- Create: `netlify/functions/_shared/progress-patterns.mjs`
- Test: `tests/unit/progress-patterns.test.js`

The input is the shape that `profile-feedback.mjs` (Task 7) builds:

```text
Piece   { id, title, short, at (ISO), kind: 'written'|'viva'|'assessment'|'quiz',
          places: { [targetKey]: stepOrRung },     // 'out:<id>' | 'con:<key>' | 'skill:<strand.sub>'
          tags: [{ code_id, positive }] }
Code    { id, code, label, group: 'composition'|'viva'|'speaking', colour, descriptor, strength_descriptor?, resource? }
```

- [ ] **Step 1: Write the failing tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { codeApplies, targetRow, codeGrid, nextSteps, classPatterns } from '../../netlify/functions/_shared/progress-patterns.mjs';

const piece = (id, kind, places, tags = [], at = `2026-10-0${id}T00:00:00Z`) => ({ id: `p${id}`, title: `Task ${id}`, short: `T${id}`, at, kind, places, tags });
const g = (code_id) => ({ code_id, positive: false });
const s = (code_id) => ({ code_id, positive: true });
const library = [
  { id: 'ts', code: 'TS', group: 'composition' },
  { id: 'ef', code: 'EF', group: 'composition' },
  { id: 'qi', code: 'QI', group: 'composition' },
  { id: 'pr', code: 'P', group: 'composition' },
  { id: 'vf', code: 'VF', group: 'viva' }
];

test('a code applies to pieces of its own kind only', () => {
  assert.equal(codeApplies(library[0], { kind: 'written' }), true);
  assert.equal(codeApplies(library[0], { kind: 'viva' }), false);
  assert.equal(codeApplies(library[4], { kind: 'viva' }), true);
  assert.equal(codeApplies(library[4], { kind: 'assessment' }), false);
});

test('holding: the same step on 3+ assessed pieces in a row, below the top', () => {
  const pieces = [
    piece(1, 'written', { 'out:a': 'starting' }),
    piece(2, 'viva', {}),
    piece(3, 'written', { 'out:a': 'building' }, [g('ts')]),
    piece(4, 'written', { 'out:a': 'building' }, [g('ts'), g('ts')]),
    piece(5, 'written', { 'out:a': 'building' }, [g('ef')])
  ];
  const row = targetRow(pieces, 'out:a', library);
  assert.deepEqual(row.cells, ['starting', null, 'building', 'building', 'building']);
  assert.equal(row.now, 'building');
  assert.deepEqual(row.story, { kind: 'holding', step: 'building', count: 3, code_id: 'ts' });
});

test('moved up names where it rose; a fall only states the current step', () => {
  const up = targetRow([piece(1, 'written', { 'out:a': 'starting' }), piece(2, 'written', { 'out:a': 'building' }), piece(3, 'written', { 'out:a': 'secure' })], 'out:a', library);
  assert.deepEqual(up.story, { kind: 'moved_up', from: 'building', to: 'secure', piece_id: 'p3' });
  const down = targetRow([piece(1, 'written', { 'out:a': 'secure' }), piece(2, 'written', { 'out:a': 'building' }), piece(3, 'written', { 'out:a': 'secure' }), piece(4, 'written', { 'out:a': 'building' })], 'out:a', library);
  assert.deepEqual(down.story, { kind: 'now', step: 'building' });
});

test('fewer than 3 assessed pieces tells the student more will show the pattern', () => {
  const row = targetRow([piece(1, 'written', { 'out:a': 'secure' }), piece(2, 'written', {})], 'out:a', library);
  assert.deepEqual(row.story, { kind: 'few', count: 1 });
});

test('Extending and Excellent never hold', () => {
  const pieces = [1, 2, 3].map((n) => piece(n, 'written', { 'skill:composing.para': 'excellent' }));
  assert.equal(targetRow(pieces, 'skill:composing.para', library).story.kind, 'now');
});

test('code grid: counts per piece, n/a where the code does not apply, totals and drop-off', () => {
  const pieces = [
    piece(1, 'written', {}, [g('qi'), g('qi'), g('qi')]),
    piece(2, 'viva', {}, [g('vf')]),
    piece(3, 'written', {}, [g('qi'), g('ts')]),
    piece(4, 'written', {}, [g('ts'), g('ts')]),
    piece(5, 'written', {}, [g('ts'), s('pr')]),
    piece(6, 'written', {}, [g('ts'), s('pr')])
  ];
  const rows = codeGrid(pieces, library);
  const ts = rows.find((r) => r.code_id === 'ts' && !r.positive);
  assert.deepEqual(ts.cells, [0, null, 1, 2, 1, 1]);
  assert.deepEqual([ts.hit, ts.of, ts.total, ts.dropped], [4, 5, 5, false]);
  const qi = rows.find((r) => r.code_id === 'qi');
  assert.deepEqual([qi.hit, qi.of, qi.total, qi.dropped], [2, 5, 4, true]);
  const pr = rows.find((r) => r.code_id === 'pr');
  assert.equal(pr.positive, true);
  assert.equal(rows.some((r) => r.code_id === 'ef'), false, 'codes never used are left out');
});

test('next steps: top 2 growth codes on 2+ of the last 5 applicable pieces, then 1 strength', () => {
  const pieces = [
    piece(1, 'written', {}, [g('ef')]),
    piece(2, 'written', {}, [g('ef'), s('pr')]),
    piece(3, 'written', {}, [g('ts'), s('pr')]),
    piece(4, 'written', {}, [g('ts'), g('qi')]),
    piece(5, 'written', {}, [g('ts'), g('ef'), s('pr')]),
    piece(6, 'written', {}, [g('ts')])
  ];
  assert.deepEqual(nextSteps(pieces, library), [
    { code_id: 'ts', positive: false, hit: 4, of: 5 },
    { code_id: 'ef', positive: false, hit: 2, of: 5 },
    { code_id: 'pr', positive: true, hit: 3, of: 5 }
  ]);
});

test('class patterns group 3+ students holding at the same step, with their top code', () => {
  const holder = (code) => [1, 2, 3].map((n) => piece(n, 'written', { 'out:a': 'building' }, [g(code)]));
  const out = classPatterns([
    { id: 'st_a', pieces: holder('ts') }, { id: 'st_b', pieces: holder('ts') }, { id: 'st_c', pieces: holder('ef') },
    { id: 'st_d', pieces: [piece(1, 'written', { 'out:a': 'secure' })] }
  ], library);
  assert.deepEqual(out, [{ key: 'out:a', step: 'building', students: ['st_a', 'st_b', 'st_c'], code_id: 'ts' }]);
});
```

- [ ] **Step 2: Run them and check they fail**

Run: `node --test tests/unit/progress-patterns.test.js`
Expected: FAIL with `Cannot find module`.

- [ ] **Step 3: Write the module**

```js
/**
 * Patterns in one student's marked pieces: a row per outcome, concept or
 * skill, code counts per piece, and the next steps they point to. Pure and
 * shared by the student page and the teacher's Analysis panel. It returns
 * structure, not sentences; the views word it (apps/teaching/src/progress/story-text.ts).
 *
 * Levels come only from the teacher's placements (`places`). Codes never move a level.
 */
import { isTop } from './progress-steps.mjs';

export const HOLD_RUN = 3;
export const RECENT = 5;
export const CHART_MAX = 8;

const VIVA_GROUPS = new Set(['viva', 'speaking']);

/** A code applies to a piece of its own kind: viva and speaking codes to vivas, composition to everything else. */
export function codeApplies(code, piece) {
  const viva = piece.kind === 'viva';
  return viva ? VIVA_GROUPS.has(code?.group) : code?.group === 'composition' || !code?.group;
}

const byId = (library) => new Map(library.map((c) => [c.id, c]));
const countOf = (piece, codeId, positive) => piece.tags.filter((t) => t.code_id === codeId && Boolean(t.positive) === positive).length;

/** The growth code that appears on most of the given pieces; the latest wins a tie. */
function commonGrowth(pieces) {
  const seen = new Map();
  pieces.forEach((p, i) => {
    for (const id of new Set(p.tags.filter((t) => !t.positive).map((t) => t.code_id))) {
      const row = seen.get(id) ?? { n: 0, last: -1 };
      seen.set(id, { n: row.n + 1, last: i });
    }
  });
  let best = null;
  for (const [id, row] of seen) if (!best || row.n > best.n || (row.n === best.n && row.last > best.last)) best = { id, ...row };
  return best?.id ?? null;
}

/** One target's cells (null where a piece didn't assess it), its current level and its story. */
export function targetRow(pieces, key) {
  const cells = pieces.map((p) => p.places?.[key] ?? null);
  const assessed = pieces.map((p, i) => ({ p, step: cells[i] })).filter((x) => x.step);
  const now = assessed.at(-1)?.step ?? null;
  if (assessed.length < HOLD_RUN) return { key, cells, now, story: { kind: 'few', count: assessed.length } };
  let run = 1;
  while (run < assessed.length && assessed.at(-1 - run).step === now) run += 1;
  if (run >= HOLD_RUN && !isTop(now)) {
    const held = assessed.slice(-run).map((x) => x.p);
    return { key, cells, now, story: { kind: 'holding', step: now, count: run, code_id: commonGrowth(held) } };
  }
  const prev = assessed.at(-1 - run);
  const rank = (id) => ['starting', 'building', 'secure', 'extending', 'below', 'capable', 'skilled', 'accomplished', 'excellent'].indexOf(id);
  if (prev && rank(now) > rank(prev.step)) {
    return { key, cells, now, story: { kind: 'moved_up', from: prev.step, to: now, piece_id: assessed.at(-run).p.id } };
  }
  return { key, cells, now, story: { kind: 'now', step: now } };
}

/** Every target any piece placed, in first-seen order. */
export function targetKeys(pieces) {
  const keys = [];
  for (const p of pieces) for (const k of Object.keys(p.places ?? {})) if (!keys.includes(k)) keys.push(k);
  return keys;
}

/**
 * Code counts per piece. Cells are a count, 0 when the code applies and is
 * absent, or null when it doesn't apply. `dropped`: 2+ earlier hits and none
 * on the last 3 applicable pieces.
 */
export function codeGrid(pieces, library) {
  const codes = byId(library);
  const used = [];
  for (const p of pieces) for (const t of p.tags) {
    const k = `${t.code_id}|${Boolean(t.positive)}`;
    if (codes.has(t.code_id) && !used.includes(k)) used.push(k);
  }
  return used.map((k) => {
    const [code_id, pos] = k.split('|');
    const positive = pos === 'true';
    const code = codes.get(code_id);
    const cells = pieces.map((p) => (codeApplies(code, p) ? countOf(p, code_id, positive) : null));
    const applicable = cells.filter((c) => c !== null);
    const hit = applicable.filter((c) => c > 0).length;
    const total = applicable.reduce((a, b) => a + b, 0);
    const last3 = applicable.slice(-3);
    const before = applicable.slice(0, -3).filter((c) => c > 0).length;
    const dropped = !positive && before >= 2 && last3.length === 3 && last3.every((c) => c === 0);
    return { code_id, positive, cells, hit, of: applicable.length, total, dropped };
  });
}

function ranked(pieces, library, positive) {
  const codes = byId(library);
  const out = [];
  for (const row of codeGrid(pieces, library).filter((r) => r.positive === positive)) {
    const recent = pieces.filter((p) => codeApplies(codes.get(row.code_id), p)).slice(-RECENT);
    const hit = recent.filter((p) => countOf(p, row.code_id, positive) > 0).length;
    const last = recent.reduce((at, p, i) => (countOf(p, row.code_id, positive) ? i : at), -1);
    if (hit >= 2) out.push({ code_id: row.code_id, positive, hit, of: recent.length, last });
  }
  return out.sort((a, b) => b.hit - a.hit || b.last - a.last).map(({ last, ...r }) => r);
}

/** Up to two growth codes and one strength code, each on 2+ of its last 5 applicable pieces. */
export function nextSteps(pieces, library) {
  return [...ranked(pieces, library, false).slice(0, 2), ...ranked(pieces, library, true).slice(0, 1)];
}

/** Students holding at the same step on the same target, 3 or more, with their commonest growth code. */
export function classPatterns(students, library) {
  const groups = new Map();
  for (const s of students) {
    for (const key of targetKeys(s.pieces)) {
      const row = targetRow(s.pieces, key);
      if (row.story.kind !== 'holding') continue;
      const id = `${key}|${row.now}`;
      const g = groups.get(id) ?? { key, step: row.now, students: [], codes: [] };
      g.students.push(s.id);
      if (row.story.code_id) g.codes.push(row.story.code_id);
      groups.set(id, g);
    }
  }
  return [...groups.values()]
    .filter((g) => g.students.length >= HOLD_RUN)
    .map((g) => {
      const tally = new Map();
      for (const c of g.codes) tally.set(c, (tally.get(c) ?? 0) + 1);
      const code_id = [...tally].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
      return { key: g.key, step: g.step, students: g.students, code_id };
    })
    .sort((a, b) => b.students.length - a.students.length);
}
```

- [ ] **Step 4: Run them and check they pass**

Run: `node --test tests/unit/progress-patterns.test.js`
Expected: PASS (8 tests). If `targetRow` is called with the library as a third argument in a test, it is ignored; that's fine.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/_shared/progress-patterns.mjs tests/unit/progress-patterns.test.js
git commit -m "Progress: pattern engine for stories, code counts and next steps"
```

---

### Task 3: Schema fields (criteria, columns, marks, outcomes, codes)

**Files:**
- Modify: `apps/teaching/src/markbook/schema.ts` (`CriterionSchema`, `AssessmentColumnSchema`, `AssessmentMarkSchema`)
- Regenerate: `netlify/functions/_shared/markbook-schema.mjs`
- Modify: `apps/teaching/src/schemas/outcome.ts`
- Modify: `netlify/functions/_shared/feedback-codes.mjs` (`cleanFeedbackCodes`)
- Test: `tests/unit/markbook.test.js`, `tests/unit/feedback-codes.test.js` (append)

- [ ] **Step 1: Append the failing tests**

Append to `tests/unit/markbook.test.js`:

```js
test('criteria take concepts and step descriptors; a column can link a lesson block; marks take steps', async () => {
  const { AssessmentColumnSchema, AssessmentMarkSchema } = await import('../../netlify/functions/_shared/markbook-schema.mjs');
  const column = AssessmentColumnSchema.parse({
    id: 'col1', kind: 'assessment', title: 'Imagery paragraph', date: '2026-10-27', weight: 0,
    piece: { lesson_id: 'lesson1', block_id: 'qset1', short: 'Imagery' },
    criteria: [{ id: 'c1', label: 'Analysis', max: 10, outcomes: ['out_a'], concepts: ['perspective'], steps: { secure: 'Shows how techniques shape meaning.' } }]
  });
  assert.equal(column.piece.block_id, 'qset1');
  assert.deepEqual(column.criteria[0].concepts, ['perspective']);
  assert.equal(AssessmentMarkSchema.parse({ steps: { c1: 'building' } }).steps.c1, 'building');
  assert.throws(() => AssessmentMarkSchema.parse({ steps: { c1: 'great' } }));
});
```

Append to `tests/unit/feedback-codes.test.js`:

```js
test('a code can carry a See how resource', () => {
  const [code] = cleanFeedbackCodes({ codes: [{ code: 'TS', label: 'Topic sentence', resource: { kind: 'video', url: 'https://example.com/v', title: 'Topic sentences', start: 12 } }] });
  assert.deepEqual(code.resource, { kind: 'video', url: 'https://example.com/v', title: 'Topic sentences', start: 12 });
  const [plain] = cleanFeedbackCodes({ codes: [{ code: 'TS', label: 'Topic sentence', resource: { kind: 'link', url: 'javascript:alert(1)' } }] });
  assert.equal(plain.resource, undefined);
});
```

(If `cleanFeedbackCodes` isn't already imported at the top of that test file, add it to the existing import.)

- [ ] **Step 2: Run them and check they fail**

Run: `node --test tests/unit/markbook.test.js tests/unit/feedback-codes.test.js`
Expected: both new tests FAIL.

- [ ] **Step 3: Edit `apps/teaching/src/markbook/schema.ts`**

Add the step ids near the top (after `MARKBOOK_LIMITS`):

```ts
export const PLACE_IDS = ['starting', 'building', 'secure', 'extending', 'below', 'capable', 'skilled', 'accomplished', 'excellent'] as const;
const StepText = z.string().trim().max(200);
```

Add to `CriterionSchema`:

```ts
  /** Concept keys from the syllabus alignment that this criterion assesses. */
  concepts: z.array(z.string().trim().min(1).max(64)).max(MARKBOOK_LIMITS.outcomes).default([]),
  /** What each step looks like on this criterion, one line each, shown to students. */
  steps: z.object({ starting: StepText, building: StepText, secure: StepText, extending: StepText }).partial().optional()
```

Add to `AssessmentColumnSchema`:

```ts
  /** The lesson block students hand this in through. Linking it switches on Hand in for this class. */
  piece: z.object({ lesson_id: z.string().min(1).max(80), block_id: z.string().min(1).max(80), short: z.string().trim().max(40).optional() }).optional()
```

Add to `AssessmentMarkSchema`:

```ts
  /** The teacher's placement per criterion: a step for outcomes and concepts, a rung for a skill. */
  steps: z.record(z.string(), z.enum(PLACE_IDS)).optional()
```

Make sure `steps` survives the `cleanMark` path in the same file (around the existing `const { feedback, note, codes: _codes, ...rest } = mark;`), and keep it only for criteria ids that exist:

```ts
    const steps = Object.fromEntries(Object.entries(mark.steps ?? {}).filter(([id]) => column.criteria.some((c) => c.id === id)));
    // …existing code…
    return { mark: { ...rest, ...(feedback ? { feedback } : {}), ...(note ? { note } : {}), ...(Object.keys(codes).length ? { codes } : {}), ...(Object.keys(steps).length ? { steps } : { steps: undefined }) } };
```

Then remove the `steps: undefined` key with the same pattern the file uses for empty values. Read the surrounding function first and match it.

- [ ] **Step 4: Regenerate the bundled schema**

Run: `node scripts/generate-alchemy-schema.mjs`
Expected: it rewrites `netlify/functions/_shared/markbook-schema.mjs` and the other generated schemas. Check with `git diff --stat` that only expected generated files changed.

- [ ] **Step 5: Add `short` to the outcome schema**

In `apps/teaching/src/schemas/outcome.ts`, next to `description`:

```ts
  /** A plain name for students, e.g. "Analysis". Falls back to the code and the first clause of the description. */
  short: z.string().trim().max(40).optional(),
```

- [ ] **Step 6: Add `resource` to codes**

In `netlify/functions/_shared/feedback-codes.mjs`, above `cleanFeedbackCodes`:

```js
const MAX_RESOURCE_TITLE = 80;
/** A See how link the teacher sets on a code: a page or a video (optionally from a time). http(s) only. */
function cleanResource(raw) {
  if (!raw || typeof raw !== 'object' || !['link', 'video'].includes(raw.kind)) return null;
  let url;
  try { url = new URL(String(raw.url)); } catch { return null; }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const out = { kind: raw.kind, url: url.toString(), title: text(raw.title, MAX_RESOURCE_TITLE) };
  const start = Math.floor(Number(raw.start));
  if (raw.kind === 'video' && Number.isFinite(start) && start > 0) out.start = Math.min(start, 24 * 3600);
  return out;
}
```

In the `cleanFeedbackCodes` map, after `problem_type`:

```js
    const resource = cleanResource(row?.resource);
    if (resource) out.resource = resource;
```

Note: `new URL('https://example.com/v').toString()` is `'https://example.com/v'`, so the test's deep-equal holds.

- [ ] **Step 7: Add the resource field to the code editor**

In `apps/teaching/src/blocks/feedback-codes-editor.ts`, find the row editor that renders `problem_type`. Below it, add a "See how link" URL input and a title input bound to `row.resource = url ? { kind: /youtu|vimeo|\.mp4/.test(url) ? 'video' : 'link', url, title } : undefined`. Use the same `labelled(...)` helper and input classes as the neighbouring fields.

- [ ] **Step 8: Add `short` to the Outcomes manager**

In `apps/teaching/src/teacher/sections/outcomes-library.ts`, add a "Short name for students" text input (max 40) beside the description field, saved with the outcome through the existing save call.

- [ ] **Step 9: Run the tests**

Run: `node --test tests/unit/markbook.test.js tests/unit/feedback-codes.test.js`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add apps/teaching/src/markbook/schema.ts netlify/functions/_shared/*-schema.mjs apps/teaching/src/schemas/outcome.ts netlify/functions/_shared/feedback-codes.mjs apps/teaching/src/blocks/feedback-codes-editor.ts apps/teaching/src/teacher/sections/outcomes-library.ts tests/unit/markbook.test.js tests/unit/feedback-codes.test.js
git commit -m "Markbook criteria take concepts and step lines; columns link a lesson block; codes carry See how"
```

---

### Task 4: Hand in

**Files:**
- Modify: `netlify/functions/_shared/lesson-work.mjs`
- Modify: `apps/teaching/src/student/work-sync.ts`, `apps/teaching/src/student/work-sync.css`
- Test: `tests/unit/lesson-work.test.js` (append), `apps/teaching/tests/unit/work-sync.test.ts` (append, or create if absent)

**Key:** `work_handins/{lesson}/{block}/{student}` = `{ class_id, student_id, text: { [part]: { [field]: text } }, handed_in_at }`.

- [ ] **Step 1: Append the failing server tests**

```js
const linkColumn = (store) => store.data.set('markbook/class1', {
  columns: [{ id: 'col1', kind: 'assessment', title: 'The crash', date: '2026-10-27', weight: 0, piece: { lesson_id: 'lesson1', block_id: 'qset1' }, criteria: [{ id: 'c1', label: 'Analysis', max: 10, outcomes: [], concepts: [] }] }],
  marks: {}, hidden_quizzes: [], focus: {}, took: {}, groups: [], history: []
});

test('status names the blocks this class marks', async () => {
  const { store } = await setup();
  linkColumn(store);
  await workAction(store, 'lesson1', { ...bobDevice, action: 'claim', initials: 'BB' });
  const status = await workAction(store, 'lesson1', { ...bobDevice, action: 'status' });
  assert.deepEqual(status.handin_blocks, ['qset1']);
});

test('hand in freezes the block text and can be redone until it is returned', async () => {
  const { store, bob } = await setup();
  linkColumn(store);
  await workAction(store, 'lesson1', { ...bobDevice, action: 'claim', initials: 'BB' });
  await save(store, { block_id: 'qset1', part: 'answers', fields: { q1: 'First go.' } });
  const first = await workAction(store, 'lesson1', { ...bobDevice, action: 'handin', block_id: 'qset1' });
  assert.ok(first.handed_in_at);
  const key = `work_handins/lesson1/qset1/${bob.id}`;
  assert.deepEqual(store.data.get(key).text, { answers: { q1: 'First go.' } });
  await save(store, { block_id: 'qset1', part: 'answers', fields: { q1: 'Second go.' } });
  await workAction(store, 'lesson1', { ...bobDevice, action: 'handin', block_id: 'qset1' });
  assert.equal(store.data.get(key).text.answers.q1, 'Second go.');
  store.data.set(`piece_feedback/class1/${bob.id}/w:lesson1:qset1`, { status: 'returned' });
  await assert.rejects(workAction(store, 'lesson1', { ...bobDevice, action: 'handin', block_id: 'qset1' }), /already been returned/);
});

test('hand in is refused for a block this class does not mark', async () => {
  const { store } = await setup();
  await workAction(store, 'lesson1', { ...bobDevice, action: 'claim', initials: 'BB' });
  await assert.rejects(workAction(store, 'lesson1', { ...bobDevice, action: 'handin', block_id: 'qset1' }), /isn’t set to be handed in/);
});
```

- [ ] **Step 2: Run them and check they fail**

Run: `node --test tests/unit/lesson-work.test.js`
Expected: the 3 new tests FAIL.

- [ ] **Step 3: Implement in `lesson-work.mjs`**

Add these imports and helpers:

```js
import { readBook } from './markbook.mjs';

export const handinKey = (lesson, block, student) => `work_handins/${lesson}/${block}/${student}`;
export const pieceId = (lesson, block) => `w:${lesson}:${block}`;

/** Blocks in this lesson that the class's Markbook links to an assessment column. */
async function handinBlocks(store, classId, lessonId) {
  const { book } = await readBook(store, classId);
  return book.columns.filter((c) => c.kind === 'assessment' && c.piece?.lesson_id === lessonId).map((c) => c.piece.block_id);
}
```

If `readBook` isn't exported from `markbook.mjs`, export it (it is used internally as `readBook(store, classId)`). Then:
- Allow `'handin'` in the action list.
- Change `const identity = …` to include `handin_blocks: await handinBlocks(store, roster.cls.id, lessonId)`.
- Before the `if (action !== 'save') return identity;` line, add:

```js
  if (action === 'handin') {
    if (typeof body.block_id !== 'string' || !identity.handin_blocks.includes(body.block_id)) reject(400, 'not_marked', 'This part of the lesson isn’t set to be handed in.');
    const feedback = await read(store, `piece_feedback/${roster.cls.id}/${student.id}/${pieceId(lessonId, body.block_id)}`);
    if (feedback?.status === 'returned') reject(409, 'returned', 'This has already been returned. Ask your teacher to take it back first.');
    const kept = await read(store, workKey(lessonId, workOwner(roster.cls.id, student.id)));
    const text = kept?.blocks?.[body.block_id];
    if (!text || !Object.keys(text).length) reject(400, 'empty', 'Write something before you hand it in.');
    const handed_in_at = new Date().toISOString();
    await store.setJSON(handinKey(lessonId, body.block_id, student.id), { class_id: roster.cls.id, student_id: student.id, text, handed_in_at });
    return { ...identity, handed_in_at };
  }
```

- [ ] **Step 4: Run the server tests**

Run: `node --test tests/unit/lesson-work.test.js`
Expected: PASS (all, old and new).

- [ ] **Step 5: Add the client button**

In `work-sync.ts`:
- Extend `Reply` with `handin_blocks?: string[]; handed_in_at?: string`.
- Extend `WorkCall`'s action union with `'handin'`.
- After a successful `status` or `claim`, for each id in `handin_blocks`, find `host.querySelector(\`[data-block-id="${CSS.escape(id)}"]\`)` and append:

```ts
function handInBar(blockId: string): HTMLElement {
  const bar = el('div', 'ws-handin');
  const note = el('p', 'ws-handin__note', 'Your teacher marks this one. Hand it in when it’s ready.');
  note.setAttribute('role', 'status');
  const send = button('Hand in', 'primary', () => {
    send.disabled = true;
    void flush()
      .then(() => call('handin', { block_id: blockId }))
      .then(
        (r) => { note.textContent = `Handed in ${new Date(r.handed_in_at ?? Date.now()).toLocaleString('en-AU', { weekday: 'short', hour: 'numeric', minute: '2-digit' })}. You can hand it in again until it comes back.`; send.textContent = 'Hand in again'; },
        (e: unknown) => { note.textContent = errorText(e); }
      )
      .finally(() => { send.disabled = false; });
  });
  bar.append(note, send);
  return bar;
}
```

Check first which attribute the lesson renderer puts on each block (`grep -n "dataset.blockId\|data-block-id" apps/teaching/src/student/lesson-view.ts apps/teaching/src/blocks/*.ts | head`) and use it.

Add to `work-sync.css`:

```css
.ws-handin { display: flex; flex-wrap: wrap; gap: var(--space-3); align-items: center; justify-content: space-between; margin-top: var(--space-3); padding: var(--space-3) var(--space-4); border: 1px solid var(--line); border-radius: var(--radius-sm); background: var(--paper); }
.ws-handin__note { margin: 0; font-size: var(--text-sm); color: var(--muted); }
.ws-handin .btn { min-height: 44px; }
```

- [ ] **Step 6: Client test**

In `apps/teaching/tests/unit/work-sync.test.ts`, add a test that mounts `mountWorkSync` on a host containing a block with the right attribute. Pass a fake `call` that returns `{ need: null, handin_blocks: ['qset1'] }` for `status`, and `{ need: null, handed_in_at: '2026-10-30T01:00:00Z' }` for `handin`. Then:
- assert the host contains the "Hand in" button
- click it, flush microtasks (`await new Promise((r) => setTimeout(r, 0))`) twice
- assert the button now reads "Hand in again"

Run: `npx vitest run apps/teaching/tests/unit/work-sync.test.ts --root apps/teaching`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add netlify/functions/_shared/lesson-work.mjs netlify/functions/_shared/markbook.mjs apps/teaching/src/student/work-sync.ts apps/teaching/src/student/work-sync.css tests/unit/lesson-work.test.js apps/teaching/tests/unit/work-sync.test.ts
git commit -m "Written work: Hand in for blocks the class's Markbook marks"
```

---

### Task 5: Piece feedback store and teacher route

**Files:**
- Create: `netlify/functions/_shared/piece-feedback.mjs`
- Create: `netlify/functions/class-pieces.mjs`
- Test: `tests/unit/piece-feedback.test.js`

**Key:** `piece_feedback/{class}/{student}/{piece}`, where `piece` is `w:{lesson}:{block}` or `v:{lesson}`.

```text
{ kind, title, short?, lesson_id, block_id?, column_id,
  tags: [{ id, code_id, positive, part, field, start, end, quote, note? }],
  comment?, status: 'draft'|'returned', returned_at?, seen_at?, updated_at }
```

Actions on `POST /api/classes/:id/pieces`:
- `list {column_id}` returns `{ column, students: [{id, initials, name, handed_in_at, status}] }`.
- `load {column_id, student_id}` returns `{ column, student, text, feedback, mark, recent_codes }`. `recent_codes` is the student's growth code ids per earlier returned piece, newest last, for the "came up on the last N" warning.
- `save {column_id, student_id, tags, comment, steps}` writes the feedback, and writes `steps` onto the Markbook mark through `markbookAction(..., { action: 'set_mark', … })`.
- `return {column_id, student_id}` and `take_back {column_id, student_id}`.

- [ ] **Step 1: Write the failing tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { piecesAction, pieceKey } from '../../netlify/functions/_shared/piece-feedback.mjs';
import { loadRoster } from '../../netlify/functions/_shared/class-claims.mjs';

function storeFixture(entries = []) {
  const data = new Map(entries.map(([k, v]) => [k, structuredClone(v)]));
  return {
    data,
    async get(key) { return structuredClone(data.get(key) ?? null); },
    async getWithMetadata(key) { return data.has(key) ? { data: structuredClone(data.get(key)), etag: 'e0' } : null; },
    async setJSON(key, value) { data.set(key, structuredClone(value)); return { modified: true }; },
    async delete(key) { data.delete(key); },
    async list({ prefix }) { return { blobs: [...data.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }; }
  };
}

const column = { id: 'col1', kind: 'assessment', title: 'Imagery paragraph', date: '2026-10-27', weight: 0, piece: { lesson_id: 'lesson1', block_id: 'qset1', short: 'Imagery' }, criteria: [{ id: 'c1', label: 'Analysis', max: 10, outcomes: ['out_a'], concepts: [] }] };

async function setup() {
  const store = storeFixture([
    ['classes/class1', { id: 'class1', type: 'class', title: '12 English', active_unit_ids: [], students: [{ name: 'Ava Nguyen' }, { name: 'Noah Patel' }] }],
    ['markbook/class1', { columns: [column], marks: {}, hidden_quizzes: [], focus: {}, took: {}, groups: [], history: [] }],
    ['feedback_codes/library', { codes: [{ id: 'ts', code: 'TS', label: 'Topic sentence', group: 'composition', criterion: 1, colour: 'peach', descriptor: 'Open with your argument.' }] }]
  ]);
  const roster = await loadRoster(store, 'class1');
  const [ava] = roster.students;
  store.data.set(`work_handins/lesson1/qset1/${ava.id}`, { class_id: 'class1', student_id: ava.id, text: { answers: { q1: 'In the poem the poet uses imagery.' } }, handed_in_at: '2026-10-28T00:00:00Z' });
  return { store, ava };
}

const tag = { code_id: 'ts', positive: false, part: 'answers', field: 'q1', start: 0, end: 34, quote: 'In the poem the poet uses imagery.' };

test('list shows who handed in and where each piece is up to', async () => {
  const { store, ava } = await setup();
  const out = await piecesAction(store, 'class1', { action: 'list', column_id: 'col1' });
  assert.equal(out.students.find((s) => s.id === ava.id).handed_in_at, '2026-10-28T00:00:00Z');
  assert.equal(out.students.find((s) => s.id === ava.id).status, 'waiting');
  assert.equal(out.students.find((s) => s.id !== ava.id).status, 'not_in');
});

test('save keeps tags inside the frozen text and writes steps to the Markbook', async () => {
  const { store, ava } = await setup();
  await piecesAction(store, 'class1', { action: 'save', column_id: 'col1', student_id: ava.id, tags: [tag, { ...tag, end: 999 }], comment: 'Sharp evidence.', steps: { c1: 'building' } });
  const saved = store.data.get(pieceKey('class1', ava.id, 'w:lesson1:qset1'));
  assert.equal(saved.status, 'draft');
  assert.equal(saved.tags.length, 1, 'a tag past the end of the text is dropped');
  assert.equal(store.data.get('markbook/class1').marks.col1[ava.id].steps.c1, 'building');
});

test('return, then take back', async () => {
  const { store, ava } = await setup();
  await piecesAction(store, 'class1', { action: 'save', column_id: 'col1', student_id: ava.id, tags: [tag], comment: 'Sharp.', steps: { c1: 'secure' } });
  await piecesAction(store, 'class1', { action: 'return', column_id: 'col1', student_id: ava.id });
  assert.equal(store.data.get(pieceKey('class1', ava.id, 'w:lesson1:qset1')).status, 'returned');
  await piecesAction(store, 'class1', { action: 'take_back', column_id: 'col1', student_id: ava.id });
  const back = store.data.get(pieceKey('class1', ava.id, 'w:lesson1:qset1'));
  assert.equal(back.status, 'draft');
  assert.equal(back.returned_at, undefined);
});

test('nothing returns without a hand-in', async () => {
  const { store } = await setup();
  const roster = await loadRoster(store, 'class1');
  await assert.rejects(piecesAction(store, 'class1', { action: 'return', column_id: 'col1', student_id: roster.students[1].id }), /hasn’t handed this in/);
});
```

- [ ] **Step 2: Run them and check they fail**

Run: `node --test tests/unit/piece-feedback.test.js`
Expected: FAIL with `Cannot find module`.

- [ ] **Step 3: Write `piece-feedback.mjs`**

```js
/**
 * The teacher's feedback on one handed-in piece: codes on the student's
 * words, a comment, and the return. Rubric steps go on the Markbook mark, so
 * the Markbook stays the gradebook.
 *
 *   piece_feedback/{class}/{student}/{piece}   piece = w:{lesson}:{block} | v:{lesson}
 */
import { randomBytes } from 'node:crypto';
import { loadRoster } from './class-claims.mjs';
import { markbookAction, readBook } from './markbook.mjs';
import { readFeedbackCodes } from './feedback-codes.mjs';
import { read, reject } from './question-drop.mjs';
import { handinKey, pieceId } from './lesson-work.mjs';
import { listBlobKeys } from './blobs-list.mjs';

export const pieceKey = (classId, studentId, piece) => `piece_feedback/${classId}/${studentId}/${piece}`;
export const piecePrefix = (classId, studentId) => `piece_feedback/${classId}/${studentId}/`;
const MAX_TAGS = 60;
const MAX_NOTE = 300;
const MAX_COMMENT = 2000;

async function context(store, classId, body) {
  const roster = await loadRoster(store, classId);
  if (!roster) reject(404, 'not_found', 'Class not found.');
  const { book } = await readBook(store, classId);
  const column = book.columns.find((c) => c.id === body.column_id && c.kind === 'assessment' && c.piece);
  if (!column) reject(404, 'no_column', 'That task isn’t linked to a lesson.');
  return { roster, book, column, piece: pieceId(column.piece.lesson_id, column.piece.block_id) };
}

function studentOf(roster, id) {
  return roster.students.find((s) => s.id === id) ?? reject(404, 'no_student', 'That student isn’t on this class list.');
}

/** Tags that land inside the frozen text, with known codes. */
function cleanTags(raw, text, codes) {
  if (!Array.isArray(raw)) return [];
  const known = new Set(codes.map((c) => c.id));
  const out = [];
  for (const t of raw.slice(0, MAX_TAGS)) {
    const body = text?.[t?.part]?.[t?.field];
    const start = Math.floor(Number(t?.start));
    const end = Math.floor(Number(t?.end));
    if (typeof body !== 'string' || !known.has(t?.code_id) || !(start >= 0) || !(end > start) || end > body.length) continue;
    const tag = { id: typeof t.id === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(t.id) ? t.id : `t_${randomBytes(4).toString('hex')}`, code_id: t.code_id, positive: t.positive === true, part: t.part, field: t.field, start, end, quote: body.slice(start, end) };
    const note = typeof t.note === 'string' ? t.note.trim().slice(0, MAX_NOTE) : '';
    if (note) tag.note = note;
    out.push(tag);
  }
  return out;
}

const statusOf = (handin, feedback) => (!handin ? 'not_in' : feedback?.status === 'returned' ? 'returned' : feedback ? 'marking' : 'waiting');

export async function piecesAction(store, classId, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) reject(400, 'bad_request', 'Invalid request.');
  const action = body.action;
  if (!['list', 'load', 'save', 'return', 'take_back'].includes(action)) reject(400, 'bad_action', 'Unknown action.');
  const { roster, book, column, piece } = await context(store, classId, body);
  const { lesson_id, block_id } = column.piece;

  if (action === 'list') {
    const students = [];
    for (const s of roster.students) {
      const [handin, feedback] = await Promise.all([read(store, handinKey(lesson_id, block_id, s.id)), read(store, pieceKey(classId, s.id, piece))]);
      students.push({ id: s.id, initials: s.initials, name: s.name, handed_in_at: handin?.handed_in_at ?? null, status: statusOf(handin, feedback), seen_at: feedback?.seen_at ?? null });
    }
    return { column, students };
  }

  const student = studentOf(roster, body.student_id);
  const key = pieceKey(classId, student.id, piece);
  const [handin, feedback, codes] = await Promise.all([read(store, handinKey(lesson_id, block_id, student.id)), read(store, key), readFeedbackCodes(store)]);
  if (!handin) reject(409, 'not_in', 'This student hasn’t handed this in yet.');

  if (action === 'load') {
    const recent = [];
    for (const k of await listBlobKeys(store, piecePrefix(classId, student.id))) {
      const row = await read(store, k);
      if (row?.status === 'returned' && k !== key) recent.push({ at: row.returned_at, codes: [...new Set((row.tags ?? []).filter((t) => !t.positive).map((t) => t.code_id))] });
    }
    recent.sort((a, b) => (a.at < b.at ? -1 : 1));
    return { column, student: { id: student.id, initials: student.initials, name: student.name }, text: handin.text, handed_in_at: handin.handed_in_at, feedback, mark: book.marks?.[column.id]?.[student.id] ?? null, codes, recent_codes: recent.map((r) => r.codes) };
  }

  const now = new Date().toISOString();
  if (action === 'save') {
    const next = {
      kind: 'written', title: column.title, ...(column.piece.short ? { short: column.piece.short } : {}), lesson_id, block_id, column_id: column.id,
      tags: cleanTags(body.tags, handin.text, codes),
      comment: typeof body.comment === 'string' ? body.comment.trim().slice(0, MAX_COMMENT) : '',
      status: feedback?.status === 'returned' ? 'returned' : 'draft',
      ...(feedback?.returned_at ? { returned_at: feedback.returned_at } : {}),
      ...(feedback?.seen_at ? { seen_at: feedback.seen_at } : {}),
      updated_at: now
    };
    await store.setJSON(key, next);
    if (body.steps && typeof body.steps === 'object') {
      const mark = book.marks?.[column.id]?.[student.id] ?? { criteria: {} };
      await markbookAction(store, classId, { action: 'set_mark', column_id: column.id, student_id: student.id, mark: { ...mark, steps: body.steps } });
    }
    return { feedback: next };
  }

  if (!feedback) reject(409, 'not_marked', 'Mark this piece before you return it.');
  const next = action === 'return'
    ? { ...feedback, status: 'returned', returned_at: now, updated_at: now }
    : (({ returned_at, seen_at, ...rest }) => ({ ...rest, status: 'draft', updated_at: now }))(feedback);
  await store.setJSON(key, next);
  return { feedback: next };
}
```

Before you write the `set_mark` call, read the existing `set_mark` branch in `markbook.mjs` (around line 229) and match its body field names exactly; the plan assumes `column_id`, `student_id` and `mark`. Also check that `listBlobKeys` returns full keys (it does in `lesson-work.mjs`).

- [ ] **Step 4: Write the route `netlify/functions/class-pieces.mjs`**

Copy `netlify/functions/markbook.mjs` exactly, changing only:

```js
import { piecesAction } from './_shared/piece-feedback.mjs';
export const config = { path: '/api/classes/:id/pieces' };
/** Teacher only: mark and return handed-in pieces. */
export function createClassPiecesHandler(deps = {}) {
  // …same body, with the regex /\/classes\/([^/]+)\/pieces$/ and piecesAction(store, match?.[1], await request.json())
}
export default createClassPiecesHandler();
```

- [ ] **Step 5: Run the tests**

Run: `node --test tests/unit/piece-feedback.test.js`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add netlify/functions/_shared/piece-feedback.mjs netlify/functions/class-pieces.mjs tests/unit/piece-feedback.test.js
git commit -m "Piece feedback: teacher marks, returns and takes back handed-in work"
```

---

### Task 6: To mark queue

**Files:**
- Create: `netlify/functions/_shared/to-mark.mjs`, `netlify/functions/to-mark.mjs`
- Test: `tests/unit/to-mark.test.js`

- [ ] **Step 1: Write the failing test**

Reuse the `storeFixture` and `setup()` from Task 5's test (copy them into this file). Then:

```js
import { toMarkQueue } from '../../netlify/functions/_shared/to-mark.mjs';

test('the queue lists linked tasks with waiting pieces, oldest first, and flags 7+ days', async () => {
  const { store } = await setup();
  store.data.set('classes/index', { ids: ['class1'] });
  const out = await toMarkQueue(store, { now: () => Date.parse('2026-11-05T00:00:00Z') });
  assert.equal(out.tasks.length, 1);
  const t = out.tasks[0];
  assert.deepEqual([t.class_id, t.column_id, t.title, t.waiting, t.handed_in, t.roster], ['class1', 'col1', 'Imagery paragraph', 1, 1, 2]);
  assert.equal(t.oldest_at, '2026-10-28T00:00:00Z');
  assert.equal(t.late, true);
});
```

Before you write this, check how other code lists every class: run `grep -rn "classes/\|listClasses" netlify/functions/_shared/teaching-blobs.mjs | head`. Use that function, and change the fixture to match it rather than `classes/index`.

- [ ] **Step 2: Run it and check it fails**

Run: `node --test tests/unit/to-mark.test.js`
Expected: FAIL.

- [ ] **Step 3: Write `to-mark.mjs`**

```js
/**
 * What is waiting for feedback, across every class: each Markbook task linked
 * to a lesson block, with how many students handed in and how many are still
 * to be returned. Oldest waiting first.
 */
import { piecesAction } from './piece-feedback.mjs';
import { readBook } from './markbook.mjs';
import { loadRoster } from './class-claims.mjs';
// import the class lister found in Step 1, e.g. { listClassIds } from './teaching-blobs.mjs'

export const LATE_DAYS = 7;

export async function toMarkQueue(store, deps = {}) {
  const now = deps.now ? deps.now() : Date.now();
  const tasks = [];
  for (const classId of await listClassIds(store)) {
    const roster = await loadRoster(store, classId);
    if (!roster?.students.length) continue;
    const { book } = await readBook(store, classId);
    for (const column of book.columns.filter((c) => c.kind === 'assessment' && c.piece)) {
      const { students } = await piecesAction(store, classId, { action: 'list', column_id: column.id });
      const waiting = students.filter((s) => s.status === 'waiting' || s.status === 'marking');
      const handed = students.filter((s) => s.handed_in_at);
      if (!handed.length) continue;
      const oldest_at = waiting.map((s) => s.handed_in_at).sort()[0] ?? null;
      tasks.push({
        class_id: classId, class_title: roster.cls.title, column_id: column.id, title: column.title, lesson_id: column.piece.lesson_id, block_id: column.piece.block_id,
        waiting: waiting.length, handed_in: handed.length, roster: students.length, oldest_at,
        late: Boolean(oldest_at) && now - Date.parse(oldest_at) >= LATE_DAYS * 86400000
      });
    }
  }
  tasks.sort((a, b) => (b.waiting > 0) - (a.waiting > 0) || String(a.oldest_at).localeCompare(String(b.oldest_at)));
  return { tasks };
}
```

Then write `netlify/functions/to-mark.mjs`, an operator `GET` handler at `/api/to-mark` modelled on `markbook.mjs`, but with method `GET` and no body: `toMarkQueue(store)`.

- [ ] **Step 4: Run the test**

Run: `node --test tests/unit/to-mark.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/_shared/to-mark.mjs netlify/functions/to-mark.mjs tests/unit/to-mark.test.js
git commit -m "To mark: one queue of handed-in work across classes"
```

---

### Task 7: Student payload

**Files:**
- Create: `netlify/functions/_shared/profile-feedback.mjs`
- Modify: `netlify/functions/_shared/profile.mjs` (actions `progress`, `returned`, `piece`, `seen`; drop `fills` from `profileFor`)
- Test: `tests/unit/profile-feedback.test.js`; update `tests/unit/profile.test.js` where it asserts `fills`

**Pieces for one student, oldest returned first:**
1. **Written:** every `piece_feedback/{class}/{student}/w:*` with `status === 'returned'`. Places come from the linked column's criteria and the Markbook mark's `steps`, falling back to `criteria` marks through `stepForShare` or `rungForShare`. Tags come from the record.
2. **Viva:** every `piece_feedback/{class}/{student}/v:*` that is returned. Tags are the confirmed tags of the student's voice submissions in that lesson (`voice_submissions/{lesson}/*/*` with `student_id === student.id && status === 'returned'`).
3. **Assessment:** Markbook assessment columns with no `piece`, where the student has a mark. Places come from `steps` or the numeric criteria; tags are the mark's `codes`, all growth.
4. **Quiz:** released quizzes, with tags from teacher marks `codes`. Quizzes have no places.

**Placing a criterion:** `out:<id>` for each of its `outcomes`, `con:<key>` for each of its `concepts`, and `skill:<ref>` when it has `skill`. If two criteria on one piece hit the same target, use `lowerOf`.

**Payload for `progress`:**

```text
{ need: null, initials,
  pieces: [{ id, label, date, kind }],                 // label = short || title; date 'D Mon'
  outcomes: [{ key, name, sub, cells, now, story, looks }],
  concepts: [ …same… ],
  skills: [{ strand, rows: [{ key, name, counts: {capable:n,…}, now, story, i_can, next_move }] }],
  codes: [{ code_id, code, label, colour, positive, cells, hit, of, total, dropped }],
  next: [{ code_id, code, colour, positive, hit, of, action, resource? }],   // action = descriptor or strength_descriptor
  unseen: n,
  map }                                                // the existing unit map payload, unchanged
```

- [ ] **Step 1: Write the failing tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { profileAction } from '../../netlify/functions/_shared/profile.mjs';
import { loadRoster } from '../../netlify/functions/_shared/class-claims.mjs';
// storeFixture as in Task 5

const device = { class_token: 'a'.repeat(48) };

async function setup() {
  const store = storeFixture([
    ['classes/class1', { id: 'class1', type: 'class', title: '12 English', active_unit_ids: [], students: [{ name: 'Ava Nguyen' }, { name: 'Noah Patel' }] }],
    ['outcomes/out_a', { id: 'out_a', code: 'EN12-1', description: 'Analyses how texts shape meaning, and responds.', short: 'Analysis', group: 'x', subject_id: 's', source: 'nesa', syllabus: 'x', syllabus_version: '1' }],
    ['feedback_codes/library', { codes: [{ id: 'ts', code: 'TS', label: 'Topic sentence', group: 'composition', criterion: 1, colour: 'peach', descriptor: 'Open each paragraph with your argument.', resource: { kind: 'link', url: 'https://example.com/ts', title: 'Topic sentences' } }] }]
  ]);
  const roster = await loadRoster(store, 'class1');
  const [ava, noah] = roster.students;
  const columns = [1, 2, 3].map((n) => ({ id: `col${n}`, kind: 'assessment', title: `Paragraph ${n}`, date: `2026-10-0${n}`, weight: 0, piece: { lesson_id: `lesson${n}`, block_id: 'b' }, criteria: [{ id: 'c1', label: 'Analysis', max: 10, outcomes: ['out_a'], concepts: [], steps: { secure: 'Shows how techniques shape meaning.' } }] }));
  const marks = Object.fromEntries(columns.map((c) => [c.id, { [ava.id]: { criteria: { c1: 6 }, steps: { c1: 'building' }, note: 'TEACHER ONLY NOTE' }, [noah.id]: { criteria: { c1: 9 }, steps: { c1: 'extending' } } }]));
  store.data.set('markbook/class1', { columns, marks, hidden_quizzes: [], focus: {}, took: {}, groups: [], history: [] });
  for (const n of [1, 2, 3]) {
    store.data.set(`piece_feedback/class1/${ava.id}/w:lesson${n}:b`, { kind: 'written', title: `Paragraph ${n}`, lesson_id: `lesson${n}`, block_id: 'b', column_id: `col${n}`, tags: [{ id: 't', code_id: 'ts', positive: false, part: 'answers', field: 'q1', start: 0, end: 4, quote: 'Text' }], comment: 'Keep going.', status: n < 3 ? 'returned' : 'draft', returned_at: `2026-10-1${n}T00:00:00Z`, updated_at: 'x' });
  }
  await profileAction(store, 'class1', { action: 'claim', initials: ava.initials, ...device });
  return { store, ava, noah };
}

test('progress shows only returned pieces, with steps and stories and no marks', async () => {
  const { store } = await setup();
  const out = await profileAction(store, 'class1', { action: 'progress', ...device });
  assert.equal(out.pieces.length, 2, 'the draft piece stays hidden');
  const row = out.outcomes[0];
  assert.deepEqual([row.name, row.now, row.story.kind], ['Analysis', 'building', 'few']);
  assert.equal(row.looks, 'Secure looks like: Shows how techniques shape meaning.');
  const text = JSON.stringify(out);
  for (const banned of ['TEACHER ONLY NOTE', '"criteria"', 'Noah', 'extending"']) assert.equal(text.includes(banned), false, banned);
});

test('next steps carry the action sentence and the See how link', async () => {
  const { store } = await setup();
  const out = await profileAction(store, 'class1', { action: 'progress', ...device });
  assert.deepEqual(out.next[0], { code_id: 'ts', code: 'TS', colour: 'peach', positive: false, hit: 2, of: 2, action: 'Open each paragraph with your argument.', resource: { kind: 'link', url: 'https://example.com/ts', title: 'Topic sentences' } });
});

test('returned lists items newest first; seen marks one read', async () => {
  const { store, ava } = await setup();
  const list = await profileAction(store, 'class1', { action: 'returned', ...device });
  assert.deepEqual(list.items.map((i) => [i.title, i.new]), [['Paragraph 2', true], ['Paragraph 1', true]]);
  await profileAction(store, 'class1', { action: 'seen', item: list.items[0].id, ...device });
  assert.ok(store.data.get(`piece_feedback/class1/${ava.id}/w:lesson2:b`).seen_at);
});

test('piece returns the frozen text, tags with code text, comment and per-criterion steps', async () => {
  const { store, ava } = await setup();
  store.data.set(`work_handins/lesson1/b/${ava.id}`, { class_id: 'class1', student_id: ava.id, text: { answers: { q1: 'Text here.' } }, handed_in_at: 'x' });
  const out = await profileAction(store, 'class1', { action: 'piece', item: 'w:lesson1:b', ...device });
  assert.equal(out.text.answers.q1, 'Text here.');
  assert.equal(out.tags[0].label, 'Topic sentence');
  assert.deepEqual(out.criteria, [{ label: 'Analysis', step: 'building', was: null }]);
  await assert.rejects(profileAction(store, 'class1', { action: 'piece', item: 'w:lesson3:b', ...device }), /not_found|isn’t back yet/);
});

test('no claim, no data', async () => {
  const { store } = await setup();
  const out = await profileAction(store, 'class1', { action: 'progress', class_token: 'z'.repeat(48) });
  assert.deepEqual(out, { need: 'initials' });
});
```

- [ ] **Step 2: Run them and check they fail**

Run: `node --test tests/unit/profile-feedback.test.js`
Expected: FAIL.

- [ ] **Step 3: Write `profile-feedback.mjs`**

```js
/**
 * A claimed student's own feedback and progress patterns. Only returned work,
 * only this student, never marks, totals, teacher notes or other students.
 * From the skills continuum, only the two lines each row needs.
 */
import { readBook } from './markbook.mjs';
import { readFeedbackCodes } from './feedback-codes.mjs';
import { read, reject } from './question-drop.mjs';
import { listBlobKeys, mapBounded } from './blobs-list.mjs';
import { piecePrefix, pieceKey } from './piece-feedback.mjs';
import { handinKey } from './lesson-work.mjs';
import { stepForShare, rungForShare, lowerOf, stepName, STEPS, RUNGS } from './progress-steps.mjs';
import { targetKeys, targetRow, codeGrid, nextSteps, CHART_MAX } from './progress-patterns.mjs';
import { readSkillsContinuum } from './skills-continuum.mjs';

const day = (iso) => new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', timeZone: 'Australia/Sydney' });

function placesFor(column, mark) {
  const places = {};
  const put = (key, step) => { if (step) places[key] = places[key] ? lowerOf(places[key], step) : step; };
  for (const c of column.criteria) {
    const placed = mark?.steps?.[c.id];
    const share = Number.isFinite(mark?.criteria?.[c.id]) ? mark.criteria[c.id] / c.max : NaN;
    const step = placed && STEPS.includes(placed) ? placed : stepForShare(share);
    const rung = placed && RUNGS.includes(placed) ? placed : rungForShare(share);
    for (const o of c.outcomes ?? []) put(`out:${o}`, step);
    for (const k of c.concepts ?? []) put(`con:${k}`, step);
    if (c.skill) put(`skill:${c.skill}`, rung);
  }
  return places;
}

/** Every returned piece for one student, oldest first. */
export async function studentPieces(store, classId, studentId) {
  const { book } = await readBook(store, classId);
  const columns = new Map(book.columns.map((c) => [c.id, c]));
  const pieces = [];
  const keys = await listBlobKeys(store, piecePrefix(classId, studentId));
  for (const [key, row] of await mapBounded(keys, 8, async (k) => [k, await read(store, k)])) {
    if (row?.status !== 'returned') continue;
    const id = key.slice(piecePrefix(classId, studentId).length);
    const column = columns.get(row.column_id);
    pieces.push({ id, kind: row.kind, title: row.title, short: row.short ?? column?.piece?.short ?? null, at: row.returned_at, places: column ? placesFor(column, book.marks?.[column.id]?.[studentId]) : {}, tags: (row.tags ?? []).map((t) => ({ code_id: t.code_id, positive: Boolean(t.positive) })), seen_at: row.seen_at ?? null, comment: row.comment ?? '' });
  }
  for (const column of book.columns.filter((c) => c.kind === 'assessment' && !c.piece)) {
    const mark = book.marks?.[column.id]?.[studentId];
    if (!mark || mark.exempt) continue;
    const tags = Object.values(mark.codes ?? {}).flat().map((code_id) => ({ code_id, positive: false }));
    pieces.push({ id: `a:${column.id}`, kind: 'assessment', title: column.title, short: null, at: `${column.date}T00:00:00Z`, places: placesFor(column, mark), tags, seen_at: null, comment: '' });
  }
  return pieces.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
}

async function outcomeName(store, id) {
  const o = await read(store, `outcomes/${id}`);
  if (!o) return { name: id, sub: '' };
  const first = String(o.description ?? '').split(/[,;.]/)[0].trim();
  return { name: o.short || o.code, sub: o.short ? `${o.code} · ${first}` : first };
}

function looksFor(column, key, now) {
  const ladder = STEPS;
  const next = ladder[ladder.indexOf(now) + 1];
  const c = column?.criteria.find((x) => (x.outcomes ?? []).includes(key.slice(4)) || (x.concepts ?? []).includes(key.slice(4)));
  const line = next && c?.steps?.[next];
  return line ? `${stepName(next)} looks like: ${line}` : null;
}

export async function progressFor(store, roster, student) {
  const all = await studentPieces(store, roster.cls.id, student.id);
  const pieces = all.slice(-CHART_MAX);
  const library = await readFeedbackCodes(store);
  const codes = new Map(library.map((c) => [c.id, c]));
  const { book } = await readBook(store, roster.cls.id);
  const lastColumn = (key) => [...book.columns].reverse().find((c) => c.kind === 'assessment' && c.criteria.some((x) => (x.outcomes ?? []).includes(key.slice(4)) || (x.concepts ?? []).includes(key.slice(4))));
  const outcomes = [];
  const concepts = [];
  const skillRows = [];
  for (const key of targetKeys(pieces)) {
    const row = targetRow(pieces, key);
    if (key.startsWith('out:')) outcomes.push({ ...row, ...(await outcomeName(store, key.slice(4))), looks: looksFor(lastColumn(key), key, row.now) });
    else if (key.startsWith('con:')) concepts.push({ ...row, name: key.slice(4).replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase()), sub: 'Concept', looks: looksFor(lastColumn(key), key, row.now) });
    else skillRows.push(row);
  }
  const continuum = await readSkillsContinuum(store).catch(() => null);
  const skills = [];
  for (const row of skillRows) {
    const ref = row.key.slice(6);
    const [strandId, subId] = ref.split('.');
    const strand = continuum?.strands.find((s) => s.strand === strandId);
    const sub = strand?.sub_strands.find((s) => s.id === subId);
    const counts = Object.fromEntries(RUNGS.map((r) => [r, row.cells.filter((c) => c === r).length]));
    const nextRung = RUNGS[Math.max(1, RUNGS.indexOf(row.now) + 1)];
    const entry = { key: row.key, name: sub?.name ?? subId, counts, now: row.now, story: row.story, i_can: row.now !== 'below' ? sub?.rungs?.[row.now]?.i_can ?? null : null, next_move: nextRung ? sub?.rungs?.[nextRung]?.build?.next_move ?? null : null, next_rung: nextRung ?? null };
    const group = skills.find((s) => s.strand === (strand?.name ?? strandId)) ?? (skills.push({ strand: strand?.name ?? strandId, rows: [] }), skills.at(-1));
    group.rows.push(entry);
  }
  const grid = codeGrid(pieces, library).map((r) => ({ ...r, code: codes.get(r.code_id)?.code, label: codes.get(r.code_id)?.label, colour: codes.get(r.code_id)?.colour }));
  const next = nextSteps(pieces, library).map((n) => {
    const c = codes.get(n.code_id);
    const action = n.positive ? c?.strength_descriptor || c?.descriptor : c?.descriptor;
    return { ...n, code: c?.code, colour: c?.colour, action: action ?? c?.label, ...(c?.resource ? { resource: c.resource } : {}) };
  });
  return {
    pieces: pieces.map((p) => ({ id: p.id, label: p.short || p.title, date: day(p.at), kind: p.kind })),
    outcomes, concepts, skills, codes: grid, next,
    unseen: all.filter((p) => p.kind !== 'assessment' && !p.seen_at).length
  };
}

export async function returnedFor(store, roster, student) {
  const pieces = await studentPieces(store, roster.cls.id, student.id);
  const items = pieces.filter((p) => p.kind !== 'assessment').reverse().map((p) => ({ id: p.id, kind: p.kind, title: p.title, date: day(p.at), new: !p.seen_at, codes: [...new Set(p.tags.map((t) => t.code_id))] }));
  // Released quizzes and feedback documents for this student join here in Task 8.
  return { items };
}

export async function pieceFor(store, roster, student, item) {
  if (typeof item !== 'string' || !/^[wv]:[A-Za-z0-9_:-]{1,200}$/.test(item)) reject(400, 'bad_item', 'That piece can’t be found.');
  const row = await read(store, pieceKey(roster.cls.id, student.id, item));
  if (row?.status !== 'returned') reject(404, 'not_found', 'That piece isn’t back yet.');
  const library = await readFeedbackCodes(store);
  const codes = new Map(library.map((c) => [c.id, c]));
  const { book } = await readBook(store, roster.cls.id);
  const column = book.columns.find((c) => c.id === row.column_id);
  const mark = column ? book.marks?.[column.id]?.[student.id] : null;
  const earlier = (await studentPieces(store, roster.cls.id, student.id)).filter((p) => p.at < row.returned_at && p.kind === row.kind).at(-1);
  const handin = row.kind === 'written' ? await read(store, handinKey(row.lesson_id, row.block_id, student.id)) : null;
  return {
    id: item, kind: row.kind, title: row.title, date: day(row.returned_at), comment: row.comment ?? '',
    text: handin?.text ?? null,
    tags: (row.tags ?? []).map((t) => { const c = codes.get(t.code_id); return { part: t.part, field: t.field, start: t.start, end: t.end, positive: t.positive, code: c?.code, label: c?.label, colour: c?.colour, action: t.positive ? c?.strength_descriptor || c?.descriptor : c?.descriptor, ...(t.note ? { note: t.note } : {}), ...(c?.resource ? { resource: c.resource } : {}) }; }),
    criteria: (column?.criteria ?? []).map((c) => {
      const step = placesFor({ criteria: [c] }, mark)[c.skill ? `skill:${c.skill}` : c.outcomes?.[0] ? `out:${c.outcomes[0]}` : `con:${c.concepts?.[0]}`] ?? null;
      const prevKey = c.skill ? `skill:${c.skill}` : c.outcomes?.[0] ? `out:${c.outcomes[0]}` : `con:${c.concepts?.[0]}`;
      return { label: c.label, step, was: earlier?.places?.[prevKey] ?? null };
    })
  };
}

export async function markSeen(store, roster, student, item) {
  if (typeof item !== 'string' || !/^[wv]:[A-Za-z0-9_:-]{1,200}$/.test(item)) reject(400, 'bad_item', 'That piece can’t be found.');
  const key = pieceKey(roster.cls.id, student.id, item);
  const row = await read(store, key);
  if (row?.status !== 'returned') reject(404, 'not_found', 'That piece isn’t back yet.');
  if (!row.seen_at) await store.setJSON(key, { ...row, seen_at: new Date().toISOString() });
  return { ok: true };
}
```

Check `readSkillsContinuum` (or whatever `skills-continuum.mjs` exports for reading the stored copy): `grep -n "^export" netlify/functions/_shared/skills-continuum.mjs`. Use that exact name. The student path must never call the private-repo reader. If only the stored copy is available, use it, and return `i_can: null` when there is none.

- [ ] **Step 4: Wire the actions into `profile.mjs`**

In `profileAction`:
- Extend the action list with `'progress', 'returned', 'piece', 'seen'`.
- Immediately after the `claimFor` / `need: 'initials'` guard, add:

```js
  if (action === 'progress') return { need: null, initials: student.initials, ...(await progressFor(store, roster, student)), map: (await profileFor(store, roster, student)).map };
  if (action === 'returned') return { need: null, ...(await returnedFor(store, roster, student)) };
  if (action === 'piece') return pieceFor(store, roster, student, body.item);
  if (action === 'seen') return markSeen(store, roster, student, body.item);
```

- For non-done actions, the `need: 'initials'` branch must return before any of these.
- In `profileFor`, remove the `fills` computation and the `fills` key (the bars are gone). Remove the now-unused imports (`fillsFor`, `markbookEvidence`, `withPointTags`, `profileItems`, `storedAlignment`) if nothing else in the file uses them.
- In `tests/unit/profile.test.js`, delete the assertions on `fills`. Keep the map and done tests.

- [ ] **Step 5: Run the tests**

Run: `node --test tests/unit/profile-feedback.test.js tests/unit/profile.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add netlify/functions/_shared/profile-feedback.mjs netlify/functions/_shared/profile.mjs tests/unit/profile-feedback.test.js tests/unit/profile.test.js
git commit -m "Student profile: progress patterns, returned work and piece views from returned feedback only"
```

---

### Task 8: Viva and feedback documents reach the student

**Files:**
- Modify: `netlify/functions/_shared/voice-submissions.mjs`
- Modify: `netlify/functions/_shared/teaching-feedback.mjs`
- Modify: `netlify/functions/_shared/profile-feedback.mjs` (`returnedFor`, `studentPieces`)
- Modify: the viva teacher UI `apps/teaching/src/blocks/voice-teacher.ts`, the feedback docs UI `apps/teaching/src/teacher/sections/feedback.ts`
- Test: `tests/unit/voice-submissions.test.js`, `tests/unit/profile-feedback.test.js` (append)

- [ ] **Step 1: Append the failing tests**

In `tests/unit/voice-submissions.test.js`:

```js
test('a submission from a claimed device carries the class and student', async () => {
  // Build on the file's existing submit helper. Seed classes/class1 with [{ name: 'Ava Nguyen' }]
  // and a class claim for the submitting device (claimInitials from class-claims.mjs),
  // then submit with { class_id: 'class1', class_token } in the body.
  // assert.equal(record.class_id, 'class1'); assert.equal(record.student_id, ava.id);
});

test('the teacher can set or change who a submission belongs to', async () => {
  // saveVoiceMarking(store, lesson, block, id, { class_id: 'class1', student_id: ava.id })
  // assert the record now has both; an id not on the list is rejected with /isn’t on this class list/.
});
```

Write both tests in full against the file's existing helpers. Read the top 80 lines of `tests/unit/voice-submissions.test.js` first, then fill the bodies with the same setup calls it already uses.

In `tests/unit/profile-feedback.test.js`:

```js
test('a returned viva set shows up as one piece with its confirmed tags', async () => {
  const { store, ava } = await setup();
  store.data.set('voice_submissions/lessonV/blk1/s1', { status: 'returned', class_id: 'class1', student_id: ava.id, tags: [{ code_id: 'ts', positive: false, confirmed: true }], returned_at: '2026-10-20T00:00:00Z' });
  store.data.set('voice_submissions/lessonV/blk2/s2', { status: 'returned', class_id: 'class1', student_id: ava.id, tags: [{ code_id: 'ts', positive: false, confirmed: false }], returned_at: '2026-10-20T00:00:00Z' });
  store.data.set(`piece_feedback/class1/${ava.id}/v:lessonV`, { kind: 'viva', title: 'Viva practice', lesson_id: 'lessonV', column_id: null, tags: [], comment: 'Clear.', status: 'returned', returned_at: '2026-10-20T00:00:00Z', updated_at: 'x' });
  const out = await profileAction(store, 'class1', { action: 'returned', class_token: 'a'.repeat(48) });
  const viva = out.items.find((i) => i.kind === 'viva');
  assert.equal(viva.title, 'Viva practice');
});

test('a feedback document for this student appears as a Note', async () => {
  const { store, ava } = await setup();
  store.data.set('feedback_docs/doc1', { id: 'doc1', title: 'Before your final draft', body_html: '<p>Hi</p>', class_id: 'class1', student_id: ava.id, returned_at: '2026-10-25T00:00:00Z', created_at: 'x', updated_at: 'x' });
  const out = await profileAction(store, 'class1', { action: 'returned', class_token: 'a'.repeat(48) });
  assert.ok(out.items.some((i) => i.kind === 'note' && i.title === 'Before your final draft'));
});
```

- [ ] **Step 2: Run them and check they fail**

Run: `node --test tests/unit/voice-submissions.test.js tests/unit/profile-feedback.test.js`
Expected: the new tests FAIL.

- [ ] **Step 3: Implement the viva changes**

In `voice-submissions.mjs`:
- In the student submit path (around line 169, where `initials` is cleaned), add:

```js
  const roster = typeof body.class_id === 'string' ? await loadRoster(store, body.class_id) : null;
  const claimed = roster ? await claimFor(store, roster, body.class_token) : null;
```

  Then add `...(claimed ? { class_id: roster.cls.id, student_id: claimed.id } : {})` to the new record. Import `loadRoster` and `claimFor` from `./class-claims.mjs`.
- In `saveVoiceMarking`, accept `body.class_id` and `body.student_id`: load the roster, check that the student is on it (otherwise `reject(400, 'no_student', 'That student isn’t on this class list.')`), and set both on `next`.
- In `returnVoiceSubmission`, after a submission with `student_id` is returned, upsert `piece_feedback/{class}/{student}/v:{lesson}` = `{ kind: 'viva', title: <lesson title>, lesson_id, column_id: null, tags: [], comment: <existing piece comment or ''>, status: 'returned', returned_at: now, updated_at: now }`. Keep any existing `seen_at` only if it is later than now (in practice, clear it so the new return shows as New).
- On the student viva client (`apps/teaching/src/blocks/voice-student.ts`), pass `class_id` and `class_token: deviceToken(\`class:${classId}\`)` in the submit call when the lesson was opened from a class page (the class id is on the lesson view options the quiz already uses; `grep -n "classId" apps/teaching/src/student/lesson-view.ts`).

In `profile-feedback.mjs` `studentPieces`, for a `v:` piece, replace its `tags` with the confirmed tags of `voice_submissions/{lesson}/*/*` where `student_id === studentId && status === 'returned'`:

```js
async function vivaTags(store, lessonId, studentId) {
  const keys = await listBlobKeys(store, `voice_submissions/${lessonId}/`);
  const rows = await mapBounded(keys, 8, (k) => read(store, k));
  return rows.filter((r) => r?.student_id === studentId && r.status === 'returned').flatMap((r) => (r.tags ?? []).filter((t) => t.confirmed !== false).map((t) => ({ code_id: t.code_id, positive: Boolean(t.positive) })));
}
```

Check the real voice key layout with `voiceKeys` (line 62). Submission records sit at `voice_submissions/{lesson}/{block}/{id}`, but claim records live under `voice_claims/`, so the prefix above lists only submissions.

- [ ] **Step 4: Implement the feedback document change**

In `teaching-feedback.mjs`:
- Accept optional `class_id` and `student_id` on create and update (validate the student against `loadRoster`).
- Set `returned_at` the first time a student is attached.
- Add `export async function studentNotes(store, classId, studentId)`, which lists `feedback_docs/` and returns the docs with matching ids and no `revoked_at`.

In `returnedFor`, append `{ id: \`n:${doc.id}\`, kind: 'note', title: doc.title, date: day(doc.returned_at), new: !doc.seen_at, codes: [] }` and sort all items by date, newest first. Extend `pieceFor` and `markSeen` so `n:` ids return `{ kind: 'note', title, date, body_html, audio_url }`. Use the existing `toPublishedFeedbackPayload` for the student-safe shape, and store `seen_at` on the doc.

In `apps/teaching/src/teacher/sections/feedback.ts`, add the **For** picker: a class select (from the existing classes list call) and a student select filled from that class's roster. On save, send `class_id` and `student_id`. The button reads "Return to <first name>" when a student is picked.

- [ ] **Step 5: Add the viva student picker**

In `voice-teacher.ts`, add a "This is" select above the transcript in the submission view. Its options are the roster of the lesson's class (load it through the existing class list call, filtered to classes whose units contain this lesson). It is prefilled from `record.student_id`, and otherwise from the roster student whose `initials === record.initials`. A change calls the existing save endpoint with `{ class_id, student_id }`. Show "Matched from the student's class claim" when `record.student_id` was already set by the device.

- [ ] **Step 6: Run the tests**

Run: `node --test tests/unit/voice-submissions.test.js tests/unit/profile-feedback.test.js tests/unit/teaching-feedback*.test.js`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add netlify/functions/_shared/voice-submissions.mjs netlify/functions/_shared/teaching-feedback.mjs netlify/functions/_shared/profile-feedback.mjs apps/teaching/src/blocks/voice-teacher.ts apps/teaching/src/blocks/voice-student.ts apps/teaching/src/teacher/sections/feedback.ts tests/unit/voice-submissions.test.js tests/unit/profile-feedback.test.js
git commit -m "Viva sets and feedback notes reach the student's Returned work"
```

---

### Task 9: Story wording and the client chart parts

**Files:**
- Create: `apps/teaching/src/progress/types.ts`, `story-text.ts`, `step-chart.ts`, `skill-path.ts`, `code-grid.ts`, `progress.css`
- Test: `apps/teaching/tests/unit/progress-parts.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { storyText, BANNED } from '@/progress/story-text';
import { stepChart } from '@/progress/step-chart';
import { skillPath } from '@/progress/skill-path';
import { codeGrid } from '@/progress/code-grid';

const pieces = [
  { id: 'p1', label: 'Road imagery', date: '6 Oct', kind: 'written' as const },
  { id: 'p2', label: 'Viva practice', date: '13 Oct', kind: 'viva' as const },
  { id: 'p3', label: 'Tension', date: '20 Oct', kind: 'written' as const }
];

describe('story text', () => {
  it('words each story kind without deficit words', () => {
    const texts = [
      storyText({ kind: 'holding', step: 'building', count: 5, code_id: 'ts' }, 'TS', false),
      storyText({ kind: 'moved_up', from: 'starting', to: 'building', piece_id: 'p3' }, null, false, pieces),
      storyText({ kind: 'few', count: 2 }, null, false),
      storyText({ kind: 'now', step: 'secure' }, null, false),
      storyText({ kind: 'holding', step: 'skilled', count: 3, code_id: null }, null, true)
    ];
    expect(texts[0]).toBe('Holding at Building for your last 5 pieces. Next step to Secure: see TS.');
    expect(texts[1]).toBe('Moved up from Starting to Building on Tension (20 Oct).');
    expect(texts[2]).toBe('2 pieces so far. More pieces will show the pattern.');
    expect(texts[3]).toBe('Now at Secure.');
    expect(texts[4]).toBe('Holding at Skilled for your last 3 pieces. Next step: Accomplished.');
    for (const t of texts) for (const word of BANNED) expect(t.toLowerCase()).not.toMatch(new RegExp(`\\b${word}\\b`));
  });
});

describe('step chart', () => {
  it('labels steps and pieces, fills up to the step, and dashes unassessed pieces', () => {
    const chart = stepChart(['starting', null, 'building'], pieces);
    expect([...chart.querySelectorAll('.pg-chart__y')].map((n) => n.textContent)).toEqual(['Extending', 'Secure', 'Building', 'Starting']);
    expect([...chart.querySelectorAll('.pg-chart__x b')].map((n) => n.textContent)).toEqual(['Road imagery', 'Viva practice', 'Tension']);
    const cols = chart.querySelectorAll('.pg-chart__col');
    expect(cols[0]!.querySelectorAll('.is-filled').length).toBe(1);
    expect(cols[1]!.classList.contains('is-none')).toBe(true);
    expect(cols[2]!.classList.contains('is-latest')).toBe(true);
    expect(chart.getAttribute('aria-label')).toBe('Road imagery: Starting. Viva practice: not marked on this. Tension: Building.');
  });
});

describe('skill path', () => {
  it('shows where the student is, the next rung, and piece counts', () => {
    const path = skillPath({ key: 'skill:composing.para', name: 'Paragraph control', counts: { below: 0, capable: 2, skilled: 3, accomplished: 0, excellent: 0 }, now: 'skilled', story: { kind: 'holding', step: 'skilled', count: 3, code_id: null }, i_can: 'I can build a paragraph.', next_move: 'End each paragraph by linking back.', next_rung: 'accomplished' });
    expect(path.querySelector('.pg-rung.is-now .pg-rung__name')!.textContent).toBe('Skilled');
    expect(path.querySelector('.pg-rung.is-next')!.textContent).toContain('Next');
    expect([...path.querySelectorAll('.pg-rung__count')].map((n) => n.textContent)).toEqual(['2 pieces', '3 pieces', '', '']);
  });
});

describe('code grid', () => {
  it('shows counts, n/a and the summary', () => {
    const grid = codeGrid([{ code_id: 'ts', code: 'TS', label: 'Topic sentence', colour: 'peach', positive: false, cells: [0, null, 2], hit: 1, of: 2, total: 2, dropped: false }], pieces);
    const cells = [...grid.querySelectorAll('tbody tr:not(.pg-codes__group) td')].map((n) => n.textContent);
    expect(cells.slice(1, 4)).toEqual(['', 'n/a', '2']);
    expect(grid.textContent).toContain('1 of 2 pieces · 2 in all');
  });
});
```

- [ ] **Step 2: Run them and check they fail**

Run: `npx vitest run tests/unit/progress-parts.test.ts --root apps/teaching`
Expected: FAIL.

- [ ] **Step 3: Write `types.ts`**

```ts
export type Step = 'starting' | 'building' | 'secure' | 'extending';
export type Rung = 'below' | 'capable' | 'skilled' | 'accomplished' | 'excellent';
export type Place = Step | Rung;
export type Story =
  | { kind: 'holding'; step: Place; count: number; code_id: string | null }
  | { kind: 'moved_up'; from: Place; to: Place; piece_id: string }
  | { kind: 'few'; count: number }
  | { kind: 'now'; step: Place };
export type PieceCol = { id: string; label: string; date: string; kind: 'written' | 'viva' | 'assessment' | 'quiz' };
export type TargetRow = { key: string; name: string; sub: string; cells: (Place | null)[]; now: Place | null; story: Story; looks: string | null };
export type SkillRow = { key: string; name: string; counts: Record<Rung, number>; now: Rung; story: Story; i_can: string | null; next_move: string | null; next_rung: Rung | null };
export type CodeRow = { code_id: string; code: string; label: string; colour: string; positive: boolean; cells: (number | null)[]; hit: number; of: number; total: number; dropped: boolean };
export type Resource = { kind: 'link' | 'video'; url: string; title?: string; start?: number };
export type NextStep = { code_id: string; code: string; colour: string; positive: boolean; hit: number; of: number; action: string; resource?: Resource };
export type ProgressPayload = {
  need: null; initials: string; pieces: PieceCol[]; outcomes: TargetRow[]; concepts: TargetRow[];
  skills: { strand: string; rows: SkillRow[] }[]; codes: CodeRow[]; next: NextStep[]; unseen: number; map: unknown;
};
export type ReturnedItem = { id: string; kind: 'written' | 'viva' | 'quiz' | 'note'; title: string; date: string; new: boolean; codes: string[] };
```

- [ ] **Step 4: Write `story-text.ts`**

```ts
import type { PieceCol, Place, Story } from './types';

export const STEP_ORDER: Place[] = ['starting', 'building', 'secure', 'extending'];
export const RUNG_ORDER: Place[] = ['below', 'capable', 'skilled', 'accomplished', 'excellent'];
const NAMES: Record<Place, string> = { starting: 'Starting', building: 'Building', secure: 'Secure', extending: 'Extending', below: 'On the way to Capable', capable: 'Capable', skilled: 'Skilled', accomplished: 'Accomplished', excellent: 'Excellent' };
export const placeName = (p: Place | null): string => (p ? NAMES[p] : '');
/** Words that never appear in what a student reads about their own learning. */
export const BANNED = ['weak', 'struggling', 'struggle', 'not', 'never', 'lacks', 'without', 'dropped', 'fail', 'poor'];

const nextOf = (p: Place): Place | null => {
  const ladder = STEP_ORDER.includes(p) ? STEP_ORDER : RUNG_ORDER;
  return ladder[ladder.indexOf(p) + 1] ?? null;
};

export function storyText(story: Story, code: string | null, skill: boolean, pieces: PieceCol[] = []): string {
  if (story.kind === 'holding') {
    const next = nextOf(story.step);
    const tail = code && !skill ? `Next step to ${placeName(next)}: see ${code}.` : `Next step: ${placeName(next)}.`;
    return `Holding at ${placeName(story.step)} for your last ${story.count} pieces. ${tail}`;
  }
  if (story.kind === 'moved_up') {
    const p = pieces.find((x) => x.id === story.piece_id);
    return `Moved up from ${placeName(story.from)} to ${placeName(story.to)}${p ? ` on ${p.label} (${p.date})` : ''}.`;
  }
  if (story.kind === 'few') return `${story.count} ${story.count === 1 ? 'piece' : 'pieces'} so far. More pieces will show the pattern.`;
  return `Now at ${placeName(story.step)}.`;
}
```

Note: the test uses `code_id: 'ts'` with display code `'TS'`. The caller passes the display code it looked up from `codes` (the payload's code grid carries `code` per id).

- [ ] **Step 5: Write `step-chart.ts`**

```ts
import { el } from '@/quiz/dom';
import { placeName, STEP_ORDER } from './story-text';
import type { PieceCol, Place } from './types';

/** One column per piece, filled up to its step; step names up the side, piece names along the bottom. */
export function stepChart(cells: (Place | null)[], pieces: PieceCol[]): HTMLElement {
  const chart = el('div', 'pg-chart');
  chart.style.setProperty('--n', String(cells.length));
  chart.setAttribute('role', 'img');
  chart.setAttribute('aria-label', cells.map((c, i) => `${pieces[i]?.label}: ${c ? placeName(c) : 'not marked on this'}.`).join(' '));
  const top = [...STEP_ORDER].reverse();
  top.forEach((s, row) => {
    const y = el('span', 'pg-chart__y', placeName(s));
    y.style.gridRow = String(row + 1);
    chart.append(y);
  });
  const latest = cells.reduce<number>((at, c, i) => (c ? i : at), -1);
  cells.forEach((c, i) => {
    const col = el('div', `pg-chart__col${c ? '' : ' is-none'}${i === latest ? ' is-latest' : ''}`);
    col.style.gridColumn = String(i + 2);
    const rank = c ? STEP_ORDER.indexOf(c) : -1;
    for (const s of top) {
      const cell = el('span', 'pg-chart__cell');
      if (rank >= 0 && STEP_ORDER.indexOf(s) <= rank) cell.classList.add('is-filled', `is-${c}`);
      col.append(cell);
    }
    chart.append(col);
    const x = el('span', 'pg-chart__x');
    x.style.gridColumn = String(i + 2);
    x.append(el('b', undefined, pieces[i]?.label ?? ''), document.createTextNode(pieces[i]?.date ?? ''));
    chart.append(x);
  });
  return chart;
}
```

- [ ] **Step 6: Write `skill-path.ts`**

```ts
import { el } from '@/quiz/dom';
import { placeName } from './story-text';
import type { Rung, SkillRow } from './types';

const SHOWN: Rung[] = ['capable', 'skilled', 'accomplished', 'excellent'];

/** The continuum as a path: rungs left to right, You are here, Next, and how many pieces landed on each. */
export function skillPath(row: SkillRow): HTMLElement {
  const path = el('div', 'pg-path');
  path.setAttribute('role', 'img');
  path.setAttribute('aria-label', `${row.name}: now ${placeName(row.now)}.`);
  const nowAt = SHOWN.indexOf(row.now);
  SHOWN.forEach((r, i) => {
    const rung = el('div', `pg-rung${i < nowAt ? ' is-past' : ''}${i === nowAt ? ' is-now' : ''}${r === row.next_rung ? ' is-next' : ''}`);
    rung.append(el('span', 'pg-rung__name', placeName(r)));
    const n = row.counts[r] ?? 0;
    rung.append(el('span', 'pg-rung__count', n ? `${n} ${n === 1 ? 'piece' : 'pieces'}` : ''));
    if (i === nowAt) rung.append(el('span', 'pg-rung__here', 'You are here'));
    if (r === row.next_rung) rung.append(el('span', 'pg-rung__here pg-rung__here--next', 'Next'));
    path.append(rung);
  });
  if (row.now === 'below') path.prepend(el('p', 'pg-path__below', 'On the way to Capable'));
  return path;
}
```

- [ ] **Step 7: Write `code-grid.ts`**

```ts
import { el } from '@/quiz/dom';
import type { CodeRow, PieceCol } from './types';

export function codeChip(code: string, colour: string): HTMLElement {
  const chip = el('span', `pg-code pg-code--${colour}`, code);
  return chip;
}

/** Codes down the side, pieces across; each cell is how many times that code is on that piece. */
export function codeGrid(rows: CodeRow[], pieces: PieceCol[]): HTMLElement {
  const wrap = el('div', 'pg-codes');
  const table = el('table', 'pg-codes__table');
  const head = el('tr');
  head.append(el('th'));
  for (const p of pieces) {
    const th = el('th');
    th.append(el('b', undefined, p.label), document.createTextNode(p.date));
    head.append(th);
  }
  head.append(el('th'));
  const thead = el('thead');
  thead.append(head);
  const body = el('tbody');
  for (const [title, positive] of [['Working on', false], ['Doing well', true]] as const) {
    const list = rows.filter((r) => r.positive === positive);
    if (!list.length) continue;
    const g = el('tr', 'pg-codes__group');
    const td = el('td', undefined, title);
    td.colSpan = pieces.length + 2;
    g.append(td);
    body.append(g);
    for (const r of list) {
      const tr = el('tr');
      const name = el('td');
      name.append(codeChip(r.code, r.colour), el('span', 'pg-codes__label', ` ${r.label}`));
      tr.append(name);
      for (const c of r.cells) {
        const cell = el('td');
        if (c === null) cell.append(el('span', 'pg-codes__na', 'n/a'));
        else if (c === 0) cell.append(el('span', 'pg-codes__none'));
        else cell.append(el('span', `pg-codes__n pg-codes__n--${positive ? 'g' : 'w'}${Math.min(c, 3)}`, String(c)));
        tr.append(cell);
      }
      const sum = el('td', 'pg-codes__sum', `${r.hit} of ${r.of} pieces · ${r.total} in all`);
      if (r.dropped) sum.append(el('span', 'pg-codes__dropped', 'none in 3 pieces'));
      tr.append(sum);
      body.append(tr);
    }
  }
  table.append(thead, body);
  wrap.append(table, el('p', 'pg-hint', 'n/a means the code doesn’t apply to that kind of piece.'));
  return wrap;
}
```

- [ ] **Step 8: Write `progress.css`**

Port the mockup's styles, renamed to `pg-` classes and using the app's design tokens (`--navy`, `--wave`, `--muted`, `--shore`, `--line`, `--pastel-blue`, `--space-*`, `--text-*`, `--radius-*`):
- `.lvchart` becomes `.pg-chart`; `.cell.f1`–`.f4` become `.is-starting`/`.is-building`/`.is-secure`/`.is-extending`
- `.sk-*`/`.rung*` become `.pg-path`/`.pg-rung*`
- `.cg*` becomes `.pg-codes*`
- `.step*` becomes `.pg-next*`
- `.oc*` becomes `.pg-row*`
- `.umap` is not needed, because the real map is mounted

The mockup is at `docs/mockups/student-progress/student-progress.html`. Copy each rule block from its `<style>` and swap the names. Keep the 390px rules: `.pg-chart` columns become `1fr`, and the code-grid summary column hides and folds into `.pg-codes__fold`. Colour is never the only signal; every cell or rung has its word.

- [ ] **Step 9: Run the tests**

Run: `npx vitest run tests/unit/progress-parts.test.ts --root apps/teaching`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add apps/teaching/src/progress apps/teaching/tests/unit/progress-parts.test.ts
git commit -m "Progress view parts: labelled step chart, skill path, code grid, story wording"
```

---

### Task 10: Student page

**Files:**
- Modify: `apps/teaching/src/student/profile-view.ts`, `apps/teaching/src/student/profile.css`
- Create: `apps/teaching/src/student/returned-view.ts`
- Test: `apps/teaching/tests/unit/profile-view.test.ts` (update)

- [ ] **Step 1: Update the tests first**

In `profile-view.test.ts`:
- Remove the bar assertions.
- Add a test that renders the page with a fake `ProgressPayload` and checks:
  - "Your next steps" lists the action sentence and "See how"
  - "Where your learning is" has an Outcomes heading with one `.pg-chart`
  - "Your skills" has a `.pg-path`
  - the code grid shows a count
  - the tab "Returned work" shows the `unseen` count
- Add a test that renders `returnedList(items)` and, on clicking an item, calls `onOpen(id)`.
- Add a test that renders `pieceView(piece)` with one tag over "In the poem", and checks:
  - the `.pa-run--mark` text
  - that clicking it shows the code label and the action
  - that the criteria ladder marks the step and shows "up from Starting" when `was` is lower

Use invented text only.

- [ ] **Step 2: Run them and check they fail**

Run: `npx vitest run tests/unit/profile-view.test.ts --root apps/teaching`
Expected: FAIL.

- [ ] **Step 3: Rewrite the page body in `profile-view.ts`**

Keep `renderInitials`, `ensureNoIndex`, the shell and the map mount (`renderMap`). Replace `renderBars` and the payload shape with:

```ts
import { stepChart } from '@/progress/step-chart';
import { skillPath } from '@/progress/skill-path';
import { codeGrid, codeChip } from '@/progress/code-grid';
import { storyText, placeName } from '@/progress/story-text';
import type { ProgressPayload, TargetRow } from '@/progress/types';
import { returnedList, pieceView } from '@/student/returned-view';
import '@/progress/progress.css';

function seeHow(r?: { url: string; title?: string; kind: string; start?: number }): HTMLElement | null {
  if (!r) return null;
  const a = el('a', 'pg-seehow', 'See how →');
  a.href = r.kind === 'video' && r.start ? `${r.url}${r.url.includes('?') ? '&' : '?'}t=${r.start}` : r.url;
  a.target = '_blank';
  a.rel = 'noopener';
  if (r.title) a.title = r.title;
  return a;
}

function renderNext(p: ProgressPayload): HTMLElement {
  const sec = el('section', 'pg-next');
  sec.append(el('h2', 'pm-map__title', 'Your next steps'), el('p', 'pm-key', 'Built from what your teacher keeps writing on your work.'));
  if (!p.next.length) {
    sec.append(el('p', 'pm-empty', 'Your next steps appear once your teacher has returned a few pieces.'));
    return sec;
  }
  const list = el('div', 'pg-next__list');
  for (const n of p.next) {
    const card = el('div', `pg-next__card${n.positive ? ' is-strength' : ''}`);
    card.append(el('p', 'pg-next__do', n.positive ? `${n.action} It’s working.` : n.action));
    const why = el('p', 'pg-next__why');
    why.append(codeChip(n.code, n.colour), document.createTextNode(` on ${n.hit} of your last ${n.of} pieces`));
    card.append(why);
    const link = seeHow(n.resource);
    if (link) card.append(link);
    list.append(card);
  }
  sec.append(list);
  return sec;
}

function renderTargetRows(title: string, rows: TargetRow[], p: ProgressPayload): HTMLElement[] {
  if (!rows.length) return [];
  const out: HTMLElement[] = [el('h3', 'pg-group', title)];
  const codeOf = (id: string | null) => (id ? p.codes.find((c) => c.code_id === id)?.code ?? null : null);
  for (const r of rows) {
    const holding = r.story.kind === 'holding';
    const row = el('article', `pg-row${holding ? ' is-holding' : ''}`);
    const left = el('div', 'pg-row__text');
    left.append(el('h4', 'pg-row__name', r.name), el('p', 'pg-row__sub', r.sub));
    if (r.now) left.append(el('span', `pg-row__now is-${r.now}`, `Now: ${placeName(r.now)}`));
    left.append(el('p', 'pg-row__story', storyText(r.story, codeOf(r.story.kind === 'holding' ? r.story.code_id : null), false, p.pieces)));
    if (r.looks) left.append(el('p', 'pg-row__looks', r.looks));
    if (holding) left.append(el('p', 'pg-row__flag', 'Your next step is here'));
    row.append(left, stepChart(r.cells, p.pieces));
    out.push(row);
  }
  return out;
}

function renderSkills(p: ProgressPayload): HTMLElement | null {
  if (!p.skills.length) return null;
  const sec = el('section', 'pg-skills');
  sec.append(el('h2', 'pm-map__title', 'Your skills'), el('p', 'pm-key', 'Skills use the HSC skills continuum, a different scale from your outcomes. The dot shows where you are now. Under each rung is how many of your pieces landed there.'));
  for (const s of p.skills) {
    const card = el('div', 'pg-skills__card');
    card.append(el('p', 'pg-skills__strand', s.strand));
    for (const r of s.rows) {
      const row = el('div', `pg-skills__row${r.story.kind === 'holding' ? ' is-holding' : ''}`);
      row.append(el('h4', 'pg-row__name', r.name), skillPath(r));
      if (r.i_can) row.append(el('p', 'pg-skills__ican', `“${r.i_can}”`));
      if (r.next_move && r.next_rung) row.append(el('p', 'pg-skills__next', `To reach ${placeName(r.next_rung)}: ${r.next_move}`));
      if (r.story.kind === 'holding') row.append(el('p', 'pg-row__flag', storyText(r.story, null, true)));
      card.append(row);
    }
    sec.append(card);
  }
  return sec;
}
```

The page root renders:
- the title "Your progress" and "AN on this device"
- a tablist with **My progress** and **Returned work** (with the `unseen` count badge); use `role="tablist"`/`role="tab"`/`aria-selected` and 44px targets
- the My progress panel, in this order:
  1. `renderNext`
  2. the `h2` "Where your learning is" and the hint "Each column is one piece your teacher marked, oldest to newest. The taller the column, the higher the step."
  3. `renderTargetRows('Outcomes', …)` and `renderTargetRows('Concepts', …)`
  4. `renderSkills`
  5. the `h2` "What your feedback keeps saying" with `codeGrid`
  6. the `h2` "Your unit" with `renderMap`

When `pieces` is empty, show only "Your progress appears here once your teacher returns your first piece of work." followed by the unit map.

The load call becomes `apiPost('/api/published/profile/:id', { action: 'progress', class_token })`. The Returned work tab calls `returned`, and opening an item calls `piece` and then `seen`.

- [ ] **Step 4: Write `returned-view.ts`**

```ts
import { el } from '@/quiz/dom';
import { paper, type Mark } from '@/blocks/peer-annotate';
import { placeName, STEP_ORDER, RUNG_ORDER } from '@/progress/story-text';
import { codeChip } from '@/progress/code-grid';
import type { Place, ReturnedItem } from '@/progress/types';

const TAG: Record<ReturnedItem['kind'], string> = { written: 'Writing', viva: 'Viva', quiz: 'Quiz', note: 'Note' };

export function returnedList(items: ReturnedItem[], onOpen: (id: string) => void): HTMLElement {
  const box = el('section', 'pg-returned');
  if (!items.length) {
    box.append(el('p', 'pm-empty', 'Feedback from your teacher appears here once it is returned.'));
    return box;
  }
  for (const item of items) {
    const card = el('button', `pg-returned__card${item.new ? ' is-new' : ''}`);
    card.type = 'button';
    card.append(el('span', `pg-returned__tag is-${item.kind}`, TAG[item.kind]));
    const t = el('span', 'pg-returned__title', item.title);
    if (item.new) t.append(el('span', 'pg-returned__new', 'New'));
    card.append(t, el('span', 'pg-returned__meta', `Returned ${item.date}`), el('span', 'pg-returned__chev', '›'));
    card.addEventListener('click', () => onOpen(item.id));
    box.append(card);
  }
  return box;
}

export type PieceTag = { part: string; field: string; start: number; end: number; positive: boolean; code: string; label: string; colour: string; action: string; note?: string; resource?: { url: string; kind: string; title?: string; start?: number } };
export type PiecePayload = { id: string; kind: string; title: string; date: string; comment: string; text: Record<string, Record<string, string>> | null; tags: PieceTag[]; criteria: { label: string; step: Place | null; was: Place | null }[] };

function ladder(step: Place | null, was: Place | null): HTMLElement {
  const order = step && RUNG_ORDER.includes(step) ? RUNG_ORDER.slice(1) : STEP_ORDER;
  const row = el('div', 'pg-ladder');
  for (const s of order) row.append(el('span', `pg-ladder__step${s === step ? ' is-on' : ''}${s === was && was !== step ? ' is-was' : ''}`, placeName(s)));
  return row;
}

export function pieceView(p: PiecePayload, onBack: () => void): HTMLElement {
  const root = el('section', 'pg-piece');
  const back = el('button', 'pg-back', '← Your progress');
  back.type = 'button';
  back.addEventListener('click', onBack);
  root.append(back, el('h2', 'pg-piece__title', p.title), el('p', 'pm-key', `Returned ${p.date}`));
  const cols = el('div', 'pg-piece__cols');
  const left = el('div');
  const pop = el('div', 'pg-pop');
  pop.hidden = true;
  for (const [part, fields] of Object.entries(p.text ?? {})) {
    for (const [field, text] of Object.entries(fields)) {
      const tags = p.tags.filter((t) => t.part === part && t.field === field);
      const marks: Mark[] = tags.map((t, i) => ({ start: t.start, end: t.end, layer: i, colour: `var(--pastel-${t.colour}-ink)` }));
      const sheet = paper(text, marks, null);
      sheet.addEventListener('click', (e) => {
        const run = (e.target as HTMLElement).closest<HTMLElement>('.pa-run--mark');
        if (!run) return;
        const at = Number(run.dataset.start);
        const tag = tags.find((t) => t.start <= at && t.end > at);
        if (!tag) return;
        pop.replaceChildren(codeChip(tag.code, tag.colour), el('b', 'pg-pop__label', ` ${tag.label}`), el('p', 'pg-pop__action', tag.action));
        if (tag.note) pop.append(el('p', 'pg-pop__note', tag.note));
        if (tag.resource) {
          const a = el('a', 'pg-seehow', 'See how →');
          a.href = tag.resource.url;
          a.target = '_blank';
          a.rel = 'noopener';
          pop.append(a);
        }
        pop.hidden = false;
      });
      left.append(sheet);
    }
  }
  left.append(pop, el('p', 'pg-hint', 'Tap a highlight to see what it means.'));
  const side = el('div', 'pg-piece__side');
  if (p.comment) {
    const c = el('div', 'pg-box');
    c.append(el('h3', 'pg-box__title', 'Your teacher’s comment'), el('p', 'pg-box__comment', p.comment));
    side.append(c);
  }
  if (p.criteria.length) {
    const c = el('div', 'pg-box');
    c.append(el('h3', 'pg-box__title', 'Where this piece sits'));
    for (const cr of p.criteria) {
      const delta = !cr.was || cr.was === cr.step ? 'same as last time' : `up from ${placeName(cr.was)}`;
      const head = el('div', 'pg-box__row');
      head.append(el('b', undefined, cr.label), el('span', 'pg-box__delta', cr.was ? delta : ''));
      c.append(head, ladder(cr.step, cr.was));
    }
    side.append(c);
  }
  cols.append(left, side);
  root.append(cols);
  return root;
}
```

On the "up from" wording: only rises reach this label. If `was` ranks above `step`, show no delta text at all, since the spec never says "down". Add that check (compare rank in `STEP_ORDER` or `RUNG_ORDER`) before writing `delta`.

A viva piece has `text: null`. For a viva, the payload's `tags` carry a `quote` line instead. Render a list of `codeChip + label + action` rows, plus the transcript link "Listen and read in the lesson".

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/unit/profile-view.test.ts --root apps/teaching`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/teaching/src/student/profile-view.ts apps/teaching/src/student/profile.css apps/teaching/src/student/returned-view.ts apps/teaching/tests/unit/profile-view.test.ts
git commit -m "Student page: next steps, learning rows, skills path, code grid and Returned work"
```

---

### Task 11: Teacher marking screen

**Files:**
- Create: `apps/teaching/src/marking/mark-piece.ts`, `apps/teaching/src/marking/marking.css`
- Modify: `apps/teaching/src/blocks/peer-annotate.ts` (export `offsetOf` and `trimRange`)
- Modify: `apps/teaching/src/app/router.ts`, `apps/teaching/src/main.ts`: add the route `/mark/:classId/:columnId` (teacher, auth)
- Test: `apps/teaching/tests/unit/mark-piece.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from 'vitest';
import { markPieceView, type MarkPieceData } from '@/marking/mark-piece';

const data: MarkPieceData = {
  column: { id: 'col1', title: 'Imagery paragraph', criteria: [{ id: 'c1', label: 'Analysis', outcomes: ['out_a'], concepts: [], skill: undefined }] },
  student: { id: 'st_ava', initials: 'AN', name: 'Ava Nguyen' },
  text: { answers: { q1: 'In the poem the poet uses imagery. The road is a grey ribbon.' } },
  feedback: null, mark: null,
  codes: [{ id: 'ts', code: 'TS', label: 'Topic sentence', colour: 'peach', group: 'composition', descriptor: 'Open with your argument.' }],
  recent_codes: [['ts'], ['ts'], ['ts']],
  position: { index: 2, total: 24 }
};

describe('mark piece', () => {
  it('arms a code, tags the selected words, places a step, and saves', async () => {
    const save = vi.fn().mockResolvedValue({});
    const view = markPieceView(data, { save, returnIt: vi.fn(), takeBack: vi.fn(), move: vi.fn() });
    document.body.append(view);
    (view.querySelector('[data-code="ts"]') as HTMLButtonElement).click();
    view.dispatchEvent(new CustomEvent('pm:select', { detail: { part: 'answers', field: 'q1', start: 0, end: 34 } }));
    expect(view.querySelectorAll('.pa-run--mark').length).toBeGreaterThan(0);
    expect(view.querySelector('.mk-tally')!.textContent).toContain('TS 1');
    expect(view.querySelector('.mk-warn')!.textContent).toBe('TS has come up on Ava’s last 3 pieces.');
    (view.querySelector('[data-step="c1:building"]') as HTMLButtonElement).click();
    (view.querySelector('.mk-comment') as HTMLTextAreaElement).value = 'Sharp evidence.';
    (view.querySelector('[data-action="save"]') as HTMLButtonElement).click();
    await Promise.resolve();
    expect(save).toHaveBeenCalledWith({ tags: [expect.objectContaining({ code_id: 'ts', part: 'answers', field: 'q1', start: 0, end: 34, positive: false })], comment: 'Sharp evidence.', steps: { c1: 'building' } });
    expect(view.querySelector('[data-action="return"]')!.textContent).toBe('Return to Ava');
  });
});
```

- [ ] **Step 2: Run it and check it fails**

Run: `npx vitest run tests/unit/mark-piece.test.ts --root apps/teaching`
Expected: FAIL.

- [ ] **Step 3: Export the selection helpers from `peer-annotate.ts`**

Change `function offsetOf` and `function trimRange` to `export function`.

- [ ] **Step 4: Write `mark-piece.ts`**

```ts
import { el, button } from '@/quiz/dom';
import { paper, offsetOf, trimRange, type Mark } from '@/blocks/peer-annotate';
import './marking.css';

type Criterion = { id: string; label: string; outcomes: string[]; concepts: string[]; skill?: string };
type Code = { id: string; code: string; label: string; colour: string; group: string; descriptor: string; strength_descriptor?: string };
type Tag = { code_id: string; positive: boolean; part: string; field: string; start: number; end: number; note?: string };
export type MarkPieceData = {
  column: { id: string; title: string; criteria: Criterion[] };
  student: { id: string; initials: string; name: string };
  text: Record<string, Record<string, string>>;
  feedback: { tags: Tag[]; comment: string; status: 'draft' | 'returned' } | null;
  mark: { steps?: Record<string, string> } | null;
  codes: Code[];
  recent_codes: string[][];
  position: { index: number; total: number };
};
export type MarkPieceActions = {
  save: (body: { tags: Tag[]; comment: string; steps: Record<string, string> }) => Promise<unknown>;
  returnIt: () => Promise<unknown>;
  takeBack: () => Promise<unknown>;
  move: (by: -1 | 1) => void;
};

const STEPS = [['starting', 'Starting'], ['building', 'Building'], ['secure', 'Secure'], ['extending', 'Extending']] as const;
const RUNGS = [['capable', 'Capable'], ['skilled', 'Skilled'], ['accomplished', 'Accompl.'], ['excellent', 'Excellent']] as const;
const first = (name: string) => name.split(' ')[0] ?? name;

export function markPieceView(d: MarkPieceData, act: MarkPieceActions): HTMLElement {
  let tags: Tag[] = [...(d.feedback?.tags ?? [])];
  const steps: Record<string, string> = { ...(d.mark?.steps ?? {}) };
  let armed: { id: string; positive: boolean } | null = null;
  let status = d.feedback?.status ?? 'draft';
  const codes = new Map(d.codes.map((c) => [c.id, c]));

  const root = el('section', 'mk');
  const bar = el('div', 'mk-bar');
  bar.append(el('h2', 'mk-bar__name', d.student.name), el('span', 'mk-bar__pos', `${d.position.index + 1} of ${d.position.total}`));
  bar.append(button('←', 'secondary', () => act.move(-1)), button('→', 'secondary', () => act.move(1)));
  const saveBtn = button('Save', 'secondary', () => void save());
  saveBtn.dataset.action = 'save';
  const retBtn = button('', 'primary', () => void (status === 'returned' ? act.takeBack().then(() => { status = 'draft'; paint(); }) : save().then(() => act.returnIt()).then(() => { status = 'returned'; paint(); })));
  retBtn.dataset.action = 'return';
  bar.append(saveBtn, retBtn);

  const palette = el('div', 'mk-palette');
  palette.append(el('span', 'mk-palette__hint', 'Tap a code, then the words. Hold Shift for a strength.'));
  for (const c of d.codes) {
    const chip = el('button', `mk-chip mk-chip--${c.colour}`);
    chip.type = 'button';
    chip.dataset.code = c.id;
    chip.append(el('b', undefined, c.code), document.createTextNode(` ${c.label}`));
    chip.addEventListener('click', (e) => {
      armed = armed?.id === c.id ? null : { id: c.id, positive: (e as MouseEvent).shiftKey };
      paint();
    });
    palette.append(chip);
  }

  const sheets = el('div', 'mk-sheets');
  const side = el('div', 'mk-side');
  const tally = el('div', 'mk-tally');
  const warn = el('p', 'mk-warn');
  const comment = el('textarea', 'mk-comment');
  comment.value = d.feedback?.comment ?? '';
  comment.setAttribute('aria-label', 'Comment the student will see');

  const rubric = el('div', 'mk-rubric');
  for (const c of d.column.criteria) {
    const row = el('div', 'mk-rubric__row');
    row.append(el('b', undefined, c.label), el('small', undefined, c.skill ? `Skill · ${c.skill}` : [...c.outcomes, ...c.concepts].join(' · ')));
    const btns = el('div', 'mk-rubric__steps');
    for (const [id, name] of c.skill ? RUNGS : STEPS) {
      const b = el('button', 'mk-step', name);
      b.type = 'button';
      b.dataset.step = `${c.id}:${id}`;
      b.addEventListener('click', () => { steps[c.id] = id; paint(); });
      btns.append(b);
    }
    row.append(btns);
    rubric.append(row);
  }
  side.append(el('h3', 'mk-side__title', 'Rubric · where this piece sits'), rubric, el('p', 'mk-hint', 'Your step sets where the student sits. The codes don’t.'), el('h3', 'mk-side__title', 'Codes on this piece'), tally, warn, el('h3', 'mk-side__title', 'Comment'), comment);

  root.addEventListener('pm:select', (e) => {
    const sel = (e as CustomEvent<{ part: string; field: string; start: number; end: number }>).detail;
    if (!armed) return;
    tags.push({ code_id: armed.id, positive: armed.positive, ...sel });
    paint();
  });

  function paint(): void {
    sheets.replaceChildren();
    for (const [part, fields] of Object.entries(d.text)) {
      for (const [field, text] of Object.entries(fields)) {
        const mine = tags.filter((t) => t.part === part && t.field === field);
        const marks: Mark[] = mine.map((t, i) => ({ start: t.start, end: t.end, layer: i, colour: `var(--pastel-${codes.get(t.code_id)?.colour ?? 'blue'}-ink)` }));
        const sheet = paper(text, marks, null);
        sheet.addEventListener('mouseup', () => {
          const s = window.getSelection();
          if (!s || s.isCollapsed || !s.anchorNode || !s.focusNode) return;
          const a = offsetOf(s.anchorNode, s.anchorOffset);
          const b = offsetOf(s.focusNode, s.focusOffset);
          if (a === null || b === null) return;
          const range = trimRange(text, Math.min(a, b), Math.max(a, b));
          if (range) root.dispatchEvent(new CustomEvent('pm:select', { detail: { part, field, ...range } }));
          s.removeAllRanges();
        });
        sheets.append(sheet);
      }
    }
    for (const chip of palette.querySelectorAll<HTMLElement>('.mk-chip')) chip.classList.toggle('is-armed', armed?.id === chip.dataset.code);
    for (const b of rubric.querySelectorAll<HTMLElement>('.mk-step')) b.classList.toggle('is-on', steps[b.dataset.step!.split(':')[0]!] === b.dataset.step!.split(':')[1]);
    const counts = new Map<string, number>();
    for (const t of tags) counts.set(t.code_id, (counts.get(t.code_id) ?? 0) + 1);
    tally.textContent = [...counts].map(([id, n]) => `${codes.get(id)?.code} ${n}`).join(' · ') || 'No codes yet.';
    const run = (id: string) => { let n = 0; for (const list of [...d.recent_codes].reverse()) { if (!list.includes(id)) break; n += 1; } return n; };
    const flagged = [...counts.keys()].map((id) => [id, run(id)] as const).filter(([, n]) => n >= 3).sort((x, y) => y[1] - x[1])[0];
    warn.textContent = flagged ? `${codes.get(flagged[0])?.code} has come up on ${first(d.student.name)}’s last ${flagged[1]} pieces.` : '';
    retBtn.textContent = status === 'returned' ? 'Take back' : `Return to ${first(d.student.name)}`;
  }

  async function save(): Promise<void> {
    await act.save({ tags, comment: comment.value.trim(), steps });
  }

  root.append(bar, palette);
  const cols = el('div', 'mk-cols');
  cols.append(sheets, side);
  root.append(cols);
  paint();
  return root;
}
```

Add a tap on an existing highlight that opens a small menu: add a note, flip strength or growth, remove. Wire it with a `click` handler on `.pa-run--mark` that finds the tag by offset (the same lookup as in `returned-view.ts`). A11y: the palette chips are buttons, the steps are buttons with `aria-pressed`, and the comment has a label.

- [ ] **Step 5: Write `marking.css`**

Port the mockup's teacher marking styles: `.palette`, `.chipbtn`, `.cols`, `.side .box`, `.rub`, `.tally`, renamed to `mk-*`. At 900px and below, `.mk-cols` becomes one column.

- [ ] **Step 6: Add the route and page**

In `router.ts`, add a teacher route `mark` for `/mark/:classId/:columnId`, following the shape of an existing teacher route (look at how `/trash` is declared around line 243). In `main.ts`, the page:
1. calls `POST /api/classes/:classId/pieces { action: 'list', column_id }`
2. starts at the first student whose `status` is `waiting` (or the `?student=` query)
3. calls `load`, then mounts `markPieceView`

`move(±1)` loads the next or previous student who has handed in. `save`, `returnIt` and `takeBack` call the matching actions.

- [ ] **Step 7: Run the test**

Run: `npx vitest run tests/unit/mark-piece.test.ts --root apps/teaching`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/teaching/src/marking apps/teaching/src/blocks/peer-annotate.ts apps/teaching/src/app/router.ts apps/teaching/src/main.ts apps/teaching/tests/unit/mark-piece.test.ts
git commit -m "Mark written work: codes on the student's words, rubric steps, Return"
```

---

### Task 12: To mark view and Markbook links

**Files:**
- Create: `apps/teaching/src/marking/to-mark-view.ts`
- Modify: the Teaching home section that lists today's work (find it with `grep -rn "Today\|home" apps/teaching/src/teacher/sections/*.ts | head`), plus `apps/teaching/src/markbook/column-form.ts` and the Markbook column header
- Test: `apps/teaching/tests/unit/to-mark-view.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { toMarkView } from '@/marking/to-mark-view';

describe('to mark', () => {
  it('groups waiting and coming in, flags late work, links to marking', () => {
    const view = toMarkView([
      { class_id: 'c1', class_title: '12E1', column_id: 'col1', title: 'Paragraph 3', lesson_id: 'l1', block_id: 'b1', waiting: 9, handed_in: 24, roster: 24, oldest_at: '2026-10-24T00:00:00Z', late: true },
      { class_id: 'c1', class_title: '12E1', column_id: 'col2', title: 'Paragraph 4', lesson_id: 'l2', block_id: 'b2', waiting: 0, handed_in: 3, roster: 24, oldest_at: null, late: false }
    ]);
    expect([...view.querySelectorAll('.tm-group')].map((n) => n.textContent)).toEqual(['Waiting for feedback', 'Coming in']);
    expect(view.querySelector('.tm-task.is-late .tm-age')!.textContent).toMatch(/days/);
    expect((view.querySelector('.tm-task a') as HTMLAnchorElement).getAttribute('href')).toBe('/mark/c1/col1');
  });
});
```

- [ ] **Step 2: Run it and check it fails**

Run: `npx vitest run tests/unit/to-mark-view.test.ts --root apps/teaching`
Expected: FAIL.

- [ ] **Step 3: Write `to-mark-view.ts`**

```ts
import { el } from '@/quiz/dom';

export type ToMarkTask = { class_id: string; class_title: string; column_id: string; title: string; lesson_id: string; block_id: string; waiting: number; handed_in: number; roster: number; oldest_at: string | null; late: boolean };

const days = (iso: string) => Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 86400000));

export function toMarkView(tasks: ToMarkTask[]): HTMLElement {
  const root = el('section', 'tm');
  const waiting = tasks.filter((t) => t.waiting > 0);
  const open = tasks.filter((t) => t.waiting === 0);
  const total = waiting.reduce((n, t) => n + t.waiting, 0);
  root.append(el('h2', 'tm-title', 'To mark'), el('p', 'tm-sub', total ? `${total} pieces waiting` : 'Nothing waiting for feedback.'));
  for (const [title, list] of [['Waiting for feedback', waiting], ['Coming in', open]] as const) {
    if (!list.length) continue;
    root.append(el('p', 'tm-group', title));
    for (const t of list) {
      const row = el('div', `tm-task${t.late ? ' is-late' : ''}`);
      const link = el('a', 'tm-task__title', t.title);
      link.href = `/mark/${encodeURIComponent(t.class_id)}/${encodeURIComponent(t.column_id)}`;
      const where = el('p', 'tm-task__where', `${t.class_title} · ${t.handed_in} of ${t.roster} handed in`);
      const age = el('span', 'tm-age', t.oldest_at ? `${days(t.oldest_at)} days` : 'open');
      const count = el('span', 'tm-count', t.waiting ? `${t.waiting} left` : `${t.handed_in} in`);
      const text = el('div');
      text.append(link, where);
      row.append(text, age, count);
      root.append(row);
    }
  }
  return root;
}
```

- [ ] **Step 4: Mount it and add the link**

On Teaching home, mount the view from `GET /api/to-mark` in the existing home layout, above the week view.

In the Markbook column form (`column-form.ts`), for assessment columns add **Marked through a lesson**: a lesson picker (lessons of the class's units) and a block picker (that lesson's question-set and frame blocks), plus a short-name input. These set `column.piece`. Then:
- Add the criterion fields: concepts (chips from the syllabus alignment's `concepts` keys) and four "looks like" lines.
- In the column header of a linked column, add a **Mark** link to `/mark/:classId/:columnId` and the count of handed-in pieces still waiting.

- [ ] **Step 5: Run the test**

Run: `npx vitest run tests/unit/to-mark-view.test.ts --root apps/teaching`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/teaching/src/marking/to-mark-view.ts apps/teaching/src/markbook apps/teaching/src/teacher/sections apps/teaching/tests/unit/to-mark-view.test.ts
git commit -m "To mark on Teaching home; Markbook columns link a lesson block and open marking"
```

---

### Task 13: Analysis panel

**Files:**
- Create: `apps/teaching/src/markbook/analysis-panel.ts`
- Modify: `netlify/functions/_shared/markbook.mjs` (new action `analysis {student_id}`)
- Modify: `apps/teaching/src/markbook/student-panel.ts` (mount it)
- Test: `tests/unit/markbook-analysis.test.js`, `apps/teaching/tests/unit/analysis-panel.test.ts`

- [ ] **Step 1: Write the failing server test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { markbookAction } from '../../netlify/functions/_shared/markbook.mjs';
// storeFixture and setup as in tests/unit/profile-feedback.test.js (copy), with all 3 pieces returned

test('analysis returns the student rows and class patterns, teacher side', async () => {
  const { store, ava } = await setup();
  const out = await markbookAction(store, 'class1', { action: 'analysis', student_id: ava.id });
  assert.equal(out.student.outcomes[0].story.kind, 'holding');
  assert.ok(Array.isArray(out.class_patterns));
});
```

- [ ] **Step 2: Implement the action**

In `markbook.mjs`, inside `markbookActionInner`:

```js
  if (action === 'analysis') {
    const student = roster.students.find((s) => s.id === body.student_id) ?? reject(404, 'no_student', 'That student isn’t on this class list.');
    const library = await readFeedbackCodes(store);
    const progress = await progressFor(store, roster, student);
    const everyone = await mapBounded(roster.students, 4, async (s) => ({ id: s.id, pieces: await studentPieces(store, classId, s.id) }));
    return { student: progress, class_patterns: classPatterns(everyone, library).map((g) => ({ ...g, names: g.students.map((id) => roster.students.find((s) => s.id === id)?.name ?? id) })) };
  }
```

Import `progressFor` and `studentPieces` from `./profile-feedback.mjs`, `classPatterns` from `./progress-patterns.mjs`, `readFeedbackCodes`, and `mapBounded` from `./blobs-list.mjs`. Look out for a circular import: `profile-feedback.mjs` imports `readBook` from `markbook.mjs`. If Node complains, move `readBook` into a tiny `markbook-store.mjs` that both import.

- [ ] **Step 3: Run the server test**

Run: `node --test tests/unit/markbook-analysis.test.js`
Expected: PASS.

- [ ] **Step 4: Write the failing client test, then `analysis-panel.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { analysisPanel } from '@/markbook/analysis-panel';

describe('analysis panel', () => {
  it('writes what the data says for the teacher and lists class patterns', () => {
    const panel = analysisPanel({
      student: { pieces: [{ id: 'p1', label: 'Imagery', date: '6 Oct', kind: 'written' }], outcomes: [{ key: 'out:a', name: 'Analysis', sub: '', cells: ['building'], now: 'building', story: { kind: 'holding', step: 'building', count: 5, code_id: 'ts' }, looks: null }], concepts: [], skills: [], codes: [{ code_id: 'ts', code: 'TS', label: 'Topic sentence', colour: 'peach', positive: false, cells: [1], hit: 1, of: 1, total: 1, dropped: false }], next: [], unseen: 0 },
      class_patterns: [{ key: 'out:a', step: 'building', students: ['a', 'b', 'c'], names: ['Ava Nguyen', 'Noah Patel', 'Ella Chen'], code_id: 'ts' }]
    }, { outcomeName: () => 'Analysis', onGroup: () => {} });
    expect(panel.querySelector('.an-says')!.textContent).toContain('Holding at Building on Analysis for 5 pieces. TS each time.');
    expect(panel.querySelector('.an-class')!.textContent).toContain('3 students holding at Building on Analysis; top code TS');
    expect(panel.querySelector('[data-action="group"]')).not.toBeNull();
  });
});
```

Implement `analysisPanel(data, { outcomeName, onGroup })`:
- Reuse `stepChart`, `skillPath` and `codeGrid` from `@/progress/*`.
- Add a **What the data says** list, built from each row's story:
  - holding: "Holding at X on <name> for N pieces. <CODE> each time."
  - moved up: "Up to X on <name> since <piece label>."
  - concept or skill with 2 pieces or fewer: "<name> has just started showing up."
- Add **Class: holding on the same step**: one line per pattern, with a **Make a group** button (`data-action="group"`) that calls `onGroup(studentIds)`.

In `student-panel.ts`, add an **Analysis** heading and mount the panel from `POST /api/classes/:id/markbook { action: 'analysis', student_id }`. `onGroup` opens the existing group sets flow with those members preselected (look at how `save_group` is called from the Markbook UI).

Run: `npx vitest run tests/unit/analysis-panel.test.ts --root apps/teaching`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/_shared/markbook.mjs apps/teaching/src/markbook/analysis-panel.ts apps/teaching/src/markbook/student-panel.ts tests/unit/markbook-analysis.test.js apps/teaching/tests/unit/analysis-panel.test.ts
git commit -m "Markbook Analysis: the student's patterns and class holding groups"
```

---

### Task 14: Mock data, browser walk, gate, PR

**Files:**
- Modify: `apps/teaching/scripts/mock-api.ts`

- [ ] **Step 1: Mock routes and data**

In `mock-api.ts`, serve the following with invented data. Use the mockup's story: 6 pieces for one student, an Analysis row holding at Building with TS, Evidence Secure since the third piece, one skills strand, and a class pattern of 7 students.
- `/api/published/profile/:id` for actions `progress`, `returned`, `piece` and `seen`
- `/api/classes/:id/pieces`
- `/api/to-mark`
- `/api/classes/:id/markbook` `analysis`

Follow the file's existing handler style.

- [ ] **Step 2: Walk it in the browser**

Start the Teaching dev server with `preview_start` (the name is in `.claude/launch.json`). At desktop and at 390px (`resize_window` preset mobile), walk:
1. a student's Hand in on a marked block
2. To mark, then open the task
3. arm TS, select words, place Building, add a comment, Return
4. the student's Returned work, then open the piece and tap the highlight (See how shows)
5. My progress: next steps, labelled step charts, skills path with "N pieces", code grid with n/a, unit map
6. the Markbook student panel's Analysis, including Make a group

At 390px, check that nothing scrolls sideways (`document.documentElement.scrollWidth === innerWidth`). Fix what breaks. Take one screenshot per screen.

- [ ] **Step 3: Run the whole gate**

Run: `npm run pre-pr-check`
Expected: exit 0. If generated files are stale, run `node scripts/generate-alchemy-schema.mjs` and `node scripts/generate-block-css.mjs`, then rerun.

- [ ] **Step 4: Push and open the PR**

```bash
git push
gh pr create --title "Student progress and feedback: mark written work, Returned work, patterns over time" --body "$(cat <<'EOF'
Students see returned feedback and their progress patterns on the class profile page; the teacher marks typed work with codes and rubric steps.

- Hand in on lesson blocks a Markbook task links to
- Mark written work: codes on the student's words, rubric steps (Starting, Building, Secure, Extending; skills on the continuum rungs), comment, Return / Take back
- To mark queue across classes
- Student page: next steps from codes, labelled step charts per outcome and concept, skills path, code counts per piece, Returned work, annotated piece view
- Markbook Analysis: the same patterns for the teacher plus class holding groups
- Viva sets and feedback notes reach the student's page; the old four bars are replaced

Spec: docs/superpowers/specs/2026-10-30-student-progress-feedback-design.md
Mockup: docs/mockups/student-progress/student-progress.html

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Then enable auto-merge (merge commit), per CLAUDE.md, and bind the PR with the `ccd_pr` tools.

---

## Self-review notes

- **Spec coverage:**

  | Spec item | Task |
  |---|---|
  | Hand in | 4 |
  | Marking screen | 11 |
  | To mark | 6, 12 |
  | Return and take back | 5 |
  | Steps and rungs | 1 |
  | Patterns | 2 |
  | Criterion concepts and "looks like" | 3 |
  | Outcome short name | 3 |
  | Code See how | 3 |
  | Student page sections | 9, 10 |
  | Returned work and piece views | 7, 10 |
  | Viva and notes | 8 |
  | Seen | 7, 8 |
  | Analysis and class patterns | 13 |
  | Bars removed, bug gone | 7 |
  | Continuum stays private (two lines only) | 7 |
  | Browser walk and gate | 14 |

- **Out of scope, per the spec:** uploads, replies, Ann.
- **Names used across tasks:**
  - `pieceKey`, `piecePrefix` and `piecesAction` (Task 5) are used in Tasks 6, 7 and 8.
  - `handinKey` and `pieceId` (Task 4) are used in Tasks 5 and 7.
  - `studentPieces` and `progressFor` (Task 7) are used in Task 13.
  - `targetRow`, `codeGrid`, `nextSteps` and `classPatterns` (Task 2) are used in Tasks 7 and 13.
  - Client types (Task 9) are used in Tasks 10 and 13.
