# Quiz Insights and Follow-through Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every quiz and assessment turns into tagged evidence records; the quiz Results tab, a markbook Patterns view and a student panel read them to show descriptive statistics, weak and secure techniques/outcomes/skills, why answers were wrong, confidence patterns, flags, and an Ann-drafted follow-up quiz for flagged students.

**Architecture:** One shared adapter (`apps/teaching/src/quiz/evidence.ts`, bundled to the server) turns each marked answer into `EvidenceItem`s. The server's new `insight` quiz action returns a per-class `InsightPayload`; closed, fully marked quizzes save the heavy part at `quiz/{lesson}/evidence/{classId}`. Pure client modules in `apps/teaching/src/evidence/` compute statistics and patterns; views render them in the quiz Results tab and the markbook.

**Tech Stack:** TypeScript (Vite app, vitest), Netlify functions (ESM, node:test), zod, Netlify Blobs, esbuild generators (`scripts/generate-alchemy-schema.mjs`, `scripts/generate-teaching-ai-runtime.mjs`).

**Spec:** `docs/superpowers/specs/2026-10-23-quiz-insights-design.md`

---

## Decisions made while planning (differences from the spec)

Reading the code turned up four things the spec didn't know. These are the plan's answers; they keep the spec's behaviour.

1. **Published keys use random option ids and drop `technique_id`.** `splitQuestion` now records `techniques: { publicOptionId: techniqueId }` and `skills` on the key. Keys published before this change have no map, so the adapter falls back to a name tag `tech:~{normalised option text}`; the client resolves names against the technique catalogue. Adam's existing pre-test therefore works without republishing.
2. **Families are resolved on the client.** The catalogue (`literary-elements.json`, 177 KB) is not bundled to the server. The adapter emits `tech:` tags only; `expandTags` adds `fam:` tags in the browser.
3. **The saved copy holds attempts only, per class**, at `quiz/{lesson}/evidence/{classId}` (or `/all` for a class-less view), with the record version it was built from. Statistics are computed in the browser from it. Siblings, follow-ups and dismissed flags are read live on each call, so they never go stale.
4. **Quiz settings reach students only on publish** (`draft.quiz` → `record.settings`). So **Close now** writes `quiz/{lesson}/closed` instead of editing `closes_at`; **Reopen** deletes it. `compare_with` is read from the draft (teacher-only, no publish needed). `for_students`, `follow_up_of` and `follow_up_flag` are set when the follow-up lesson is created, so its first publish carries them.

5. **No new Ann recipe.** The follow-up reuses Ann's existing lesson job: the app creates the draft lesson itself (title, place, quiz settings), then starts an Ann job on it with a brief built from the evidence. The brief says "go ahead", which the runner already treats as a confirmed plan, because the teacher confirmed it in the plan sheet. Ann's questions then arrive as a proposal in that lesson's AI panel, which Adam accepts and reviews as usual.
6. **The student panel shows the overall mark**; the quiz sparkline stays on the student's grid row, where it already is.

Also: the Results tab today mixes every class and every go. The new insight section uses **each student's first attempt in one class**, matching the markbook, with a class picker when the lesson belongs to more than one class.

## File map

**Phase 1 — tags and adapters**
- Modify `apps/teaching/src/quiz/core.ts` — `skills` on questions; `skills`, `techniques` on keys; export `spotList`; new quiz settings fields.
- Create `apps/teaching/src/quiz/evidence.ts` — `answerEvidence`, `techTag`, `EvidenceItem`, `Why`.
- Modify `scripts/generate-alchemy-schema.mjs` — bundle `quiz/evidence.ts` to `netlify/functions/_shared/quiz-evidence.mjs`.
- Create `apps/teaching/src/skills/select.ts` — shared skill `<select>` (moved out of `column-form.ts`).
- Modify `apps/teaching/src/markbook/column-form.ts`, `apps/teaching/src/quiz/builder.ts`.
- Tests: `tests/unit/quiz-core.test.js` (extend), `tests/unit/quiz-evidence.test.js` (new).

**Phase 2 — statistics**
- Create `apps/teaching/src/evidence/constants.ts`, `types.ts`, `tags.ts`, `stats.ts`, `patterns.ts`.
- Tests: `apps/teaching/tests/unit/evidence-stats.test.ts`, `evidence-patterns.test.ts`, `evidence-tags.test.ts`.

**Phase 3 — server**
- Modify `netlify/functions/_shared/quiz.mjs` — codes on marks, `insight`/`close`/`reopen`/`dismiss_flag` actions, saved copies, `for_students`, `classInsight`, `classQuizScores` on top of it.
- Modify `netlify/functions/lessons.mjs` — `after_lesson_id`, quiz settings on create.
- Modify `apps/teaching/src/markbook/schema.ts` (+ regenerate `markbook-schema.mjs`) — criterion `codes`, markbook `focus`.
- Modify `netlify/functions/_shared/markbook.mjs` — `set_focus`, quiz rows carry `items`, `closed`.
- Tests: `tests/unit/quiz.test.js`, `tests/unit/markbook.test.js`, `tests/unit/lessons-follow-up.test.js` (new).

**Phase 4 — quiz Results view**
- Create `apps/teaching/src/evidence/views/parts.ts`, `views/quiz-insight.ts`, `views/insight.css`, `apps/teaching/src/evidence/api.ts`, `apps/teaching/src/evidence/context.ts`.
- Modify `apps/teaching/src/quiz/teacher-panel.ts`.
- Tests: `apps/teaching/tests/unit/evidence-views.test.ts`.

**Phase 5 — markbook Patterns and student panel**
- Create `apps/teaching/src/evidence/markbook-evidence.ts`, `apps/teaching/src/markbook/patterns-view.ts`, `apps/teaching/src/markbook/student-panel.ts`.
- Modify `apps/teaching/src/markbook/types.ts`, `api.ts`, `grid.ts`, `markbook.css`, `apps/teaching/src/teacher/sections/markbook.ts`.
- Delete `apps/teaching/src/markbook/outcomes-view.ts` (Patterns replaces it).
- Tests: `apps/teaching/tests/unit/markbook-patterns.test.ts`, update `markbook-views.test.ts`, `markbook-section.test.ts`.

**Phase 6 — feedback-code chips**
- Create `apps/teaching/src/evidence/code-chips.ts`.
- Modify `apps/teaching/src/quiz/teacher-panel.ts` (attempt view), `apps/teaching/src/markbook/assessment-panel.ts`.
- Tests: `apps/teaching/tests/unit/evidence-code-chips.test.ts`, extend `markbook-panel.test.ts`.

**Phase 7 — follow-up flow**
- Create `apps/teaching/src/evidence/follow-up.ts`.
- Modify `apps/teaching/src/evidence/views/quiz-insight.ts`, `apps/teaching/src/markbook/patterns-view.ts`.
- Tests: `apps/teaching/tests/unit/evidence-follow-up.test.ts`.

**Finish** — regenerate, `npm run pre-pr-check`, browser walk at 1280px and 390px, PR with auto-merge.

## Commands used throughout

- Teaching unit tests (vitest): `cd apps/teaching && npx vitest run tests/unit/<file>`
- Server tests (node:test): `node --import ./scripts/test-network-guard.mjs --test tests/unit/<file>.test.js` (from repo root)
- Regenerate server bundles after any change to `apps/teaching/src/quiz/core.ts`, `apps/teaching/src/quiz/evidence.ts` or `apps/teaching/src/markbook/schema.ts`: `node scripts/generate-alchemy-schema.mjs && node scripts/generate-teaching-ai-runtime.mjs`
- Types: `cd apps/teaching && npx tsc --noEmit -p .`

Fixtures use invented names only (public repo).

---

# Phase 1 — Tags and adapters

### Task 1: `skills` on questions; `skills` and `techniques` on keys

**Files:**
- Modify: `apps/teaching/src/quiz/core.ts` (the `base` object near line 115, `QuestionKey` near line 482, `splitQuestion` near line 540, `spotList` near line 859)
- Test: `tests/unit/quiz-core.test.js`

- [ ] **Step 1: Write the failing tests** — append to `tests/unit/quiz-core.test.js`:

```js
test('keys carry skills and the technique of each public option', () => {
  const q = {
    id: 'qt', kind: 'quote_technique', prompt: 'Which technique?', marks: 1, quote: 'The wind sang.',
    skills: ['reading.inference'],
    options: [{ id: 'a', text: 'Personification', technique_id: 'personification' }, { id: 'b', text: 'Simile', technique_id: 'simile' }, { id: 'c', text: 'Rhyme' }],
    correct: ['a']
  };
  const checked = checkQuestion(q);
  assert.equal(checked.ok, true);
  const { question, key } = splitQuestion(checked.question, seeded());
  assert.deepEqual(key.skills, ['reading.inference']);
  const byText = Object.fromEntries(question.options.map((o) => [o.text, o.id]));
  assert.deepEqual(key.techniques, { [byText.Personification]: 'personification', [byText.Simile]: 'simile' });
});

test('spot_technique keys map option ids to techniques', () => {
  const q = {
    id: 'sp', kind: 'spot_technique', prompt: 'Find them.', marks: 2, passage: 'The sea roared like a lion. The moon was a coin.',
    options: [{ id: 'o1', text: 'Simile', technique_id: 'simile' }, { id: 'o2', text: 'Metaphor', technique_id: 'metaphor' }],
    targets: [{ id: 't1', quote: 'roared like a lion', correct: ['o1'] }, { id: 't2', quote: 'was a coin', correct: ['o2'] }]
  };
  const checked = checkQuestion(q);
  assert.equal(checked.ok, true);
  const { question, key } = splitQuestion(checked.question, seeded());
  const byText = Object.fromEntries(question.options.map((o) => [o.text, o.id]));
  assert.deepEqual(key.techniques, { [byText.Simile]: 'simile', [byText.Metaphor]: 'metaphor' });
});

test('a question with no technique ids or skills keeps a bare key', () => {
  const { key } = splitQuestion(samples.multiple_choice, seeded());
  assert.equal('techniques' in key, false);
  assert.equal('skills' in key, false);
});

test('a skill must be strand.sub', () => {
  assert.equal(checkQuestion({ ...samples.true_false, skills: ['Reading'] }).ok, false);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --import ./scripts/test-network-guard.mjs --test tests/unit/quiz-core.test.js`
Expected: the four new tests FAIL (`key.skills` undefined; `checkQuestion` accepts `Reading`).

- [ ] **Step 3: Implement in `apps/teaching/src/quiz/core.ts`**

In `base`, after `outcomes`:

```ts
  /** Skills-continuum sub-strands, `strand.sub`, for insights. */
  skills: z.array(z.string().regex(/^[a-z]{3,20}\.[a-z-]{2,40}$/, 'Pick a skill from the list.')).max(8).optional()
```

In `QuestionKey`, after `outcomes?: string[];`:

```ts
  skills?: string[];
  /** Public option id → technique catalogue id, for technique questions. */
  techniques?: Record<string, string>;
```

Above `splitQuestion`, add:

```ts
/** Each public option's technique, for the options that name one. */
function techniquesOf(options: ReadonlyArray<{ id: string; technique_id?: string }>, ids: Map<string, string>): { techniques?: Record<string, string> } {
  const map: Record<string, string> = {};
  for (const o of options) if (o.technique_id) map[ids.get(o.id) as string] = o.technique_id;
  return Object.keys(map).length ? { techniques: map } : {};
}
```

In `splitQuestion`'s `keyHead`, after the `outcomes` spread:

```ts
    ...(q.skills?.length ? { skills: [...q.skills] } : {})
```

In the `multiple_choice | multi_select | odd_one_out | quote_technique` case, change the return's key to:

```ts
      return {
        question,
        key: { ...keyHead, ...(q.kind === 'quote_technique' ? techniquesOf(q.options, ids) : {}), answer: { type: 'choice', ids: q.correct.map((id) => ids.get(id) as string) } }
      };
```

In the `spot_technique` case, change the key to:

```ts
        key: { ...keyHead, ...techniquesOf(q.options, ids), answer: { type: 'spots', passage: q.passage, targets, pick } }
```

Change `function spotList(v: unknown): Spot[]` to `export function spotList(v: unknown): Spot[]`.

- [ ] **Step 4: Regenerate and run**

Run: `node scripts/generate-alchemy-schema.mjs && node scripts/generate-teaching-ai-runtime.mjs && node --import ./scripts/test-network-guard.mjs --test tests/unit/quiz-core.test.js`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/teaching/src/quiz/core.ts netlify/functions/_shared/quiz-core.mjs netlify/functions/_shared/teaching-ai-runtime.mjs tests/unit/quiz-core.test.js
git commit -m "Teaching quiz: skills on questions, technique map on keys"
```

### Task 2: Evidence adapter

**Files:**
- Create: `apps/teaching/src/quiz/evidence.ts`
- Modify: `scripts/generate-alchemy-schema.mjs`
- Test: `tests/unit/quiz-evidence.test.js` (new)

- [ ] **Step 1: Write the failing test** — create `tests/unit/quiz-evidence.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkQuestion, markResponse, splitQuestion } from '../../netlify/functions/_shared/quiz-core.mjs';
import { answerEvidence, techTag } from '../../netlify/functions/_shared/quiz-evidence.mjs';

function seeded(seed = 7) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}
const split = (q) => {
  const checked = checkQuestion(q);
  assert.equal(checked.ok, true, checked.message);
  return splitQuestion(checked.question, seeded());
};
const idOf = (question, text) => question.options.find((o) => o.text === text).id;
const run = ({ question, key }, response, extra = {}) => {
  const mark = markResponse(key, response);
  return answerEvidence({ question, key, response, awarded: mark.score, ...extra });
};

test('techTag uses the id, else the normalised name', () => {
  assert.equal(techTag('simile', 'Simile'), 'tech:simile');
  assert.equal(techTag(undefined, '  Personification. '), 'tech:~personification');
});

test('quote_technique: a wrong pick is named-as the picked technique', () => {
  const s = split({
    id: 'q1', kind: 'quote_technique', prompt: 'Which?', marks: 2, quote: 'The wind sang.', outcomes: ['EN5-RVL-01'], skills: ['reading.inference'],
    options: [{ id: 'a', text: 'Personification', technique_id: 'personification' }, { id: 'b', text: 'Metaphor', technique_id: 'metaphor' }],
    correct: ['a']
  });
  const [item] = run(s, { selected: [idOf(s.question, 'Metaphor')] });
  assert.equal(item.item, 'q1');
  assert.equal(item.share, 0);
  assert.deepEqual(item.tags.sort(), ['out:EN5-RVL-01', 'skill:reading.inference', 'tech:personification'].sort());
  assert.deepEqual(item.why, [{ type: 'named', as: 'tech:metaphor', target: 'tech:personification' }]);
  const [right] = run(s, { selected: [idOf(s.question, 'Personification')] });
  assert.equal(right.share, 1);
  assert.deepEqual(right.why, []);
});

test('options without technique ids fall back to name tags', () => {
  const s = split({ id: 'q2', kind: 'quote_technique', prompt: 'Which?', marks: 1, quote: 'Buzz.', options: [{ id: 'a', text: 'Onomatopoeia' }, { id: 'b', text: 'Simile' }], correct: ['a'] });
  const [item] = run(s, { selected: [idOf(s.question, 'Simile')] });
  assert.deepEqual(item.why, [{ type: 'named', as: 'tech:~simile', target: 'tech:~onomatopoeia' }]);
});

test('multiple choice: a wrong pick is an option why with its text', () => {
  const s = split({ id: 'q3', kind: 'multiple_choice', prompt: 'Which?', marks: 1, options: [{ id: 'a', text: 'Red' }, { id: 'b', text: 'Blue' }], correct: ['a'] });
  const blue = idOf(s.question, 'Blue');
  const [item] = run(s, { selected: [blue] }, { fallbackOutcomes: ['EN5-ECA-01'] });
  assert.deepEqual(item.tags, ['out:EN5-ECA-01']);
  assert.deepEqual(item.why, [{ type: 'option', id: blue, text: 'Blue' }]);
});

test('spot_technique: one item per target, found-but-misnamed is half, unfound is not_found', () => {
  const s = split({
    id: 'q4', kind: 'spot_technique', prompt: 'Find both.', marks: 2, passage: 'The sea roared like a lion. The moon was a coin.',
    options: [{ id: 'o1', text: 'Simile', technique_id: 'simile' }, { id: 'o2', text: 'Metaphor', technique_id: 'metaphor' }],
    targets: [{ id: 't1', quote: 'roared like a lion', correct: ['o1'] }, { id: 't2', quote: 'was a coin', correct: ['o2'] }]
  });
  // Words: The(0) sea(1) roared(2) like(3) a(4) lion.(5) The(6) moon(7) was(8) a(9) coin.(10)
  const items = run(s, { spots: [{ from: 2, to: 5, option: idOf(s.question, 'Metaphor') }] });
  assert.equal(items.length, 2);
  const [simile, metaphor] = items;
  assert.equal(simile.item, 'q4#0');
  assert.equal(simile.share, 0.5);
  assert.deepEqual(simile.why, [{ type: 'named', as: 'tech:metaphor', target: 'tech:simile' }]);
  assert.equal(metaphor.item, 'q4#1');
  assert.equal(metaphor.share, 0);
  assert.deepEqual(metaphor.why, [{ type: 'not_found', target: 'tech:metaphor' }]);
});

test('ordering and matching: misplaced items are placement whys', () => {
  const s = split({ id: 'q5', kind: 'ordering', prompt: 'Order them.', marks: 1, items: [{ id: 'a', text: 'First' }, { id: 'b', text: 'Second' }, { id: 'c', text: 'Third' }] });
  const ids = s.key.answer.ids;
  const [item] = run(s, { order: [ids[1], ids[0], ids[2]] });
  assert.deepEqual(item.why.map((w) => w.text).sort(), ['First', 'Second']);
});

test('hand-marked answers: codes are the why, only below full marks', () => {
  const s = split({ id: 'q6', kind: 'extended_response', prompt: 'Explain.', marks: 4 });
  const [low] = answerEvidence({ ...s, response: { text: 'Because.' }, awarded: 2, codes: ['code-e'] });
  assert.equal(low.share, 0.5);
  assert.deepEqual(low.why, [{ type: 'code', id: 'code-e' }]);
  const [full] = answerEvidence({ ...s, response: { text: 'Because.' }, awarded: 4, codes: ['code-e'] });
  assert.deepEqual(full.why, []);
  const [waiting] = answerEvidence({ ...s, response: { text: 'Because.' }, awarded: null });
  assert.equal(waiting.share, null);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --import ./scripts/test-network-guard.mjs --test tests/unit/quiz-evidence.test.js`
Expected: FAIL — cannot find module `quiz-evidence.mjs`.

- [ ] **Step 3: Create `apps/teaching/src/quiz/evidence.ts`**

```ts
import { matchSpots, norm, passageWords, spotList, type PublicQuestion, type QuestionKey } from './core';

/**
 * Evidence: what one marked answer says about each thing it tests. One
 * adapter per answer type, so every insight view reads the same records
 * whatever the quiz kind. Shared with the server (quiz-evidence.mjs).
 */

export type Why =
  | { type: 'option'; id: string; text: string }
  | { type: 'named'; as: string; target: string }
  | { type: 'not_found'; target: string }
  | { type: 'placement'; id: string; text: string }
  | { type: 'code'; id: string };

/** One thing an answer tells us: tags, share of marks (null while waiting to be marked), and why marks were lost. */
export type EvidenceItem = { item: string; tags: string[]; share: number | null; why: Why[] };

export type AnswerInput = {
  question: PublicQuestion;
  key: QuestionKey;
  response: unknown;
  /** Marks after hints and teacher marking; null while waiting. */
  awarded: number | null;
  /** Teacher feedback-code ids on this answer. */
  codes?: string[];
  /** The lesson's outcomes, for questions without their own. */
  fallbackOutcomes?: string[];
};

/** A technique tag: the catalogue id when known, else the normalised name for the browser to resolve. */
export function techTag(id: string | undefined, text: string): string {
  return id ? `tech:${id}` : `tech:~${norm(text)}`;
}

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const unique = (xs: string[]): string[] => [...new Set(xs)];

/** The text of a public option, segment, item, label or left-hand side. */
function textOf(question: PublicQuestion, id: string): string {
  const q = question as unknown as Record<string, unknown>;
  for (const field of ['options', 'segments', 'items', 'labels', 'left', 'right', 'groups']) {
    const list = q[field];
    if (!Array.isArray(list)) continue;
    const hit = (list as Array<{ id?: string; text?: string }>).find((o) => o?.id === id);
    if (hit) return String(hit.text ?? '');
  }
  if (question.kind === 'label_image') {
    const pin = question.pins.find((p) => p.id === id);
    if (pin) return `Pin ${pin.n}`;
  }
  return '';
}

/** The technique tag of a public option, on technique kinds only. */
function techOf(question: PublicQuestion, key: QuestionKey, optionId: string): string | null {
  if (question.kind !== 'quote_technique' && question.kind !== 'spot_technique') return null;
  const id = key.techniques?.[optionId];
  const text = textOf(question, optionId);
  if (!id && !text.trim()) return null;
  return techTag(id || undefined, text);
}

export function answerEvidence(input: AnswerInput): EvidenceItem[] {
  const { question, key } = input;
  const base = [
    ...(key.outcomes?.length ? key.outcomes : input.fallbackOutcomes ?? []).map((o) => `out:${o}`),
    ...(key.skills ?? []).map((s) => `skill:${s}`)
  ];
  const codes: Why[] = (input.codes ?? []).map((id) => ({ type: 'code', id }));
  const share = input.awarded === null ? null : key.marks > 0 ? Math.min(1, Math.max(0, input.awarded / key.marks)) : null;
  const r = isRecord(input.response) ? input.response : {};
  const a = key.answer;
  const one = (tags: string[], why: Why[]): EvidenceItem[] => [
    { item: key.id, tags: unique([...base, ...tags]), share, why: share === null || share >= 1 ? [] : [...why, ...codes] }
  ];

  switch (a.type) {
    case 'spots':
      return spotEvidence(input, a, base, codes);
    case 'choice': {
      const right = new Set(a.ids);
      const targets = a.ids.map((id) => techOf(question, key, id)).filter((t): t is string => !!t);
      const why = strings(r.selected)
        .filter((id) => !right.has(id))
        .map((id): Why => {
          const as = techOf(question, key, id);
          return as && targets[0] ? { type: 'named', as, target: targets[0] } : { type: 'option', id, text: textOf(question, id) };
        });
      return one(targets, why);
    }
    case 'map': {
      const given = isRecord(r.map) ? r.map : {};
      const why = Object.entries(a.map)
        .filter(([from, to]) => given[from] !== to)
        .map(([from]): Why => ({ type: 'placement', id: from, text: textOf(question, from) }));
      return one([], why);
    }
    case 'order': {
      const given = strings(r.order);
      const why = a.ids.filter((id, i) => given[i] !== id).map((id): Why => ({ type: 'placement', id, text: textOf(question, id) }));
      return one([], why);
    }
    default:
      return one([], []);
  }
}

/**
 * One item per target, so a passage testing a simile and a metaphor counts
 * towards each. Right words, right name: 1. Right words, wrong name: 0.5.
 * Missed: 0, but only when students had to find every target; with
 * "find any N", targets nobody was asked to find aren't counted.
 * The per-target shares follow the automatic marking, not a teacher override.
 */
function spotEvidence(input: AnswerInput, a: Extract<QuestionKey['answer'], { type: 'spots' }>, base: string[], codes: Why[]): EvidenceItem[] {
  const { question, key } = input;
  const r = isRecord(input.response) ? input.response : {};
  const spots = spotList(r.spots).slice(0, a.pick);
  const found = matchSpots(passageWords(a.passage), spots, a.targets);
  const every = a.pick >= a.targets.length;
  const out: EvidenceItem[] = [];
  a.targets.forEach((target, t) => {
    const techs = target.ids.map((id) => techOf(question, key, id)).filter((x): x is string => !!x);
    const tags = unique([...base, ...techs]);
    const first = techs[0];
    const item = `${key.id}#${t}`;
    const at = found.findIndex((f) => f === t);
    if (at === -1) {
      if (every) out.push({ item, tags, share: 0, why: [...(first ? [{ type: 'not_found', target: first } as Why] : []), ...codes] });
      return;
    }
    const spot = spots[at] as (typeof spots)[number];
    const named = target.ids.includes(spot.option);
    const as = techOf(question, key, spot.option);
    out.push({ item, tags, share: named ? 1 : 0.5, why: named ? [] : [...(as && first ? [{ type: 'named', as, target: first } as Why] : []), ...codes] });
  });
  return out;
}
```

- [ ] **Step 4: Add the bundle** — in `scripts/generate-alchemy-schema.mjs`, after the `quiz/core.ts` build block, add:

```js
await build({
  entryPoints: ['apps/teaching/src/quiz/evidence.ts'],
  outfile: 'netlify/functions/_shared/quiz-evidence.mjs',
  bundle: true, platform: 'node', format: 'esm', external: ['zod'],
  banner: {js:'// Generated from apps/teaching/src/quiz/evidence.ts; regenerate with scripts/generate-alchemy-schema.mjs.'}
});
```

- [ ] **Step 5: Regenerate and run**

Run: `node scripts/generate-alchemy-schema.mjs && node --import ./scripts/test-network-guard.mjs --test tests/unit/quiz-evidence.test.js`
Expected: all PASS. If the spot test's word indexes are off, print `passageWords(passage)` from quiz-core.mjs and correct the `from`/`to` in the test, not the adapter.

- [ ] **Step 6: Check pre-pr-check knows the new generated file**

Run: `grep -n "quiz-core.mjs" scripts/pre-pr-check.mjs scripts/*.mjs | head`
If a freshness list names `quiz-core.mjs`, add `quiz-evidence.mjs` beside it in the same form.

- [ ] **Step 7: Commit**

```bash
git add apps/teaching/src/quiz/evidence.ts scripts/generate-alchemy-schema.mjs netlify/functions/_shared/quiz-evidence.mjs tests/unit/quiz-evidence.test.js scripts/pre-pr-check.mjs
git commit -m "Teaching quiz: evidence adapter for every answer type"
```

### Task 3: Skill picker in the question builder

**Files:**
- Create: `apps/teaching/src/skills/select.ts`
- Modify: `apps/teaching/src/markbook/column-form.ts:47-66`, `apps/teaching/src/quiz/builder.ts` (options type ~line 43, student strip ~line 59, the "more" section ~line 1079)
- Test: `apps/teaching/tests/unit/skills-select.test.ts` (new)

- [ ] **Step 1: Write the failing test** — `apps/teaching/tests/unit/skills-select.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { skillSelect } from '@/skills/select';
import type { SkillsContinuum } from '@/skills/schema';

const skills = {
  strands: [{ strand: 'reading', name: 'Reading', sub_strands: [{ id: 'inference', name: 'Inference' }] }]
} as unknown as SkillsContinuum;

describe('skillSelect', () => {
  it('lists sub-strands as strand.sub and keeps the value', () => {
    const s = skillSelect('reading.inference', skills, 'x');
    expect([...s.options].map((o) => o.value)).toEqual(['', 'reading.inference']);
    expect(s.value).toBe('reading.inference');
    expect(s.className).toBe('x');
  });
  it('keeps a saved value while the list loads', () => {
    const s = skillSelect('reading.inference', null, 'x');
    expect(s.value).toBe('reading.inference');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/teaching && npx vitest run tests/unit/skills-select.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `apps/teaching/src/skills/select.ts`** (moved from `column-form.ts`, class name now a parameter):

```ts
import { el } from '@/quiz/dom';
import type { SkillsContinuum } from './schema';

/** A skill picker: none, or one sub-strand grouped by strand. Keeps a saved skill even before the list loads. */
export function skillSelect(value: string, skills: SkillsContinuum | null, className: string): HTMLSelectElement {
  const select = el('select', className);
  const none = el('option', undefined, skills ? 'No skill' : value ? value : 'Skills are loading…');
  none.value = skills ? '' : value;
  select.append(none);
  for (const strand of skills?.strands ?? []) {
    const group = el('optgroup');
    group.label = strand.name;
    for (const sub of strand.sub_strands) {
      const opt = el('option', undefined, sub.name);
      opt.value = `${strand.strand}.${sub.id}`;
      group.append(opt);
    }
    select.append(group);
  }
  select.value = value;
  return select;
}
```

In `column-form.ts`, delete the local `skillSelect` function, import `{ skillSelect } from '@/skills/select'`, and change each call `skillSelect(v, skills)` to:

```ts
(() => {
  const s = skillSelect(v, skills, 'mb-form__input mb-form__skill');
  s.name = 'criterion-skill';
  return s;
})()
```

(Keep whatever variable names the call sites already use for `v` and `skills`.)

- [ ] **Step 4: Builder field.** In `apps/teaching/src/quiz/builder.ts`:

Add imports:

```ts
import { loadSkills } from '@/skills/api';
import { skillSelect } from '@/skills/select';
```

In `mountQuestionBuilder`, beside `if (options.audience === 'student') delete q.outcomes;` add `delete q.skills;` inside the same condition:

```ts
  if (options.audience === 'student') {
    delete q.outcomes;
    delete q.skills;
  }
```

Directly after the `if (offersOutcomes && options.outcomes) { … }` block, add:

```ts
    if (!student) {
      const pick = skillSelect(q.skills?.[0] ?? '', null, 'qz-input qz-skill');
      const field = labelled('Skill (optional)', pick, 'For insights. Republish for changes to count.');
      const fill = (skills: Parameters<typeof skillSelect>[1]) => {
        const next = skillSelect(q.skills?.[0] ?? '', skills, 'qz-input qz-skill');
        next.addEventListener('change', onPick);
        pick.replaceWith(next);
      };
      function onPick(this: HTMLSelectElement) {
        if (this.value) q.skills = [this.value];
        else delete q.skills;
        emit();
      }
      pick.addEventListener('change', onPick);
      void loadSkills().then(fill, () => undefined);
      more.append(field);
    }
```

(`student` is the existing boolean used in `offersOutcomes`; if the builder names it differently, use that name.)

- [ ] **Step 5: Run tests and types**

Run: `cd apps/teaching && npx vitest run tests/unit/skills-select.test.ts tests/unit/markbook-form.test.ts && npx tsc --noEmit -p .`
Expected: PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add apps/teaching/src/skills/select.ts apps/teaching/src/markbook/column-form.ts apps/teaching/src/quiz/builder.ts apps/teaching/tests/unit/skills-select.test.ts
git commit -m "Teaching quiz: optional skill on each question"
```

# Phase 2 — Statistics

### Task 4: Constants and types

**Files:**
- Create: `apps/teaching/src/evidence/constants.ts`, `apps/teaching/src/evidence/types.ts`

- [ ] **Step 1: Create `apps/teaching/src/evidence/constants.ts`**

```ts
/** Every threshold the insight views use, in one place so they can be tuned. Shares are 0–1. */
export const BANDS = {
  /** A tag below this is Weak. */
  weak: 0.5,
  /** At or above this (and confident enough, when asked) is Secure. */
  secure: 0.8,
  secureConfidence: 2.5,
  /** A tag needs this many questions before it gets a band. */
  minQuestions: 2,
  /** A student needs this many items on a tag to be put in a group. */
  groupMin: 2
} as const;

export const FOCUS = { below: 0.6, minItems: 3, max: 3, secureMinItems: 3 } as const;

export const FLAGS = {
  /** Students sure (3) but below full marks on one tag. */
  sureWrongStudents: 2,
  /** Share of full-mark answers given at confidence 1. */
  guessShare: 0.25,
  guessMin: 2
} as const;

export const ITEM = {
  alphaMinAttempts: 5,
  alphaMinItems: 3,
  discriminationMinAttempts: 10,
  tooEasy: 0.95,
  tooHard: 0.05
} as const;

export const FOLLOW_UP = {
  defaultCount: 5,
  min: 3,
  max: 10,
  /** From recorded Ann quiz builds (US$0.26–0.36 for about 10 questions, 21 Oct 2026). */
  cost: 'about A$0.30 to A$0.55'
} as const;
```

- [ ] **Step 2: Create `apps/teaching/src/evidence/types.ts`**

```ts
import type { EvidenceItem, Why } from '@/quiz/evidence';

export type { EvidenceItem, Why };
export type Confidence = 1 | 2 | 3 | null;
export type TagKind = 'tech' | 'fam' | 'out' | 'skill';
export const TAG_KINDS: TagKind[] = ['tech', 'fam', 'out', 'skill'];
export const TAG_KIND_LABEL: Record<TagKind, string> = { tech: 'Technique', fam: 'Family', out: 'Outcome', skill: 'Skill' };

/** An evidence item placed: whose, from where, when, how sure. */
export type Evidence = EvidenceItem & { student: string; source: string; date: string; confidence: Confidence };

export type InsightRow = {
  id: string;
  awarded: number | null;
  max: number;
  confidence: Confidence;
  codes: string[];
  outcomes: string[];
  items: EvidenceItem[];
};
export type InsightAttempt = { student: string; attempt_id: string; submitted_at: string; score: number; max: number; pending: number; rows: InsightRow[] };
export type InsightQuestion = { id: string; prompt: string; marks: number; kind: string; outcomes: string[] };
export type InsightStudent = { id: string; name: string; initials: string };

/** What the quiz `insight` action returns for one class (or all attempts when `class_id` is null). */
export type InsightPayload = {
  lesson_id: string;
  title: string;
  unit_id: string;
  record_version: string;
  class_id: string | null;
  closed: boolean;
  closed_by: 'button' | 'date' | null;
  built_at: string;
  saved: boolean;
  confidence: boolean;
  students: InsightStudent[];
  questions: InsightQuestion[];
  attempts: InsightAttempt[];
  compare_with: string | null;
  follow_up_of: string | null;
  follow_up_flag: string | null;
  for_students: string[];
  dismissed: string[];
  follow_ups: Array<{ lesson_id: string; title: string; flag: string | null }>;
  siblings: Array<{ lesson_id: string; title: string }>;
};

export type Band = 'weak' | 'developing' | 'secure' | 'thin';
export type StudentBand = Exclude<Band, 'thin'>;

export type TagRow = {
  tag: string;
  mean: number;
  /** Share of items with full marks. */
  full: number;
  /** Share of items with part marks (e.g. found the words, named them wrong). */
  half: number;
  confidence: number | null;
  questions: number;
  band: Band;
  groups: Record<StudentBand, string[]>;
};

export type FlagType = 'sure_wrong' | 'guessing' | 'thin' | 'outlier';
export type Flag = { id: string; type: FlagType; tag: string; students: string[] };

export type MixUp = { tag: string; key: string; why: Why; count: number; students: string[] };
```

- [ ] **Step 3: Type-check and commit**

Run: `cd apps/teaching && npx tsc --noEmit -p .`
Expected: no errors.

```bash
git add apps/teaching/src/evidence/constants.ts apps/teaching/src/evidence/types.ts
git commit -m "Teaching evidence: thresholds and shared types"
```

### Task 5: Tags — resolve names, add families, label

**Files:**
- Create: `apps/teaching/src/evidence/tags.ts`
- Test: `apps/teaching/tests/unit/evidence-tags.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { expandTags, kindOf, tagLabel, payloadEvidence } from '@/evidence/tags';
import type { Evidence, InsightPayload } from '@/evidence/types';
import type { LiteraryElementsTable } from '@/blocks/literary-elements';

const table = {
  version: '1', source: 't',
  families: [{ key: 'Comparative', name: 'Comparative', colour: '#000' }],
  subgroups: [{ id: 'comparative-figurative', family: 'Comparative', name: 'Figurative', definition: '' }],
  techniques: [
    { id: 'simile', symbol: 'Si', name: 'Simile', subgroup: 'comparative-figurative', definition: '', effect: '', example: '', related: [] },
    { id: 'metaphor', symbol: 'Me', name: 'Metaphor', subgroup: 'comparative-figurative', definition: '', effect: '', example: '', related: [] }
  ]
} as unknown as LiteraryElementsTable;
const ev = (tags: string[], why: Evidence['why'] = []): Evidence => ({ item: 'q1', tags, share: 0, why, student: 's1', source: 'quiz:l1', date: '2026-10-20', confidence: null });

describe('tags', () => {
  it('kindOf reads the prefix', () => {
    expect(kindOf('tech:simile')).toBe('tech');
    expect(kindOf('fam:Comparative')).toBe('fam');
    expect(kindOf('nope')).toBe(null);
  });
  it('resolves name tags and adds the family, also inside whys', () => {
    const [e] = expandTags([ev(['tech:~simile', 'out:X'], [{ type: 'named', as: 'tech:~metaphor', target: 'tech:~simile' }])], table);
    expect(e.tags.sort()).toEqual(['fam:Comparative', 'out:X', 'tech:simile']);
    expect(e.why).toEqual([{ type: 'named', as: 'tech:metaphor', target: 'tech:simile' }]);
  });
  it('leaves unknown names as name tags', () => {
    const [e] = expandTags([ev(['tech:~zeugma'])], table);
    expect(e.tags).toEqual(['tech:~zeugma']);
  });
  it('labels each kind', () => {
    const ctx = { table, outcomes: [{ id: 'X', code: 'EN5-RVL-01', title: 'Reads', group: 'g' }], skills: null };
    expect(tagLabel('tech:simile', ctx)).toBe('Simile');
    expect(tagLabel('tech:~zeugma', ctx)).toBe('Zeugma');
    expect(tagLabel('fam:Comparative', ctx)).toBe('Comparative');
    expect(tagLabel('out:X', ctx)).toBe('EN5-RVL-01');
    expect(tagLabel('skill:reading.inference', ctx)).toBe('reading.inference');
  });
  it('payloadEvidence places each item', () => {
    const p = {
      lesson_id: 'l1',
      attempts: [{ student: 's1', attempt_id: 'a', submitted_at: '2026-10-20T01:00:00Z', score: 0, max: 1, pending: 0, rows: [{ id: 'q1', awarded: 0, max: 1, confidence: 3, codes: [], outcomes: [], items: [{ item: 'q1', tags: ['tech:simile'], share: 0, why: [] }] }] }]
    } as unknown as InsightPayload;
    expect(payloadEvidence(p)).toEqual([{ item: 'q1', tags: ['tech:simile'], share: 0, why: [], student: 's1', source: 'quiz:l1', date: '2026-10-20', confidence: 3 }]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/teaching && npx vitest run tests/unit/evidence-tags.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `apps/teaching/src/evidence/tags.ts`**

```ts
import type { LiteraryElementsTable } from '@/blocks/literary-elements';
import { sydneyDay } from '@/markbook/calc';
import type { OutcomeLabel } from '@/markbook/types';
import { norm } from '@/quiz/core';
import type { SkillsContinuum } from '@/skills/schema';
import type { Evidence, InsightPayload, TagKind, Why } from './types';

export type TagContext = { table: LiteraryElementsTable | null; outcomes: readonly OutcomeLabel[]; skills: SkillsContinuum | null };

export function kindOf(tag: string): TagKind | null {
  const prefix = tag.slice(0, Math.max(0, tag.indexOf(':')));
  return prefix === 'tech' || prefix === 'fam' || prefix === 'out' || prefix === 'skill' ? prefix : null;
}

/** Every item in an insight payload, placed with its student, source, day and confidence. */
export function payloadEvidence(p: InsightPayload): Evidence[] {
  const out: Evidence[] = [];
  for (const a of p.attempts) {
    const date = sydneyDay(a.submitted_at);
    for (const row of a.rows) for (const item of row.items) out.push({ ...item, student: a.student, source: `quiz:${p.lesson_id}`, date, confidence: row.confidence });
  }
  return out;
}

/**
 * Turns name tags (`tech:~simile`) into catalogue ids where a technique has
 * that name, and adds each technique's family tag. Unknown names stay as they are.
 */
export function expandTags(evidence: Evidence[], table: LiteraryElementsTable | null): Evidence[] {
  if (!table) return evidence;
  const byName = new Map(table.techniques.map((t) => [norm(t.name), t.id]));
  const familyOf = new Map<string, string>();
  const subgroupFamily = new Map(table.subgroups.map((s) => [s.id, s.family]));
  for (const t of table.techniques) {
    const fam = subgroupFamily.get(t.subgroup);
    if (fam) familyOf.set(t.id, fam);
  }
  const resolve = (tag: string): string => {
    if (!tag.startsWith('tech:~')) return tag;
    const id = byName.get(tag.slice(6));
    return id ? `tech:${id}` : tag;
  };
  const fixWhy = (w: Why): Why => (w.type === 'named' ? { ...w, as: resolve(w.as), target: resolve(w.target) } : w.type === 'not_found' ? { ...w, target: resolve(w.target) } : w);
  return evidence.map((e) => {
    const tags = new Set<string>();
    for (const raw of e.tags) {
      const tag = resolve(raw);
      tags.add(tag);
      const fam = tag.startsWith('tech:') ? familyOf.get(tag.slice(5)) : undefined;
      if (fam) tags.add(`fam:${fam}`);
    }
    return { ...e, tags: [...tags], why: e.why.map(fixWhy) };
  });
}

const capital = (s: string): string => (s ? s[0]!.toUpperCase() + s.slice(1) : s);

export function tagLabel(tag: string, ctx: TagContext): string {
  const kind = kindOf(tag);
  const value = tag.slice(tag.indexOf(':') + 1);
  if (kind === 'tech') {
    if (value.startsWith('~')) return capital(value.slice(1));
    return ctx.table?.techniques.find((t) => t.id === value)?.name ?? value;
  }
  if (kind === 'fam') return ctx.table?.families.find((f) => f.key === value)?.name ?? value;
  if (kind === 'out') return ctx.outcomes.find((o) => o.id === value)?.code ?? value;
  if (kind === 'skill') {
    const [strand, sub] = value.split('.');
    return ctx.skills?.strands.find((s) => s.strand === strand)?.sub_strands.find((x) => x.id === sub)?.name ?? value;
  }
  return tag;
}
```

- [ ] **Step 4: Run tests**

Run: `cd apps/teaching && npx vitest run tests/unit/evidence-tags.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/teaching/src/evidence/tags.ts apps/teaching/tests/unit/evidence-tags.test.ts
git commit -m "Teaching evidence: resolve technique names, add families, label tags"
```

### Task 6: Descriptive statistics and item analysis

**Files:**
- Create: `apps/teaching/src/evidence/stats.ts`
- Test: `apps/teaching/tests/unit/evidence-stats.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { cronbachAlpha, itemStats, quantile, summary } from '@/evidence/stats';

describe('summary', () => {
  it('mean, median, sample sd, quartiles (linear interpolation)', () => {
    const s = summary([0.8, 0.2, 0.6, 0.4])!;
    expect(s.n).toBe(4);
    expect(s.mean).toBeCloseTo(0.5, 6);
    expect(s.median).toBeCloseTo(0.5, 6);
    expect(s.sd).toBeCloseTo(0.258199, 5);
    expect(s.q1).toBeCloseTo(0.35, 6);
    expect(s.q3).toBeCloseTo(0.65, 6);
    expect(s.min).toBe(0.2);
    expect(s.max).toBe(0.8);
  });
  it('is null when empty; sd 0 for one value', () => {
    expect(summary([])).toBeNull();
    expect(summary([0.7])!.sd).toBe(0);
  });
  it('quantile at the ends', () => {
    expect(quantile([1, 2, 3], 0)).toBe(1);
    expect(quantile([1, 2, 3], 1)).toBe(3);
  });
});

const m = [
  [1, 1, 1],
  [1, 1, 0],
  [1, 0, 0],
  [0, 0, 0]
];

describe('reliability and items', () => {
  it("Cronbach's alpha (KR-20 for right/wrong)", () => {
    expect(cronbachAlpha(m)).toBeCloseTo(0.75, 6);
  });
  it('alpha is null with under 2 items or 2 students, or no spread', () => {
    expect(cronbachAlpha([[1], [0]])).toBeNull();
    expect(cronbachAlpha([[1, 1]])).toBeNull();
    expect(cronbachAlpha([[1, 1], [1, 1]])).toBeNull();
  });
  it('facility and corrected item–total discrimination', () => {
    const stats = itemStats(m, [1, 1, 1]);
    expect(stats[0]!.facility).toBeCloseTo(0.75, 6);
    expect(stats[0]!.discrimination).toBeCloseTo(0.5222, 3);
    expect(stats[2]!.facility).toBeCloseTo(0.25, 6);
  });
  it('discrimination is null when an item has no spread', () => {
    expect(itemStats([[1, 0], [1, 1]], [1, 1])[0]!.discrimination).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/teaching && npx vitest run tests/unit/evidence-stats.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `apps/teaching/src/evidence/stats.ts`**

```ts
/** Plain descriptive statistics and classical item analysis. No quiz knowledge. */

export type Summary = { n: number; mean: number; median: number; sd: number; min: number; max: number; q1: number; q3: number };

const mean = (xs: number[]): number => xs.reduce((s, x) => s + x, 0) / xs.length;

/** Sample variance (n − 1); 0 for fewer than two values. */
function variance(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1);
}

/** Quantile of sorted values by linear interpolation (Excel QUARTILE.INC, R type 7). */
export function quantile(sorted: number[], p: number): number {
  if (!sorted.length) return NaN;
  const h = (sorted.length - 1) * p;
  const lo = Math.floor(h);
  const hi = Math.ceil(h);
  return (sorted[lo] as number) + (h - lo) * ((sorted[hi] as number) - (sorted[lo] as number));
}

export function summary(values: number[]): Summary | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return {
    n: values.length,
    mean: mean(values),
    median: quantile(sorted, 0.5),
    sd: Math.sqrt(variance(values)),
    min: sorted[0] as number,
    max: sorted[sorted.length - 1] as number,
    q1: quantile(sorted, 0.25),
    q3: quantile(sorted, 0.75)
  };
}

export function pearson(xs: number[], ys: number[]): number | null {
  if (xs.length !== ys.length || xs.length < 2) return null;
  const mx = mean(xs);
  const my = mean(ys);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  xs.forEach((x, i) => {
    const dx = x - mx;
    const dy = (ys[i] as number) - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  });
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : null;
}

/**
 * Cronbach's alpha over marks (rows = students, columns = questions). Equals
 * KR-20 when every question is right or wrong. Null without two students,
 * two questions, or any spread in totals.
 */
export function cronbachAlpha(matrix: number[][]): number | null {
  const k = matrix[0]?.length ?? 0;
  if (matrix.length < 2 || k < 2) return null;
  const itemVar = Array.from({ length: k }, (_, j) => variance(matrix.map((row) => row[j] as number))).reduce((s, v) => s + v, 0);
  const totalVar = variance(matrix.map((row) => row.reduce((s, v) => s + v, 0)));
  if (totalVar <= 0) return null;
  return (k / (k - 1)) * (1 - itemVar / totalVar);
}

export type ItemStat = { facility: number; discrimination: number | null };

/** Facility (mean share of marks) and discrimination (each question against the total of the others). */
export function itemStats(matrix: number[][], maxes: number[]): ItemStat[] {
  return maxes.map((max, j) => {
    const item = matrix.map((row) => row[j] as number);
    const rest = matrix.map((row) => row.reduce((s, v, i) => (i === j ? s : s + v), 0));
    return { facility: max > 0 && item.length ? mean(item) / max : 0, discrimination: pearson(item, rest) };
  });
}
```

- [ ] **Step 4: Run tests**

Run: `cd apps/teaching && npx vitest run tests/unit/evidence-stats.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/teaching/src/evidence/stats.ts apps/teaching/tests/unit/evidence-stats.test.ts
git commit -m "Teaching evidence: summary statistics, alpha, item analysis"
```

### Task 7: Patterns — tags, mix-ups, confidence, flags, trends, compare, focus

**Files:**
- Create: `apps/teaching/src/evidence/patterns.ts`
- Test: `apps/teaching/tests/unit/evidence-patterns.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { byTag, compare, confidenceQuadrants, defaultKind, findFlags, focusFor, mixUps, studentBand, trend } from '@/evidence/patterns';
import type { Evidence } from '@/evidence/types';

const e = (student: string, item: string, tags: string[], share: number | null, confidence: Evidence['confidence'] = null, why: Evidence['why'] = [], source = 'quiz:a', date = '2026-10-01'): Evidence =>
  ({ student, item, tags, share, why, confidence, source, date });

// Juxtaposition: weak (2 questions). Simile: secure. Motif: one question.
const sample: Evidence[] = [
  e('s1', 'q1', ['tech:jux'], 0, 3, [{ type: 'named', as: 'tech:contrast', target: 'tech:jux' }]),
  e('s1', 'q2', ['tech:jux'], 0.5, 2),
  e('s2', 'q1', ['tech:jux'], 0, 3, [{ type: 'named', as: 'tech:contrast', target: 'tech:jux' }]),
  e('s2', 'q2', ['tech:jux'], 0, 1),
  e('s3', 'q1', ['tech:jux'], 1, 1),
  e('s3', 'q2', ['tech:jux'], 1, 1),
  e('s1', 'q3', ['tech:simile'], 1, 3),
  e('s1', 'q4', ['tech:simile'], 1, 3),
  e('s2', 'q3', ['tech:simile'], 1, 3),
  e('s2', 'q4', ['tech:simile'], 1, 3),
  e('s3', 'q3', ['tech:simile'], 0, 3),
  e('s3', 'q4', ['tech:simile'], 0, 3),
  e('s4', 'q3', ['tech:simile'], 1, 3),
  e('s4', 'q4', ['tech:simile'], 1, 3),
  e('s5', 'q3', ['tech:simile'], 1, 3),
  e('s5', 'q4', ['tech:simile'], 1, 3),
  e('s1', 'q5', ['tech:motif'], 1, 2)
];

describe('byTag', () => {
  it('bands, groups and sorts weakest first', () => {
    const rows = byTag(sample, 'tech');
    expect(rows.map((r) => r.tag)).toEqual(['tech:jux', 'tech:simile', 'tech:motif']);
    const jux = rows[0]!;
    expect(jux.mean).toBeCloseTo(2.5 / 6, 6);
    expect(jux.full).toBeCloseTo(2 / 6, 6);
    expect(jux.half).toBeCloseTo(1 / 6, 6);
    expect(jux.questions).toBe(2);
    expect(jux.band).toBe('weak');
    expect(jux.groups).toEqual({ weak: ['s1', 's2'], developing: [], secure: ['s3'] });
    expect(rows[2]!.band).toBe('thin');
  });
  it('counts spot targets of one question once', () => {
    const rows = byTag([e('s1', 'q9#0', ['tech:x'], 1), e('s1', 'q9#1', ['tech:x'], 1)], 'tech');
    expect(rows[0]!.questions).toBe(1);
  });
  it('defaultKind picks the most specific kind present', () => {
    expect(defaultKind(sample)).toBe('tech');
    expect(defaultKind([e('s1', 'q', ['out:X', 'skill:a.b'], 1)])).toBe('out');
    expect(defaultKind([])).toBe('out');
  });
});

describe('mixUps and confidence', () => {
  it('counts the same mistake across students', () => {
    const [top] = mixUps(sample, 'tech');
    expect(top).toMatchObject({ tag: 'tech:jux', key: 'named:tech:contrast', count: 2, students: ['s1', 's2'] });
  });
  it('quadrants count only sure (3) and unsure (1)', () => {
    const q = confidenceQuadrants(sample);
    expect(q).toMatchObject({ sureRight: 8, sureWrong: 4, unsureRight: 2, unsureWrong: 1, total: 15 });
    expect(q.sureWrongStudents).toEqual(['s1', 's2', 's3']);
  });
});

describe('flags', () => {
  it('sure-but-wrong, guessing, thin and outlier', () => {
    const flags = findFlags(sample, byTag(sample, 'tech'));
    const ids = flags.map((f) => f.id).sort();
    // Simile: only s3 was sure and wrong, so no sure-but-wrong flag there (needs 2).
    expect(ids).toEqual(['guessing:tech:jux', 'outlier:tech:simile', 'sure_wrong:tech:jux', 'thin:tech:motif'].sort());
    expect(flags.find((f) => f.id === 'outlier:tech:simile')!.students).toEqual(['s3']);
  });
});

describe('trend and compare', () => {
  it('trend gives each source a median of student means', () => {
    const points = trend(
      [e('s1', 'q', [], 0.2, null, [], 'quiz:a', '2026-10-01'), e('s2', 'q', [], 0.6, null, [], 'quiz:a', '2026-10-01'), e('s1', 'q', [], 0.8, null, [], 'quiz:b', '2026-10-09')],
      [{ source: 'quiz:b', title: 'B' }, { source: 'quiz:a', title: 'A' }]
    );
    expect(points.map((p) => p.title)).toEqual(['A', 'B']);
    expect(points[0]!.median).toBeCloseTo(0.4, 6);
    expect(points[1]!.n).toBe(1);
  });
  it('compare reports class change and band moves per tag', () => {
    const before = [e('s1', 'q', ['tech:x'], 0.2), e('s2', 'q', ['tech:x'], 0.9)];
    const after = [e('s1', 'q', ['tech:x'], 0.9), e('s2', 'q', ['tech:x'], 0.9)];
    const [row] = compare(before, after, 'tech');
    expect(row).toMatchObject({ tag: 'tech:x', up: 1, down: 0 });
    expect(row!.change).toBeCloseTo(0.35, 6);
    expect(studentBand(0.49)).toBe('weak');
  });
});

describe('focusFor', () => {
  it('weakest tags with enough items, plus pins, minus dismissals', () => {
    const ev = [
      ...[0, 0.2, 0.4].map((s, i) => e('s1', `a${i}`, ['tech:a'], s)),
      ...[0.5, 0.5, 0.5].map((s, i) => e('s1', `b${i}`, ['tech:b'], s)),
      ...[1, 1, 0.9].map((s, i) => e('s1', `c${i}`, ['tech:c'], s)),
      ...[0, 0].map((s, i) => e('s1', `d${i}`, ['tech:d'], s))
    ];
    const f = focusFor(ev, 's1', 'tech', { pinned: ['tech:c'], dismissed: ['tech:b'] });
    expect(f.focus.map((x) => x.tag)).toEqual(['tech:c', 'tech:a']);
    expect(f.focus[0]!.pinned).toBe(true);
    expect(f.secure.map((x) => x.tag)).toEqual(['tech:c']);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/teaching && npx vitest run tests/unit/evidence-patterns.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `apps/teaching/src/evidence/patterns.ts`**

```ts
import { BANDS, FLAGS, FOCUS } from './constants';
import { summary } from './stats';
import type { Band, Evidence, Flag, MixUp, StudentBand, TagKind, TagRow, Why } from './types';

/** Patterns across evidence: by tag, mistakes, confidence, flags, change over time, focus areas. */

const avg = (xs: number[]): number => xs.reduce((s, x) => s + x, 0) / xs.length;
const scored = (list: Evidence[]): Evidence[] => list.filter((x) => x.share !== null);
const questionOf = (item: string): string => item.split('#')[0] as string;
const tagsOf = (x: Evidence, kind: TagKind): string[] => x.tags.filter((t) => t.startsWith(`${kind}:`));

function groupBy<T>(xs: T[], key: (x: T) => string[]): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const x of xs) for (const k of key(x)) out.set(k, [...(out.get(k) ?? []), x]);
  return out;
}

export function studentBand(mean: number): StudentBand {
  return mean < BANDS.weak ? 'weak' : mean >= BANDS.secure ? 'secure' : 'developing';
}

/** The most specific tag kind the evidence has: technique, then outcome, skill, family. */
export function defaultKind(evidence: Evidence[]): TagKind {
  for (const kind of ['tech', 'out', 'skill', 'fam'] as TagKind[]) if (evidence.some((x) => tagsOf(x, kind).length)) return kind;
  return 'out';
}

export function kindsPresent(evidence: Evidence[]): TagKind[] {
  return (['tech', 'fam', 'out', 'skill'] as TagKind[]).filter((kind) => evidence.some((x) => tagsOf(x, kind).length));
}

export function byTag(evidence: Evidence[], kind: TagKind): TagRow[] {
  const rows: TagRow[] = [];
  for (const [tag, list] of groupBy(scored(evidence), (x) => tagsOf(x, kind))) {
    const shares = list.map((x) => x.share as number);
    const mean = avg(shares);
    const sure = list.map((x) => x.confidence).filter((c): c is 1 | 2 | 3 => c !== null);
    const confidence = sure.length ? avg(sure) : null;
    const questions = new Set(list.map((x) => questionOf(x.item))).size;
    const band: Band =
      questions < BANDS.minQuestions ? 'thin' : mean < BANDS.weak ? 'weak' : mean >= BANDS.secure && (confidence === null || confidence >= BANDS.secureConfidence) ? 'secure' : 'developing';
    const groups: Record<StudentBand, string[]> = { weak: [], developing: [], secure: [] };
    for (const [student, mine] of groupBy(list, (x) => [x.student])) {
      if (mine.length < BANDS.groupMin) continue;
      groups[studentBand(avg(mine.map((x) => x.share as number)))].push(student);
    }
    rows.push({ tag, mean, full: shares.filter((s) => s >= 1).length / shares.length, half: shares.filter((s) => s > 0 && s < 1).length / shares.length, confidence, questions, band, groups });
  }
  return rows.sort((a, b) => a.mean - b.mean || a.tag.localeCompare(b.tag));
}

function whyKey(w: Why): string {
  switch (w.type) {
    case 'named':
      return `named:${w.as}`;
    case 'not_found':
      return 'not_found';
    case 'option':
      return `option:${w.text}`;
    case 'placement':
      return `placement:${w.text}`;
    case 'code':
      return `code:${w.id}`;
  }
}

/** The same mistake made by several students, per tag, most common first. */
export function mixUps(evidence: Evidence[], kind: TagKind): MixUp[] {
  const found = new Map<string, MixUp>();
  for (const x of evidence) {
    for (const w of x.why) {
      const tags = w.type === 'named' || w.type === 'not_found' ? [w.target].filter((t) => t.startsWith(`${kind}:`)) : tagsOf(x, kind);
      for (const tag of tags.length ? tags : ['']) {
        const key = whyKey(w);
        const id = `${tag}|${key}`;
        const row = found.get(id) ?? { tag, key, why: w, count: 0, students: [] };
        if (!row.students.includes(x.student)) {
          row.students.push(x.student);
          row.count += 1;
        }
        found.set(id, row);
      }
    }
  }
  return [...found.values()].sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

export type Quadrants = { sureRight: number; sureWrong: number; unsureRight: number; unsureWrong: number; total: number; sureWrongStudents: string[] };

/** Sure (3) and unsure (1) answers against full marks. Fairly sure (2) counts in neither. */
export function confidenceQuadrants(evidence: Evidence[]): Quadrants {
  const q: Quadrants = { sureRight: 0, sureWrong: 0, unsureRight: 0, unsureWrong: 0, total: 0, sureWrongStudents: [] };
  for (const x of scored(evidence)) {
    if (x.confidence !== 3 && x.confidence !== 1) continue;
    const right = (x.share as number) >= 1;
    q.total += 1;
    if (x.confidence === 3 && right) q.sureRight += 1;
    if (x.confidence === 3 && !right) {
      q.sureWrong += 1;
      if (!q.sureWrongStudents.includes(x.student)) q.sureWrongStudents.push(x.student);
    }
    if (x.confidence === 1 && right) q.unsureRight += 1;
    if (x.confidence === 1 && !right) q.unsureWrong += 1;
  }
  q.sureWrongStudents.sort();
  return q;
}

/** Where the data can't support a decision yet. `rows` are byTag rows for the same kind. */
export function findFlags(evidence: Evidence[], rows: TagRow[]): Flag[] {
  const flags: Flag[] = [];
  const kind = rows[0]?.tag.slice(0, rows[0].tag.indexOf(':')) as TagKind | undefined;
  if (!kind) return flags;
  const list = scored(evidence);
  for (const row of rows) {
    const mine = list.filter((x) => x.tags.includes(row.tag));
    const sureWrong = [...new Set(mine.filter((x) => x.confidence === 3 && (x.share as number) < 1).map((x) => x.student))].sort();
    if (sureWrong.length >= FLAGS.sureWrongStudents) flags.push({ id: `sure_wrong:${row.tag}`, type: 'sure_wrong', tag: row.tag, students: sureWrong });
    const full = mine.filter((x) => (x.share as number) >= 1);
    const guesses = full.filter((x) => x.confidence === 1);
    if (guesses.length >= FLAGS.guessMin && guesses.length / full.length >= FLAGS.guessShare)
      flags.push({ id: `guessing:${row.tag}`, type: 'guessing', tag: row.tag, students: [...new Set(guesses.map((x) => x.student))].sort() });
    if (row.band === 'thin') flags.push({ id: `thin:${row.tag}`, type: 'thin', tag: row.tag, students: [] });
    if (row.band === 'secure' && row.groups.weak.length) flags.push({ id: `outlier:${row.tag}`, type: 'outlier', tag: row.tag, students: [...row.groups.weak].sort() });
  }
  return flags;
}

export type TrendPoint = { source: string; title: string; date: string; n: number; median: number; q1: number; q3: number };

/** Per source, oldest first: the spread of each student's mean share (optionally on one tag). */
export function trend(evidence: Evidence[], sources: Array<{ source: string; title: string }>, tag?: string): TrendPoint[] {
  const points: TrendPoint[] = [];
  for (const { source, title } of sources) {
    const mine = scored(evidence).filter((x) => x.source === source && (!tag || x.tags.includes(tag)));
    if (!mine.length) continue;
    const perStudent = [...groupBy(mine, (x) => [x.student]).values()].map((xs) => avg(xs.map((x) => x.share as number)));
    const s = summary(perStudent);
    if (!s) continue;
    const date = mine.map((x) => x.date).sort()[0] as string;
    points.push({ source, title, date, n: s.n, median: s.median, q1: s.q1, q3: s.q3 });
  }
  return points.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
}

export type CompareRow = { tag: string; before: number; after: number; change: number; up: number; down: number; students: Array<{ student: string; before: number; after: number }> };

/** Tags present in both: class change and how many students moved up or down a band. */
export function compare(before: Evidence[], after: Evidence[], kind: TagKind): CompareRow[] {
  const b = groupBy(scored(before), (x) => tagsOf(x, kind));
  const a = groupBy(scored(after), (x) => tagsOf(x, kind));
  const rows: CompareRow[] = [];
  for (const [tag, was] of b) {
    const now = a.get(tag);
    if (!now) continue;
    const byStudent = (xs: Evidence[]) => new Map([...groupBy(xs, (x) => [x.student])].map(([s, ys]) => [s, avg(ys.map((y) => y.share as number))]));
    const pre = byStudent(was);
    const post = byStudent(now);
    const students = [...pre].filter(([s]) => post.has(s)).map(([student, v]) => ({ student, before: v, after: post.get(student) as number }));
    const order: StudentBand[] = ['weak', 'developing', 'secure'];
    const moved = (s: { before: number; after: number }) => order.indexOf(studentBand(s.after)) - order.indexOf(studentBand(s.before));
    const beforeMean = avg(was.map((x) => x.share as number));
    const afterMean = avg(now.map((x) => x.share as number));
    rows.push({ tag, before: beforeMean, after: afterMean, change: afterMean - beforeMean, up: students.filter((s) => moved(s) > 0).length, down: students.filter((s) => moved(s) < 0).length, students });
  }
  return rows.sort((x, y) => x.after - y.after);
}

export type FocusArea = { tag: string; mean: number | null; items: number; pinned: boolean; why: Why[] };
export type FocusPins = { pinned: string[]; dismissed: string[] };

/** A student's focus areas (pinned first, then weakest) and secure tags. */
export function focusFor(evidence: Evidence[], student: string, kind: TagKind, pins: FocusPins = { pinned: [], dismissed: [] }): { focus: FocusArea[]; secure: Array<{ tag: string; mean: number }> } {
  const mine = scored(evidence).filter((x) => x.student === student);
  const byT = groupBy(mine, (x) => x.tags);
  const area = (tag: string, pinned: boolean): FocusArea => {
    const xs = byT.get(tag) ?? [];
    return { tag, mean: xs.length ? avg(xs.map((x) => x.share as number)) : null, items: xs.length, pinned, why: xs.flatMap((x) => x.why) };
  };
  const pinned = pins.pinned.map((t) => area(t, true));
  const weak = [...byT.keys()]
    .filter((t) => t.startsWith(`${kind}:`) && !pins.dismissed.includes(t) && !pins.pinned.includes(t))
    .map((t) => area(t, false))
    .filter((f) => f.items >= FOCUS.minItems && (f.mean as number) < FOCUS.below)
    .sort((x, y) => (x.mean as number) - (y.mean as number))
    .slice(0, FOCUS.max);
  const secure = [...byT.keys()]
    .filter((t) => t.startsWith(`${kind}:`))
    .map((t) => area(t, false))
    .filter((f) => f.items >= FOCUS.secureMinItems && (f.mean as number) >= BANDS.secure)
    .map((f) => ({ tag: f.tag, mean: f.mean as number }))
    .sort((x, y) => y.mean - x.mean);
  return { focus: [...pinned, ...weak], secure };
}
```

- [ ] **Step 4: Run tests**

Run: `cd apps/teaching && npx vitest run tests/unit/evidence-patterns.test.ts`
Expected: PASS. If a count in the test is off, recount the `sample` by hand before touching the code; the test data is the spec.

- [ ] **Step 5: Commit**

```bash
git add apps/teaching/src/evidence/patterns.ts apps/teaching/tests/unit/evidence-patterns.test.ts
git commit -m "Teaching evidence: tag bands, mix-ups, confidence, flags, trends, focus"
```

# Phase 3 — Server

### Task 8: Quiz settings for follow-ups and Compare with

**Files:**
- Modify: `apps/teaching/src/quiz/core.ts` (`QuizSettingsSchema`, near line 420)
- Test: `tests/unit/quiz-core.test.js`

- [ ] **Step 1: Failing test** — append:

```js
test('quiz settings accept follow-up fields and keep them out of student settings', async () => {
  const { QuizSettingsSchema } = await import('../../netlify/functions/_shared/quiz-core.mjs');
  const parsed = QuizSettingsSchema.parse({ for_students: ['stu1'], follow_up_of: 'lesson_a', follow_up_flag: 'sure_wrong:tech:simile', compare_with: 'lesson_b' });
  assert.deepEqual(parsed.for_students, ['stu1']);
  assert.equal(parsed.compare_with, 'lesson_b');
});
```

- [ ] **Step 2: Run** `node --import ./scripts/test-network-guard.mjs --test tests/unit/quiz-core.test.js` — Expected: FAIL (zod strips unknown keys, so `for_students` is undefined).

- [ ] **Step 3: Implement** — add to `QuizSettingsSchema` after `move_on`:

```ts
  /** A follow-up quiz: only these students (class-list ids) may sit it. */
  for_students: z.array(z.string().min(1).max(64)).max(60).optional(),
  /** The quiz this one follows up, and the flag that prompted it. */
  follow_up_of: z.string().max(64).optional(),
  follow_up_flag: z.string().max(160).optional(),
  /** Teacher only: an earlier quiz to show before-and-after against. */
  compare_with: z.string().max(64).optional()
```

`publicSettings` in `quiz.mjs` lists its fields one by one, so none of these reach students. Leave it unchanged.

- [ ] **Step 4: Regenerate, run, commit**

Run: `node scripts/generate-alchemy-schema.mjs && node scripts/generate-teaching-ai-runtime.mjs && node --import ./scripts/test-network-guard.mjs --test tests/unit/quiz-core.test.js`
Expected: PASS.

```bash
git add apps/teaching/src/quiz/core.ts netlify/functions/_shared/quiz-core.mjs netlify/functions/_shared/quiz-evidence.mjs netlify/functions/_shared/teaching-ai-runtime.mjs tests/unit/quiz-core.test.js
git commit -m "Teaching quiz: follow-up and compare settings"
```

### Task 9: Server insight, saved copies, Close now, codes, small-group quizzes

**Files:**
- Modify: `netlify/functions/_shared/quiz.mjs`
- Test: `tests/unit/quiz.test.js`

- [ ] **Step 1: Write failing tests** — append to `tests/unit/quiz.test.js` (it already defines `withClass`, `bobDevice`, `tomDevice`, `qBlock`, `mc`, `sa`, `baseStore`, `publishQuiz`):

```js
test('insight: evidence per answer; a closed, fully marked quiz is saved until something changes', async () => {
  const store = withClass(baseStore({ quizBlocks: [qBlock('qa', mc), qBlock('qb', sa)] }));
  await publishQuiz(store);
  await rawQuizAction(store, 'quiz1', { ...bobDevice, action: 'claim', initials: 'BB' });
  await rawQuizAction(store, 'quiz1', { ...bobDevice, action: 'start' });
  await rawQuizAction(store, 'quiz1', { ...bobDevice, action: 'submit', responses: { qb: { text: 'Juliet' } } });

  const open = await quizTeacherAction(store, 'quiz1', { action: 'insight', class_id: 'class1' });
  assert.equal(open.closed, false);
  assert.equal(open.saved, false);
  assert.equal(open.attempts.length, 1);
  assert.ok(open.students.length >= 2, 'the whole class list comes back');
  assert.equal(open.attempts[0].rows.find((r) => r.id === 'qb').items[0].share, 0);
  assert.equal(store.data.has('quiz/quiz1/evidence/class1'), false, 'open quizzes are not saved');

  const closed = await quizTeacherAction(store, 'quiz1', { action: 'close', class_id: 'class1' });
  assert.equal(closed.closed, true);
  assert.equal(closed.closed_by, 'button');
  assert.ok(store.data.has('quiz/quiz1/evidence/class1'));
  assert.equal((await quizTeacherAction(store, 'quiz1', { action: 'insight', class_id: 'class1' })).saved, true);
  await rawQuizAction(store, 'quiz1', { ...tomDevice, action: 'claim', initials: 'TT' });
  await assert.rejects(rawQuizAction(store, 'quiz1', { ...tomDevice, action: 'start' }), /closed/);

  await quizTeacherAction(store, 'quiz1', { action: 'mark', attempt_id: open.attempts[0].attempt_id, question_id: 'qb', score: 0, codes: ['code-e', 'code-e'] });
  assert.equal(store.data.has('quiz/quiz1/evidence/class1'), false, 'marking drops the saved copy');
  const after = await quizTeacherAction(store, 'quiz1', { action: 'insight', class_id: 'class1' });
  const qb = after.attempts[0].rows.find((r) => r.id === 'qb');
  assert.deepEqual(qb.codes, ['code-e']);
  assert.deepEqual(qb.items[0].why, [{ type: 'code', id: 'code-e' }]);

  await quizTeacherAction(store, 'quiz1', { action: 'reopen', class_id: 'class1' });
  assert.equal((await quizTeacherAction(store, 'quiz1', { action: 'insight', class_id: 'class1' })).closed, false);
});

test('old numeric teacher marks still read', async () => {
  const store = withClass(baseStore({ quizBlocks: [qBlock('qa', mc), qBlock('qb', sa)] }));
  await publishQuiz(store);
  await rawQuizAction(store, 'quiz1', { ...bobDevice, action: 'claim', initials: 'BB' });
  await rawQuizAction(store, 'quiz1', { ...bobDevice, action: 'start' });
  await rawQuizAction(store, 'quiz1', { ...bobDevice, action: 'submit', responses: {} });
  const [attempt] = (await quizTeacherAction(store, 'quiz1', { action: 'insight', class_id: 'class1' })).attempts;
  const [owner, n] = attempt.attempt_id.split('~');
  store.data.set(`quiz/quiz1/marks/${owner}~${n}`, { qb: 1 });
  const row = (await quizTeacherAction(store, 'quiz1', { action: 'insight', class_id: 'class1' })).attempts[0].rows.find((r) => r.id === 'qb');
  assert.equal(row.awarded, 1);
  assert.deepEqual(row.codes, []);
});

test('a follow-up quiz only lets its listed students in', async () => {
  const store = withClass(baseStore({ quizBlocks: [qBlock('qa', mc)] }));
  const { loadRoster } = await import('../../netlify/functions/_shared/class-claims.mjs');
  const [bob] = (await loadRoster(store, 'class1')).students;
  const draft = store.data.get('lessons/quiz1');
  store.data.set('lessons/quiz1', { ...draft, quiz: { ...(draft.quiz ?? {}), for_students: [bob.id] } });
  await publishQuiz(store);
  await rawQuizAction(store, 'quiz1', { ...bobDevice, action: 'claim', initials: 'BB' });
  assert.ok((await rawQuizAction(store, 'quiz1', { ...bobDevice, action: 'start' })).current);
  await assert.rejects(rawQuizAction(store, 'quiz1', { ...tomDevice, action: 'claim', initials: 'TT' }), /small group/);
});

test('dismissed flags are kept and come back with the insight', async () => {
  const store = withClass(baseStore({ quizBlocks: [qBlock('qa', mc)] }));
  await publishQuiz(store);
  assert.deepEqual((await quizTeacherAction(store, 'quiz1', { action: 'dismiss_flag', flag_id: 'thin:tech:motif' })).dismissed, ['thin:tech:motif']);
  assert.deepEqual((await quizTeacherAction(store, 'quiz1', { action: 'insight', class_id: 'class1' })).dismissed, ['thin:tech:motif']);
  assert.deepEqual((await quizTeacherAction(store, 'quiz1', { action: 'dismiss_flag', flag_id: 'thin:tech:motif', undo: true })).dismissed, []);
});

test('insight lists the unit’s other quizzes and this quiz’s follow-ups', async () => {
  const store = withClass(baseStore({ quizBlocks: [qBlock('qa', mc)] }));
  store.data.set('units/unit1', { id: 'unit1', type: 'unit', lesson_ids: ['lesson1', 'quiz1', 'quiz2'] });
  store.data.set('lessons/quiz2', { id: 'quiz2', title: 'Follow-up: Simile', unit_id: 'unit1', pedagogical_mode: 'quiz', quiz: { follow_up_of: 'quiz1', follow_up_flag: 'sure_wrong:tech:simile' }, blocks: [] });
  await publishQuiz(store);
  const insight = await quizTeacherAction(store, 'quiz1', { action: 'insight', class_id: 'class1' });
  assert.deepEqual(insight.siblings, [{ lesson_id: 'quiz2', title: 'Follow-up: Simile' }]);
  assert.deepEqual(insight.follow_ups, [{ lesson_id: 'quiz2', title: 'Follow-up: Simile', flag: 'sure_wrong:tech:simile' }]);
});
```

If `units/unit1` isn't the unit key format, check `unitKey` in `netlify/functions/_shared/teaching-blobs.mjs` and use its output in the test.

In the existing test `markbook: each student’s first handed-in attempt, scored like Results`, replace

```js
  assert.deepEqual(qb, { id: 'qb', awarded: 1, max: 1, confidence: 3, outcomes: ['oShort'] });
```

with

```js
  const { items, codes, ...plain } = qb;
  assert.deepEqual(plain, { id: 'qb', awarded: 1, max: 1, confidence: 3, outcomes: ['oShort'] });
  assert.deepEqual(codes, []);
  assert.deepEqual(items.map((i) => i.share), [1]);
```

- [ ] **Step 2: Run to verify the new tests fail**

Run: `node --import ./scripts/test-network-guard.mjs --test tests/unit/quiz.test.js`
Expected: the new tests FAIL with `Unknown action.`; existing tests pass except the edited markbook one (no `items` yet).

- [ ] **Step 3: Implement in `netlify/functions/_shared/quiz.mjs`**

Imports — add `unitKey` to the `./teaching-blobs.mjs` import, and:

```js
import { answerEvidence } from './quiz-evidence.mjs';
```

Add to the storage comment at the top of the file:

```js
 *   quiz/{lesson}/closed                             { at } the teacher pressed Close now
 *   quiz/{lesson}/flags                              { dismissed } insight flags the teacher dismissed
 *   quiz/{lesson}/evidence/{class|all}               saved insight of a closed, fully marked quiz
```

In `keys(lesson)` add:

```js
  closed: `quiz/${lesson}/closed`,
  flags: `quiz/${lesson}/flags`,
  insight: (cls) => `quiz/${lesson}/evidence/${cls}`,
```

After `entryFor`, add:

```js
const INSIGHT_SCHEMA = 1;

/** Closed by the teacher's Close now, or by the Closes date. */
async function closedState(store, k, settings, now = Date.now()) {
  if (await read(store, k.closed)) return { closed: true, by: 'button' };
  const closesAt = Date.parse(settings.closes_at ?? '');
  return Number.isFinite(closesAt) && closesAt < now ? { closed: true, by: 'date' } : { closed: false, by: null };
}

/** Saved insight goes stale when any answer, mark or attempt changes. */
async function dropSavedInsight(store, lessonId) {
  const saved = await listBlobKeys(store, `quiz/${lessonId}/evidence/`);
  await mapBounded(saved, 8, (key) => store.delete(key));
}

/** Feedback-code ids on one answer: unique, at most 8. */
const cleanCodes = (v) => (Array.isArray(v) ? [...new Set(v.filter((c) => typeof c === 'string' && c.length > 0 && c.length <= 64))].slice(0, 8) : []);
```

In `scoreAttempt`, replace the override lines:

```js
    const override = teacherMarks?.[id];
    let awarded = mark.score === null ? null : afterHint(mark.score, mark.max, hinted, hintCost);
    if (typeof override === 'number') awarded = Math.max(0, Math.min(mark.max, roundMarks(override)));
    return { id, mark, awarded, hinted, response: given, confidence: result.confidence?.[id] ?? null };
```

with:

```js
    // A teacher mark is a number, or { marks, codes } once feedback codes were picked.
    const override = teacherMarks?.[id];
    const overrideMarks = typeof override === 'number' ? override : typeof override?.marks === 'number' ? override.marks : null;
    let awarded = mark.score === null ? null : afterHint(mark.score, mark.max, hinted, hintCost);
    if (overrideMarks !== null) awarded = Math.max(0, Math.min(mark.max, roundMarks(overrideMarks)));
    const codes = cleanCodes(override?.codes);
    return { id, mark, awarded, hinted, response: given, confidence: result.confidence?.[id] ?? null, codes };
```

In `quizAction`, replace

```js
  const closesAt = Date.parse(settings.closes_at ?? '');
  const closed = Number.isFinite(closesAt) && closesAt < now;
```

with

```js
  const { closed } = await closedState(store, k, settings, now);
```

and directly after `const who = await identify(store, body, action);` add:

```js
  // A follow-up quiz is for the students it was made for.
  if (settings.for_students?.length && who.student && !settings.for_students.includes(who.student.id)) {
    reject(403, 'not_for_you', 'This quiz is for a small group.');
  }
```

In the `submit` branch, after `await store.setJSON(k.result(device, current.n), result, { onlyIfNew: true });` add:

```js
    await dropSavedInsight(store, lessonId);
```

In `quizTeacherAction`, extend the action list:

```js
  if (!['results', 'attempt', 'mark', 'release', 'reset', 'clear_all', 'insight', 'close', 'reopen', 'dismiss_flag'].includes(action)) reject(400, 'bad_action', 'Unknown action.');
```

After `const rosters = new Map();` add:

```js
  if (action === 'insight') return classInsight(store, lessonId, body.class_id ?? null, loaded);

  if (action === 'close' || action === 'reopen') {
    if (action === 'close') await store.setJSON(k.closed, { at: new Date().toISOString() });
    else await store.delete(k.closed);
    await dropSavedInsight(store, lessonId);
    return classInsight(store, lessonId, body.class_id ?? null, loaded);
  }

  if (action === 'dismiss_flag') {
    const flag = typeof body.flag_id === 'string' ? body.flag_id.slice(0, 160) : '';
    if (!flag) reject(400, 'bad_request', 'Unknown flag.');
    const was = (await read(store, k.flags))?.dismissed ?? [];
    const dismissed = body.undo === true ? was.filter((f) => f !== flag) : [...new Set([...was, flag])].slice(-200);
    await store.setJSON(k.flags, { dismissed });
    return { dismissed };
  }
```

After the `reset` branch's `await clearOwner(...)` and after the `clear_all` branch's `await mapBounded(...)`, add `await dropSavedInsight(store, lessonId);` in each.

In the `mark` branch, replace `next[body.question_id] = roundMarks(score);` with:

```js
      const codes = cleanCodes(body.codes);
      next[body.question_id] = codes.length ? { marks: roundMarks(score), codes } : roundMarks(score);
```

and after `await store.setJSON(k.marks(device, n), next);` add `await dropSavedInsight(store, lessonId);`.

Replace the whole `classQuizScores` function (and keep `lessonOutcomes` above it) with:

```js
/**
 * Each owner's first handed-in attempt that a teacher hasn't cleared. With
 * `owners` (hash → student id) only they are read. The cleared record and the
 * first go are read together, so most students cost one round trip.
 */
async function firstAttempts(store, k, lessonId, owners) {
  const handedIn = new Map();
  // Listings can lag a just-written hand-in; the next load picks it up, the same as Results.
  for (const key of await listBlobKeys(store, `quiz/${lessonId}/results/`)) {
    const [, , , owner, nText] = key.split('/');
    if (!owners || owners.has(owner)) handedIn.set(owner, [...(handedIn.get(owner) ?? []), Number(nText)]);
  }
  const out = [];
  await mapBounded([...handedIn], 8, async ([owner, ns]) => {
    const sorted = [...ns].sort((a, b) => a - b);
    const readAttempt = (n) => Promise.all([read(store, k.attempt(owner, n)), read(store, k.result(owner, n)), read(store, k.marks(owner, n))]);
    const [cleared, firstRead] = await Promise.all([read(store, `quiz/${lessonId}/cleared/${owner}`), readAttempt(sorted[0])]);
    const from = cleared?.from ?? 0;
    for (const n of sorted.filter((x) => x >= from)) {
      const [start, result, marks] = n === sorted[0] ? firstRead : await readAttempt(n);
      if (!start || !result) continue;
      out.push({ owner, n, start, result, marks });
      return;
    }
  });
  return out;
}

async function buildInsight(store, k, lessonId, record, fallback, cls, roster) {
  const owners = roster ? new Map(roster.students.map((s) => [deviceHash(`student:${cls}:${s.id}`), s.id])) : null;
  const firsts = await firstAttempts(store, k, lessonId, owners);
  const rosters = new Map();
  const students = roster ? roster.students.map(({ id, name, initials }) => ({ id, name, initials })) : [];
  const attempts = [];
  for (const a of firsts) {
    const rec = await recordFor(store, lessonId, a.start.version, record);
    const scored = scoreAttempt(rec, a.result, a.marks);
    const student = owners ? owners.get(a.owner) : a.start.student_id ?? a.owner;
    if (!owners) {
      const label = await studentLabel(store, a.start, rosters);
      students.push({ id: student, name: label.name ?? `Device ${a.owner.slice(0, 6)}`, initials: label.initials ?? '–' });
    }
    attempts.push({
      student,
      attempt_id: attemptId(a.owner, a.n),
      submitted_at: a.result.submitted_at,
      score: scored.score,
      max: scored.max,
      pending: scored.pending,
      rows: scored.rows.map((r) => {
        const entry = rec.questions[r.id];
        const outcomes = entry.key.outcomes ?? fallback;
        const items = answerEvidence({ question: entry.question, key: entry.key, response: r.response, awarded: r.awarded, codes: r.codes, fallbackOutcomes: fallback });
        return { id: r.id, awarded: r.awarded, max: r.mark.max, confidence: r.confidence, codes: r.codes, outcomes, items };
      })
    });
  }
  attempts.sort((x, y) => String(x.student).localeCompare(String(y.student)));
  return { schema: INSIGHT_SCHEMA, record_version: record.version, built_at: new Date().toISOString(), students, attempts };
}

/** Quiz lessons in the same unit, and the follow-ups made from this one. */
async function unitFamily(store, draft, lessonId) {
  const unit = draft.unit_id && isSafeId(draft.unit_id) ? await read(store, unitKey(draft.unit_id)) : null;
  const ids = (unit?.lesson_ids ?? []).filter((id) => id !== lessonId && isSafeId(id));
  const drafts = await mapBounded(ids, 8, (id) => read(store, draftLessonKey(id)));
  const siblings = [];
  const followUps = [];
  drafts.forEach((d, i) => {
    if (!d || isDeletedRecord(d) || d.pedagogical_mode !== 'quiz') return;
    siblings.push({ lesson_id: ids[i], title: d.title });
    if (d.quiz?.follow_up_of === lessonId) followUps.push({ lesson_id: ids[i], title: d.title, flag: d.quiz.follow_up_flag ?? null });
  });
  return { siblings, followUps };
}

/**
 * One class's insight (every first attempt when classId is null): each
 * student's first attempt with its evidence items. A closed quiz with nothing
 * left to mark saves the attempts at quiz/{lesson}/evidence/{class} and reads
 * them back until something changes; a new publish makes the copy stale.
 * `family: false` skips the unit read, for the markbook. Null when the lesson
 * isn't a published quiz.
 */
export async function classInsight(store, lessonId, classId, loaded = null, { family = true } = {}) {
  if (!loaded) {
    try {
      loaded = await loadQuiz(store, lessonId);
    } catch (error) {
      if (error instanceof QuizError) return null;
      throw error;
    }
  }
  const { draft, record, settings, k } = loaded;
  const cls = typeof classId === 'string' && isSafeId(classId) ? classId : null;
  const [roster, state, saved, flags, kin] = await Promise.all([
    cls ? loadRoster(store, cls) : null,
    closedState(store, k, settings),
    read(store, k.insight(cls ?? 'all')),
    read(store, k.flags),
    family ? unitFamily(store, draft, lessonId) : { siblings: [], followUps: [] }
  ]);
  const fallback = lessonOutcomes(draft);
  let body;
  if (saved?.schema === INSIGHT_SCHEMA && saved.record_version === record.version) body = { ...saved, saved: true };
  else {
    // A class with no list stays anonymous, so its insight covers every first attempt.
    const listed = cls && roster?.students.length ? roster : null;
    body = await buildInsight(store, k, lessonId, record, fallback, listed ? cls : null, listed);
    if (state.closed && body.attempts.every((a) => a.pending === 0)) {
      // A failed save only costs speed: the next view builds it again.
      await store.setJSON(k.insight(cls ?? 'all'), body).catch((error) => console.warn('quiz insight save failed', error));
    }
  }
  return {
    lesson_id: lessonId,
    title: draft.title,
    unit_id: draft.unit_id ?? '',
    record_version: record.version,
    class_id: cls,
    closed: state.closed,
    closed_by: state.by,
    built_at: body.built_at,
    saved: !!body.saved,
    confidence: !!settings.confidence,
    students: body.students,
    questions: record.order.map((id) => {
      const { question, key } = record.questions[id];
      return { id, prompt: question.prompt, marks: key.marks, kind: key.kind, outcomes: key.outcomes ?? fallback };
    }),
    attempts: body.attempts,
    compare_with: draft.quiz?.compare_with ?? null,
    follow_up_of: draft.quiz?.follow_up_of ?? null,
    follow_up_flag: draft.quiz?.follow_up_flag ?? null,
    for_students: settings.for_students ?? [],
    dismissed: flags?.dismissed ?? [],
    follow_ups: kin.followUps,
    siblings: kin.siblings
  };
}

/**
 * Each listed student's first handed-in attempt at this quiz in one class,
 * scored as the Results tab scores it, with evidence items. Null when the
 * lesson isn't a published quiz.
 */
export async function classQuizScores(store, lessonId, classId, studentIds) {
  const insight = await classInsight(store, lessonId, classId, null, { family: false });
  if (!insight) return null;
  const wanted = new Set(studentIds);
  const scores = {};
  let firstAt = null;
  for (const a of insight.attempts) {
    if (!wanted.has(a.student)) continue;
    scores[a.student] = { attempt_id: a.attempt_id, submitted_at: a.submitted_at, score: a.score, max: a.max, pending: a.pending, rows: a.rows };
    if (!firstAt || a.submitted_at < firstAt) firstAt = a.submitted_at;
  }
  return {
    lesson_id: lessonId,
    title: insight.title,
    confidence: insight.confidence,
    closed: insight.closed,
    first_at: firstAt,
    questions: insight.questions.map(({ id, prompt, marks, outcomes }) => ({ id, prompt, marks, outcomes })),
    scores
  };
}
```

- [ ] **Step 4: Run all quiz server tests**

Run: `node --import ./scripts/test-network-guard.mjs --test tests/unit/quiz.test.js tests/unit/markbook.test.js`
Expected: PASS. The round-trip test (`cleared record and first attempt are read in one round trip`) must still pass; if it doesn't, the four reads in `firstAttempts` have been split apart.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/_shared/quiz.mjs tests/unit/quiz.test.js
git commit -m "Teaching quiz: insight action, saved copies, Close now, codes on marks, small-group quizzes"
```

### Task 10: Create a follow-up lesson after the original

**Files:**
- Modify: `netlify/functions/lessons.mjs`
- Test: `tests/unit/lessons-follow-up.test.js` (new)

- [ ] **Step 1: Failing test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createLessonRecord } from '../../netlify/functions/lessons.mjs';
import { draftLessonKey, unitKey } from '../../netlify/functions/_shared/teaching-blobs.mjs';

function storeFixture(entries = []) {
  const data = new Map(entries.map(([k, v]) => [k, structuredClone(v)]));
  return {
    data,
    async get(key) { return structuredClone(data.get(key) ?? null); },
    async getJSON(key) { return structuredClone(data.get(key) ?? null); },
    async setJSON(key, value) { data.set(key, structuredClone(value)); return { modified: true }; },
    async set(key, value) { data.set(key, typeof value === 'string' ? JSON.parse(value) : value); },
    async delete(key) { data.delete(key); },
    async list({ prefix }) { return { blobs: [...data.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }; }
  };
}

test('a follow-up lesson goes straight after its original, with its quiz settings', async () => {
  const store = storeFixture([
    [unitKey('unit1'), { id: 'unit1', lesson_ids: ['la', 'lb'] }],
    [draftLessonKey('la'), { id: 'la', sequence: 1 }],
    [draftLessonKey('lb'), { id: 'lb', sequence: 2 }]
  ]);
  const record = await createLessonRecord(store, {
    title: 'Follow-up: Simile', unit_id: 'unit1', pedagogical_mode: 'quiz', after_lesson_id: 'la',
    quiz: { for_students: ['stu1'], follow_up_of: 'la', follow_up_flag: 'sure_wrong:tech:simile', bogus: 1 }
  });
  assert.equal(record.sequence, 1.5);
  assert.deepEqual(record.quiz, { for_students: ['stu1'], follow_up_of: 'la', follow_up_flag: 'sure_wrong:tech:simile' });
  const unit = await store.get(unitKey('unit1'));
  assert.deepEqual(unit.lesson_ids, ['la', record.id, 'lb']);
});

test('without after_lesson_id it still goes last', async () => {
  const store = storeFixture([[unitKey('unit1'), { id: 'unit1', lesson_ids: ['la'] }], [draftLessonKey('la'), { id: 'la', sequence: 4 }]]);
  const record = await createLessonRecord(store, { title: 'Next', unit_id: 'unit1' });
  assert.equal(record.sequence, 5);
  assert.equal('quiz' in record, false);
});
```

Before running, check how `getJSON`/`setJSON` in `teaching-blobs.mjs` call the store (`store.get(key, { type: 'json' })` or similar) and shape the fixture to match; keep the assertions as written.

- [ ] **Step 2: Run** `node --import ./scripts/test-network-guard.mjs --test tests/unit/lessons-follow-up.test.js` — Expected: FAIL (`sequence` is 3, no `quiz`).

- [ ] **Step 3: Implement** in `netlify/functions/lessons.mjs`:

Add import:

```js
import { QuizSettingsSchema } from './_shared/quiz-core.mjs';
```

Replace the sequence loop and record/unit writes in `createLessonRecord` with:

```js
  const lessonIds = Array.isArray(unit.lesson_ids) ? unit.lesson_ids : [];
  const sequences = new Map();
  for (const lessonId of lessonIds) {
    const lesson = await getJSON(store, draftLessonKey(lessonId));
    if (typeof lesson?.sequence === 'number') sequences.set(lessonId, lesson.sequence);
  }
  const maxSequence = Math.max(0, ...sequences.values());
  // A follow-up sits straight after the lesson it follows: halfway to the next one.
  const after = typeof body.after_lesson_id === 'string' && sequences.has(body.after_lesson_id) ? body.after_lesson_id : null;
  let sequence = maxSequence + 1;
  if (after) {
    const from = sequences.get(after);
    const later = [...sequences.values()].filter((s) => s > from);
    sequence = later.length ? (from + Math.min(...later)) / 2 : from + 1;
  }
  const quiz = pedagogical_mode === 'quiz' && body.quiz ? QuizSettingsSchema.safeParse(body.quiz) : null;

  const timestamp = new Date().toISOString();
  const id = newId('lesson');
  const record = {
    id,
    type: 'lesson',
    title,
    slug: slugify(title),
    unit_id,
    sequence,
    blocks: [],
    pedagogical_mode,
    ...(quiz?.success ? { quiz: quiz.data } : {}),
    status: 'active',
    created_at: timestamp,
    updated_at: timestamp,
    schema_version: 1
  };

  await setJSON(store, draftLessonKey(id), record);
  const at = after ? lessonIds.indexOf(after) + 1 : lessonIds.length;
  await setJSON(store, unitKey(unit_id), {
    ...unit,
    lesson_ids: [...lessonIds.slice(0, at), id, ...lessonIds.slice(at)],
    updated_at: timestamp
  });
  return record;
```

- [ ] **Step 4: Run** the new test plus any existing lessons tests: `node --import ./scripts/test-network-guard.mjs --test tests/unit/lessons-follow-up.test.js $(ls tests/unit/*lesson*.test.js)` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/lessons.mjs tests/unit/lessons-follow-up.test.js
git commit -m "Teaching: create a follow-up lesson straight after its original"
```

### Task 11: Markbook schema — criterion codes and focus pins

**Files:**
- Modify: `apps/teaching/src/markbook/schema.ts`, `netlify/functions/_shared/markbook.mjs`
- Regenerate: `netlify/functions/_shared/markbook-schema.mjs`
- Test: `apps/teaching/tests/unit/markbook-schema.test.ts`, `tests/unit/markbook.test.js`

- [ ] **Step 1: Failing tests** — append to `apps/teaching/tests/unit/markbook-schema.test.ts` (reuse the file's existing assessment column fixture; here it is called `essay`, with criteria `c1`, `c2` — use whatever the file has):

```ts
describe('criterion codes', () => {
  it('keeps codes on known criteria and drops empty lists', () => {
    const checked = checkMark(essay, { criteria: { c1: 3 }, codes: { c1: ['code-e'], c2: [] } });
    expect('mark' in checked && checked.mark).toEqual({ criteria: { c1: 3 }, codes: { c1: ['code-e'] } });
  });
  it('refuses codes on an unknown criterion', () => {
    expect(checkMark(essay, { criteria: {}, codes: { nope: ['x'] } })).toEqual({ problem: 'Unknown criterion.' });
  });
  it('pruneMarks keeps codes only for criteria still there', () => {
    const edited = { ...essay, criteria: essay.criteria.slice(0, 1) };
    const kept = pruneMarks(edited, { s1: { criteria: { [essay.criteria[0]!.id]: 1 }, codes: { [essay.criteria[0]!.id]: ['a'], [essay.criteria[1]!.id]: ['b'] } } });
    expect(kept.s1).toEqual({ criteria: { [essay.criteria[0]!.id]: 1 }, codes: { [essay.criteria[0]!.id]: ['a'] } });
  });
  it('a markbook defaults focus to empty', () => {
    expect(MarkbookSchema.parse({}).focus).toEqual({});
  });
});
```

Append to `tests/unit/markbook.test.js` (it has a class fixture and `markbookAction`):

```js
test('set_focus pins and dismisses tags per student', async () => {
  const { store, students } = await classWithStudents(); // use the file's existing helper that builds a class with a list
  const [s1] = students;
  const { markbook } = await markbookAction(store, 'class1', { action: 'set_focus', student_id: s1.id, pinned: ['tech:simile', 'tech:simile'], dismissed: ['tech:motif'] });
  assert.deepEqual(markbook.focus[s1.id], { pinned: ['tech:simile'], dismissed: ['tech:motif'] });
  const cleared = await markbookAction(store, 'class1', { action: 'set_focus', student_id: s1.id, pinned: [], dismissed: [] });
  assert.equal(s1.id in cleared.markbook.focus, false);
  await assert.rejects(markbookAction(store, 'class1', { action: 'set_focus', student_id: 'nobody', pinned: [] }), /class list/);
});
```

(Replace `classWithStudents` with the helper `tests/unit/markbook.test.js` already uses to set up `class1` and its roster.)

- [ ] **Step 2: Run** `cd apps/teaching && npx vitest run tests/unit/markbook-schema.test.ts` and `node --import ./scripts/test-network-guard.mjs --test tests/unit/markbook.test.js` — Expected: new tests FAIL.

- [ ] **Step 3: Implement `schema.ts`**

In `AssessmentMarkSchema` add:

```ts
  /** Feedback-code ids per criterion: why marks were lost. */
  codes: z.record(z.string(), z.array(z.string().min(1).max(64)).max(8)).optional()
```

In `MarkbookSchema` add:

```ts
  /** Per student: insight tags the teacher pinned as focus areas or dismissed. */
  focus: z
    .record(z.string(), z.object({ pinned: z.array(z.string().max(120)).max(12).default([]), dismissed: z.array(z.string().max(120)).max(40).default([]) }))
    .default({})
```

In `checkMark`'s assessment branch, after the criteria loop add:

```ts
    for (const id of Object.keys(mark.codes ?? {})) {
      if (!column.criteria.some((c) => c.id === id)) return { problem: 'Unknown criterion.' };
    }
    const codes = Object.fromEntries(Object.entries(mark.codes ?? {}).filter(([, list]) => list.length).map(([id, list]) => [id, [...new Set(list)]]));
```

and change its last two lines to:

```ts
    const { feedback, note, codes: _codes, ...rest } = mark;
    return { mark: { ...rest, ...(feedback ? { feedback } : {}), ...(note ? { note } : {}), ...(Object.keys(codes).length ? { codes } : {}) } };
```

In `pruneMarks`, replace `candidate = { ...mark, criteria: kept };` with:

```ts
      const rawCodes = mark.codes && typeof mark.codes === 'object' && !Array.isArray(mark.codes) ? (mark.codes as Record<string, unknown>) : {};
      const codes = Object.fromEntries(Object.entries(rawCodes).filter(([id]) => column.criteria.some((c) => c.id === id)));
      candidate = { ...mark, criteria: kept, codes };
```

- [ ] **Step 4: Implement `markbook.mjs`**

Before the final `reject(400, 'bad_action', …)` add:

```js
  if (action === 'set_focus') {
    if (!roster.students.some((s) => s.id === body.student_id)) reject(404, 'not_found', 'That student isn’t on the class list.');
    const list = (v, max) => (Array.isArray(v) ? [...new Set(v.filter((t) => typeof t === 'string' && t.length > 0 && t.length <= 120))].slice(0, max) : []);
    const pinned = list(body.pinned, 12);
    const dismissed = list(body.dismissed, 40);
    const markbook = await changeBook(store, classId, (book) => {
      const focus = { ...(book.focus ?? {}) };
      if (!pinned.length && !dismissed.length) delete focus[body.student_id];
      else focus[body.student_id] = { pinned, dismissed };
      book.focus = focus;
      return book;
    });
    return { markbook };
  }
```

In `quizColumns`' `.map((q) => ({ … }))`, add `closed: q.closed,` after `confidence: q.confidence,`.

- [ ] **Step 5: Regenerate, run, commit**

Run: `node scripts/generate-alchemy-schema.mjs && cd apps/teaching && npx vitest run tests/unit/markbook-schema.test.ts && cd ../.. && node --import ./scripts/test-network-guard.mjs --test tests/unit/markbook.test.js`
Expected: PASS.

```bash
git add apps/teaching/src/markbook/schema.ts netlify/functions/_shared/markbook-schema.mjs netlify/functions/_shared/markbook.mjs apps/teaching/tests/unit/markbook-schema.test.ts tests/unit/markbook.test.js
git commit -m "Teaching markbook: feedback codes per criterion, focus pins per student"
```

# Phase 4 — Quiz Results view

### Task 12: Client API and shared context

**Files:**
- Create: `apps/teaching/src/evidence/api.ts`, `apps/teaching/src/evidence/context.ts`

- [ ] **Step 1: Create `apps/teaching/src/evidence/api.ts`**

```ts
import { apiPost } from '@/api/client';
import type { InsightPayload } from './types';

export type InsightReply = InsightPayload | { published: false };
export const isInsight = (r: InsightReply | null): r is InsightPayload => !!r && !('published' in r && r.published === false);

const quizPath = (lessonId: string): string => `/api/lessons/${encodeURIComponent(lessonId)}/quiz`;

export type InsightApi = {
  load: (lessonId: string, classId: string | null) => Promise<InsightReply>;
  close: (lessonId: string, classId: string | null) => Promise<InsightReply>;
  reopen: (lessonId: string, classId: string | null) => Promise<InsightReply>;
  dismiss: (lessonId: string, flagId: string, undo?: boolean) => Promise<{ dismissed: string[] }>;
  classes: (lessonId: string) => Promise<{ classes: Array<{ id: string; title: string }> }>;
};

export const httpInsightApi: InsightApi = {
  load: (lessonId, classId) => apiPost<InsightReply>(quizPath(lessonId), { action: 'insight', class_id: classId }),
  close: (lessonId, classId) => apiPost<InsightReply>(quizPath(lessonId), { action: 'close', class_id: classId }),
  reopen: (lessonId, classId) => apiPost<InsightReply>(quizPath(lessonId), { action: 'reopen', class_id: classId }),
  dismiss: (lessonId, flagId, undo = false) => apiPost<{ dismissed: string[] }>(quizPath(lessonId), { action: 'dismiss_flag', flag_id: flagId, undo }),
  classes: (lessonId) => apiPost<{ classes: Array<{ id: string; title: string }> }>(quizPath(lessonId), { action: 'classes' })
};
```

- [ ] **Step 2: Create `apps/teaching/src/evidence/context.ts`**

```ts
import { peekCurriculum } from '@/app/curriculum-state';
import { loadFeedbackCodes, type FeedbackCode } from '@/blocks/feedback-codes';
import { loadLiteraryElements } from '@/blocks/literary-elements';
import { outcomeLabels } from '@/markbook/parse';
import { loadSkills } from '@/skills/api';
import type { TagContext } from './tags';

/** What the insight views need to name tags and codes. Each part may be missing; views fall back to raw ids. */
export type InsightContext = TagContext & { codes: FeedbackCode[] };

let cached: Promise<Omit<InsightContext, 'outcomes'>> | null = null;

export async function loadInsightContext(): Promise<InsightContext> {
  cached ??= Promise.all([
    loadLiteraryElements().catch(() => null),
    loadSkills().catch(() => null),
    loadFeedbackCodes().catch(() => [] as FeedbackCode[])
  ]).then(([table, skills, codes]) => ({ table, skills, codes }));
  // Outcomes are read each time: the curriculum may load after the first call.
  return { ...(await cached), outcomes: outcomeLabels(peekCurriculum()?.outcomes ?? []) };
}

export function codeLabel(id: string, codes: readonly FeedbackCode[]): string {
  const code = codes.find((c) => c.id === id);
  return code ? `${code.code} ${code.label}` : id;
}
```

- [ ] **Step 3: Type-check and commit**

Run: `cd apps/teaching && npx tsc --noEmit -p .` — Expected: no errors.

```bash
git add apps/teaching/src/evidence/api.ts apps/teaching/src/evidence/context.ts
git commit -m "Teaching evidence: insight API and shared tag context"
```

### Task 13: View parts

**Files:**
- Create: `apps/teaching/src/evidence/views/parts.ts`, `apps/teaching/src/evidence/views/insight.css`
- Test: `apps/teaching/tests/unit/evidence-views.test.ts`

- [ ] **Step 1: Failing test** — `apps/teaching/tests/unit/evidence-views.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { dotPlot, flagCards, mixUpList, questionTable, summaryCards, tagRows, tagSwitch } from '@/evidence/views/parts';
import { summary } from '@/evidence/stats';
import type { Flag, TagRow } from '@/evidence/types';

const label = (t: string) => t.slice(t.indexOf(':') + 1);

describe('view parts', () => {
  it('summary cards show percentages and a dash for missing reliability', () => {
    const node = summaryCards(summary([0.5, 0.7]), 2, 3, null, 'Needs 5 attempts.');
    expect(node.textContent).toContain('2/3');
    expect(node.textContent).toContain('60%');
    expect(node.querySelector('[title="Needs 5 attempts."]')?.textContent).toContain('–');
  });
  it('dot plot draws one dot per score and stacks equal scores', () => {
    const svg = dotPlot([0.5, 0.5, 0.9], summary([0.5, 0.5, 0.9]));
    const dots = [...svg.querySelectorAll('circle')];
    expect(dots).toHaveLength(3);
    expect(new Set(dots.map((d) => d.getAttribute('cy'))).size).toBe(2);
  });
  it('tag switch marks the current kind and reports picks', () => {
    const onPick = vi.fn();
    const node = tagSwitch(['tech', 'out'], 'tech', onPick);
    const [tech, out] = [...node.querySelectorAll('button')];
    expect(tech!.getAttribute('aria-pressed')).toBe('true');
    out!.click();
    expect(onPick).toHaveBeenCalledWith('out');
  });
  it('tag rows name bands', () => {
    const row: TagRow = { tag: 'tech:jux', mean: 0.3, full: 0.2, half: 0.2, confidence: 2.4, questions: 3, band: 'weak', groups: { weak: [], developing: [], secure: [] } };
    const node = tagRows([row, { ...row, tag: 'tech:motif', band: 'thin', questions: 1 }], label);
    expect(node.textContent).toContain('Weak');
    expect(node.textContent).toContain('1 question');
  });
  it('flag cards say who and offer dismiss', () => {
    const flag: Flag = { id: 'sure_wrong:tech:jux', type: 'sure_wrong', tag: 'tech:jux', students: ['s1', 's2'] };
    const onDismiss = vi.fn();
    const node = flagCards([flag], { label, who: (ids) => ids.join(', '), onDismiss });
    expect(node.textContent).toContain('Sure but wrong on jux');
    expect(node.textContent).toContain('s1, s2');
    [...node.querySelectorAll('button')].find((b) => b.textContent === 'Dismiss')!.click();
    expect(onDismiss).toHaveBeenCalledWith(flag);
  });
  it('mix-ups only list mistakes two or more students share', () => {
    const node = mixUpList(
      [
        { tag: 'tech:jux', key: 'named:tech:contrast', why: { type: 'named', as: 'tech:contrast', target: 'tech:jux' }, count: 3, students: [] },
        { tag: 'tech:jux', key: 'not_found', why: { type: 'not_found', target: 'tech:jux' }, count: 1, students: [] }
      ],
      label,
      (id) => id
    );
    expect(node.textContent).toContain('jux named as contrast · 3');
    expect(node.textContent).not.toContain('not found');
  });
  it('question table flags too easy and check question', () => {
    const node = questionTable(
      [{ id: 'q1', prompt: 'Find the simile', marks: 1, kind: 'spot_technique', outcomes: [] }, { id: 'q2', prompt: 'Name it', marks: 1, kind: 'quote_technique', outcomes: [] }],
      [{ facility: 0.97, discrimination: 0.05 }, { facility: 0.45, discrimination: -0.1 }],
      true
    );
    expect(node.textContent).toContain('Too easy');
    expect(node.textContent).toContain('Check question');
  });
});
```

- [ ] **Step 2: Run** `cd apps/teaching && npx vitest run tests/unit/evidence-views.test.ts` — Expected: FAIL, module not found.

- [ ] **Step 3: Create `apps/teaching/src/evidence/views/parts.ts`**

```ts
import { button, el } from '@/quiz/dom';
import { ITEM } from '../constants';
import type { CompareRow, Quadrants } from '../patterns';
import type { ItemStat, Summary } from '../stats';
import { TAG_KIND_LABEL, type Flag, type InsightQuestion, type MixUp, type TagKind, type TagRow } from '../types';
import './insight.css';

/** Small pieces the quiz insight and the markbook Patterns view share. */

export const pct = (share: number | null | undefined): string => (share === null || share === undefined ? '–' : `${Math.round(share * 100)}%`);
const short = (text: string): string => (text.length > 60 ? `${text.slice(0, 57)}…` : text || 'Question');

export function sectionHead(title: string, extra?: HTMLElement): HTMLElement {
  const head = el('div', 'ev-section');
  head.append(el('h5', 'ev-section__title', title));
  if (extra) head.append(extra);
  return head;
}

function card(label: string, value: string, why?: string): HTMLElement {
  const c = el('div', 'ev-card');
  c.append(el('span', 'ev-card__label', label), el('span', 'ev-card__value', value));
  if (why) c.title = why;
  return c;
}

export function summaryCards(s: Summary | null, attempts: number, of: number, alpha: number | null, alphaWhy: string): HTMLElement {
  const row = el('div', 'ev-cards');
  row.append(
    card('Attempts', of ? `${attempts}/${of}` : String(attempts)),
    card('Mean', pct(s?.mean)),
    card('Median', pct(s?.median)),
    card('Std dev', s ? String(Math.round(s.sd * 100)) : '–', 'Spread, in percentage points.'),
    card('Middle half', s ? `${Math.round(s.q1 * 100)}–${Math.round(s.q3 * 100)}%` : '–'),
    card('Reliability', alpha === null ? '–' : alpha.toFixed(2), alpha === null ? alphaWhy : 'Cronbach’s alpha. Around 0.7 or more is good for a class quiz.')
  );
  return row;
}

const SVG = 'http://www.w3.org/2000/svg';
function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/** One dot per student on a 0–100% line, equal scores stacked; the middle half shaded and the median marked. */
export function dotPlot(shares: number[], s: Summary | null): SVGSVGElement {
  const x = (share: number): number => 20 + share * 600;
  const stacks = new Map<number, number>();
  const dots: Array<[number, number]> = [];
  for (const share of [...shares].sort((a, b) => a - b)) {
    const bin = Math.round(share * 50);
    const k = stacks.get(bin) ?? 0;
    stacks.set(bin, k + 1);
    dots.push([x(bin / 50), 32 - k * 9]);
  }
  const top = Math.min(0, ...dots.map(([, y]) => y - 8));
  const root = svg('svg', { viewBox: `0 ${top} 640 ${60 - top}`, class: 'ev-dots', role: 'img' });
  const title = svg('title');
  title.textContent = `Scores of ${shares.length} ${shares.length === 1 ? 'student' : 'students'}${s ? `, median ${pct(s.median)}` : ''}`;
  root.append(title, svg('line', { x1: 20, y1: 40, x2: 620, y2: 40, class: 'ev-dots__axis' }));
  if (s) {
    root.append(svg('rect', { x: x(s.q1), y: 22, width: Math.max(2, x(s.q3) - x(s.q1)), height: 18, rx: 3, class: 'ev-dots__band' }));
    root.append(svg('line', { x1: x(s.median), y1: 16, x2: x(s.median), y2: 44, class: 'ev-dots__median' }));
  }
  for (const [cx, cy] of dots) root.append(svg('circle', { cx, cy, r: 4.5, class: 'ev-dots__dot' }));
  for (const [t, text] of [[0, '0%'], [0.5, '50%'], [1, '100%']] as const) {
    const tick = svg('text', { x: x(t), y: 56, 'text-anchor': 'middle', class: 'ev-dots__tick' });
    tick.textContent = text;
    root.append(tick);
  }
  return root;
}

export function tagSwitch(kinds: TagKind[], current: TagKind, onPick: (kind: TagKind) => void): HTMLElement {
  const group = el('div', 'ev-switch');
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', 'Group by');
  for (const kind of kinds) {
    const b = el('button', 'ev-switch__pill', TAG_KIND_LABEL[kind]);
    b.type = 'button';
    b.setAttribute('aria-pressed', String(kind === current));
    b.addEventListener('click', () => onPick(kind));
    group.append(b);
  }
  return group;
}

const BAND_TEXT = { weak: 'Weak', developing: 'Developing', secure: 'Secure', thin: '1 question' } as const;

/** Tags weakest first: a bar (dark = full marks, light = part marks), a band and how sure students were. */
export function tagRows(rows: TagRow[], label: (tag: string) => string): HTMLElement {
  if (!rows.length) return el('p', 'ev__empty', 'No tagged questions yet.');
  const list = el('ul', 'ev-tags');
  for (const r of rows) {
    const li = el('li', 'ev-tag');
    const bar = el('span', 'ev-bar');
    bar.setAttribute('aria-hidden', 'true');
    const full = el('span', `ev-bar__full ev-bar--${r.band}`);
    full.style.width = `${Math.round(r.full * 100)}%`;
    const part = el('span', 'ev-bar__part');
    part.style.width = `${Math.round(r.half * 100)}%`;
    bar.append(full, part);
    const meta = el('span', 'ev-tag__meta');
    meta.append(el('span', `ev-badge ev-badge--${r.band}`, BAND_TEXT[r.band]), ` ${pct(r.mean)}${r.confidence === null ? '' : ` · sure ${r.confidence.toFixed(1)}`}`);
    li.append(el('span', 'ev-tag__name', label(r.tag)), bar, meta);
    list.append(li);
  }
  return list;
}

const FLAG_TEXT: Record<Flag['type'], { head: (tag: string) => string; note: string }> = {
  sure_wrong: { head: (t) => `Sure but wrong on ${t}`, note: 'Likely a firm misunderstanding.' },
  guessing: { head: (t) => `Possible guessing on ${t}`, note: 'Right, but unsure. Check again before moving on.' },
  thin: { head: (t) => `${t} tested once`, note: 'Too little evidence to decide.' },
  outlier: { head: (t) => `Behind the class on ${t}`, note: 'The rest of the class is secure here.' }
};

export type FlagCardOptions = {
  label: (tag: string) => string;
  who: (ids: string[]) => string;
  onDismiss: (flag: Flag) => void;
  /** Shown as "Ann drafts follow-up quiz" when given. */
  onFollowUp?: (flag: Flag) => void;
  /** A follow-up already made from this flag, with what it found. */
  followed?: (flag: Flag) => { title: string; open: () => void; outcome: string | null } | null;
};

export function flagCards(flags: Flag[], o: FlagCardOptions): HTMLElement {
  if (!flags.length) return el('p', 'ev__empty', 'Nothing needs following up.');
  const list = el('ul', 'ev-flags');
  for (const f of flags) {
    const text = FLAG_TEXT[f.type];
    const li = el('li', 'ev-flag');
    const head = el('p', 'ev-flag__head');
    head.append(el('strong', undefined, text.head(o.label(f.tag))), f.students.length ? ` · ${o.who(f.students)}` : '');
    li.append(head, el('p', 'ev-flag__note', text.note));
    const actions = el('div', 'ev-flag__actions');
    const done = o.followed?.(f) ?? null;
    if (done) {
      const link = button(`Follow-up: ${done.title}`, 'ghost', () => done.open());
      actions.append(link);
      if (done.outcome) li.append(el('p', 'ev-flag__outcome', done.outcome));
    } else if (o.onFollowUp) actions.append(button('Ann drafts follow-up quiz', 'secondary', () => o.onFollowUp!(f)));
    actions.append(button('Dismiss', 'ghost', () => o.onDismiss(f)));
    li.append(actions);
    list.append(li);
  }
  return list;
}

export function mixUpText(m: MixUp, label: (tag: string) => string, codeLabel: (id: string) => string): string {
  const what = m.tag ? label(m.tag) : 'Question';
  switch (m.why.type) {
    case 'named':
      return `${what} named as ${label(m.why.as)}`;
    case 'not_found':
      return `${what} not found`;
    case 'option':
      return `${what}: picked “${m.why.text}”`;
    case 'placement':
      return `“${m.why.text}” put in the wrong place`;
    case 'code':
      return `${what}: ${codeLabel(m.why.id)}`;
  }
}

/** Mistakes two or more students share, most common first. */
export function mixUpList(mixUps: MixUp[], label: (tag: string) => string, codeLabel: (id: string) => string): HTMLElement {
  const shared = mixUps.filter((m) => m.count >= 2).slice(0, 8);
  if (!shared.length) return el('p', 'ev__empty', 'No mistake was shared by two or more students.');
  const list = el('ul', 'ev-mixups');
  for (const m of shared) list.append(el('li', undefined, `${mixUpText(m, label, codeLabel)} · ${m.count}`));
  return list;
}

export function quadrantGrid(q: Quadrants, who: (ids: string[]) => string): HTMLElement {
  if (!q.total) return el('p', 'ev__empty', 'This quiz didn’t ask how sure students were.');
  const share = (n: number) => pct(n / q.total);
  const grid = el('div', 'ev-cards ev-cards--two');
  const sureWrong = card('Sure but wrong', share(q.sureWrong));
  sureWrong.classList.add('ev-card--warn');
  if (q.sureWrongStudents.length) sureWrong.append(el('span', 'ev-card__who', who(q.sureWrongStudents)));
  grid.append(card('Sure and right', share(q.sureRight)), sureWrong, card('Unsure but right (guess?)', share(q.unsureRight)), card('Unsure and wrong', share(q.unsureWrong)));
  return grid;
}

/** Facility and discrimination per question, with a quality note. */
export function questionTable(questions: InsightQuestion[], stats: ItemStat[], showDiscrimination: boolean): HTMLElement {
  const table = el('table', 'ev-questions');
  const head = el('tr');
  for (const h of ['Question', 'Right', showDiscrimination ? 'Discrimination' : '', '']) head.append(el('th', undefined, h));
  table.append(head);
  questions.forEach((q, i) => {
    const s = stats[i];
    const tr = el('tr');
    const note =
      !s ? '' : s.facility >= ITEM.tooEasy ? 'Too easy' : s.facility <= ITEM.tooHard ? 'Too hard' : showDiscrimination && s.discrimination !== null && s.discrimination < 0 ? 'Check question' : '';
    const prompt = el('td', 'ev-questions__prompt', short(q.prompt));
    prompt.title = q.prompt;
    tr.append(
      prompt,
      el('td', undefined, pct(s?.facility)),
      el('td', undefined, showDiscrimination && s?.discrimination !== null && s?.discrimination !== undefined ? s.discrimination.toFixed(2) : ''),
      el('td', note ? `ev-badge ev-badge--${note === 'Check question' ? 'weak' : 'thin'}` : undefined, note)
    );
    table.append(tr);
  });
  return table;
}

export function comparePanel(rows: CompareRow[], label: (tag: string) => string, title: string): HTMLElement {
  const wrap = el('div', 'ev-compare');
  wrap.append(el('p', 'ev__note', `Before: ${title}. Each student’s change is a rough guide; one short quiz is noisy.`));
  if (!rows.length) {
    wrap.append(el('p', 'ev__empty', 'The two quizzes share no tags.'));
    return wrap;
  }
  const list = el('ul', 'ev-tags');
  for (const r of rows) {
    const sign = r.change >= 0 ? '+' : '−';
    list.append(el('li', 'ev-compare__row', `${label(r.tag)} · ${pct(r.before)} → ${pct(r.after)} (${sign}${Math.abs(Math.round(r.change * 100))}) · ${r.up} up a band, ${r.down} down`));
  }
  wrap.append(list);
  return wrap;
}
```

- [ ] **Step 4: Create `apps/teaching/src/evidence/views/insight.css`**

```css
.ev { display: grid; gap: var(--space-3); min-width: 0; }
.ev__head { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; }
.ev__status, .ev__note, .ev__empty { margin: 0; font: var(--text-sm) / 1.4 var(--font-ui); color: var(--muted); }
.ev-section { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); flex-wrap: wrap; margin-top: var(--space-2); }
.ev-section__title { margin: 0; font: var(--weight-semibold) var(--text-sm) / 1.3 var(--font-ui); color: var(--ink); }
.ev-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(96px, 1fr)); gap: var(--space-2); }
.ev-cards--two { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.ev-card { display: grid; gap: 2px; padding: var(--space-2) var(--space-3); border-radius: var(--radius-md); background: var(--surface-subtle, var(--paper)); border: 1px solid var(--line); }
.ev-card--warn { background: var(--warning-surface); }
.ev-card__label { font: var(--text-xs) / 1.3 var(--font-ui); color: var(--muted); }
.ev-card__value { font: var(--weight-semibold) var(--text-md) / 1.2 var(--font-ui); color: var(--ink); font-variant-numeric: tabular-nums; }
.ev-card__who { font: var(--text-xs) / 1.3 var(--font-ui); color: var(--ink); }
.ev-dots { width: 100%; height: auto; max-height: 120px; }
.ev-dots__axis { stroke: var(--line); stroke-width: 1; }
.ev-dots__band { fill: var(--marine); opacity: 0.15; }
.ev-dots__median { stroke: var(--marine); stroke-width: 2; }
.ev-dots__dot { fill: var(--muted); }
.ev-dots__tick { fill: var(--muted); font: 11px var(--font-ui); }
.ev-switch { display: flex; gap: var(--space-1); flex-wrap: wrap; }
.ev-switch__pill { padding: 2px var(--space-2); border: 1px solid var(--line); border-radius: var(--radius-full); background: none; font: var(--text-xs) / 1.6 var(--font-ui); color: var(--muted); cursor: pointer; min-height: 32px; }
.ev-switch__pill[aria-pressed='true'] { border-color: var(--marine); color: var(--marine); font-weight: var(--weight-semibold); }
.ev-tags, .ev-flags, .ev-mixups { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--space-1); }
.ev-tag { display: grid; grid-template-columns: minmax(0, 9rem) minmax(0, 1fr) auto; gap: var(--space-2); align-items: center; padding: var(--space-1) 0; border-bottom: 1px solid var(--line); font: var(--text-sm) / 1.3 var(--font-ui); }
.ev-bar { position: relative; display: flex; height: 10px; border-radius: 3px; background: var(--line); overflow: hidden; }
.ev-bar__full { background: var(--danger); }
.ev-bar__full.ev-bar--developing { background: var(--warning, #c08a1e); }
.ev-bar__full.ev-bar--secure { background: var(--success, #2f8f6b); }
.ev-bar__full.ev-bar--thin { background: var(--muted); }
.ev-bar__part { background: var(--danger-surface); }
.ev-badge { padding: 0 var(--space-1); border-radius: var(--radius-sm); font: var(--weight-semibold) var(--text-2xs) / 1.6 var(--font-ui); background: var(--line); color: var(--ink); }
.ev-badge--weak { background: var(--danger-surface); color: var(--danger); }
.ev-badge--secure { background: var(--success-surface, var(--line)); color: var(--success, var(--ink)); }
.ev-flag { padding: var(--space-2) var(--space-3); border: 1px solid var(--line); border-left: 3px solid var(--warning, var(--marine)); border-radius: 0; }
.ev-flag__head, .ev-flag__note, .ev-flag__outcome { margin: 0; font: var(--text-sm) / 1.4 var(--font-ui); }
.ev-flag__note { color: var(--muted); }
.ev-flag__actions { display: flex; gap: var(--space-2); flex-wrap: wrap; margin-top: var(--space-1); }
.ev-mixups li { font: var(--text-sm) / 1.6 var(--font-ui); }
.ev-questions { width: 100%; border-collapse: collapse; font: var(--text-sm) / 1.3 var(--font-ui); }
.ev-questions th { text-align: left; font-weight: var(--weight-semibold); color: var(--muted); }
.ev-questions td, .ev-questions th { padding: var(--space-1); border-bottom: 1px solid var(--line); }
.ev-questions__prompt { max-width: 0; width: 60%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
@media (max-width: 600px) {
  .ev-tag { grid-template-columns: minmax(0, 1fr) auto; }
  .ev-tag .ev-bar { grid-column: 1 / -1; grid-row: 2; }
}
```

Check token names against `apps/teaching/src/markbook/markbook.css` and the app's token file before committing; replace any token that doesn't exist (`--success`, `--warning`, `--surface-subtle`) with the nearest one the markbook already uses. The fallbacks keep the page readable if one is missed.

- [ ] **Step 5: Run and commit**

Run: `cd apps/teaching && npx vitest run tests/unit/evidence-views.test.ts && npx tsc --noEmit -p .`
Expected: PASS.

```bash
git add apps/teaching/src/evidence/views apps/teaching/tests/unit/evidence-views.test.ts
git commit -m "Teaching evidence: view parts for statistics, tags, flags, mix-ups"
```

### Task 14: The quiz insight view

**Files:**
- Create: `apps/teaching/src/evidence/views/quiz-insight.ts`
- Test: `apps/teaching/tests/unit/evidence-quiz-insight.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, expect, it, vi } from 'vitest';
import { renderQuizInsight } from '@/evidence/views/quiz-insight';
import type { InsightPayload } from '@/evidence/types';

const row = (id: string, awarded: number, confidence: 1 | 2 | 3 | null, tags: string[], why: InsightPayload['attempts'][number]['rows'][number]['items'][number]['why'] = []) =>
  ({ id, awarded, max: 1, confidence, codes: [], outcomes: [], items: [{ item: id, tags, share: awarded, why }] });
const attempt = (student: string, rows: ReturnType<typeof row>[]) => ({
  student, attempt_id: `${student}~0`, submitted_at: '2026-10-20T01:00:00Z', score: rows.reduce((s, r) => s + r.awarded, 0), max: rows.length, pending: 0, rows
});
const payload: InsightPayload = {
  lesson_id: 'l1', title: 'Pre-test', unit_id: 'u1', record_version: 'v1', class_id: 'c1', closed: false, closed_by: null, built_at: '', saved: false, confidence: true,
  students: [{ id: 's1', name: 'Ada Ash', initials: 'AA' }, { id: 's2', name: 'Bo Birch', initials: 'BB' }, { id: 's3', name: 'Cy Cole', initials: 'CC' }],
  questions: [{ id: 'q1', prompt: 'Spot it', marks: 1, kind: 'quote_technique', outcomes: [] }, { id: 'q2', prompt: 'Name it', marks: 1, kind: 'quote_technique', outcomes: [] }],
  attempts: [
    attempt('s1', [row('q1', 0, 3, ['tech:~juxtaposition', 'out:X'], [{ type: 'named', as: 'tech:~contrast', target: 'tech:~juxtaposition' }]), row('q2', 0, 3, ['tech:~juxtaposition', 'out:X'])]),
    attempt('s2', [row('q1', 0, 3, ['tech:~juxtaposition', 'out:X'], [{ type: 'named', as: 'tech:~contrast', target: 'tech:~juxtaposition' }]), row('q2', 1, 2, ['tech:~juxtaposition', 'out:X'])]),
    attempt('s3', [row('q1', 1, 1, ['tech:~juxtaposition', 'out:X']), row('q2', 1, 1, ['tech:~juxtaposition', 'out:X'])])
  ],
  compare_with: null, follow_up_of: null, follow_up_flag: null, for_students: [], dismissed: [], follow_ups: [], siblings: []
};
const ctx = { table: null, outcomes: [], skills: null, codes: [] };

describe('renderQuizInsight', () => {
  it('shows the summary, tags, flags and mix-ups for the default (technique) grouping', () => {
    const node = renderQuizInsight(payload, { ctx, onDismiss: vi.fn(), openLesson: vi.fn() });
    expect(node.textContent).toContain('3/3');
    expect(node.textContent).toContain('Juxtaposition');
    expect(node.textContent).toContain('Sure but wrong on Juxtaposition · AA, BB');
    expect(node.textContent).toContain('Juxtaposition named as Contrast · 2');
  });
  it('switches grouping', () => {
    const node = renderQuizInsight(payload, { ctx, onDismiss: vi.fn(), openLesson: vi.fn() });
    [...node.querySelectorAll<HTMLButtonElement>('.ev-switch__pill')].find((b) => b.textContent === 'Outcome')!.click();
    expect(node.querySelector('.ev-tag__name')?.textContent).toBe('X');
  });
  it('hides dismissed flags and offers Close now while open', () => {
    const onClose = vi.fn();
    const node = renderQuizInsight({ ...payload, dismissed: ['sure_wrong:tech:~juxtaposition'] }, { ctx, onDismiss: vi.fn(), openLesson: vi.fn(), onClose });
    expect(node.textContent).not.toContain('Sure but wrong');
    [...node.querySelectorAll('button')].find((b) => b.textContent === 'Close now')!.click();
    expect(onClose).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run** `cd apps/teaching && npx vitest run tests/unit/evidence-quiz-insight.test.ts` — Expected: FAIL.

- [ ] **Step 3: Create `apps/teaching/src/evidence/views/quiz-insight.ts`**

```ts
import { button, el } from '@/quiz/dom';
import { BANDS, ITEM } from '../constants';
import { codeLabel, type InsightContext } from '../context';
import { byTag, compare, confidenceQuadrants, defaultKind, findFlags, kindsPresent, mixUps } from '../patterns';
import { cronbachAlpha, itemStats, summary } from '../stats';
import { expandTags, payloadEvidence, tagLabel } from '../tags';
import type { Evidence, Flag, InsightPayload, TagKind } from '../types';
import { comparePanel, dotPlot, flagCards, mixUpList, quadrantGrid, questionTable, sectionHead, summaryCards, tagRows, tagSwitch } from './parts';

export type QuizInsightOptions = {
  ctx: InsightContext;
  /** The quiz picked in Compare with, for the same class. */
  compare?: InsightPayload | null;
  /** Insight of each follow-up made from this quiz, by lesson id. */
  followUps?: Map<string, InsightPayload>;
  onClose?: () => void;
  onReopen?: () => void;
  onDismiss: (flag: Flag) => void;
  onFollowUp?: (flag: Flag, kind: TagKind, evidence: Evidence[]) => void;
  openLesson: (lessonId: string) => void;
};

/** Of the flagged students, how many are now secure on the flag's tag in the follow-up. */
export function followUpOutcome(flag: Flag, follow: Evidence[]): string | null {
  const students = flag.students.length ? flag.students : [...new Set(follow.map((e) => e.student))];
  const sat = students.filter((s) => follow.some((e) => e.student === s && e.tags.includes(flag.tag) && e.share !== null));
  if (!sat.length) return null;
  const secure = sat.filter((s) => {
    const shares = follow.filter((e) => e.student === s && e.tags.includes(flag.tag) && e.share !== null).map((e) => e.share as number);
    return shares.reduce((a, b) => a + b, 0) / shares.length >= BANDS.secure;
  });
  return `${secure.length} of ${sat.length} now secure`;
}

export function renderQuizInsight(p: InsightPayload, o: QuizInsightOptions): HTMLElement {
  const root = el('section', 'ev');
  root.setAttribute('aria-label', 'Quiz insights');
  const evidence = expandTags(payloadEvidence(p), o.ctx.table);
  const kinds = kindsPresent(evidence);
  let kind: TagKind = defaultKind(evidence);
  const label = (tag: string): string => tagLabel(tag, o.ctx);
  const initials = new Map(p.students.map((s) => [s.id, s.initials]));
  const who = (ids: string[]): string => ids.map((id) => initials.get(id) ?? '?').join(', ');

  const head = el('div', 'ev__head');
  head.append(el('span', 'ev__status', p.closed ? (p.saved ? 'Closed · saved' : 'Closed') : 'Open · updates as students hand in'));
  if (!p.closed && o.onClose) head.append(button('Close now', 'secondary', () => o.onClose?.()));
  if (p.closed && p.closed_by === 'button' && o.onReopen) head.append(button('Reopen', 'ghost', () => o.onReopen?.()));
  if (p.follow_up_of) {
    const original = p.siblings.find((x) => x.lesson_id === p.follow_up_of);
    head.append(button(`Following up: ${original?.title ?? 'an earlier quiz'}`, 'ghost', () => o.openLesson(p.follow_up_of as string)));
  }
  root.append(head);

  const marked = p.attempts.filter((a) => a.pending === 0);
  const waiting = p.attempts.reduce((s, a) => s + a.pending, 0);
  const shares = marked.map((a) => (a.max ? a.score / a.max : 0));
  const s = summary(shares);
  const matrix = marked.map((a) => p.questions.map((q) => a.rows.find((r) => r.id === q.id)?.awarded ?? 0));
  const alpha = marked.length >= ITEM.alphaMinAttempts && p.questions.length >= ITEM.alphaMinItems ? cronbachAlpha(matrix) : null;
  root.append(summaryCards(s, p.attempts.length, p.students.length, alpha, `Needs ${ITEM.alphaMinAttempts} fully marked attempts and ${ITEM.alphaMinItems} questions.`));
  if (waiting) root.append(el('p', 'ev__note', `${waiting} ${waiting === 1 ? 'answer is' : 'answers are'} still to mark and left out of the numbers.`));
  if (shares.length) root.append(dotPlot(shares, s));

  const tagHost = el('div');
  const flagHost = el('div');
  const mixHost = el('div');
  const compareHost = el('div');
  root.append(tagHost, flagHost, mixHost);

  const paint = (): void => {
    const rows = byTag(evidence, kind);
    tagHost.replaceChildren(
      sectionHead('By tag · weakest first', kinds.length > 1 ? tagSwitch(kinds, kind, (k) => { kind = k; paint(); }) : undefined),
      tagRows(rows, label),
      el('p', 'ev__note', 'Dark: full marks. Light: part marks, such as the right words with the wrong name.')
    );
    const flags = findFlags(evidence, rows).filter((f) => !p.dismissed.includes(f.id));
    flagHost.replaceChildren(
      sectionHead('Follow up'),
      flagCards(flags, {
        label,
        who,
        onDismiss: o.onDismiss,
        onFollowUp: o.onFollowUp ? (f) => o.onFollowUp?.(f, kind, evidence) : undefined,
        followed: (f) => {
          const made = p.follow_ups.find((x) => x.flag === f.id);
          if (!made) return null;
          const follow = o.followUps?.get(made.lesson_id);
          return { title: made.title, open: () => o.openLesson(made.lesson_id), outcome: follow ? followUpOutcome(f, expandTags(payloadEvidence(follow), o.ctx.table)) : null };
        }
      })
    );
    mixHost.replaceChildren(sectionHead('Mix-ups'), mixUpList(mixUps(evidence, kind), label, (id) => codeLabel(id, o.ctx.codes)));
    if (o.compare) {
      const before = expandTags(payloadEvidence(o.compare), o.ctx.table);
      compareHost.replaceChildren(sectionHead('Compared with'), comparePanel(compare(before, evidence, kind), label, o.compare.title));
    }
  };
  paint();

  root.append(sectionHead('Confidence'), quadrantGrid(confidenceQuadrants(evidence), who));
  root.append(sectionHead('Questions'), questionTable(p.questions, itemStats(matrix, p.questions.map((q) => q.marks)), marked.length >= ITEM.discriminationMinAttempts));
  if (o.compare) root.append(compareHost);
  return root;
}
```

- [ ] **Step 4: Run and commit**

Run: `cd apps/teaching && npx vitest run tests/unit/evidence-quiz-insight.test.ts && npx tsc --noEmit -p .`
Expected: PASS. (With `table: null`, names stay as `tech:~…` and `tagLabel` capitalises them: "Juxtaposition", "Contrast".)

```bash
git add apps/teaching/src/evidence/views/quiz-insight.ts apps/teaching/tests/unit/evidence-quiz-insight.test.ts
git commit -m "Teaching evidence: quiz insight view"
```

### Task 15: Put insights in the quiz Results tab; Compare with in Settings

**Files:**
- Modify: `apps/teaching/src/quiz/teacher-panel.ts`

- [ ] **Step 1: State and loading.** Add imports:

```ts
import { httpInsightApi, isInsight, type InsightReply } from '@/evidence/api';
import { loadInsightContext, type InsightContext } from '@/evidence/context';
import type { InsightPayload } from '@/evidence/types';
import { renderQuizInsight } from '@/evidence/views/quiz-insight';
import { navigate } from '@/app/router';
```

In `QuizPanelOptions` add an optional test seam: `insightApi?: typeof httpInsightApi;`.

Beside the other `let` state in `mountQuizPanel`:

```ts
  const insightApi = options.insightApi ?? httpInsightApi;
  let insight: InsightPayload | null = null;
  let compareInsight: InsightPayload | null = null;
  const followInsights = new Map<string, InsightPayload>();
  let classes: Array<{ id: string; title: string }> | null = null;
  let insightClass: string | null = null;
  let ctx: InsightContext | null = null;
```

Add a loader after `post`:

```ts
  /** Insights for the chosen class, plus its Compare with quiz and follow-ups. */
  async function loadInsight(): Promise<void> {
    ctx ??= await loadInsightContext();
    if (!classes) {
      classes = (await insightApi.classes(lessonId)).classes;
      insightClass = classes[0]?.id ?? null;
    }
    const reply: InsightReply = await insightApi.load(lessonId, insightClass);
    insight = isInsight(reply) ? reply : null;
    compareInsight = null;
    if (insight?.compare_with) {
      const other = await insightApi.load(insight.compare_with, insightClass).catch(() => null);
      compareInsight = isInsight(other) ? other : null;
    }
    for (const f of insight?.follow_ups ?? []) {
      const reply2 = await insightApi.load(f.lesson_id, insightClass).catch(() => null);
      if (isInsight(reply2)) followInsights.set(f.lesson_id, reply2);
    }
  }
```

In `refresh()`, right after the line that loads `results`, add:

```ts
      if (tab === 'results' && !openAttempt) await loadInsight();
```

- [ ] **Step 2: Render.** In `resultsView()`, after `wrap.append(top);` and before the `if (!total)` check, add:

```ts
    if (insight && ctx) {
      if ((classes?.length ?? 0) > 1) {
        const pick = select((classes ?? []).map((c) => ({ value: c.id, label: c.title })), insightClass ?? '');
        pick.addEventListener('change', async () => {
          insightClass = pick.value || null;
          try {
            await loadInsight();
          } catch (error) {
            showError(error);
          }
          paint();
        });
        wrap.append(labelled('Class', pick, 'Insights use each student’s first attempt.'));
      }
      const act = (run: () => Promise<InsightReply>) => async () => {
        try {
          const reply = await run();
          insight = isInsight(reply) ? reply : insight;
        } catch (error) {
          showError(error);
        }
        paint();
      };
      wrap.append(
        renderQuizInsight(insight, {
          ctx,
          compare: compareInsight,
          followUps: followInsights,
          onClose: act(() => insightApi.close(lessonId, insightClass)),
          onReopen: act(() => insightApi.reopen(lessonId, insightClass)),
          onDismiss: async (flag) => {
            try {
              const { dismissed } = await insightApi.dismiss(lessonId, flag.id);
              if (insight) insight = { ...insight, dismissed };
            } catch (error) {
              showError(error);
            }
            paint();
          },
          openLesson: (id) => navigate(`/lessons/${encodeURIComponent(id)}`)
        })
      );
    }
```

Change the heading `wrap.append(el('h4', 'qz-h', 'By question'));` to `wrap.append(el('h4', 'qz-h', 'Answers by question'));` so the two question sections are told apart.

- [ ] **Step 3: Compare with in Settings.** In `settingsView()`, after the Closes field, add:

```ts
    const siblings = insight?.siblings ?? [];
    const current = raw.compare_with ?? '';
    const options = [{ value: '', label: 'None' }, ...siblings.map((s) => ({ value: s.lesson_id, label: s.title }))];
    if (current && !siblings.some((s) => s.lesson_id === current)) options.push({ value: current, label: 'An earlier quiz' });
    const compareWith = select(options, current);
    compareWith.addEventListener('change', () => save({ compare_with: compareWith.value || undefined }));
    grid.append(labelled('Compare with', compareWith, siblings.length ? 'Results shows before and after against this quiz. No republish needed.' : 'Open Results once to list this unit’s other quizzes.'));
    if (raw.for_students?.length) grid.append(el('p', 'qz-note block-secondary', `For ${raw.for_students.length} ${raw.for_students.length === 1 ? 'student' : 'students'} only (a follow-up quiz).`));
```

(`raw`, `grid`, `save` are the names `settingsView` already uses for the settings object, the field grid and the save helper; keep the file's names if they differ.)

- [ ] **Step 4: Run teacher-panel tests and types**

Run: `cd apps/teaching && npx vitest run $(ls tests/unit | grep -i -E "quiz-panel|teacher-panel" | sed 's#^#tests/unit/#') && npx tsc --noEmit -p .`
Expected: PASS. Existing panel tests that stub `apiPost` for `results` must also answer `classes` and `insight`; give them the `insightApi` seam with `{ classes: async () => ({ classes: [] }), load: async () => ({ published: false }), … }` rather than widening the stub.

- [ ] **Step 5: Commit**

```bash
git add apps/teaching/src/quiz/teacher-panel.ts apps/teaching/tests/unit
git commit -m "Teaching quiz: insights in Results, Close now, Compare with"
```

# Phase 5 — Markbook Patterns view and student panel

### Task 16: Markbook evidence

**Files:**
- Modify: `apps/teaching/src/markbook/types.ts`
- Create: `apps/teaching/src/evidence/markbook-evidence.ts`
- Test: `apps/teaching/tests/unit/markbook-patterns.test.ts` (new; Task 17 adds to it)

- [ ] **Step 1: Types.** In `apps/teaching/src/markbook/types.ts`:

```ts
import type { EvidenceItem } from '@/quiz/evidence';
```

Change `QuizRow` to:

```ts
export type QuizRow = { id: string; awarded: number | null; max: number; confidence: 1 | 2 | 3 | null; outcomes: string[]; codes?: string[]; items?: EvidenceItem[] };
```

and add `closed?: boolean;` to `QuizColumn` after `confidence`. Add to `MarkbookActions`:

```ts
  openStudent: (studentId: string) => void;
```

- [ ] **Step 2: Failing test** — `apps/teaching/tests/unit/markbook-patterns.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { markbookEvidence } from '@/evidence/markbook-evidence';
import type { MarkbookView } from '@/markbook/types';

export const view: MarkbookView = {
  markbook: {
    columns: [{ id: 'essay0001', kind: 'assessment', title: 'Essay', date: '2026-11-01', weight: 40, criteria: [{ id: 'c1', label: 'Analysis', max: 20, outcomes: ['o1'], skill: 'reading.inference' }] }],
    hidden_quizzes: [],
    marks: { essay0001: { s1: { criteria: { c1: 10 }, codes: { c1: ['code-e'] } }, s2: { criteria: {}, exempt: true } } },
    focus: {},
    updated_at: ''
  },
  students: [{ id: 's1', name: 'Ada Ash', initials: 'AA' }, { id: 's2', name: 'Bo Birch', initials: 'BB' }],
  quizzes: [
    {
      kind: 'quiz', id: 'quiz:l1', lesson_id: 'l1', title: 'Pre-test', date: '2026-10-20', hidden: false, confidence: true,
      questions: [{ id: 'q1', prompt: 'Name it', marks: 1, outcomes: [] }],
      scores: {
        s1: { attempt_id: 'a~0', submitted_at: '2026-10-20T01:00:00Z', score: 0, max: 1, pending: 0, rows: [{ id: 'q1', awarded: 0, max: 1, confidence: 3, outcomes: [], items: [{ item: 'q1', tags: ['tech:simile'], share: 0, why: [] }] }] },
        s2: { attempt_id: 'b~0', submitted_at: '2026-10-20T01:00:00Z', score: 1, max: 1, pending: 0, rows: [{ id: 'q1', awarded: 1, max: 1, confidence: 1, outcomes: [], items: [{ item: 'q1', tags: ['tech:simile'], share: 1, why: [] }] }] }
      }
    },
    { kind: 'quiz', id: 'quiz:l2', lesson_id: 'l2', title: 'Hidden', date: '2026-10-21', hidden: true, confidence: false, questions: [], scores: {} }
  ]
};

describe('markbookEvidence', () => {
  it('reads quiz items and assessment criteria, skipping hidden quizzes and exempt marks', () => {
    const { evidence, sources } = markbookEvidence(view);
    expect(sources.map((s) => s.title)).toEqual(['Pre-test', 'Essay']);
    expect(evidence.filter((e) => e.source === 'quiz:l1').map((e) => [e.student, e.share, e.confidence])).toEqual([
      ['s1', 0, 3],
      ['s2', 1, 1]
    ]);
    const essay = evidence.filter((e) => e.source === 'assess:essay0001');
    expect(essay).toEqual([
      { item: 'essay0001:c1', tags: ['out:o1', 'skill:reading.inference'], share: 0.5, why: [{ type: 'code', id: 'code-e' }], student: 's1', source: 'assess:essay0001', date: '2026-11-01', confidence: null }
    ]);
  });
});
```

- [ ] **Step 3: Run** `cd apps/teaching && npx vitest run tests/unit/markbook-patterns.test.ts` — Expected: FAIL.

- [ ] **Step 4: Create `apps/teaching/src/evidence/markbook-evidence.ts`**

```ts
import { assessments, sydneyDay } from '@/markbook/calc';
import { outcomeIdOf } from '@/markbook/parse';
import type { AssessmentMark } from '@/markbook/schema';
import type { MarkbookView, OutcomeLabel } from '@/markbook/types';
import type { Evidence } from './types';

export type Source = { source: string; title: string };

/**
 * Every piece of evidence the markbook holds: quiz items (first attempts,
 * shown quizzes only) and assessment criteria. Old outcome codes become
 * catalogue ids when `labels` are given.
 */
export function markbookEvidence(view: MarkbookView, labels: readonly OutcomeLabel[] = []): { evidence: Evidence[]; sources: Source[] } {
  const norm = (tag: string): string => (tag.startsWith('out:') ? `out:${outcomeIdOf(tag.slice(4), labels)}` : tag);
  const evidence: Evidence[] = [];
  const sources: Source[] = [];
  for (const quiz of view.quizzes) {
    if (quiz.hidden) continue;
    const source = `quiz:${quiz.lesson_id}`;
    sources.push({ source, title: quiz.title });
    for (const [student, score] of Object.entries(quiz.scores)) {
      const date = score.submitted_at ? sydneyDay(score.submitted_at) : quiz.date;
      for (const row of score.rows) for (const item of row.items ?? []) evidence.push({ ...item, tags: item.tags.map(norm), student, source, date, confidence: row.confidence });
    }
  }
  for (const column of assessments(view.markbook)) {
    const source = `assess:${column.id}`;
    sources.push({ source, title: column.title });
    for (const [student, raw] of Object.entries(view.markbook.marks[column.id] ?? {})) {
      const mark = raw as AssessmentMark | undefined;
      if (!mark || mark.exempt) continue;
      for (const c of column.criteria) {
        const given = mark.criteria?.[c.id];
        if (typeof given !== 'number' || c.max <= 0) continue;
        const share = Math.min(1, given / c.max);
        const tags = [...c.outcomes.map((o) => norm(`out:${o}`)), ...(c.skill ? [`skill:${c.skill}`] : [])];
        const why = share < 1 ? (mark.codes?.[c.id] ?? []).map((id) => ({ type: 'code' as const, id })) : [];
        evidence.push({ item: `${column.id}:${c.id}`, tags, share, why, student, source, date: column.date, confidence: null });
      }
    }
  }
  return { evidence, sources };
}
```

- [ ] **Step 5: Run, then fix fixtures elsewhere.** Run `cd apps/teaching && npx vitest run tests/unit/markbook-patterns.test.ts && npx tsc --noEmit -p .`. `Markbook` now has `focus`, and `MarkbookActions` has `openStudent`; add `focus: {}` to markbook fixtures and `openStudent: () => {}` to actions fixtures that `tsc` reports. Expected: PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add apps/teaching/src/markbook/types.ts apps/teaching/src/evidence/markbook-evidence.ts apps/teaching/tests/unit
git commit -m "Teaching markbook: evidence from quizzes and assessment criteria"
```

### Task 17: Patterns view

**Files:**
- Create: `apps/teaching/src/markbook/patterns-view.ts`
- Modify: `apps/teaching/src/markbook/markbook.css`
- Test: `apps/teaching/tests/unit/markbook-patterns.test.ts`

- [ ] **Step 1: Failing test** — append:

```ts
import { vi } from 'vitest';
import { renderPatterns } from '@/markbook/patterns-view';

describe('renderPatterns', () => {
  const ctx = { table: null, outcomes: [], skills: null, codes: [] };
  it('draws the class trend, tag table and heatmap; groups open a student list', () => {
    const openStudent = vi.fn();
    const node = renderPatterns(view, view.students, ctx, { openStudent });
    expect(node.querySelector('.mb-trend')).not.toBeNull();
    expect(node.querySelector('.mb-patterns__tags')?.textContent).toContain('simile');
    const weak = node.querySelector<HTMLButtonElement>('[data-group="weak"]');
    expect(weak).toBeNull(); // one question per student: below the group minimum
    const cell = node.querySelector<HTMLButtonElement>('.mb-patterns__cell[data-student="s1"]');
    expect(cell?.textContent).toBe('0');
    node.querySelector<HTMLButtonElement>('.mb-patterns__name[data-student="s2"]')!.click();
    expect(openStudent).toHaveBeenCalledWith('s2');
  });
});
```

- [ ] **Step 2: Run** — Expected: FAIL, module not found.

- [ ] **Step 3: Create `apps/teaching/src/markbook/patterns-view.ts`**

```ts
import { el } from '@/quiz/dom';
import type { InsightContext } from '@/evidence/context';
import { markbookEvidence } from '@/evidence/markbook-evidence';
import { byTag, defaultKind, kindsPresent, trend, type TrendPoint } from '@/evidence/patterns';
import { expandTags, tagLabel } from '@/evidence/tags';
import type { Evidence, StudentBand, TagKind } from '@/evidence/types';
import { pct, sectionHead, tagSwitch } from '@/evidence/views/parts';
import { sparkline } from './grid';
import { band4 } from './insight';
import { openOverlay } from './overlay';
import type { MarkbookView, RosterStudent } from './types';

export type PatternsActions = {
  openStudent: (studentId: string) => void;
  /** Phase 7: offer Ann a follow-up for a group of students on one tag. */
  followUp?: (tag: string, students: string[], evidence: Evidence[]) => void;
};

const SVG = 'http://www.w3.org/2000/svg';

/** Median and middle half per quiz or task, oldest first. */
function trendChart(points: TrendPoint[]): SVGSVGElement {
  const root = document.createElementNS(SVG, 'svg');
  root.setAttribute('viewBox', '0 0 640 140');
  root.setAttribute('class', 'mb-trend');
  root.setAttribute('role', 'img');
  const title = document.createElementNS(SVG, 'title');
  title.textContent = points.length ? `Class median from ${pct(points[0]!.median)} to ${pct(points[points.length - 1]!.median)}` : 'No marks yet';
  root.append(title);
  const x = (i: number): number => (points.length < 2 ? 340 : 60 + (i * 540) / (points.length - 1));
  const y = (share: number): number => 110 - share * 90;
  const add = (tag: string, attrs: Record<string, string | number>, text?: string) => {
    const n = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
    if (text) n.textContent = text;
    root.append(n);
  };
  for (const share of [0, 0.5, 1]) {
    add('line', { x1: 40, x2: 620, y1: y(share), y2: y(share), class: 'mb-trend__grid' });
    add('text', { x: 4, y: y(share) + 4, class: 'mb-trend__tick' }, `${share * 100}`);
  }
  if (points.length > 1) {
    const band = [...points.map((p, i) => `${x(i)},${y(p.q3)}`), ...points.map((p, i) => `${x(i)},${y(p.q1)}`).reverse()].join(' ');
    add('polygon', { points: band, class: 'mb-trend__band' });
    add('polyline', { points: points.map((p, i) => `${x(i)},${y(p.median)}`).join(' '), class: 'mb-trend__line' });
  }
  points.forEach((p, i) => {
    add('circle', { cx: x(i), cy: y(p.median), r: 4, class: 'mb-trend__dot' });
    add('text', { x: x(i), y: 134, 'text-anchor': 'middle', class: 'mb-trend__tick' }, p.title.length > 14 ? `${p.title.slice(0, 13)}…` : p.title);
  });
  return root;
}

function evidenceSheet(title: string, items: Evidence[], sourceTitle: (source: string) => string): void {
  const body = el('div', 'mb-sheet');
  const heading = el('h3', 'mb-form__title', title);
  heading.id = `mb-ev-${Math.random().toString(36).slice(2, 8)}`;
  const close = el('button', 'btn btn--secondary mb-sheet__close', 'Close');
  close.type = 'button';
  const list = el('ul', 'mb-attempt');
  for (const e of items) list.append(el('li', undefined, `${sourceTitle(e.source)} · ${e.item.split('#')[0]} · ${pct(e.share)}`));
  body.append(close, heading, list);
  const opened = openOverlay(body, { labelledBy: heading.id });
  close.addEventListener('click', () => opened.close());
}

export function renderPatterns(view: MarkbookView, students: RosterStudent[], ctx: InsightContext, actions: PatternsActions): HTMLElement {
  const root = el('div', 'mb-patterns');
  const { evidence: raw, sources } = markbookEvidence(view, ctx.outcomes);
  const evidence = expandTags(raw, ctx.table);
  const label = (tag: string): string => tagLabel(tag, ctx);
  const titleOf = new Map(sources.map((s) => [s.source, s.title]));
  const names = new Map(students.map((s) => [s.id, s]));
  let kind: TagKind = defaultKind(evidence);
  const kinds = kindsPresent(evidence);

  root.append(sectionHead('Class over time'), trendChart(trend(evidence, sources)));
  const tagsHost = el('div', 'mb-patterns__tags');
  const heatHost = el('div', 'mb-patterns__heat');
  root.append(tagsHost, heatHost);

  const paint = (): void => {
    const rows = byTag(evidence, kind);
    const table = el('table', 'mb-grid__table mb-patterns__table');
    const head = el('tr');
    for (const h of ['Tag', 'Now', 'Change', 'Trend', 'Evidence', 'Groups']) head.append(el('th', undefined, h));
    table.append(head);
    for (const r of rows) {
      const points = trend(evidence, sources, r.tag);
      const change = points.length > 1 ? points[points.length - 1]!.median - points[0]!.median : null;
      const tr = el('tr');
      const groups = el('td', 'mb-patterns__groups');
      for (const band of ['weak', 'developing', 'secure'] as StudentBand[]) {
        const ids = r.groups[band];
        if (!ids.length) continue;
        const b = el('button', `mb-patterns__group mb-band--${band === 'weak' ? 'low' : band === 'developing' ? 'mid' : 'high'}`, String(ids.length));
        b.type = 'button';
        b.dataset.group = band;
        b.setAttribute('aria-label', `${ids.length} ${band}`);
        b.addEventListener('click', () => {
          table.querySelector('.mb-patterns__expand')?.remove();
          const holder = el('tr', 'mb-patterns__expand');
          const cell = el('td');
          cell.colSpan = 6;
          const list = el('div', 'mb-patterns__list');
          list.append(el('p', undefined, `${label(r.tag)}, ${band}: ${ids.map((id) => names.get(id)?.name ?? 'Removed student').join(', ')}`));
          if (actions.followUp) {
            const ann = el('button', 'btn btn--secondary', 'Ann drafts follow-up quiz');
            ann.type = 'button';
            ann.addEventListener('click', () => actions.followUp?.(r.tag, ids, evidence));
            list.append(ann);
          }
          cell.append(list);
          holder.append(cell);
          tr.after(holder);
        });
        groups.append(b);
      }
      const spark = el('td');
      if (points.length > 1) spark.append(sparkline(points.map((p) => p.median * 100)));
      tr.append(
        el('th', undefined, label(r.tag)),
        el('td', undefined, pct(r.mean)),
        el('td', undefined, change === null ? '–' : `${change >= 0 ? '+' : '−'}${Math.abs(Math.round(change * 100))}`),
        spark,
        el('td', undefined, `${r.questions} Qs`),
        groups
      );
      table.append(tr);
    }
    const wrap = el('div', 'mb-grid');
    wrap.append(table);
    tagsHost.replaceChildren(sectionHead('Tags', kinds.length > 1 ? tagSwitch(kinds, kind, (k) => { kind = k; paint(); }) : undefined), rows.length ? wrap : el('p', 'mb__empty', 'No tagged marks yet.'));

    const heat = el('table', 'mb-grid__table mb-patterns__heatmap');
    const hr = el('tr');
    const corner = el('th', 'mb-grid__student', 'Student');
    corner.scope = 'col';
    hr.append(corner);
    for (const r of rows) {
      const th = el('th', undefined, label(r.tag));
      th.scope = 'col';
      hr.append(th);
    }
    heat.append(hr);
    for (const s of students) {
      const tr = el('tr');
      const name = el('th', 'mb-grid__student');
      name.scope = 'row';
      const nb = el('button', 'mb-patterns__name', `${s.initials} · ${s.name}`);
      nb.type = 'button';
      nb.dataset.student = s.id;
      nb.addEventListener('click', () => actions.openStudent(s.id));
      name.append(nb);
      tr.append(name);
      for (const r of rows) {
        const mine = evidence.filter((e) => e.student === s.id && e.tags.includes(r.tag) && e.share !== null);
        const td = el('td');
        if (mine.length) {
          const mean = mine.reduce((a, e) => a + (e.share as number), 0) / mine.length;
          const b = el('button', `mb-patterns__cell mb-band--${band4(mean * 100)}`, String(Math.round(mean * 100)));
          b.type = 'button';
          b.dataset.student = s.id;
          b.setAttribute('aria-label', `${s.name}, ${label(r.tag)}: ${Math.round(mean * 100)}% from ${mine.length}`);
          b.addEventListener('click', () => evidenceSheet(`${s.name} · ${label(r.tag)}`, mine, (src) => titleOf.get(src) ?? src));
          td.append(b);
        } else td.append(el('span', 'mb-heat--none', '–'));
        tr.append(td);
      }
      heat.append(tr);
    }
    const heatWrap = el('div', 'mb-grid');
    heatWrap.append(heat);
    heatHost.replaceChildren(sectionHead('Students × tags'), heatWrap);
  };
  paint();
  return root;
}
```

- [ ] **Step 4: CSS** — append to `apps/teaching/src/markbook/markbook.css`:

```css
.mb-patterns { display: grid; gap: var(--space-3); min-width: 0; }
.mb-trend { width: 100%; height: auto; max-height: 180px; }
.mb-trend__grid { stroke: var(--line); stroke-width: 1; }
.mb-trend__band { fill: var(--marine); opacity: 0.15; }
.mb-trend__line { fill: none; stroke: var(--marine); stroke-width: 2; }
.mb-trend__dot { fill: var(--marine); }
.mb-trend__tick { fill: var(--muted); font: 11px var(--font-ui); }
.mb-patterns__table th:first-child, .mb-patterns__table td:first-child { text-align: left; }
.mb-patterns__groups { display: flex; gap: var(--space-1); justify-content: center; }
.mb-patterns__group, .mb-patterns__cell { min-width: 32px; min-height: 32px; border: 0; border-radius: var(--radius-sm); font: inherit; font-variant-numeric: tabular-nums; cursor: pointer; }
.mb-patterns__name { border: 0; background: none; padding: 0; font: inherit; color: var(--marine); cursor: pointer; text-align: left; }
.mb-patterns__list { display: grid; gap: var(--space-2); text-align: left; white-space: normal; }
```

- [ ] **Step 5: Run and commit**

Run: `cd apps/teaching && npx vitest run tests/unit/markbook-patterns.test.ts && npx tsc --noEmit -p .` — Expected: PASS.

```bash
git add apps/teaching/src/markbook/patterns-view.ts apps/teaching/src/markbook/markbook.css apps/teaching/tests/unit/markbook-patterns.test.ts
git commit -m "Teaching markbook: Patterns view with class trend, tags and heatmap"
```

### Task 18: Student panel

**Files:**
- Create: `apps/teaching/src/markbook/student-panel.ts`
- Test: `apps/teaching/tests/unit/markbook-patterns.test.ts`

- [ ] **Step 1: Failing test** — append:

```ts
import { studentPanelBody } from '@/markbook/student-panel';

describe('student panel', () => {
  it('lists focus areas with pin and dismiss, secure tags and confidence', () => {
    const ev = [0, 0.2, 0.4].map((share, i) => ({ item: `q${i}`, tags: ['tech:jux'], share, why: [], student: 's1', source: 'quiz:l1', date: '2026-10-20', confidence: 3 as const }));
    const onPins = vi.fn();
    const node = studentPanelBody({
      student: { id: 's1', name: 'Ada Ash', initials: 'AA' }, evidence: ev, kind: 'tech', label: (t) => t.slice(5), codeLabel: (id) => id,
      pins: { pinned: [], dismissed: [] }, onPins, overall: '64%'
    });
    expect(node.textContent).toContain('Focus areas');
    expect(node.textContent).toContain('jux');
    expect(node.textContent).toContain('Sure but wrong 3 times');
    [...node.querySelectorAll('button')].find((b) => b.textContent === 'Pin')!.click();
    expect(onPins).toHaveBeenCalledWith({ pinned: ['tech:jux'], dismissed: [] });
  });
});
```

- [ ] **Step 2: Run** — Expected: FAIL.

- [ ] **Step 3: Create `apps/teaching/src/markbook/student-panel.ts`**

```ts
import { el } from '@/quiz/dom';
import { focusFor, type FocusPins } from '@/evidence/patterns';
import type { Evidence, TagKind } from '@/evidence/types';
import { mixUpText, pct } from '@/evidence/views/parts';
import { openOverlay } from './overlay';
import type { RosterStudent } from './types';

export type StudentPanelOptions = {
  student: RosterStudent;
  evidence: Evidence[];
  kind: TagKind;
  label: (tag: string) => string;
  codeLabel: (id: string) => string;
  pins: FocusPins;
  onPins: (pins: FocusPins) => void;
  overall: string;
};

/** One student's focus areas, secure tags and confidence, for the panel and for tests. */
export function studentPanelBody(o: StudentPanelOptions): HTMLElement {
  const body = el('div', 'mb-student-panel');
  const heading = el('h3', 'mb-panel__student', `${o.student.initials} · ${o.student.name}`);
  body.append(heading, el('p', 'mb-panel__task', `Overall ${o.overall}`));
  const { focus, secure } = focusFor(o.evidence, o.student.id, o.kind, o.pins);

  body.append(el('h4', 'mb-form__label', 'Focus areas'));
  if (!focus.length) body.append(el('p', 'mb__empty', 'No weak area has enough evidence yet.'));
  const list = el('ul', 'mb-focus');
  for (const f of focus) {
    const li = el('li', 'mb-focus__item');
    const top = f.why.length ? mixUpText({ tag: f.tag, key: '', why: f.why[0]!, count: 1, students: [] }, o.label, o.codeLabel) : '';
    li.append(el('span', undefined, `${pct(f.mean)} ${o.label(f.tag)} · ${f.items} ${f.items === 1 ? 'item' : 'items'}${top ? ` · ${top}` : ''}`));
    const pin = el('button', 'btn btn--ghost', f.pinned ? 'Unpin' : 'Pin');
    pin.type = 'button';
    pin.addEventListener('click', () =>
      o.onPins(f.pinned ? { ...o.pins, pinned: o.pins.pinned.filter((t) => t !== f.tag) } : { ...o.pins, pinned: [...o.pins.pinned, f.tag] })
    );
    li.append(pin);
    if (!f.pinned) {
      const dismiss = el('button', 'btn btn--ghost', 'Dismiss');
      dismiss.type = 'button';
      dismiss.addEventListener('click', () => o.onPins({ ...o.pins, dismissed: [...o.pins.dismissed, f.tag] }));
      li.append(dismiss);
    }
    list.append(li);
  }
  body.append(list);

  body.append(el('h4', 'mb-form__label', 'Secure'));
  body.append(el('p', 'mb__empty', secure.length ? secure.map((s) => `${o.label(s.tag)} ${pct(s.mean)}`).join(' · ') : 'Nothing secure with enough evidence yet.'));

  const mine = o.evidence.filter((e) => e.student === o.student.id && e.share !== null);
  const sureWrong = mine.filter((e) => e.confidence === 3 && (e.share as number) < 1);
  body.append(el('h4', 'mb-form__label', 'Confidence'));
  body.append(
    el('p', 'mb__empty', sureWrong.length ? `Sure but wrong ${sureWrong.length} ${sureWrong.length === 1 ? 'time' : 'times'}, on ${[...new Set(sureWrong.flatMap((e) => e.tags.filter((t) => t.startsWith(`${o.kind}:`))))].map(o.label).join(', ') || 'untagged questions'}.` : 'Never sure and wrong.')
  );
  if (o.pins.dismissed.length) {
    const undo = el('button', 'btn btn--ghost', `Show ${o.pins.dismissed.length} dismissed`);
    undo.type = 'button';
    undo.addEventListener('click', () => o.onPins({ ...o.pins, dismissed: [] }));
    body.append(undo);
  }
  return body;
}

export function openStudentPanel(o: StudentPanelOptions & { returnFocus?: () => HTMLElement | null }): void {
  const sheet = el('div', 'mb-sheet mb-sheet--student');
  const close = el('button', 'btn btn--secondary mb-sheet__close', 'Close');
  close.type = 'button';
  let body = studentPanelBody({ ...o, onPins: (pins) => redraw(pins) });
  const heading = body.querySelector('h3') as HTMLElement;
  heading.id = `mb-student-${o.student.id}`;
  sheet.append(close, body);
  const opened = openOverlay(sheet, { labelledBy: heading.id, returnFocus: o.returnFocus });
  close.addEventListener('click', () => opened.close());
  function redraw(pins: Parameters<StudentPanelOptions['onPins']>[0]): void {
    o.onPins(pins);
    o = { ...o, pins };
    const next = studentPanelBody({ ...o, onPins: (p) => redraw(p) });
    (next.querySelector('h3') as HTMLElement).id = heading.id;
    body.replaceWith(next);
    body = next;
  }
}
```

Add to `markbook.css`:

```css
.mb-focus { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--space-1); }
.mb-focus__item { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; font: var(--text-sm) / 1.4 var(--font-ui); }
@media (max-width: 600px) { .mb-sheet--student { width: 100vw; height: 100dvh; max-height: none; border-radius: 0; } }
```

- [ ] **Step 4: Run and commit**

Run: `cd apps/teaching && npx vitest run tests/unit/markbook-patterns.test.ts && npx tsc --noEmit -p .` — Expected: PASS.

```bash
git add apps/teaching/src/markbook/student-panel.ts apps/teaching/src/markbook/markbook.css apps/teaching/tests/unit/markbook-patterns.test.ts
git commit -m "Teaching markbook: student panel with focus areas"
```

### Task 19: Wire Patterns and the student panel into the markbook; retire Outcomes

**Files:**
- Modify: `apps/teaching/src/teacher/sections/markbook.ts`, `apps/teaching/src/markbook/api.ts`, `apps/teaching/src/markbook/grid.ts`
- Delete: `apps/teaching/src/markbook/outcomes-view.ts`
- Test: `apps/teaching/tests/unit/markbook-section.test.ts`, `apps/teaching/tests/unit/markbook-views.test.ts`

- [ ] **Step 1: API.** In `api.ts` add to `MarkbookApi`:

```ts
  setFocus: (classId: string, studentId: string, pinned: string[], dismissed: string[]) => Promise<Markbook>;
```

and to `httpMarkbookApi`:

```ts
  setFocus: (classId, studentId, pinned, dismissed) => write(classId, { action: 'set_focus', student_id: studentId, pinned, dismissed })
```

- [ ] **Step 2: Grid names open the panel.** In `grid.ts` `studentHead(view, student)`, add an optional third parameter `onOpen?: (id: string) => void` and replace the plain name span with:

```ts
  const name = onOpen ? el('button', 'mb-student__name mb-patterns__name', student.name) : el('span', 'mb-student__name', student.name);
  if (onOpen && name instanceof HTMLButtonElement) {
    name.type = 'button';
    name.addEventListener('click', () => onOpen(student.id));
  }
```

In `renderGrid`, pass `actions.openStudent` as the third argument where it calls `studentHead`.

- [ ] **Step 3: Section.** In `apps/teaching/src/teacher/sections/markbook.ts`:

Imports — remove the `renderOutcomes`/`OutcomeSelection` import, add:

```ts
import { renderPatterns } from '@/markbook/patterns-view';
import { openStudentPanel } from '@/markbook/student-panel';
import { loadInsightContext, codeLabel, type InsightContext } from '@/evidence/context';
import { markbookEvidence } from '@/evidence/markbook-evidence';
import { defaultKind } from '@/evidence/patterns';
import { expandTags, tagLabel } from '@/evidence/tags';
import { formatPercent, overallFor } from '@/markbook/calc';
```

(Merge `formatPercent, overallFor` into the existing `@/markbook/calc` import.)

`Change` gains `| { kind: 'focus'; studentId: string; pinned: string[]; dismissed: string[] }`, and `applyChange` handles it first:

```ts
  if (change.kind === 'focus') {
    const focus = { ...(view.markbook.focus ?? {}) };
    if (!change.pinned.length && !change.dismissed.length) delete focus[change.studentId];
    else focus[change.studentId] = { pinned: change.pinned, dismissed: change.dismissed };
    return { ...view, markbook: { ...view.markbook, focus } };
  }
```

(Put the existing mark handling after it, unchanged.)

Replace `let mode: 'grid' | 'outcomes' = 'grid';` with `let mode: 'grid' | 'patterns' = 'grid';`, delete `selectedOutcome`, change the toggle label to `'Patterns'`, and add context loading after `void load();`:

```ts
  let ctx: InsightContext | null = null;
  void loadInsightContext().then((loaded) => {
    ctx = { ...loaded, outcomes: options.outcomes ?? loaded.outcomes };
    if (mode === 'patterns') paint();
  });
```

In `draw()`, change `toggle.setAttribute('aria-pressed', String(mode === 'outcomes'));` to `String(mode === 'patterns')` and replace the `if (mode === 'outcomes') { … }` block with:

```ts
    if (mode === 'patterns') {
      body.replaceChildren(ctx ? renderPatterns(current, students, ctx, { openStudent: actions.openStudent }) : el('p', 'mb__status', 'Loading patterns…'));
    }
```

In the toggle handler: `mode = mode === 'grid' ? 'patterns' : 'grid';`.

Add `openStudent` to `actions`:

```ts
    openStudent: (studentId) => {
      const student = view?.students.find((s) => s.id === studentId);
      if (!view || !student || !ctx) return;
      const context = ctx;
      const evidence = expandTags(markbookEvidence(view, context.outcomes).evidence, context.table);
      const pins = view.markbook.focus?.[studentId] ?? { pinned: [], dismissed: [] };
      openStudentPanel({
        student,
        evidence,
        kind: defaultKind(evidence),
        label: (tag) => tagLabel(tag, context),
        codeLabel: (id) => codeLabel(id, context.codes),
        pins,
        overall: formatPercent(overallFor(view.markbook, studentId).percent),
        onPins: (next) =>
          change({ kind: 'focus', studentId, pinned: next.pinned, dismissed: next.dismissed }, () => api.setFocus(cls.id, studentId, next.pinned, next.dismissed)),
        returnFocus: () => title
      });
    },
```

`change(...)` already queues, saves and rolls back on failure; if its signature types `Change` narrowly, the new union member covers it.

Delete `apps/teaching/src/markbook/outcomes-view.ts`. Then run `grep -rn "outcomes-view\|renderOutcomes\|outcomeCell\|outcomesInView\|evidenceFor" apps/teaching/src apps/teaching/tests` and remove what only the outcomes view used from `insight.ts` (keep `band4`, `heatShare`, `reteachList`, `quizSeries`, `isDropping`, `isConfidentlyWrong`, which other files import).

- [ ] **Step 4: Update tests.** In `markbook-section.test.ts`:
- `keeps the Outcomes label…` → expect `'Patterns'`.
- `draws the outcomes view from the Outcomes toggle…` → expect `.mb-patterns` after toggling (stub `loadInsightContext` with `vi.mock('@/evidence/context', () => ({ loadInsightContext: async () => ({ table: null, skills: null, codes: [], outcomes: [] }), codeLabel: (id: string) => id }))` at the top of the file), and back to the grid.
- `keeps the outcomes table on a phone` → expect `.mb-patterns .mb-grid` on a phone.
- Add `setFocus: vi.fn(async () => book)` to the fake API object the file builds.

In `markbook-views.test.ts` and `markbook-insight.test.ts`, delete the cases for removed functions.

- [ ] **Step 5: Run the markbook suite and types**

Run: `cd apps/teaching && npx vitest run tests/unit/markbook-*.test.ts && npx tsc --noEmit -p .`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A apps/teaching/src/markbook apps/teaching/src/teacher/sections/markbook.ts apps/teaching/tests/unit
git commit -m "Teaching markbook: Patterns replaces Outcomes; names open the student panel"
```

# Phase 6 — Feedback-code chips

### Task 20: Chip component

**Files:**
- Create: `apps/teaching/src/evidence/code-chips.ts`
- Test: `apps/teaching/tests/unit/evidence-code-chips.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, expect, it, vi } from 'vitest';
import { codeChips } from '@/evidence/code-chips';
import type { FeedbackCode } from '@/blocks/feedback-codes';

const code = (id: string, c: string, group: FeedbackCode['group'], hidden = false): FeedbackCode =>
  ({ id, code: c, label: c, group, criterion: null, colour: 'sage', descriptor: `${c} means…`, hidden }) as FeedbackCode;
const codes = [code('ts', 'TS', 'composition'), code('e', 'E', 'composition'), code('v', 'VP', 'viva'), code('h', 'X', 'composition', true)];

describe('codeChips', () => {
  it('shows composition codes, toggles them, and hides the rest behind More codes', () => {
    const onChange = vi.fn();
    const node = codeChips({ codes, selected: ['e'], onChange });
    const chips = () => [...node.querySelectorAll<HTMLButtonElement>('.ev-chip')];
    expect(chips().map((b) => b.textContent)).toEqual(['TS', 'E']);
    expect(chips()[1]!.getAttribute('aria-pressed')).toBe('true');
    expect(chips()[0]!.title).toBe('TS means…');
    chips()[0]!.click();
    expect(onChange).toHaveBeenLastCalledWith(['e', 'ts']);
    node.querySelector<HTMLButtonElement>('.ev-chips__more')!.click();
    expect(chips().map((b) => b.textContent)).toEqual(['TS', 'E', 'VP']);
  });
  it('shows a picked code from another group without More codes', () => {
    const node = codeChips({ codes, selected: ['v'], onChange: vi.fn() });
    expect([...node.querySelectorAll('.ev-chip')].map((b) => b.textContent)).toContain('VP');
  });
});
```

- [ ] **Step 2: Run** `cd apps/teaching && npx vitest run tests/unit/evidence-code-chips.test.ts` — Expected: FAIL.

- [ ] **Step 3: Create `apps/teaching/src/evidence/code-chips.ts`**

```ts
import type { FeedbackCode } from '@/blocks/feedback-codes';
import { el } from '@/quiz/dom';
import './views/insight.css';

export type CodeChipsOptions = { codes: readonly FeedbackCode[]; selected: readonly string[]; onChange: (ids: string[]) => void };

/**
 * One tap per reason marks were lost, from the teacher's own feedback codes.
 * Composition codes show first; Viva and Speaking sit behind More codes.
 */
export function codeChips(o: CodeChipsOptions): HTMLElement {
  const root = el('div', 'ev-chips');
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', 'Why marks were lost');
  let picked = [...o.selected];
  let more = false;
  const paint = (): void => {
    const shown = o.codes.filter((c) => !c.hidden && (more || c.group === 'composition' || picked.includes(c.id)));
    const chips = shown.map((c) => {
      const b = el('button', 'ev-chip', c.code);
      b.type = 'button';
      b.title = c.descriptor;
      b.setAttribute('aria-pressed', String(picked.includes(c.id)));
      b.addEventListener('click', () => {
        picked = picked.includes(c.id) ? picked.filter((id) => id !== c.id) : [...picked, c.id];
        o.onChange(picked);
        paint();
      });
      return b;
    });
    root.replaceChildren(...chips);
    if (!more && o.codes.some((c) => !c.hidden && c.group !== 'composition' && !picked.includes(c.id))) {
      const b = el('button', 'ev-chips__more', 'More codes');
      b.type = 'button';
      b.addEventListener('click', () => {
        more = true;
        paint();
      });
      root.append(b);
    }
  };
  paint();
  return root;
}
```

Append to `apps/teaching/src/evidence/views/insight.css`:

```css
.ev-chips { display: flex; gap: var(--space-1); flex-wrap: wrap; align-items: center; }
.ev-chip, .ev-chips__more { min-height: 32px; min-width: 32px; padding: 0 var(--space-2); border: 1px solid var(--line); border-radius: var(--radius-full); background: none; font: var(--weight-semibold) var(--text-xs) / 1 var(--font-ui); color: var(--ink); cursor: pointer; }
.ev-chip[aria-pressed='true'] { border-color: var(--marine); background: var(--marine); color: var(--paper); }
.ev-chips__more { border-style: dashed; color: var(--muted); font-weight: var(--weight-regular, 400); }
```

- [ ] **Step 4: Run and commit**

Run: `cd apps/teaching && npx vitest run tests/unit/evidence-code-chips.test.ts` — Expected: PASS.

```bash
git add apps/teaching/src/evidence/code-chips.ts apps/teaching/src/evidence/views/insight.css apps/teaching/tests/unit/evidence-code-chips.test.ts
git commit -m "Teaching evidence: feedback-code chips"
```

### Task 21: Chips on quiz answers and assessment criteria

**Files:**
- Modify: `apps/teaching/src/quiz/teacher-panel.ts` (`Row` type ~line 55, `attemptView` ~line 595), `apps/teaching/src/markbook/assessment-panel.ts`, `apps/teaching/src/teacher/sections/markbook.ts` (where it calls `openAssessmentPanel`)
- Test: `apps/teaching/tests/unit/markbook-panel.test.ts`

- [ ] **Step 1: Quiz attempt view.** In `teacher-panel.ts`, add `codes: string[];` to the `Row` type. Import `{ codeChips } from '@/evidence/code-chips'`. In `attemptView`, change the Mark button's post to keep codes:

```ts
          const res = await post<{ attempt: AttemptDetail }>({ action: 'mark', attempt_id: a.id, question_id: r.id, score, codes: r.codes ?? [] });
```

and after `item.append(markRow);` add:

```ts
      if (ctx?.codes.length && r.awarded !== null && r.awarded < r.mark.max) {
        item.append(
          labelled(
            'Why marks were lost (optional)',
            codeChips({
              codes: ctx.codes,
              selected: r.codes ?? [],
              onChange: async (ids) => {
                try {
                  const res = await post<{ attempt: AttemptDetail }>({ action: 'mark', attempt_id: a.id, question_id: r.id, score: r.awarded, codes: ids });
                  r.codes = res.attempt.rows.find((x) => x.id === r.id)?.codes ?? ids;
                } catch (error) {
                  showError(error);
                }
              }
            })
          )
        );
      }
```

(Saving the current mark with codes turns an automatic mark into a teacher mark of the same value. That's intended: the codes need somewhere to live.)

- [ ] **Step 2: Failing panel test** — append to `apps/teaching/tests/unit/markbook-panel.test.ts`, following the file's existing setup (it opens the panel with a `column`, `students`, `markFor` and an `onSave` spy; reuse those names):

```ts
it('saves feedback codes for a criterion below full marks', async () => {
  const onSave = vi.fn();
  const panel = openAssessmentPanel({ ...baseOptions, onSave, codes: [{ id: 'e', code: 'E', label: 'Evidence', group: 'composition', criterion: 2, colour: 'sage', descriptor: 'Link evidence.' } as FeedbackCode] });
  const box = panel.querySelector<HTMLInputElement>('.mb-panel__mark')!;
  box.value = '5';
  box.dispatchEvent(new Event('input'));
  panel.querySelector<HTMLButtonElement>('.ev-chip')!.click();
  [...panel.querySelectorAll('button')].find((b) => b.textContent === 'Save')!.click();
  expect(onSave.mock.calls.at(-1)![1]).toMatchObject({ criteria: { [baseOptions.column.criteria[0]!.id]: 5 }, codes: { [baseOptions.column.criteria[0]!.id]: ['e'] } });
});
```

(Use the file's names for the shared options object and the Save button's text.)

- [ ] **Step 3: Run** `cd apps/teaching && npx vitest run tests/unit/markbook-panel.test.ts` — Expected: FAIL (`codes` option unknown).

- [ ] **Step 4: Assessment panel.** In `assessment-panel.ts`:

Add to `AssessmentPanelOptions`: `/** The teacher's feedback codes, offered under each criterion below full marks. */ codes?: FeedbackCode[];` with `import type { FeedbackCode } from '@/blocks/feedback-codes';` and `import { codeChips } from '@/evidence/code-chips';`.

Beside `let boxes`, add `let picked: Record<string, string[]> = {};`. Where the body is painted for a student (just before `boxes = o.column.criteria.map(...)`), set `picked = Object.fromEntries(Object.entries(mark?.codes ?? {}).map(([id, list]) => [id, [...list]]));`.

Inside the criteria map, after `body.append(row);`:

```ts
      if (o.codes?.length) {
        const chipHost = el('div', 'mb-panel__codes');
        const showChips = () => {
          const n = Number(box.value);
          chipHost.hidden = !(box.value.trim() !== '' && Number.isFinite(n) && n < c.max);
        };
        chipHost.append(codeChips({ codes: o.codes, selected: picked[c.id] ?? [], onChange: (ids) => { picked[c.id] = ids; clearError(); } }));
        box.addEventListener('input', showChips);
        showChips();
        body.append(chipHost);
      }
```

In `collect()`, build codes for criteria that are below full marks and return them:

```ts
    const codes = Object.fromEntries(
      o.column.criteria.filter((c) => typeof criteria[c.id] === 'number' && (criteria[c.id] as number) < c.max && picked[c.id]?.length).map((c) => [c.id, picked[c.id] as string[]])
    );
    const fbText = feedback.value.trim();
    if (!Object.keys(criteria).length && !fbText && !noteText) return null;
    return { criteria, ...(Object.keys(codes).length ? { codes } : {}), ...(fbText ? { feedback: fbText } : {}), ...(noteText ? { note: noteText } : {}) };
```

In `typedState()` add `codes: ex ? {} : picked,` and in `savedState(mark)` add `codes: ex ? {} : mark?.codes ?? {},` so unsaved-change detection notices a chip.

- [ ] **Step 5: Pass codes from the section.** In `apps/teaching/src/teacher/sections/markbook.ts`, in the `openAssessmentPanel({ … })` call add `codes: ctx?.codes,`.

- [ ] **Step 6: Run and commit**

Run: `cd apps/teaching && npx vitest run tests/unit/markbook-panel.test.ts tests/unit/markbook-panel-confirm.test.ts && npx tsc --noEmit -p .` — Expected: PASS.

```bash
git add apps/teaching/src/quiz/teacher-panel.ts apps/teaching/src/markbook/assessment-panel.ts apps/teaching/src/teacher/sections/markbook.ts apps/teaching/tests/unit/markbook-panel.test.ts
git commit -m "Teaching: feedback-code chips on hand-marked answers and criteria"
```

# Phase 7 — Follow-up flow

### Task 22: Ann's brief and the plan sheet

**Files:**
- Create: `apps/teaching/src/evidence/follow-up.ts`
- Test: `apps/teaching/tests/unit/evidence-follow-up.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, expect, it, vi } from 'vitest';
import { annBrief, startFollowUp } from '@/evidence/follow-up';
import type { Evidence } from '@/evidence/types';

const ev = (student: string, why: Evidence['why'], share = 0): Evidence => ({ item: 'q1', tags: ['tech:personification'], share, why, student, source: 'quiz:l1', date: '2026-10-20', confidence: 3 });
const evidence = [
  ev('s1', [{ type: 'named', as: 'tech:metaphor', target: 'tech:personification' }]),
  ev('s2', [{ type: 'named', as: 'tech:metaphor', target: 'tech:personification' }]),
  ev('s3', [{ type: 'option', id: 'x', text: 'It describes the sky' }]),
  ev('s9', [{ type: 'named', as: 'tech:simile', target: 'tech:personification' }])
];
const label = (t: string) => (t === 'tech:metaphor' ? 'Metaphor' : t === 'tech:simile' ? 'Simile' : 'Personification');

describe('annBrief', () => {
  it('names the tag, the shared mistakes of the chosen students, the count, and says go ahead, with no names', () => {
    const brief = annBrief({ tag: 'tech:personification', students: ['s1', 's2', 's3'], evidence, label, codeLabel: (id) => id, sourceTitle: 'Pre-test', count: 5 });
    expect(brief).toMatch(/go ahead/i);
    expect(brief).toContain('5 questions');
    expect(brief).toContain('Personification');
    expect(brief).toContain('Personification named as Metaphor (2 students)');
    expect(brief).not.toContain('Simile'); // s9 is not in the group
    expect(brief).not.toMatch(/s1|s2|s3/);
  });
});

describe('startFollowUp', () => {
  it('creates the lesson after the original with its settings, then starts Ann on it', async () => {
    const createLesson = vi.fn(async () => ({ id: 'lesson_new' }));
    const startJob = vi.fn(async () => ({ id: 'job1', status: 'working' as const }));
    const id = await startFollowUp(
      { sourceLessonId: 'l1', unitId: 'u1', flagId: 'sure_wrong:tech:personification', title: 'Follow-up: Personification', students: ['s1', 's2'], brief: 'Go ahead.' },
      { createLesson, startJob }
    );
    expect(id).toBe('lesson_new');
    expect(createLesson).toHaveBeenCalledWith({
      title: 'Follow-up: Personification', unit_id: 'u1', pedagogical_mode: 'quiz', after_lesson_id: 'l1',
      quiz: { for_students: ['s1', 's2'], follow_up_of: 'l1', follow_up_flag: 'sure_wrong:tech:personification', confidence: true }
    });
    expect(startJob).toHaveBeenCalledWith({ lesson_id: 'lesson_new', agent: 'ann', scope: 'lesson', message: 'Go ahead.' });
  });
});
```

- [ ] **Step 2: Run** `cd apps/teaching && npx vitest run tests/unit/evidence-follow-up.test.ts` — Expected: FAIL.

- [ ] **Step 3: Create `apps/teaching/src/evidence/follow-up.ts`**

```ts
import { apiPost } from '@/api/client';
import { startAiJob, type StartAiJobPayload, type StartAiJobResult } from '@/ai/jobs-client';
import { openOverlay } from '@/markbook/overlay';
import { button, el, labelled } from '@/quiz/dom';
import { FOLLOW_UP } from './constants';
import { mixUps } from './patterns';
import type { Evidence } from './types';
import { mixUpText } from './views/parts';

export type BriefInput = {
  tag: string;
  students: string[];
  evidence: Evidence[];
  label: (tag: string) => string;
  codeLabel: (id: string) => string;
  sourceTitle: string;
  count: number;
};

/**
 * What Ann is told: the tag, the mistakes these students made on it, how many
 * questions. No names or initials leave the app. "Go ahead" skips Ann's own
 * plan step, because the teacher has just confirmed this one.
 */
export function annBrief(input: BriefInput): string {
  const group = new Set(input.students);
  const kind = input.tag.slice(0, input.tag.indexOf(':')) as Parameters<typeof mixUps>[1];
  const mine = input.evidence.filter((e) => (group.size ? group.has(e.student) : true) && e.tags.includes(input.tag));
  const mistakes = mixUps(mine, kind)
    .filter((m) => m.tag === input.tag || !m.tag)
    .slice(0, 6)
    .map((m) => `- ${mixUpText(m, input.label, input.codeLabel)} (${m.count} ${m.count === 1 ? 'student' : 'students'})`);
  const name = input.label(input.tag);
  return [
    'Go ahead and build without a plan: the teacher has already confirmed this follow-up.',
    `Build a short follow-up quiz of ${input.count} questions on ${name}.`,
    `It follows up the quiz "${input.sourceTitle}".`,
    mistakes.length ? `The students who will sit it made these mistakes:\n${mistakes.join('\n')}` : `These students scored low on ${name}.`,
    'Aim each question at one of those mistakes. Where two techniques were mixed up, make students choose between them, or find the right one in a short passage. Use quote_technique or spot_technique for techniques, and multiple choice otherwise.',
    'Keep each question to a single technique or idea, so the results show exactly what each student knows.'
  ].join('\n\n');
}

export type FollowUpRequest = { sourceLessonId: string; unitId: string; flagId: string | null; title: string; students: string[]; brief: string };
export type FollowUpDeps = {
  createLesson: (body: Record<string, unknown>) => Promise<{ id: string }>;
  startJob: (payload: StartAiJobPayload) => Promise<StartAiJobResult>;
};

export const httpFollowUpDeps: FollowUpDeps = {
  createLesson: (body) => apiPost<{ id: string }>('/api/lessons', body),
  startJob: (payload) => startAiJob(payload)
};

/** Creates the follow-up lesson straight after the original, then starts Ann on it. Returns the new lesson id. */
export async function startFollowUp(req: FollowUpRequest, deps: FollowUpDeps = httpFollowUpDeps): Promise<string> {
  const lesson = await deps.createLesson({
    title: req.title,
    unit_id: req.unitId,
    pedagogical_mode: 'quiz',
    after_lesson_id: req.sourceLessonId,
    quiz: { for_students: req.students, follow_up_of: req.sourceLessonId, ...(req.flagId ? { follow_up_flag: req.flagId } : {}), confidence: true }
  });
  await deps.startJob({ lesson_id: lesson.id, agent: 'ann', scope: 'lesson', message: req.brief });
  return lesson.id;
}

export type PlanSheetOptions = {
  sourceLessonId: string;
  sourceTitle: string;
  unitId: string;
  flagId: string | null;
  tag: string;
  students: Array<{ id: string; name: string; initials: string }>;
  /** Ticked to start with. */
  chosen: string[];
  evidence: Evidence[];
  label: (tag: string) => string;
  codeLabel: (id: string) => string;
  onDone: (lessonId: string) => void;
  deps?: FollowUpDeps;
};

/** The plan to confirm before Ann runs: tags, students, size, what Ann sees, the cost. */
export function openFollowUpPlan(o: PlanSheetOptions): HTMLElement {
  const sheet = el('div', 'mb-sheet ev-plan');
  const heading = el('h3', 'mb-form__title', `Follow-up quiz: ${o.label(o.tag)}`);
  heading.id = `ev-plan-${Math.random().toString(36).slice(2, 8)}`;
  const picked = new Set(o.chosen);
  const list = el('fieldset', 'ev-plan__students');
  list.append(el('legend', 'mb-form__label', 'Who sits it'));
  for (const s of o.students) {
    const row = el('label', 'ev-plan__student');
    const box = el('input');
    box.type = 'checkbox';
    box.checked = picked.has(s.id);
    box.addEventListener('change', () => (box.checked ? picked.add(s.id) : picked.delete(s.id)));
    row.append(box, ` ${s.initials} · ${s.name}`);
    list.append(row);
  }
  const count = el('input', 'mb-form__input');
  count.type = 'number';
  count.min = String(FOLLOW_UP.min);
  count.max = String(FOLLOW_UP.max);
  count.value = String(FOLLOW_UP.defaultCount);
  const preview = el('pre', 'ev-plan__brief');
  const brief = (): string =>
    annBrief({ tag: o.tag, students: [...picked], evidence: o.evidence, label: o.label, codeLabel: o.codeLabel, sourceTitle: o.sourceTitle, count: Math.min(FOLLOW_UP.max, Math.max(FOLLOW_UP.min, Number(count.value) || FOLLOW_UP.defaultCount)) });
  preview.textContent = brief();
  count.addEventListener('input', () => (preview.textContent = brief()));
  list.addEventListener('change', () => (preview.textContent = brief()));
  const error = el('p', 'mb-form__error');
  error.setAttribute('role', 'alert');
  const opened = { close: () => {} };
  const draft = button('Draft', 'primary', async function () {
    if (!picked.size && o.chosen.length) {
      error.textContent = 'Tick at least one student.';
      return;
    }
    this.disabled = true;
    error.textContent = '';
    try {
      const id = await startFollowUp(
        { sourceLessonId: o.sourceLessonId, unitId: o.unitId, flagId: o.flagId, title: `Follow-up: ${o.label(o.tag)}`, students: [...picked], brief: brief() },
        o.deps
      );
      opened.close();
      o.onDone(id);
    } catch (e) {
      error.textContent = e instanceof Error ? e.message : 'Couldn’t start the follow-up.';
      this.disabled = false;
    }
  });
  const cancel = button('Cancel', 'secondary', () => opened.close());
  const actions = el('div', 'mb-form__actions');
  actions.append(cancel, draft);
  sheet.append(
    heading,
    el('p', 'mb__empty', `Ann drafts a new lesson after “${o.sourceTitle}”, only for the students ticked. You review it before publishing.`),
    list,
    labelled('Questions', count),
    el('h4', 'mb-form__label', 'What Ann is told (no names)'),
    preview,
    el('p', 'mb__empty', `Cost: ${FOLLOW_UP.cost}, based on past Ann quiz builds.`),
    error,
    actions
  );
  const handle = openOverlay(sheet, { labelledBy: heading.id });
  opened.close = handle.close;
  return sheet;
}
```

Append to `insight.css`:

```css
.ev-plan { display: grid; gap: var(--space-2); max-width: 36rem; }
.ev-plan__students { display: grid; gap: var(--space-1); max-height: 14rem; overflow: auto; border: 1px solid var(--line); border-radius: var(--radius-md); padding: var(--space-2); }
.ev-plan__student { display: flex; align-items: center; gap: var(--space-1); min-height: 32px; font: var(--text-sm) / 1.3 var(--font-ui); }
.ev-plan__brief { white-space: pre-wrap; margin: 0; padding: var(--space-2); border-radius: var(--radius-md); background: var(--paper); border: 1px solid var(--line); font: var(--text-xs) / 1.5 var(--font-ui); max-height: 12rem; overflow: auto; }
```

- [ ] **Step 4: Run and commit**

Run: `cd apps/teaching && npx vitest run tests/unit/evidence-follow-up.test.ts && npx tsc --noEmit -p .` — Expected: PASS.

```bash
git add apps/teaching/src/evidence/follow-up.ts apps/teaching/src/evidence/views/insight.css apps/teaching/tests/unit/evidence-follow-up.test.ts
git commit -m "Teaching evidence: Ann follow-up brief, plan sheet and start"
```

### Task 23: Offer the follow-up from flags and Patterns groups

**Files:**
- Modify: `apps/teaching/src/quiz/teacher-panel.ts`, `apps/teaching/src/teacher/sections/markbook.ts`

- [ ] **Step 1: From quiz flags.** In `teacher-panel.ts` import `{ openFollowUpPlan } from '@/evidence/follow-up'`, `{ codeLabel } from '@/evidence/context'` and `{ tagLabel } from '@/evidence/tags'`. In the `renderQuizInsight(insight, { … })` options add:

```ts
          onFollowUp: (flag, _kind, evidence) => {
            if (!insight || !ctx) return;
            const context = ctx;
            const from = insight;
            openFollowUpPlan({
              sourceLessonId: from.lesson_id,
              sourceTitle: from.title,
              unitId: from.unit_id,
              flagId: flag.id,
              tag: flag.tag,
              students: from.students,
              chosen: flag.students.length ? flag.students : from.students.map((s) => s.id),
              evidence,
              label: (tag) => tagLabel(tag, context),
              codeLabel: (id) => codeLabel(id, context.codes),
              onDone: (id) => navigate(`/lessons/${encodeURIComponent(id)}`)
            });
          },
```

- [ ] **Step 2: From Patterns groups.** In `apps/teaching/src/teacher/sections/markbook.ts`, import `openFollowUpPlan`, then pass `followUp` to `renderPatterns`:

```ts
      body.replaceChildren(
        ctx
          ? renderPatterns(current, students, ctx, {
              openStudent: actions.openStudent,
              followUp: (tag, ids, evidence) => {
                const context = ctx;
                const lessonId = latestQuizFor(current, tag, evidence);
                const quiz = current.quizzes.find((q) => q.lesson_id === lessonId);
                if (!context) return;
                if (!quiz) {
                  status.textContent = 'Follow-ups start from a quiz; this tag only has assessment marks.';
                  return;
                }
                openFollowUpPlan({
                  sourceLessonId: quiz.lesson_id,
                  sourceTitle: quiz.title,
                  unitId: quiz.unit_id ?? '',
                  flagId: null,
                  tag,
                  students: current.students,
                  chosen: ids,
                  evidence,
                  label: (t) => tagLabel(t, context),
                  codeLabel: (id) => codeLabel(id, context.codes),
                  onDone: (id) => navigate(`/lessons/${encodeURIComponent(id)}`)
                });
              }
            })
          : el('p', 'mb__status', 'Loading patterns…')
      );
```

with, at module level:

```ts
/** The most recent shown quiz with evidence on this tag: the follow-up goes after it. */
function latestQuizFor(view: MarkbookView, tag: string, evidence: Evidence[]): string | null {
  const sources = new Set(evidence.filter((e) => e.tags.includes(tag) && e.source.startsWith('quiz:')).map((e) => e.source.slice(5)));
  const quizzes = view.quizzes.filter((q) => !q.hidden && sources.has(q.lesson_id)).sort((a, b) => b.date.localeCompare(a.date));
  return quizzes[0]?.lesson_id ?? null;
}
```

The follow-up needs the quiz's unit. Add `unit_id` to quiz columns: in `netlify/functions/_shared/quiz.mjs` `classQuizScores` return add `unit_id: insight.unit_id,`; in `markbook.mjs` `quizColumns` map add `unit_id: q.unit_id,`; in `apps/teaching/src/markbook/types.ts` `QuizColumn` add `unit_id?: string;`. Import `navigate` from `@/app/router`, `type Evidence` from `@/evidence/types`, `openFollowUpPlan` from `@/evidence/follow-up`.

- [ ] **Step 3: Run the affected suites and types**

Run: `cd apps/teaching && npx vitest run tests/unit/markbook-*.test.ts tests/unit/evidence-*.test.ts && npx tsc --noEmit -p . && cd ../.. && node --import ./scripts/test-network-guard.mjs --test tests/unit/quiz.test.js tests/unit/markbook.test.js`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/teaching/src/quiz/teacher-panel.ts apps/teaching/src/teacher/sections/markbook.ts apps/teaching/src/markbook/types.ts netlify/functions/_shared/quiz.mjs netlify/functions/_shared/markbook.mjs
git commit -m "Teaching: Ann follow-up from quiz flags and Patterns groups"
```

# Finish

### Task 24: Regenerate, gate, walk, PR

- [ ] **Step 1: Regenerate everything generated**

Run: `node scripts/generate-alchemy-schema.mjs && node scripts/generate-teaching-ai-runtime.mjs && node scripts/generate-block-css.mjs`
Then `git status` — commit any regenerated file that changed: `git commit -am "Teaching: regenerate bundles"`.

- [ ] **Step 2: Full gate**

Run: `npm run pre-pr-check`
Expected: exit 0. Fix failures at their cause; never skip a check.

- [ ] **Step 3: Browser walk** on the mock API (the same setup the markbook walk used, `docs/superpowers/plans/2026-10-22-markbook.md` describes it), at 1280px and 390px:
1. A quiz lesson's Results tab with attempts: summary cards, dot plot, tag switch (Technique / Family / Outcome), flags, mix-ups, confidence, questions.
2. Close now → status reads "Closed · saved" on reload; Reopen returns to Open.
3. Settings → Compare with lists the unit's other quizzes; Results then shows "Compared with".
4. An attempt below full marks shows chips; tapping one keeps it after reload.
5. Markbook → Patterns: class trend, tags table, groups expand, heatmap cell opens its evidence, a student name opens the panel; Pin survives a reload.
6. Assessment panel shows chips under a criterion below full marks; saved codes come back.
7. A flag's "Ann drafts follow-up quiz" opens the plan sheet with the brief and cost; stop at Draft (a real run costs money and needs Adam's go).
At 390px check: no sideways page scroll, tag rows wrap the bar under the name, heatmap scrolls inside its box with names fixed, the student panel fills the screen.

- [ ] **Step 4: Push and open the PR** (ready, not draft), then enable auto-merge (merge commit), per `CLAUDE.md`.

```bash
git push -u origin claude/quiz-insights
gh pr create --title "Teaching: quiz insights, Patterns view and Ann follow-ups" --body "<summary of the seven phases, what was walked, and that a live Ann follow-up run is not yet verified>

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```
