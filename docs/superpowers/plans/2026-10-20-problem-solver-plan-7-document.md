# Problem Solver Plan 7: Document, the naming rules and the case file

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the two Document tools, 5 Cs documentation and knowledge management. Each gets a definition, coach knowledge, an emblem and an animated diagram faithful to the book. Enforce the Correspond naming rules: a pure validator refuses names that break the five strict rules and leaves the other three to the coach. Write a **case file** composed from the whole session onto a Tasks page through a confirm card: the linked project or task, or a new project named by the Correspond rules. Once written, later changes (knowledge management finished afterwards, or a late review) offer a dated update, appended under the case file as the next version.

**Architecture:**
- **Tools:** the two tools are pure definitions in `packages/problem-solver/tools/`, registered in the tool index. One generic hook comes first, `strictNode(run, node)`, read through a new `acceptProblem(run, node)` in `machine.mjs`. It refuses an *accepted* or *kept* node but never a challenge, so the coach can still challenge with the person's words on the table. The 5 Cs uses it for the name.
- **Naming:** `packages/problem-solver/naming.mjs` holds the eight rules, the checks and `reviseName`.
- **Case file:** `packages/problem-solver/case-file.mjs` composes it from the session (never from the coach). It gives each section a digest and decides what the card offers (`caseFileOffer`). Both the server's prompt and the page's card read it, so the two cannot drift.
- **Session:** two fields, `caseFile` (what was written, where, at which version, with the section digests) and `caseFileDeclined` (the key of an offer set aside with Not now). Two actions, `link_case_file` and `dismiss_case_file`.
- **Page:** the page writes to Tasks; the server never does. It builds page blocks with the existing block factory, appends them to the target's `page_blocks` (by block id, so a retry never duplicates), creates the project first when needed, and then posts `link_case_file` through the session sync.
- **Diagrams:** each is a renderer in `packages/problem-solver/render/`, following the v1 contract and the Plan 5 addendum, and registered in the canvas and the preview harness.

**Tech Stack:** Plain ESM with JSDoc (tools, naming, case file, server), TypeScript renderers and page code (Vite, Tasks app), Web Animations API, `node:test` for root tests, Vitest + happy-dom for renderer and page tests, the preview harness with `--audit`, Playwright on the Tasks mock API for the walk.

**Spec:** `docs/superpowers/specs/2026-10-19-problem-solver-full-process-design.md`, these sections:
- Experience 8 (Document)
- Tool catalogue → Document, and the Correspond naming rules
- Diagrams: 5 Cs, Knowledge management
- Emblems
- Coach knowledge: the Document chapter and triggers
- Architecture: the case file on the session; Tasks hub writes
- Errors
- Testing

It builds on Plans 3–6, all merged to `main` (PRs adamrussell91-hash/life-hub#971 and adamrussell91-hash/life-hub#980). The "Hooks the later plans need" section at the end of Plan 6 (`docs/superpowers/plans/2026-10-20-problem-solver-plan-6-improve.md`) lists what this plan picks up.

**Worktree and branch:** `/Users/adamrussell/Projects/life-hub-ps-process`, branch `claude/problem-solver-document` (cut from `origin/main` at `e177c007`, after PR 980 merged). Run every command from the worktree. Never touch `/Users/adamrussell/Projects/life-hub`.

**Book references (local only, never commit):** the Document pages are rendered in `/Users/adamrussell/Projects/life-hub-ps-process/.ps-book/` (git-excluded):
- `document-intro.png` (p.144) and `fivecs-intro.png` (p.145)
- `fivecs-a.png` (p.146) and `five-cs.png` (p.147, the pie)
- `fivecs-b.png` (p.148) and `five-cs-2.png` (p.149, the Correspond card)
- `km-intro.png` (p.150) and `knowledge-management.png` (p.151, the stack)
- `km-2.png` (p.152) and `km-3.png` (p.153)
- `emblem-sheet.png` (p.163)

If one is missing, re-render it from `~/Downloads/scan_adam.russell_2026-10-19-11-19-09.pdf`. Scan page *k* holds book pages 2k+98 and 2k+99, so the pages above are k = 23 to 27. In zsh, write each command out rather than looping over pairs:
1. `pdftoppm -f <k> -l <k> -r 150 -png -singlefile <pdf> <name>`
2. `sips -r 90 <name>.png`
3. `sips -c 1240 877 --cropOffset 0 877 <name>.png` for the right-hand page (`--cropOffset 0 0` for the left)

Open the image with the Read tool before building a tool's emblem or renderer.

**The pictures differ from the spec, and the pictures win:**
- **Correspond length:** the card's limit is **260** characters, not the spec's 280.
- **Correspond card:** nine dots in the book (yellow for do, red for don't). We keep eight rules, in our own words and in the book's order. The book's ninth point (spaces are fine instead of dashes) is advice, not a rule, and is covered by the characters rule.
- **5 Cs pie:** five slices inside a white ring and a red rim. Clockwise from the top left: Contextualise yellow (top), Categorise blue (upper right), Condense yellow (lower right), Correct red (bottom), Correspond blue (left).
- **Knowledge management:** four yellow squares stacked with small gaps:
  - Consider: a blue right triangle in the lower left, and its label at the top;
  - Capture: a red header band carrying the label;
  - Share: a thick blue frame;
  - Review: a red disc carrying the label.

The book's wording must not be copied into the repo (it is public). Write labels, prompts, rules and questions in our own words. Short generic headings are ordinary words and may be used: "Contextualise", "Categorise", "Condense", "Correct", "Correspond", "Consider", "Capture", "Share", "Review", "Explicit", "Tacit", "Case file".

**Commands used throughout:**

- One root test file: `node --import ./scripts/test-network-guard.mjs --test tests/unit/<file>.test.js`
- All root Problem Solver tests: `node --import ./scripts/test-network-guard.mjs --test tests/unit/problem-solver-*.test.js`
- One Tasks test file: `cd apps/tasks && npx vitest run tests/unit/<file>.test.ts`
- All Tasks Problem Solver tests: `cd apps/tasks && npx vitest run tests/unit/problem-solver`
- Type gate (the Tasks app has about 125 unrelated pre-existing errors): `cd apps/tasks && npx tsc --noEmit -p . 2>&1 | grep "error TS" | grep -v TS6059 | grep -i -E "problem-solver|page-editor"` must print nothing.
- Preview with audit: `PS_PREVIEW_CHROMIUM="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" node scripts/problem-solver-preview.mjs <tool> "$PS_SCRATCH/preview" --audit`. `$PS_SCRATCH` is the executing session's scratchpad directory. The audit must print `audit: clean` at every width.

---

## Execution notes (read first)

- **Rules learned in Plans 4–6. Copy this list into every subagent prompt:**
  - **Public repo:** no real names anywhere (samples, fixtures, tests, prompts). No copied book wording; short generic headings are fine. Invented samples only.
  - **Git:** stage only your own files (`git add <paths>`, never `git add -A`). Never use `git stash`, `git reset --hard` or force-push. Auto mode refuses them, so sync branches by merging. `.claude/launch.json` may hold another session's uncommitted change: never touch it.
  - **Page actions** go through the session sync (`confirmed()` then `settle()`), never `problemSolverApi.actWith` directly, or they race the coach turn.
  - **Shared rules** live in `packages/problem-solver/` (`review.mjs`, `steps.mjs`, and now `naming.mjs` and `case-file.mjs`). New cross-cutting rules go there, not duplicated in the page and the server.
  - **Reuse:**
    - `task-cards.ts` (`makeCard`) for the case-file confirm card;
    - `confirmed()` for page writes;
    - `session.links` plus `proposedTasks[].taskId` as candidate pages;
    - the existing `problemSolverChips` on a project created for the case file. It appears through `session.links`, so nothing new is needed.
  - **Renderer lessons** (tell implementers up front):
    - batch every layout read before any write (FLIP);
    - a click on an aria-hidden key item must focus the real control;
    - named containers need a role;
    - removal tests use `[data-node~=...]`;
    - CSS scale on an already-rotated element scales along the screen axis, so draw lines in on an inner span;
    - fit stage heights to the real content extent.
- **Before Task 1:** `git log --oneline -1` shows the branch at or after `e177c007`. Run the root and Tasks Problem Solver tests; all must pass before you change anything.
- **One PR for Plans 7 and 8.**
  - This plan adds commits to `claude/problem-solver-document`. It does not push or open a PR. The PR is opened when Plan 8 is done, because each PR costs Adam money.
  - Each task ends in one commit with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Review weight follows complexity:**
  - **Full review** (spec-compliance reviewer, then code-quality reviewer, then fixes): Task 4 (session), Task 8 (the case-file card on the page) and Task 9 (5 Cs renderer). One opus reviewer doing spec then quality in one pass is fine for the renderer.
  - **Single controller check:** every other task. The controller reads the diff, runs the task's tests, looks at both preview PNGs beside the book page and reads the audit.
- **Human checkpoint:** Task 2 (emblems). Later tasks may proceed while Adam looks.
- **Adam's decisions** are listed under "Decisions" at the end. The plan is written to them.
- **Dry run:** the pure code in Tasks 1, 3 and 4 was run against these tests on 20 October before the plan was committed. All passed. The only other failure was the registry list test, which Task 1 updates.

---

## File map

| File | Responsibility | Change |
| --- | --- | --- |
| `packages/problem-solver/naming.mjs` | The eight Correspond rules, `namingChecks`, `namingProblem`, `nameDate`, `nameVersion`, `reviseName` | Create |
| `packages/problem-solver/tools/{five-cs,knowledge-management}.mjs` | Document tools | Create |
| `packages/problem-solver/tools/index.mjs` | Register 2 tools | Modify |
| `packages/problem-solver/machine.mjs` | `acceptProblem(run, node)` (the `strictNode` hook) | Modify |
| `packages/problem-solver/case-file.mjs` | `composeCaseFile`, `sectionDigests`, `hashText`, `caseFileOffer`, `caseFileSource` | Create |
| `packages/problem-solver/types.ts` | Tool ids, `PsCaseFileRecord`, two session fields, two actions | Modify |
| `packages/problem-solver/glyphs/tools/*.svg`, `packages/problem-solver/glyphs.ts` | 2 emblems | Create / Modify |
| `netlify/functions/_shared/problem-solver/session.mjs` | `linkCaseFile`, `dismissCaseFile`, the strict check on accept and keep | Modify |
| `netlify/functions/_shared/problem-solver/migrate.mjs` | Default the two new fields on read | Modify |
| `netlify/functions/_shared/problem-solver/coach.mjs` | An accepted node that `acceptProblem` refuses goes back for repair | Modify |
| `netlify/functions/_shared/problem-solver/service.mjs` | Two actions | Modify |
| `netlify/functions/_shared/problem-solver/prompts.mjs` | Rubric item 9, `caseFileLines`, Document carry-forward | Modify |
| `netlify/functions/_shared/problem-solver/knowledge/{selection,triggers}.mjs` | Document guide and triggers | Modify |
| `netlify/functions/_shared/problem-solver/scripted-coach.mjs` | Document tools, name challenges | Modify |
| `apps/tasks/src/views/problem-solver/case-file-blocks.ts` | Case file → page blocks (write and update) | Create |
| `apps/tasks/src/views/problem-solver/case-file-bridge.ts` | Create the project, append the blocks once, link | Create |
| `apps/tasks/src/views/problem-solver/task-cards.ts` | The case-file card | Modify |
| `apps/tasks/src/views/problem-solver/view.ts` | Wire the bridge, the places list and the two actions | Modify |
| `packages/problem-solver/render/{five-cs,knowledge-management}.ts` | Diagrams | Create |
| `packages/problem-solver/problem-solver.css` | One commented section per new diagram and the case-file card | Modify |
| `apps/tasks/src/views/problem-solver/canvas.ts` | Register renderers | Modify |
| `scripts/problem-solver-preview.mjs`, `scripts/problem-solver-preview-samples.mjs` | Renderer registry, samples | Modify |
| `apps/tasks/tests/browser/problem-solver.spec.mjs` | Walk the 5 Cs, the write, and the update after a late review | Modify |

---

## Shared renderer contract (every diagram task)

Plan 4's "Shared renderer contract" applies unchanged, and so does Plan 5's "Addendum: lessons from the Plan 4 reviews" (items 1–15 and the extra baseline tests 6–8). Read both before building any renderer here:
- `docs/superpowers/plans/2026-10-19-problem-solver-plan-4-analyse-devise.md`
- `docs/superpowers/plans/2026-10-19-problem-solver-plan-5-decide-implement.md`

Also read these renderers:
- `packages/problem-solver/render/after-action-review.ts`: faint frames that fill as answers arrive, and a meta gauge.
- `packages/problem-solver/render/feedback-matrix.ts`: quadrants with pill lists, "+N more" and a phone key.
- `packages/problem-solver/render/dmaic.ts`: bands filling in order.

Every renderer test file has the eight baseline tests plus the tool's own.

---

### Task 1: The naming rules, the two Document tools and the `strictNode` hook

**Files:**
- Create: `packages/problem-solver/naming.mjs`, `packages/problem-solver/tools/five-cs.mjs`, `packages/problem-solver/tools/knowledge-management.mjs`
- Modify: `packages/problem-solver/tools/index.mjs`, `packages/problem-solver/machine.mjs`, `packages/problem-solver/types.ts`, `tests/unit/problem-solver-machine.test.js`
- Test: `tests/unit/problem-solver-naming.test.js`, `tests/unit/problem-solver-document-tools.test.js`

`strictNode(run, node) => string | null` is an optional tool hook, read through `acceptProblem(run, node)`. It names a rule the node breaks.
- **Where it applies:** only to a node about to be *accepted* (the coach's turn) or *kept* (Keep it anyway).
- **Why not `validateNode`:** `checkNode` also runs on a challenge. Refusing there would fail the coach's turn, when it should be able to challenge with the person's name on the table.

- [ ] **Step 1: Failing tests**

```js
// tests/unit/problem-solver-naming.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { NAMING_RULES, NAME_MAX, nameDate, nameVersion, namingChecks, namingProblem, reviseName } from '../../packages/problem-solver/naming.mjs';

const GOOD = 'Kitchen rota case file 20261020 v1 Final';

test('eight rules in the book\'s order: five strict, three for the coach', () => {
  assert.deepEqual(NAMING_RULES.map((r) => r.id), ['meaningful', 'private', 'consistent', 'date', 'length', 'version', 'final', 'characters']);
  assert.deepEqual(NAMING_RULES.filter((r) => r.check === 'strict').map((r) => r.id), ['date', 'length', 'version', 'final', 'characters']);
  assert.deepEqual(NAMING_RULES.filter((r) => r.kind === 'dont').map((r) => r.id), ['private', 'length', 'characters']);
  assert.equal(NAME_MAX, 260);
});

test('a good name passes every strict rule; the coach rules stay open', () => {
  const checks = namingChecks(GOOD);
  assert.deepEqual(checks.filter((c) => c.check === 'strict').map((c) => c.ok), [true, true, true, true, true]);
  assert.deepEqual(checks.filter((c) => c.check === 'coach').map((c) => c.ok), [null, null, null]);
  assert.equal(namingProblem(GOOD), null);
});

test('the first broken strict rule is named', () => {
  assert.match(namingProblem('Kitchen rota v1 Final'), /YYYYMMDD/);
  assert.match(namingProblem('Kitchen rota 20261320 v1 Final'), /YYYYMMDD/, 'month 13 is not a date');
  assert.match(namingProblem('Kitchen rota 20261020 Final'), /version/);
  assert.match(namingProblem('Kitchen rota 20261020 v1'), /Final/);
  assert.equal(namingProblem('Kitchen rota 20261020 v1', { final: false }), null);
  assert.match(namingProblem('Kitchen_rota 20261020 v1 Final'), /letters, digits and spaces/);
  assert.match(namingProblem(`${'a'.repeat(250)} 20261020 v1 Final`), /260/);
});

test('date and version are read from whole words', () => {
  assert.equal(nameDate(GOOD), '20261020');
  assert.equal(nameDate('Rota 2026102 v1'), null);
  assert.equal(nameVersion(GOOD), 1);
  assert.equal(nameVersion('Rota 20261020 v12 Final'), 12);
  assert.equal(nameVersion('Rota v0 Final'), null);
});

test('reviseName swaps the date and version in place, or adds them', () => {
  assert.equal(reviseName(GOOD, { version: 2, date: '20261102' }), 'Kitchen rota case file 20261102 v2 Final');
  assert.equal(reviseName('Kitchen rota Final', { version: 2, date: '20261102' }), 'Kitchen rota Final 20261102 v2');
});
```

```js
// tests/unit/problem-solver-document-tools.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { acceptProblem, isComplete, newRun, nextSlots, placeNode } from '../../packages/problem-solver/machine.mjs';
import { TOOLS, toolsForBookStep } from '../../packages/problem-solver/tools/index.mjs';
import { correspondName, filledCs, FIVE_CS } from '../../packages/problem-solver/tools/five-cs.mjs';
import { kmStage } from '../../packages/problem-solver/tools/knowledge-management.mjs';

let n = 0;
const put = (run, slot, text = `${slot} answer`) => placeNode(run, { id: `d${(n += 1)}`, slot, text, title: slot, state: 'accepted' });

test('document step lists its two tools in order', () => {
  assert.deepEqual(toolsForBookStep('document'), ['five_cs', 'knowledge_management']);
});

test('5 Cs: the Cs in order, more essentials until Correct, then the name', () => {
  let r = newRun('five_cs', 'r');
  assert.deepEqual(FIVE_CS, ['contextualise', 'categorise', 'condense', 'correct', 'correspond']);
  for (const slot of ['contextualise', 'categorise', 'condense:1']) {
    assert.deepEqual(nextSlots(r), [slot]);
    r = put(r, slot);
  }
  assert.deepEqual(nextSlots(r), ['condense:2', 'correct']);
  r = put(r, 'condense:2');
  r = put(r, 'correct', 'Nothing needs correcting');
  assert.deepEqual(nextSlots(r), ['correspond']);
  assert.match(TOOLS.five_cs.promptNote(r), /exactly in node\.text/);
  assert.equal(isComplete(r), false);
  assert.deepEqual(filledCs(r), ['contextualise', 'categorise', 'condense', 'correct']);
  r = put(r, 'correspond', 'Kitchen rota case file 20261020 v1 Final');
  assert.equal(isComplete(r), true);
  assert.deepEqual(nextSlots(r), []);
  assert.equal(TOOLS.five_cs.promptNote(r), null);
  assert.equal(correspondName(r), 'Kitchen rota case file 20261020 v1 Final');
});

test('5 Cs: a name breaking a strict rule cannot be accepted; other slots are never refused', () => {
  const r = newRun('five_cs', 'r');
  assert.match(acceptProblem(r, { slot: 'correspond', text: 'rota stuff' }), /naming rule: add the date/);
  assert.equal(acceptProblem(r, { slot: 'correspond', text: 'Kitchen rota case file 20261020 v1 Final' }), null);
  assert.equal(acceptProblem(r, { slot: 'condense:1', text: 'x' }), null);
  assert.equal(acceptProblem(newRun('five_whys', 'w'), { slot: 'problem', text: 'x' }), null);
});

test('knowledge management: consider, then capture both kinds, then share and review', () => {
  let r = newRun('knowledge_management', 'r');
  assert.equal(kmStage(r), null);
  assert.deepEqual(nextSlots(r), ['consider']);
  r = put(r, 'consider');
  assert.deepEqual(nextSlots(r), ['explicit:1', 'tacit:1']);
  r = put(r, 'explicit:1');
  assert.equal(kmStage(r), 'capture');
  assert.deepEqual(nextSlots(r), ['explicit:2', 'tacit:1']);
  r = put(r, 'tacit:1');
  assert.deepEqual(nextSlots(r), ['explicit:2', 'tacit:2', 'share', 'review']);
  r = put(r, 'review');
  assert.equal(isComplete(r), true, 'share is optional');
  assert.deepEqual(nextSlots(r), ['explicit:2', 'tacit:2', 'share']);
  r = put(r, 'share');
  assert.equal(kmStage(r), 'share');
});
```

In `tests/unit/problem-solver-machine.test.js`, "registry lists every tool in order": append `'five_cs', 'knowledge_management'` to the expected list.

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement**

```js
// packages/problem-solver/naming.mjs
// The Correspond naming rules for a case file's name, in our words. Five are strict and
// checked here; three need judgement and are left to the coach (Adam, 20 October 2026).

export const NAME_MAX = 260;

/** In the book's order. `kind`: do (yellow dot) or dont (red dot). `check`: strict (here) or coach. */
export const NAMING_RULES = Object.freeze([
  { id: 'meaningful', label: 'A short name that says what it holds', kind: 'do', check: 'coach' },
  { id: 'private', label: 'No names or abbreviations only you would know', kind: 'dont', check: 'coach' },
  { id: 'consistent', label: 'Named the same way as related records', kind: 'do', check: 'coach' },
  { id: 'date', label: 'The date as YYYYMMDD', kind: 'do', check: 'strict' },
  { id: 'length', label: `No more than ${NAME_MAX} characters`, kind: 'dont', check: 'strict' },
  { id: 'version', label: 'A version, such as v1', kind: 'do', check: 'strict' },
  { id: 'final', label: '"Final" on the final version', kind: 'do', check: 'strict' },
  { id: 'characters', label: 'Letters, digits and spaces only', kind: 'dont', check: 'strict' }
].map((rule) => Object.freeze(rule)));

const MESSAGES = {
  date: 'add the date as YYYYMMDD, for example 20261020.',
  length: `keep it to ${NAME_MAX} characters or fewer.`,
  version: 'add a version, such as v1.',
  final: 'this is the final version, so include "Final".',
  characters: 'use letters, digits and spaces only.'
};

const words = (name) => String(name ?? '').trim().split(/\s+/).filter(Boolean);

function isRealDate(token) {
  if (!/^\d{8}$/.test(token)) return false;
  const iso = `${token.slice(0, 4)}-${token.slice(4, 6)}-${token.slice(6, 8)}`;
  const date = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === iso;
}

/** The name's YYYYMMDD date, or null. */
export function nameDate(name) {
  return words(name).find(isRealDate) ?? null;
}

/** The name's version number (`v2` → 2), or null. */
export function nameVersion(name) {
  const token = words(name).find((word) => /^v[1-9]\d*$/.test(word));
  return token ? Number(token.slice(1)) : null;
}

const STRICT = {
  date: (name) => nameDate(name) !== null,
  length: (name) => String(name ?? '').length <= NAME_MAX,
  version: (name) => nameVersion(name) !== null,
  final: (name, final) => !final || words(name).some((word) => word.toLowerCase() === 'final'),
  characters: (name) => /^[A-Za-z0-9 ]+$/.test(String(name ?? ''))
};

/**
 * Every rule with its result for `name`: true or false for strict rules, null for the
 * coach's. `final` says whether this is the final version (a case file always is).
 */
export function namingChecks(name, { final = true } = {}) {
  return NAMING_RULES.map((rule) => ({ ...rule, ok: rule.check === 'strict' ? STRICT[rule.id](name, final) : null }));
}

/** The first strict rule the name breaks, as advice, or null when it passes. */
export function namingProblem(name, options = {}) {
  const broken = namingChecks(name, options).find((rule) => rule.ok === false);
  return broken ? MESSAGES[broken.id] : null;
}

/** The name with its date and version replaced (added at the end when missing). */
export function reviseName(name, { version, date }) {
  let out = words(name);
  const swap = (test, value) => {
    const i = out.findIndex(test);
    if (i >= 0) out[i] = value;
    else out = [...out, value];
  };
  if (date) swap(isRealDate, date);
  if (version) swap((word) => /^v[1-9]\d*$/.test(word), `v${version}`);
  return out.join(' ').slice(0, NAME_MAX);
}
```

```js
// packages/problem-solver/tools/five-cs.mjs
import { countSlots, hasSlot, nextIndexed, open, parseSlot } from '../slots.mjs';
import { namingProblem } from '../naming.mjs';

/** The five Cs in the order they are worked (and the pie's clockwise order from the top left). */
export const FIVE_CS = Object.freeze(['contextualise', 'categorise', 'condense', 'correct', 'correspond']);
const CONDENSE_MAX = 8;

/** The Cs that have an answer, in order. */
export function filledCs(run) {
  return FIVE_CS.filter((c) => countSlots(run, c) > 0);
}

/** The accepted name, or null. */
export function correspondName(run) {
  return run.nodes.find((node) => node.slot === 'correspond')?.text ?? null;
}

export const fiveCs = Object.freeze({
  id: 'five_cs',
  name: '5 Cs documentation',
  kind: 'record',
  step: 'document',
  when: 'At the end of a problem, to leave a record someone can find and use later: why it exists, where it lives, what it keeps, what was corrected and what it is called. The case file is built from it.',
  failureModes: [
    'Keeping everything instead of the few things that matter.',
    'A name only the person would understand, or one with no date or version.',
    'No purpose, so nobody knows why the record exists or who it is for.',
    'Known errors left in place instead of corrected or noted.'
  ],
  steps: [
    { id: 'contextualise', title: 'Purpose', prompt: 'Why keep this record, and who is it for: learning, accountability, handing over, next time?' },
    { id: 'categorise', title: 'Where it lives', prompt: 'Where will it be filed, under what heading, and who can see it?' },
    { id: 'condense', title: 'Keep the essentials', prompt: 'What are the few things worth keeping? One per answer.' },
    { id: 'correct', title: 'Correct', prompt: 'What was wrong or has changed since, and what did you fix? Note who, what, when and why, or say nothing needs correcting.' },
    { id: 'correspond', title: 'Name it', prompt: 'A short name that says what it holds, with the date as YYYYMMDD, a version such as v1, and Final.' }
  ],
  slots: {
    contextualise: 'Why the record is kept and who it is for',
    categorise: 'Where it is filed, under what heading, and who can see it',
    condense: 'One essential worth keeping',
    correct: 'What was corrected or has changed (who, what, when, why), or that nothing needs correcting',
    correspond: 'The record\'s name, exactly as agreed'
  },
  edgeKinds: [],
  nextSlots(run) {
    for (const slot of ['contextualise', 'categorise']) if (!hasSlot(run, slot)) return [slot];
    if (!countSlots(run, 'condense')) return ['condense:1'];
    if (!hasSlot(run, 'correct')) return open(nextIndexed(run, 'condense', CONDENSE_MAX), 'correct');
    return hasSlot(run, 'correspond') ? [] : ['correspond'];
  },
  complete(run) {
    return FIVE_CS.every((c) => countSlots(run, c) > 0);
  },
  /** Refuses an accepted name that breaks a strict naming rule; a challenge may still carry it. */
  strictNode(run, node) {
    if (parseSlot(node.slot)?.name !== 'correspond') return null;
    const problem = namingProblem(node.text);
    return problem ? `The name breaks a naming rule: ${problem}` : null;
  },
  promptNote(run) {
    if (!nextSlotsOpen(run, 'correspond')) return null;
    return 'Put the agreed name exactly in node.text. It is refused unless it has a YYYYMMDD date, a version such as v1 and "Final", is at most 260 characters, and uses only letters, digits and spaces. You judge whether it says what it holds and avoids names or abbreviations only the person would know; challenge if not.';
  }
});

function nextSlotsOpen(run, slot) {
  return fiveCs.nextSlots(run).includes(slot);
}
```

```js
// packages/problem-solver/tools/knowledge-management.mjs
import { countSlots, hasSlot, nextIndexed, open, parseSlot } from '../slots.mjs';

const CAPTURE_MAX = 6;

/** The block of the book's stack each slot belongs to. */
export const KM_BLOCK = Object.freeze({ consider: 'consider', explicit: 'capture', tacit: 'capture', share: 'share', review: 'review' });
export const KM_BLOCKS = Object.freeze(['consider', 'capture', 'share', 'review']);

/** The block the latest node sits in, or null before any. */
export function kmStage(run) {
  const last = run.nodes.at(-1);
  return last ? KM_BLOCK[parseSlot(last.slot)?.name] ?? null : null;
}

export const knowledgeManagement = Object.freeze({
  id: 'knowledge_management',
  name: 'Knowledge management',
  kind: 'record',
  step: 'document',
  when: 'When what was learned should outlast this problem: decide what to keep, write down what can be written, plan how know-how held by people is passed on, and set a time to review and prune it.',
  failureModes: [
    'Capturing only documents and missing the know-how that lives in people.',
    'Writing it down where nobody will look for it.',
    'No review, so the record goes stale or keeps what should be deleted.',
    'Keeping personal or sensitive details that should not be stored.'
  ],
  steps: [
    { id: 'consider', title: 'Consider', prompt: 'What is already recorded, and what is missing that next time will need?' },
    { id: 'capture', title: 'Capture', prompt: 'Explicit: what can be written down, and where. Tacit: know-how held by people, and how it will be passed on (a walk-through, a review, working alongside).' },
    { id: 'share', title: 'Share', prompt: 'How will others find it, and be encouraged to ask and add to it?' },
    { id: 'review', title: 'Review', prompt: 'When will you look at it again, what will you update, and what will you delete?' }
  ],
  slots: {
    consider: 'What needs capturing, and what is already recorded',
    explicit: 'Explicit knowledge: something that can be written down, and where it goes',
    tacit: 'Tacit knowledge: know-how held by people, and how it will be passed on',
    share: 'How it will be shared and kept alive',
    review: 'When it will be reviewed, and what will be updated or deleted'
  },
  edgeKinds: [],
  nextSlots(run) {
    if (!hasSlot(run, 'consider')) return ['consider'];
    const capture = open(nextIndexed(run, 'explicit', CAPTURE_MAX), nextIndexed(run, 'tacit', CAPTURE_MAX));
    if (!countSlots(run, 'explicit') || !countSlots(run, 'tacit')) return capture;
    return open(...capture, hasSlot(run, 'share') ? null : 'share', hasSlot(run, 'review') ? null : 'review');
  },
  complete(run) {
    return hasSlot(run, 'consider') && countSlots(run, 'explicit') > 0 && countSlots(run, 'tacit') > 0 && hasSlot(run, 'review');
  }
});
```

Append to `packages/problem-solver/machine.mjs`:

```js
/**
 * Why the tool refuses to accept this node, or null. Only accepted (and kept) nodes are checked,
 * so the coach can still challenge with the person's words on the table (the 5 Cs name rules).
 */
export function acceptProblem(run, node) {
  const test = toolDef(run.tool).strictNode;
  return typeof test === 'function' ? test(run, node) ?? null : null;
}
```

- `tools/index.mjs`: import both and add them after `feedback_matrix` in this order: `five_cs: fiveCs`, `knowledge_management: knowledgeManagement`.
- `types.ts`: add `'five_cs' | 'knowledge_management'` to `PsToolId`. `glyphs.ts` needs emblems for them (Task 2). Until then, give the two ids the same temporary fallback Plan 6 Task 1 used, so the type gate stays clean.

- [ ] **Step 4: Run** the two new files, `problem-solver-machine`, `problem-solver-catalogue`, `problem-solver-tools`, `problem-solver-steps` and `problem-solver-prompts`. Expect PASS. Then run the Tasks glyph and view tests. If one checks that every tool has an emblem, it may need the same temporary fallback.

- [ ] **Step 5: Commit**: `Problem Solver: Document tool definitions and the naming rules` (with trailer).

---

### Task 2: Emblems for the two tools, then the HUMAN CHECKPOINT

**Files:**
- Create: `packages/problem-solver/glyphs/tools/five_cs.svg`, `knowledge_management.svg`
- Modify: `packages/problem-solver/glyphs.ts` (drop the Task 1 fallback)
- Test: `apps/tasks/tests/unit/problem-solver-glyphs.test.ts` (already checks that every tool has an emblem), `apps/tasks/tests/unit/problem-solver-view.test.ts`

- [ ] **Step 1: Draw the emblems.** Open `.ps-book/emblem-sheet.png` (they are the last column, rows 4 and 5) and each tool's page, where the emblem sits beside the title (`five-cs.png`, `knowledge-management.png`). Every emblem is a circle in viewBox `0 0 100 100` with literal book fills (copy the hex values from `glyphs/tools/smart.svg`), no ids and no strokes.
  - **five_cs:** the disc is cut into five unequal slices from the centre, clockwise from about 1 o'clock:
    - blue (top right);
    - yellow (lower right);
    - red (bottom);
    - blue (lower left);
    - yellow (top left, the largest).
  - **knowledge_management:** a yellow disc. A blue right-angled triangle points right from the left edge, wide at the left and narrowing to a point at the lower right. A small red disc sits at the upper right, at about one-fifth of the disc's width.

  Where this list and the sheet disagree, follow the sheet.
- [ ] **Step 2:** Import the two SVGs in `glyphs.ts`, add them to `EMBLEMS`, and drop the fallback.
- [ ] **Step 3: Contact sheet.**
  - Build a throwaway HTML page in the scratchpad with all 32 emblems at 96px and 24px on the paper background.
  - Screenshot it with the Chrome path (reuse `node_modules/playwright-core`) to `$PS_SCRATCH/preview/emblems-plan7.png`.
  - Compare it with `.ps-book/emblem-sheet.png`, and fix any emblem that does not read as its book counterpart.
- [ ] **Step 4:** Run the glyph and view tests, the type gate and all Problem Solver tests. Add a view test that `[data-step="document"]` on the landing shelf contains both Document tool names. Commit: `Problem Solver: Document emblems`.
- [ ] **Step 5: HUMAN CHECKPOINT.** The controller sends `emblems-plan7.png` to Adam (SendUserFile) and asks for approval. Later tasks may proceed meanwhile. Requested changes become a fix commit before the plan finishes.

---

### Task 3: The case file: composition, digests and the offer

**Files:**
- Create: `packages/problem-solver/case-file.mjs`
- Modify: `packages/problem-solver/types.ts`
- Test: `tests/unit/problem-solver-case-file.test.js`

The case file is composed from the session, not by the coach, so it is the same every time and cannot invent anything:
- **Sections** come from the latest complete 5 Cs run and knowledge management, Improve (Plan 6 hook: latest learned, double-loop strategies, feedback actions), the frame, the chosen option, confirmed tasks and the step learnings.
- **Digests:** each section has a digest. The session stores the digests written, so later changes are found by comparison.
- **The offer:** `caseFileOffer` is the one rule for what the card shows.

- [ ] **Step 1: Failing tests**

```js
// tests/unit/problem-solver-case-file.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { caseFileOffer, composeCaseFile, hashText, sectionDigests } from '../../packages/problem-solver/case-file.mjs';

const NAME = 'Kitchen rota case file 20261020 v1 Final';
const node = (slot, text) => ({ id: `n-${slot}`, slot, text, title: slot, state: 'accepted' });
const run = (id, tool, nodes, status = 'done') => ({ id, tool, status, nodes, edges: [] });
const fiveCs = (extra = []) => run('r5', 'five_cs', [
  node('contextualise', 'So next term starts without the same scramble'),
  node('categorise', 'On the Kitchen rota project page'),
  node('condense:1', 'Publish on Wednesday'),
  node('correct', 'Nothing needs correcting'),
  node('correspond', NAME),
  ...extra
]);

function session(extra = {}) {
  return {
    title: 'Late rota',
    status: 'active',
    model: { id: 'seven_step' },
    phase: 'document',
    frame: { goal: 'Rota fixed a week ahead', whatIsTrue: 'Changed 3 of 4 weeks' },
    steps: {
      decide: { runs: [run('rd', 'swot', [node('choice', 'Move publish day to Wednesday')])], status: 'done', objection: null },
      improve: { runs: [run('ra', 'after_action_review', [node('learned', 'One person signing off is a weak point')]), run('rl', 'double_loop', [node('strategy:1', 'Two people can sign off')])], status: 'done', objection: null },
      document: { runs: [fiveCs()], status: 'open', objection: null }
    },
    learnings: [{ step: 'decide', text: 'I decide faster with a matrix', at: 't' }],
    proposedTasks: [{ id: 'p1', title: 'Draft rota', status: 'confirmed', taskId: 't1' }, { id: 'p2', title: 'Idea', status: 'proposed' }],
    reviewState: null,
    caseFile: null,
    caseFileDeclined: null,
    ...extra
  };
}

test('compose: the name, the version from the name and every non-empty section in order', () => {
  const file = composeCaseFile(session());
  assert.equal(file.title, NAME);
  assert.equal(file.version, 1);
  assert.deepEqual(file.sections.map((s) => s.key), ['purpose', 'problem', 'decision', 'actions', 'kept', 'learned', 'corrections', 'filed', 'learnings']);
  assert.deepEqual(file.sections.find((s) => s.key === 'learned').lines, ['One person signing off is a weak point', 'New strategy: Two people can sign off']);
  assert.deepEqual(file.sections.find((s) => s.key === 'actions').lines, ['Draft rota'], 'only confirmed tasks');
  assert.deepEqual(file.sections.find((s) => s.key === 'learnings').lines, ['Decide: I decide faster with a matrix']);
});

test('compose: null until a 5 Cs run is complete; knowledge management adds its section', () => {
  const s = session();
  assert.equal(composeCaseFile({ ...s, steps: { ...s.steps, document: { ...s.steps.document, runs: [run('r5', 'five_cs', [node('contextualise', 'x')], 'active')] } } }), null);
  const km = run('rk', 'knowledge_management', [node('consider', 'c'), node('explicit:1', 'The checklist on the project page'), node('tacit:1', 'Show the new manager once'), node('review', 'Each January')]);
  const file = composeCaseFile({ ...s, steps: { ...s.steps, document: { ...s.steps.document, runs: [fiveCs(), km] } } });
  assert.deepEqual(file.sections.find((x) => x.key === 'knowledge').lines, ['Written down: The checklist on the project page', 'Know-how: Show the new manager once', 'Review: Each January']);
});

test('digests are stable eight-character hashes per section', () => {
  const file = composeCaseFile(session());
  const a = sectionDigests(file);
  assert.deepEqual(a, sectionDigests(composeCaseFile(session())));
  assert.ok(Object.values(a).every((d) => /^[0-9a-f]{8}$/.test(d)));
  assert.notEqual(hashText('a'), hashText('b'));
});

test('offer: write first, every section, at the version in the name', () => {
  const offer = caseFileOffer(session());
  assert.equal(offer.kind, 'write');
  assert.equal(offer.version, 1);
  assert.equal(offer.changed.length, offer.file.sections.length);
  assert.match(offer.key, /^[0-9a-f]{8}$/);
});

test('offer: held before Document, while a Document tool is part-done, during a review, and after Not now', () => {
  const s = session();
  assert.equal(caseFileOffer({ ...s, steps: { decide: s.steps.decide } }), null);
  const partKm = run('rk', 'knowledge_management', [node('consider', 'c')], 'active');
  assert.equal(caseFileOffer({ ...s, steps: { ...s.steps, document: { ...s.steps.document, runs: [fiveCs(), partKm] } } }), null);
  assert.equal(caseFileOffer({ ...s, reviewState: { status: 'reviewing' } }), null);
  assert.equal(caseFileOffer({ ...s, caseFileDeclined: caseFileOffer(s).key }), null);
  assert.equal(caseFileOffer({ ...s, status: 'archived' }), null);
});

test('offer: after a write, only a changed section other than the learnings offers an update', () => {
  const s = session();
  const written = { ...s, caseFile: { title: NAME, version: 1, target: { kind: 'project', id: 'p' }, writtenAt: 't', sections: caseFileOffer(s).digests, history: [] } };
  assert.equal(caseFileOffer(written), null);
  assert.equal(caseFileOffer({ ...written, learnings: [...s.learnings, { step: 'document', text: 'Naming it took longest', at: 't' }] }), null);
  const later = { ...written, steps: { ...s.steps, improve: { ...s.steps.improve, runs: [...s.steps.improve.runs, run('ra2', 'after_action_review', [node('learned', 'The Wednesday rota held for a month')])] } } };
  const offer = caseFileOffer(later);
  assert.equal(offer.kind, 'update');
  assert.equal(offer.version, 2);
  assert.deepEqual(offer.changed, ['learned']);
});
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement**

```js
// packages/problem-solver/case-file.mjs
// The case file Document writes to a Tasks page: composed from the session (never by the
// coach), with a digest per section so the page and the server can tell what changed since
// it was written. Shared by the server's prompt and the page's card so the two cannot drift.
import { isComplete } from './machine.mjs';
import { parseSlot } from './slots.mjs';
import { chosenOption, planStepForBook, stepName } from './steps.mjs';
import { nameVersion } from './naming.mjs';

/** Sections that never call for an update on their own (every step boundary adds a learning). */
const QUIET = new Set(['learnings']);

const keptRuns = (session) => Object.values(session.steps ?? {}).flatMap((step) => step.runs).filter((run) => run.status !== 'switched');
const latest = (session, tool, test = () => true) => keptRuns(session).filter((run) => run.tool === tool && test(run)).at(-1) ?? null;
const texts = (run, name) => (run ? run.nodes.filter((node) => parseSlot(node.slot)?.name === name).map((node) => node.text) : []);
const first = (run, name) => texts(run, name)[0] ?? null;

/** The latest complete 5 Cs run the case file is built from, or null. */
export function caseFileSource(session) {
  return latest(session, 'five_cs', isComplete);
}

/**
 * `{ title, version, sections: [{ key, heading, lines }] }`, or null before a complete 5 Cs run.
 * Empty sections are left out. Improve's latest learned, double-loop strategies and feedback
 * actions are included (Plan 6 hook).
 */
export function composeCaseFile(session) {
  const five = caseFileSource(session);
  if (!five) return null;
  const km = latest(session, 'knowledge_management');
  const aar = latest(session, 'after_action_review');
  const loop = latest(session, 'double_loop');
  const feedback = latest(session, 'feedback_matrix');
  const chosen = chosenOption(session);
  const title = first(five, 'correspond');
  const frame = session.frame ?? {};
  const raw = [
    ['purpose', 'Purpose', [first(five, 'contextualise')]],
    ['problem', 'The problem', [session.title, frame.goal && `Goal: ${frame.goal}`, frame.whatIsTrue && `What was true: ${frame.whatIsTrue}`]],
    ['decision', 'What was decided', [chosen?.text]],
    ['actions', 'Actions', (session.proposedTasks ?? []).filter((p) => p.status === 'confirmed').map((p) => p.title)],
    ['kept', 'What to keep', texts(five, 'condense')],
    ['learned', 'What was learned', [first(aar, 'learned'), ...texts(loop, 'strategy').map((t) => `New strategy: ${t}`), ...texts(feedback, 'action').map((t) => `From feedback: ${t}`)]],
    ['knowledge', 'Knowledge captured', [...texts(km, 'explicit').map((t) => `Written down: ${t}`), ...texts(km, 'tacit').map((t) => `Know-how: ${t}`), first(km, 'share') && `Shared: ${first(km, 'share')}`, first(km, 'review') && `Review: ${first(km, 'review')}`]],
    ['corrections', 'Corrections', [first(five, 'correct')]],
    ['filed', 'Where it is filed', [first(five, 'categorise')]],
    ['learnings', 'How it was solved', (session.learnings ?? []).map((item) => `${session.model ? stepName(session.model.id, item.step) : item.step}: ${item.text}`)]
  ];
  const sections = raw.map(([key, heading, lines]) => ({ key, heading, lines: lines.filter(Boolean) })).filter((section) => section.lines.length);
  return { title, version: nameVersion(title) ?? 1, sections };
}

/** A short stable hash (FNV-1a, 32 bits, hex). */
export function hashText(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

export function sectionDigests(file) {
  return Object.fromEntries(file.sections.map((section) => [section.key, hashText(JSON.stringify([section.heading, section.lines]))]));
}

/**
 * What the case-file card offers now, or null:
 * - `write`: no case file yet (version from the name, else 1), every section;
 * - `update`: written before and a section other than the learnings changed (version + 1).
 * Held until Document is reached, while a Document tool is part-done (one write takes in the
 * whole step), during a review, and when the person said Not now to exactly this content.
 */
export function caseFileOffer(session) {
  if (!session.model || session.status === 'archived') return null;
  const document = planStepForBook(session.model.id, 'document');
  if (!document || !session.steps?.[document]) return null;
  if (session.reviewState?.status === 'reviewing') return null;
  if (session.phase === document && session.steps[document].runs.some((run) => run.status === 'active' && !isComplete(run))) return null;
  const file = composeCaseFile(session);
  if (!file) return null;
  const digests = sectionDigests(file);
  const key = hashText(JSON.stringify(digests));
  if (session.caseFileDeclined === key) return null;
  const record = session.caseFile;
  if (!record) return { kind: 'write', version: file.version, file, digests, key, changed: file.sections.map((s) => s.key) };
  const changed = file.sections.filter((s) => record.sections[s.key] !== digests[s.key]).map((s) => s.key);
  if (!changed.some((k) => !QUIET.has(k))) return null;
  return { kind: 'update', version: record.version + 1, file, digests, key, changed };
}
```

In `types.ts`:

```ts
export type PsCaseFileTarget = { kind: 'task' | 'project'; id: string };
/** What was written where: the section digests written, so later changes can be found. */
export type PsCaseFileRecord = { title: string; version: number; target: PsCaseFileTarget; writtenAt: string; sections: Record<string, string>; history: { version: number; at: string; target: PsCaseFileTarget }[] };
export type PsCaseFileSection = { key: string; heading: string; lines: string[] };
export type PsCaseFile = { title: string; version: number; sections: PsCaseFileSection[] };
export type PsCaseFileOffer = { kind: 'write' | 'update'; version: number; file: PsCaseFile; digests: Record<string, string>; key: string; changed: string[] };
```

Add to `PsSession`: `caseFile: PsCaseFileRecord | null; caseFileDeclined: string | null;`. Add `'link_case_file' | 'dismiss_case_file'` to `PsAction`. Give `case-file.mjs`'s exports JSDoc `@returns {import('./types').PsCaseFileOffer | null}` (and the like) so the page sees the types.

- [ ] **Step 4: Run** the new file and the type gate. Expect PASS (the type gate may show `PsSession` construction errors in tests that build sessions by hand; add the two fields there).

- [ ] **Step 5: Commit**: `Problem Solver: compose the case file and decide what to offer` (with trailer).

---

### Task 4: Session: the strict name check, link_case_file and dismiss_case_file (FULL REVIEW)

**Files:**
- Modify: `netlify/functions/_shared/problem-solver/session.mjs`, `netlify/functions/_shared/problem-solver/migrate.mjs`
- Test: `tests/unit/problem-solver-session.test.js`, `tests/unit/problem-solver-migrate.test.js`

- [ ] **Step 1: Failing tests.** Append to `tests/unit/problem-solver-session.test.js`, and add `linkCaseFile, dismissCaseFile` to its import. The helpers `at`, `idle`, `coach`, `deps` and `implementDone` already exist in the file.

```js
/** In Document with a 5 Cs run whose name is next. */
function namingNext() {
  let s = idle(acceptSuggestion({ ...at('document'), suggestion: { kind: 'next_tool', tool: 'five_cs', reason: 'r' } }, deps));
  for (const [slot, text] of [['contextualise', 'So next term starts without the same scramble'], ['categorise', 'On the Kitchen rota project page'], ['condense:1', 'Publish the rota on Wednesday'], ['correct', 'Nothing in it needs correcting now']]) {
    s = idle(applyCoachTurn(s, coach({ node: { slot, text } }), deps));
  }
  return s;
}
const NAME = 'Kitchen rota case file 20261020 v1 Final';
const named = () => idle(applyCoachTurn(namingNext(), coach({ node: { slot: 'correspond', text: NAME } }), deps));
const digests = { purpose: '0a1b2c3d', kept: '1a2b3c4d' };

test('a new session has no case file', () => {
  const s = createSession({ text: 'x' }, deps);
  assert.equal(s.caseFile, null);
  assert.equal(s.caseFileDeclined, null);
});

test('an accepted name that breaks a strict rule is not placed; Keep it anyway refuses it too', () => {
  let s = idle(applyCoachTurn(namingNext(), coach({ node: { slot: 'correspond', text: 'rota stuff' } }), deps));
  assert.equal(activeRun(s).nodes.some((x) => x.slot === 'correspond'), false);
  s = idle(applyCoachTurn(s, coach({ verdict: 'challenge', node: { slot: 'correspond', text: 'rota stuff' } }), deps));
  assert.equal(s.pendingKeep.slot, 'correspond');
  assert.throws(() => keepAnyway(s, deps), /naming rule: add the date/);
  s = idle(applyCoachTurn(s, coach({ node: { slot: 'correspond', text: NAME } }), deps));
  assert.equal(activeRun(s).nodes.at(-1).text, NAME);
});

test('link_case_file records the first write and links the page', () => {
  const s = linkCaseFile(named(), { target: { kind: 'project', id: 'proj1' }, version: 1, title: NAME, sections: digests }, deps);
  assert.deepEqual(s.caseFile, { title: NAME, version: 1, target: { kind: 'project', id: 'proj1' }, writtenAt: deps.now(), sections: digests, history: [{ version: 1, at: deps.now(), target: { kind: 'project', id: 'proj1' } }] });
  assert.deepEqual(s.links.at(-1), { kind: 'project', id: 'proj1' });
  assert.equal(s.runner.status, 'idle', 'no coach call');
  assert.equal(linkCaseFile(s, { target: { kind: 'project', id: 'proj1' }, version: 1, title: NAME, sections: digests }, deps), s, 'a retry is a no-op');
});

test('an update is the next version on the same page and merges its sections; a move replaces them', () => {
  const s = linkCaseFile(named(), { target: { kind: 'project', id: 'proj1' }, version: 1, title: NAME, sections: digests }, deps);
  const up = linkCaseFile(s, { target: { kind: 'project', id: 'proj1' }, version: 2, title: 'Kitchen rota case file 20261102 v2 Final', sections: { learned: '2a3b4c5d' } }, deps);
  assert.equal(up.caseFile.version, 2);
  assert.deepEqual(up.caseFile.sections, { ...digests, learned: '2a3b4c5d' });
  assert.equal(up.caseFile.history.length, 2);
  assert.equal(up.links.filter((l) => l.id === 'proj1').length, 1);
  assert.throws(() => linkCaseFile(s, { target: { kind: 'project', id: 'proj1' }, version: 3, title: NAME, sections: digests }, deps), /next case file version is v2/);
  assert.throws(() => linkCaseFile(s, { target: { kind: 'task', id: 't9' }, version: 2, title: NAME, sections: digests }, deps), /already on/);
  const moved = linkCaseFile(s, { target: { kind: 'task', id: 't9' }, version: 2, title: NAME, sections: { kept: '9a9b9c9d' }, moved: true }, deps);
  assert.deepEqual(moved.caseFile.sections, { kept: '9a9b9c9d' });
  assert.deepEqual(moved.caseFile.target, { kind: 'task', id: 't9' });
});

test('link_case_file validates its payload', () => {
  const s = named();
  assert.throws(() => linkCaseFile(s, { target: { kind: 'goal', id: 'g' }, version: 1, title: NAME, sections: digests }, deps), /task or project/);
  assert.throws(() => linkCaseFile(s, { target: { kind: 'project', id: 'p' }, version: 0, title: NAME, sections: digests }, deps), /version/);
  assert.throws(() => linkCaseFile(s, { target: { kind: 'project', id: 'p' }, version: 1, title: '', sections: digests }, deps), /title/);
  assert.throws(() => linkCaseFile(s, { target: { kind: 'project', id: 'p' }, version: 1, title: NAME, sections: { purpose: 'nothex!!' } }, deps), /sections/);
  assert.throws(() => linkCaseFile({ ...s, status: 'archived' }, { target: { kind: 'project', id: 'p' }, version: 1, title: NAME, sections: digests }, deps), /archived/);
});

test('Not now on the case file stores its key; a new write clears it', () => {
  let s = dismissCaseFile(named(), { key: 'abcdef12' }, deps);
  assert.equal(s.caseFileDeclined, 'abcdef12');
  assert.equal(dismissCaseFile(s, { key: 'abcdef12' }, deps), s);
  assert.throws(() => dismissCaseFile(s, { key: 'x' }, deps), /key/);
  s = linkCaseFile(s, { target: { kind: 'project', id: 'p' }, version: 1, title: NAME, sections: digests }, deps);
  assert.equal(s.caseFileDeclined, null);
});

test('Document re-entered after a late review keeps its runs and its case file', () => {
  let s = idle(moveOn(implementDone(), deps));
  s = idle(moveOn(s, deps));
  assert.equal(s.phase, 'document');
  s = idle(acceptSuggestion({ ...s, suggestion: { kind: 'next_tool', tool: 'five_cs', reason: 'r' } }, deps));
  s = linkCaseFile(s, { target: { kind: 'project', id: 'p' }, version: 1, title: NAME, sections: digests }, deps);
  s = idle(startReview(s, {}, deps));
  assert.equal(s.phase, 'improve');
  s = idle(moveOn(s, deps));
  assert.equal(s.phase, 'document');
  assert.equal(s.steps.document.runs.length, 1);
  assert.equal(s.caseFile.version, 1);
});
```

In `tests/unit/problem-solver-migrate.test.js`, add a test that a v2 session without the two fields gains `caseFile: null, caseFileDeclined: null`. Extend the fixture in "v2 sessions and index rows pass through unchanged" with the two fields, so a complete v2 session is still untouched.

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement** in `session.mjs`:
- Import `acceptProblem` with the existing `machine.mjs` imports.
- **`createSession`:** add `caseFile: null, caseFileDeclined: null` after `detour: null`.
- **`applyCoachTurn`:** an accepted node the tool refuses is not placed; the coach's turn is kept. Replace the accept branch's first line:

```js
    if (run && turn.node && turn.verdict === 'accept') {
      // A node the tool refuses to accept (a name breaking a strict rule) is not placed; the turn stays.
      if (!acceptProblem(run, turn.node)) next = placeAccepted(next, turn, coachTurn.id, deps);
```

  (The model coach never reaches this: its parser sends such a reply back for repair, Task 5. The scripted coach challenges instead, Task 11. This is the last guard.)
- **`keepAnyway`:** after the `canPlace` check:

```js
  const refused = acceptProblem(run, keep);
  if (refused) throw fail(409, 'action_not_allowed', refused);
```

- **New functions**, before `rename`:

```js
const DIGEST_RE = /^[0-9a-f]{8}$/;
const SECTION_KEYS_MAX = 20;

function cleanTarget(raw) {
  const id = typeof raw?.id === 'string' ? raw.id.trim() : '';
  if (!['task', 'project'].includes(raw?.kind) || !id || id.length > 200) throw fail(400, 'validation_error', 'A case file needs a task or project to go on.');
  return { kind: raw.kind, id };
}

function cleanDigests(raw) {
  const entries = raw && typeof raw === 'object' && !Array.isArray(raw) ? Object.entries(raw) : [];
  if (!entries.length || entries.length > SECTION_KEYS_MAX || entries.some(([key, value]) => !/^[a-z_]{1,24}$/.test(key) || !DIGEST_RE.test(String(value)))) {
    throw fail(400, 'validation_error', 'The case file sections are not valid.');
  }
  return Object.fromEntries(entries);
}

const sameTarget = (a, b) => Boolean(a && b) && a.kind === b.kind && a.id === b.id;

/**
 * The page wrote the case file (or an update) to a task or project page; record it. No coach call.
 * A first write or a move (`moved`: the old page is gone) replaces the section digests; an update
 * merges them and must be the next version on the same page. The same version on the same page
 * again is a no-op, so a retry after a lost response is safe. The page joins the problem's links.
 */
export function linkCaseFile(session, payload, deps) {
  if (session.status === 'archived') throw fail(409, 'action_not_allowed', 'This problem is archived.');
  if (!session.model || !planStepForBook(session.model.id, 'document')) throw fail(409, 'action_not_allowed', 'This problem has no Document step.');
  const target = cleanTarget(payload?.target);
  const version = payload?.version;
  if (!Number.isInteger(version) || version < 1 || version > 999) throw fail(400, 'validation_error', 'A case file version is required.');
  const title = typeof payload?.title === 'string' ? payload.title.trim().slice(0, 260) : '';
  if (!title) throw fail(400, 'validation_error', 'A case file title is required.');
  const sections = cleanDigests(payload?.sections);
  const record = session.caseFile;
  if (record && record.version === version && sameTarget(record.target, target)) return session;
  const moved = payload?.moved === true;
  if (record && version !== record.version + 1) throw fail(409, 'action_not_allowed', `The next case file version is v${record.version + 1}.`);
  if (record && !moved && !sameTarget(record.target, target)) throw fail(409, 'action_not_allowed', 'An update goes on the page the case file is already on.');
  const at = deps.now();
  const caseFile = {
    title,
    version,
    target,
    writtenAt: at,
    sections: record && !moved ? { ...record.sections, ...sections } : sections,
    history: [...(record?.history ?? []), { version, at, target }]
  };
  const linked = session.links.some((link) => sameTarget(link, target));
  const links = linked || session.links.length >= LINKS_MAX ? session.links : [...session.links, target];
  return touch({ ...session, caseFile, caseFileDeclined: null, links }, deps);
}

/** Not now on the case-file card: hidden until its content changes again (`key` is the offer's). */
export function dismissCaseFile(session, payload, deps) {
  const key = typeof payload?.key === 'string' ? payload.key : '';
  if (!DIGEST_RE.test(key)) throw fail(400, 'validation_error', 'A case file key is required.');
  return session.caseFileDeclined === key ? session : touch({ ...session, caseFileDeclined: key }, deps);
}
```

In `migrate.mjs`, add `caseFile: null, caseFileDeclined: null` to `LATER_FIELDS`, and change its comment to "Sessions saved before Plans 5, 6 and 7 gain these fields".

- [ ] **Step 4: Run** the session, migrate and case-file tests. Expect PASS. Then run every root Problem Solver test, because `applyCoachTurn` and `keepAnyway` changed.

- [ ] **Step 5: Commit**: `Problem Solver: record the case file; refuse names that break the strict rules` (with trailer).

---

### Task 5: Coach parser and the service actions

**Files:**
- Modify: `netlify/functions/_shared/problem-solver/coach.mjs`, `service.mjs`
- Test: `tests/unit/problem-solver-coach.test.js`, `tests/unit/problem-solver-service.test.js`

- [ ] **Step 1: Failing tests**
  - **Parser:** build a session in Document with a 5 Cs run whose next slot is `correspond`, using the session-test approach: `createSession` → `applyCoachTurn` → `moveOn` with an idle runner → `acceptSuggestion`.
    - A model reply `accept` with node `{ slot: 'correspond', text: 'rota stuff' }` is rejected. The repair prompt contains "naming rule" and "Challenge instead".
    - With a fake model whose second reply is a `challenge` carrying the same node, the turn passes with `verdict: 'challenge'`.
    - A reply that accepts `Kitchen rota case file 20261020 v1 Final` passes.
  - **Service:** `link_case_file` and `dismiss_case_file` are accepted actions. `link_case_file` while the coach is busy gets 409 `busy`, like the others.

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement**

In `coach.mjs` `fitToRun`, import `acceptProblem` from `machine.mjs` and add after `const problem = checkNode(...)`'s check:

```js
  // A strict rule (the 5 Cs name) refuses an accept, never a challenge: send it back to be challenged.
  const refused = value.verdict === 'accept' ? acceptProblem(run, node) : null;
  if (refused) return { error: `${refused} Challenge instead, name the rule in one sentence, and ask for a corrected name.` };
```

In `service.mjs` `ACTIONS` (import `linkCaseFile` and `dismissCaseFile`):

```js
    link_case_file: (s, body) => linkCaseFile(s, body.payload ?? {}, deps),
    dismiss_case_file: (s, body) => dismissCaseFile(s, body.payload ?? {}, deps),
```

- [ ] **Step 4: Run** those two test files and `problem-solver-http`. Expect PASS.

- [ ] **Step 5: Commit**: `Problem Solver: case-file actions; the coach challenges a name the rules refuse` (with trailer).

---

### Task 6: Coach knowledge and prompt lines for Document

**Files:**
- Modify: `netlify/functions/_shared/problem-solver/knowledge/selection.mjs`, `knowledge/triggers.mjs`, `prompts.mjs`
- Test: `tests/unit/problem-solver-knowledge.test.js`, `tests/unit/problem-solver-prompts.test.js`

The chapter paragraph for Document already exists (Plan 3).

- [ ] **Step 1: Failing tests**

Extend the step lists in `problem-solver-knowledge.test.js`'s Decide and Implement tests to include `'document'`: the guide names both Document tools, and there are at least four short triggers.

Append to `problem-solver-prompts.test.js` (it already has `inTool`; add `composeCaseFile` only if you need it):

```js
const documentAt = (runs, extra = {}) => ({ ...inTool(), phase: 'document', steps: { ...inTool().steps, document: { runs, status: 'open', objection: null } }, runner: { status: 'idle', mode: 'turn', error: null }, caseFile: null, caseFileDeclined: null, ...extra });
const doneFiveCs = () => ({ id: 'r5', tool: 'five_cs', status: 'active', edges: [], nodes: [
  ['contextualise', 'So next term starts calmly'], ['categorise', 'On the rota project page'], ['condense:1', 'Publish on Wednesday'],
  ['correct', 'Nothing needs correcting'], ['correspond', 'Kitchen rota case file 20261020 v1 Final']
].map(([slot, text]) => ({ id: slot, slot, text, title: slot, state: 'accepted' })) });

test('rubric explains the case file and the name rules', () => {
  for (const word of ['CASE FILE', 'node.text', 'Document']) assert.ok(RUBRIC.includes(word), word);
});

test('the Document step carries its guide, triggers and carry-forward', () => {
  const { system } = buildCoachPrompt(documentAt([]));
  assert.match(system[1], /CURRENT STEP: Document/);
  assert.match(system[1], /five_cs \(5 Cs documentation\)/);
  assert.match(system[1], /CHALLENGE IN THIS STEP/);
  assert.match(system[1], /CARRY FORWARD:/);
});

test('a case file ready to write is named, and a written one says where and which version', () => {
  assert.match(buildCoachPrompt(documentAt([doneFiveCs()])).user, /CASE FILE: ready to write as "Kitchen rota case file 20261020 v1 Final"/);
  const written = documentAt([doneFiveCs()], { caseFile: { title: 'Kitchen rota case file 20261020 v1 Final', version: 1, target: { kind: 'project', id: 'p' }, writtenAt: '2026-10-20T09:00:00.000Z', sections: {}, history: [] } });
  assert.match(buildCoachPrompt(written).user, /CASE FILE: v1 "Kitchen rota case file 20261020 v1 Final" written 2026-10-20 to the linked project/);
  assert.match(buildCoachPrompt(written).user, /Changed since it was written: /);
});
```

(The second written case uses empty stored digests, so every section counts as changed.)

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement**

Add to `SELECTION`:

```js
  document: 'Choose from what the record needs. To leave a record of this problem that someone can find, trust and use: `five_cs`, the usual first tool; the case file is built from it. To make what was learned outlast the problem, especially know-how held by people: `knowledge_management`. In the 5 Cs, the correspond answer is the record\'s name. The machine refuses a name without a YYYYMMDD date, a version such as v1 and "Final", one over 260 characters, or one with characters other than letters, digits and spaces. You judge whether it says what it holds and avoids names or abbreviations only the person would know.'
```

Add to `STEP_TRIGGERS`:

```js
  document: [
    'A name only the person would understand: initials, in-jokes or private abbreviations (critical_thinking).',
    'Keeping everything instead of condensing to the few things that matter (analysis).',
    'No purpose given, so nobody knows who the record is for (critical_thinking).',
    'Only written records captured, with no plan for know-how held by people (reflective_thinking).',
    'Personal or sensitive details kept that should not be stored (critical_thinking).'
  ]
```

In `prompts.mjs`:

- **`CARRY.document`:** `'CARRY FORWARD: seed contextualise from the goal in the frame; seed condense from the CHOSEN OPTION, the after action review\\'s learned and the confirmed tasks; seed correct from anything the review showed was wrong. In knowledge management, explicit items often come from the condensed list and tacit items from what the review learned. Confirm before placing.'`
- **RUBRIC, SESSION SHAPE:** add item 9:
  > 9. Document: the case file is built from the 5 Cs (and knowledge management when it is done), together with what earlier steps established. In correspond, put the agreed name exactly in node.text. The machine refuses a name that breaks a strict rule, so challenge such a name and name the rule. The person writes the case file onto a page from a card. Never say it is written until CASE FILE says so. When CASE FILE lists changes since it was written, the person can add a dated update from the card; say so once.
- **`caseFileLines(session)`**, pushed after `...reviewLines(session)` (import `caseFileOffer` from `packages/problem-solver/case-file.mjs` and `planStepForBook` with the steps imports):

```js
function caseFileLines(session) {
  const document = planStepForBook(session.model.id, 'document');
  if (!document || !session.steps?.[document]) return [];
  const offer = caseFileOffer(session);
  const record = session.caseFile;
  if (record) {
    const where = record.target.kind === 'project' ? 'the linked project' : 'the linked task';
    const changed = offer?.kind === 'update' ? ` Changed since it was written: ${offer.changed.map((key) => offer.file.sections.find((s) => s.key === key)?.heading).join(', ')}. The person can add update v${offer.version} from the card.` : '';
    return [`CASE FILE: v${record.version} "${record.title}" written ${record.writtenAt.slice(0, 10)} to ${where}.${changed}`];
  }
  return offer ? [`CASE FILE: ready to write as "${offer.file.title}". The person writes it from the card; it is not written yet.`] : [];
}
```

- Push `...caseFileLines(session)` into `parts` straight after `...reviewLines(session)` (inside the same `session.model` guard).

- [ ] **Step 4: Run** the knowledge and prompts tests. Expect PASS.

- [ ] **Step 5: Commit**: `Problem Solver: coach knowledge for Document and the case file` (with trailer).

---

### Task 7: The case file on the page: blocks and the bridge

**Files:**
- Create: `apps/tasks/src/views/problem-solver/case-file-blocks.ts`, `apps/tasks/src/views/problem-solver/case-file-bridge.ts`
- Test: `apps/tasks/tests/unit/problem-solver-case-file-blocks.test.ts`, `apps/tasks/tests/unit/problem-solver-case-file-bridge.test.ts`

The page is the only writer to Tasks. The blocks use existing block types only: `heading` and `rich_text`, built with `createBlock` from `@/blocks/create-block`. Their ids are fixed for a session and version, so appending twice never duplicates.

- [ ] **Step 1: Failing tests**

`problem-solver-case-file-blocks.test.ts`:
- `caseFileBlocks(offer, { sessionId: 's1234567-…', date: '20261102' })` for a `write` offer returns:
  - a `heading` block (variant `section`) with the file title;
  - one `rich_text` block per section;
  - a final `rich_text` block whose html links `#/problem-solver?id=<sessionId>` with the text "Open this problem in Problem Solver".
- Block ids are `ps-cf-<first 8 of sessionId>-v<version>-<n>`, starting at 1.
- A section with one line renders `<p><strong>Heading</strong></p><p>line</p>`. With several lines it renders `<p><strong>Heading</strong></p><ul><li>…</li></ul>`.
- Text is escaped: a line `Tom & Jo <b>` (invented) renders `Tom &amp; Jo &lt;b&gt;`.
- For an `update` offer:
  - the first block is a `heading` (variant `subsection`) reading `Update: ` plus `reviseName(title, { version, date })`;
  - only the `changed` sections follow;
  - the link block comes last.

`problem-solver-case-file-bridge.test.ts`, with fake deps:
- **New project:** `write(session, offer, { place: 'new', title })`:
  - calls `createProject({ title })` once;
  - fetches the project, appends the blocks after its existing `page_blocks` with `updateProject(id, { page_blocks })`;
  - then calls `link({ target: { kind: 'project', id }, version, title, sections: offer.digests })`.
- **Retry after a failed append:**
  - the first `updateProject` rejects; a second `write` does not call `createProject` again (the bridge remembers the project it made);
  - blocks whose ids are already on the page are not appended again.
- **Existing task:** `place: { kind: 'task', id: 't1' }` uses `getTask`/`updateTask`.
- **Update:**
  - an `update` offer appends to `session.caseFile.target`;
  - its `link` payload carries only the changed sections' digests, and no `moved`.
- **Gone:** a 404 from `getProject` on an update throws `CaseFilePageGone`. A later `write` with `{ place, moved: true }` sends `moved: true` and every digest.

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement**

```ts
// apps/tasks/src/views/problem-solver/case-file-blocks.ts
// The case file as page blocks: a heading, one rich text block per section and a link back.
// Ids are fixed per session and version, so a retried append never duplicates a block.
import { createBlock } from '@/blocks/create-block';
import type { Block } from '@/schemas/block';
import { reviseName } from '../../../../../packages/problem-solver/naming.mjs';
import type { PsCaseFileOffer } from '../../../../../packages/problem-solver/types';

const esc = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function caseFileBlockId(sessionId: string, version: number, n: number): string {
  return `ps-cf-${sessionId.slice(0, 8)}-v${version}-${n}`;
}

export function caseFileBlocks(offer: PsCaseFileOffer, opts: { sessionId: string; date: string }): Block[] {
  let n = 0;
  const id = () => caseFileBlockId(opts.sessionId, offer.version, (n += 1));
  const heading = (text: string, variant: 'section' | 'subsection'): Block => {
    const block = createBlock('heading', id()) as Extract<Block, { block_type: 'heading' }>;
    return { ...block, variant, content: { text } };
  };
  const rich = (html: string): Block => {
    const block = createBlock('rich_text', id()) as Extract<Block, { block_type: 'rich_text' }>;
    return { ...block, content: { html } };
  };
  const title = offer.kind === 'write' ? offer.file.title : `Update: ${reviseName(offer.file.title, { version: offer.version, date: opts.date })}`;
  const sections = offer.file.sections.filter((s) => offer.kind === 'write' || offer.changed.includes(s.key));
  return [
    heading(title, offer.kind === 'write' ? 'section' : 'subsection'),
    ...sections.map((s) => rich(`<p><strong>${esc(s.heading)}</strong></p>${s.lines.length === 1 ? `<p>${esc(s.lines[0])}</p>` : `<ul>${s.lines.map((line) => `<li>${esc(line)}</li>`).join('')}</ul>`}`)),
    rich(`<p><a href="#/problem-solver?id=${encodeURIComponent(opts.sessionId)}">Open this problem in Problem Solver</a></p>`)
  ];
}
```

```ts
// apps/tasks/src/views/problem-solver/case-file-bridge.ts
// Writes the case file to a Tasks page, then tells the session (link_case_file). The page is
// the only writer: the server never touches Tasks. A project made for the case file is
// remembered, so a retry after a failed append never makes a second one.
import type { Block } from '@/schemas/block';
import type { PsCaseFileOffer, PsCaseFileTarget, PsSession } from '../../../../../packages/problem-solver/types';
import { caseFileBlocks } from './case-file-blocks';

type Entity = { id: string; page_blocks?: Block[] };
type Deps = {
  createProject(body: { title: string }): Promise<{ id: string }>;
  getProject(id: string): Promise<Entity>;
  updateProject(id: string, body: { page_blocks: Block[] }): Promise<unknown>;
  getTask(id: string): Promise<Entity>;
  updateTask(id: string, body: { page_blocks: Block[] }): Promise<unknown>;
  link(payload: Record<string, unknown>): Promise<void>;
  today(): string; // YYYYMMDD
};

export type CaseFilePlace = PsCaseFileTarget | 'new';

/** The page the case file was on has gone; the card asks for another place. */
export class CaseFilePageGone extends Error {
  constructor() {
    super('The page the case file was on is gone. Pick another place for it.');
  }
}

const isMissing = (err: unknown) => (err as { status?: number }).status === 404;

export function createCaseFileBridge(deps: Deps) {
  let made: string | null = null;

  async function append(target: PsCaseFileTarget, blocks: Block[]): Promise<void> {
    const get = target.kind === 'project' ? deps.getProject : deps.getTask;
    const put = target.kind === 'project' ? deps.updateProject : deps.updateTask;
    let entity: Entity;
    try {
      entity = await get(target.id);
    } catch (err) {
      if (isMissing(err)) throw new CaseFilePageGone();
      throw err;
    }
    const existing = Array.isArray(entity.page_blocks) ? entity.page_blocks : [];
    const have = new Set(existing.map((block) => block.id));
    const fresh = blocks.filter((block) => !have.has(block.id));
    if (fresh.length) await put(target.id, { page_blocks: [...existing, ...fresh] });
  }

  return {
    /**
     * Write `offer` and link it. A write goes to `choice.place` (a new project is made once,
     * named by the case file's title); an update goes where the case file already is unless
     * `moved` (its page is gone) sends the full file to `choice.place`.
     */
    async write(session: PsSession, offer: PsCaseFileOffer, choice: { place: CaseFilePlace; title: string; moved?: boolean }): Promise<void> {
      const full = offer.kind === 'write' || Boolean(choice.moved);
      const file = { ...offer.file, title: choice.title };
      const sent: PsCaseFileOffer = full ? { ...offer, kind: 'write', file } : offer;
      let target: PsCaseFileTarget;
      if (!full && session.caseFile) target = session.caseFile.target;
      else if (choice.place === 'new') {
        made ??= (await deps.createProject({ title: choice.title })).id;
        target = { kind: 'project', id: made };
      } else target = choice.place;
      await append(target, caseFileBlocks(sent, { sessionId: session.id, date: deps.today() }));
      const sections = full ? offer.digests : Object.fromEntries(offer.changed.map((key) => [key, offer.digests[key]]));
      const title = full ? choice.title : session.caseFile!.title;
      await deps.link({ target, version: offer.version, title, sections, ...(choice.moved ? { moved: true } : {}) });
    }
  };
}
```

`made` is per page view (one bridge per open session), which is enough: once linked, the project is in `session.links` and is offered as a place.

- [ ] **Step 4: Run** both test files and the type gate. Expect PASS.

- [ ] **Step 5: Commit**: `Problem Solver: write the case file to a Tasks page` (with trailer).

---

### Task 8: The case-file card and its wiring (FULL REVIEW)

**Files:**
- Modify: `apps/tasks/src/views/problem-solver/task-cards.ts`, `view.ts`, `packages/problem-solver/problem-solver.css`
- Test: `apps/tasks/tests/unit/problem-solver-task-cards.test.ts`, `apps/tasks/tests/unit/problem-solver-view.test.ts`

- [ ] **Step 1: Failing tests** (in `problem-solver-task-cards.test.ts`, with sessions built by hand as its other tests do):
- **Hidden:** no case-file card while `caseFileOffer(session)` is null.
- **Write card:** `article.ps-casefilecard` with:
  - meta "Write the case file?";
  - a Title field prefilled with the file title;
  - a Place `select` filled from `handlers.places(session)`. It resolves to `[{ value: 'project:p1', label: 'Project: Kitchen rota' }, …, { value: 'new', label: 'New project: <title>' }]`, and the first option is selected;
  - a list of the section headings (`ul.ps-casefilecard__sections`);
  - the buttons "Write case file" and "Not now".
- **Title errors:** editing the title to `rota stuff` and pressing Write shows the `namingProblem` message in the card's error line. `writeCaseFile` is not called.
- **Write:** "Write case file" calls `handlers.writeCaseFile(offer, { place, title })` with the selected place (`'new'` or `{ kind, id }`) and the title. While pending, the button reads "Writing…".
- **Not now:** calls `handlers.dismissCaseFile(offer.key)`.
- **Update card:**
  - meta "Add an update to the case file?";
  - the changed headings listed;
  - no title field and no place field;
  - the buttons "Add update" and "Not now".
- **Page gone:** when `writeCaseFile` rejects with `CaseFilePageGone`:
  - the update card shows the error and turns into the write form (Place select, with title prefilled with `reviseName(title, { version, date })`);
  - its primary button "Write it there" calls `writeCaseFile` with `moved: true`.
- **Kept between updates:** the card is kept across `update(session)` calls while the offer key is unchanged, so typed edits survive polling. A new key replaces it.
- **Order:** it sits after the review card.

In `problem-solver-view.test.ts`, test the pure `caseFilePlaces(session, labels)` (exported from `view.ts`):
- it lists linked projects, then linked tasks, then confirmed proposal tasks not already listed, then `new`;
- `labels` maps `kind:id` to a fetched title, falling back to "Linked project" or "Linked task";
- the new option's label is `New project: <title>`.

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement**
- **`task-cards.ts`:**
  - `TaskCardHandlers` gains:
    - `places(session): Promise<{ value: string; label: string }[]>`;
    - `writeCaseFile(offer, choice: { place: CaseFilePlace; title: string; moved?: boolean }): Promise<void>`;
    - `dismissCaseFile(key: string): Promise<void>`.
  - `CardParts` gains an optional `busyLabel` (the primary's in-flight text, default "Creating…"). Use "Writing…" for the case-file card.
  - **The card:** `caseFileCard(offer, today)`, built with `makeCard`. The Place select is filled when `places` resolves. If it rejects, offer only `new` and show nothing else.
  - **The client-side name check:** the title is checked with `namingProblem` before calling `writeCaseFile`. Throwing an `Error` with the message shows it on the card through `makeCard`'s error line. Capitalise its first letter, e.g. "Add the date as YYYYMMDD, for example 20261020."
  - **Turning into the write form:** on `CaseFilePageGone`, swap the card's fields to the write form in place (keep the same `article`), set `moved`, and relabel the primary "Write it there".
  - **`update(session)`:** compute `caseFileOffer(session)`. Keep the card while `offer.key` is the same. Replace it when the key changes, remove it when the offer is null, and place it after the review card in `order`. Include it in `lastOrder` as `'casefile'` and in `focusAfter`.
- **`view.ts`:**
  - Export `caseFilePlaces(session, labels)` (pure).
  - `places(session)`: fetch titles for each linked project or task (`tasksApi.getProject` / `getTask`, failures fall back to the label), then return `caseFilePlaces`.
  - Create the bridge with `createCaseFileBridge`:
    - project and task get and update calls go through `tasksApi`;
    - `createProject: (body) => tasksApi.createProject({ title: body.title, purpose: \`Case file for the problem "${session.title}"\` })`;
    - `link: (payload) => confirmed('link_case_file', payload)`;
    - `today`: the local date as `YYYYMMDD`.
  - Pass `writeCaseFile: (offer, choice) => caseFiles.write(session, offer, choice)` and `dismissCaseFile: (key) => confirmed('dismiss_case_file', { key })` to `mountTaskCards`.
  - After a successful write, `notifyTasksChanged` is already called by `tasksApi.update*`, so the Tasks hub refreshes. The project page shows the Problem Solver chip through `session.links`.
- **CSS:** add a `/* Case-file card */` section:
  - the same card frame as `.ps-taskcard`, with a 3px solid ink top border;
  - section headings as a muted two-column list on desktop and one column at 390px;
  - the select full width, at least 44px tall;
  - no horizontal overflow at 390px.

- [ ] **Step 4: Run** the two test files, all Tasks Problem Solver tests and the type gate. Expect PASS.

- [ ] **Step 5: Commit**: `Problem Solver: the case-file card writes and updates the case file` (with trailer).

---

## Renderer tasks (9–10)

Each task gives:
- the book page;
- the class prefix and container name;
- the composition, how it builds and the phone layout;
- the tool-specific tests, on top of the eight baseline tests.

Follow the shared contract and the Plan 5 addendum for everything else. Each renderer:
- registers in `canvas.ts` `RENDERERS` and in `scripts/problem-solver-preview.mjs` `RENDERERS`;
- adds an invented sample to `SAMPLES`, with no real names, one contested node and a full run;
- must pass `--audit` at 900 and 390.

### Task 9: 5 Cs renderer (`render/five-cs.ts`, `createFiveCsView`, prefix `ps-fivecs`, container `fivecs`) — FULL REVIEW

**Book:** p.147 (`five-cs.png`, the pie) and p.149 (`five-cs-2.png`, the Correspond card). Look at both closely.

**Pie (an SVG layer, `aria-hidden`, with HTML labels over it):**
- **Frame:** a red outer rim (about 3% of the diameter), then a thin paper ring, then the pie.
- **Slices:** five slices of 72°, with boundaries at 18°, 90°, 162°, 234° and 306° clockwise from 12 o'clock:
  - Categorise: blue, 18°–90°;
  - Condense: yellow, 90°–162°;
  - Correct: red, 162°–234°;
  - Correspond: blue, 234°–306°;
  - Contextualise: yellow, 306°–18°.
- **Labels:** each slice's label sits at its centroid (`data-slice="<c>"`, `__title`). The heading is uppercase via CSS, with the answer's title below, clamped to two lines. White text on red and blue; `--ps-on-yellow` on yellow.
- **Condense:** it can hold several items. Its label shows the latest title and "+N", with all of them in its details card.

**Correspond card (HTML, `role="list"` with the label "Naming rules"):**
- A blue rounded card headed "Correspond".
- One row per rule in `NAMING_RULES` (`data-rule="<id>"`): a 14px dot (yellow for `do`, red for `dont`) and the rule's label in white.
- **Before a name exists:** rows are neutral.
- **Once `correspond` exists:** each strict row shows a tick or a cross mark (`data-ok="true|false"`, from `namingChecks(name)`), and coach rows show "coach" (`data-ok="coach"`).
- **Name line:** the name itself is shown above the rows in a monospace chip.

**Case file preview (`data-casefile`):** appears once the run is complete. It is a paper card titled with the name, listing "Purpose", "Filed", "Kept" (a count and the first item) and "Corrections", each from the run's own nodes. It is the record of this tool only; the full case file lives on the page.

**Build:**
- Slices are faint (paper with a 1px ink rule at 0.35 opacity) until filled. Then the colour grows from the centre (scale 0.6 → 1 on an inner group, 420ms) and the label fades in.
- Rule marks tick in one after another (80ms stagger) when the name arrives.
- The preview card rises in (translateY 8px → 0, fade).
- Nothing moves on an update that changes nothing.

**Phone (390):**
- The pie scales to the container. Slices show their number (1–5) only.
- A key list under the pie pairs each number with its heading and latest answer, and is the 44px target (addendum item 13).
- The Correspond card goes full width under the key.

**Tool tests:**
- Five `[data-slice]` exist before any node, with `data-filled="false"`, and eight `[data-rule]` rows exist.
- Placing `categorise` fills that slice only.
- Two condense items show "+1" on the Condense slice and both in its details card.
- With `correspond` = `Kitchen rota case file 20261020 v1 Final`, every strict row is `data-ok="true"` and the three coach rows are `data-ok="coach"`.
- A contested `correspond` (kept against a coach-judgement objection, e.g. `Rota KR 20261020 v1 Final`) shows the contested tag on the Correspond slice.
- `[data-casefile]` is absent until the run is complete, then lists the name.
- Undo of `correspond` returns the rows to neutral and removes the preview, with no animation left running.

### Task 10: Knowledge management renderer (`render/knowledge-management.ts`, `createKnowledgeManagementView`, prefix `ps-km`, container `km`)

**Book:** p.151 (`knowledge-management.png`).

**Stack:** four equal yellow squares stacked with a small even gap (`data-block="consider|capture|share|review"`), each carrying its heading in white (`__title`):
1. Consider: a blue right-angled triangle in the lower left, its right angle at the bottom left.
2. Capture: a red band across the top carries the heading.
3. Share: a thick blue frame (about 8% of the side) around a yellow centre.
4. Review: a red disc fills most of the square, with the heading on the disc.

**Answers:** they sit to the right of each square on desktop:
- Consider: its answer.
- Capture: two lists, "Explicit" and "Tacit" (`[data-list="explicit|tacit"]`, `role="list"`), each item a pill.
- Share: its answer.
- Review: its answer.

**Build:**
- Squares are faint until their block has an entry. Then the shape draws in:
  - the triangle scales from its right-angle corner;
  - the band slides down;
  - the frame's stroke draws (stroke-dashoffset);
  - the disc pops (scale 0.6 → 1).
- Pills drop into their list (translateY 8px → 0, fade).

**Phone (390):** squares 72px in a left column with the answers beside them, still a stack. Pills clamp to one line, with the full text in details.

**Tool tests:**
- Four `[data-block]` exist before any node, with `data-filled="false"`.
- Placing `explicit:1` fills Capture and adds one item to `[data-list="explicit"]`.
- Two tacit items are both listed.
- `share` fills Share only.
- A contested `review` shows the contested tag on Review.
- Undo of `tacit:1` removes its pill and empties Capture when it was the only entry.

---

### Task 11: Scripted coach and the browser walk through Document

**Files:**
- Modify: `netlify/functions/_shared/problem-solver/scripted-coach.mjs`, `apps/tasks/tests/browser/problem-solver.spec.mjs`
- Test: `tests/unit/problem-solver-scripted.test.js`

- [ ] **Step 1: Failing tests** (`tests/unit/problem-solver-scripted.test.js`):
  - **Document opening:** in Document with no tool open, the scripted turn suggests `five_cs`, which is the step's default.
  - **Name refused:** in a 5 Cs run at `correspond`, the answer `Kitchen rota case file` (six words or more, so it clears the thin-answer threshold, but with no date) is challenged. The message starts "That name needs one more thing:" followed by the `namingProblem` advice. The node is carried on the challenge.
  - **Name accepted:** the answer `Kitchen rota case file 20261020 v1 Final` is accepted.
  - **Next tool hint:** `next: knowledge_management` in Document suggests it.
  - **Knowledge management:** answers place in order, and `explicit: …` / `tacit: …` hints go to those slots.
  - **Thin names:** the scripted coach's six-word threshold applies to the name too. Keep the walk's names at six words or more.

- [ ] **Step 2: Implement** in the scripted coach (deterministic, local dev and tests only), following the existing patterns. The name check goes after the six-word challenge:

```js
  if (run.tool === 'five_cs' && slot === 'correspond' && namingProblem(text)) {
    const advice = namingProblem(text);
    return { ...base, verdict: 'challenge', ...fillNode(run, slot, text, tag), proposeTasks: [], skillsMissing: ['critical_thinking'], message: `That name needs one more thing: ${advice} Then it can be found and trusted later. What is the full name?` };
  }
```

- [ ] **Step 3: Browser walk.** Extend the spec's Plan 6 walk at its step 5 ("Late review"):
  1. **Document:** after "Move on to Document", expect the suggestion "Next: 5 Cs documentation". Start it. Answer:
     - contextualise, categorise and one condense, each a sentence of at least eight words;
     - `correct: Nothing in the record needs correcting at this point`.
  2. **Name:**
     - Answer `Kitchen rota case file for the team` and expect the challenge "That name needs one more thing".
     - Answer `Kitchen rota case file 20261020 v1 Final` (use the session's own date if the walk's clock differs).
     - Expect `.ps-fivecs [data-slice][data-filled="true"]` ×5, and every strict `[data-rule]` with `data-ok="true"`.
  3. **Write:**
     - Expect `.ps-casefilecard` with "Write the case file?". The walk's problem links nothing, so its Place select defaults to "New project: …". Click "Write case file".
     - Through the mock API (`GET /api/projects`), expect one new project titled with the name, whose `page_blocks` start with a heading of the name and end with the link block.
     - Open the project page and expect the Problem Solver chip.
  4. **Finish:** go back and click Finish. Expect the case-file card gone.
  5. **Late review:** follow Plan 6's late review from finished, with a new after action review whose `learned` differs.
     - After Finish, expect `.ps-casefilecard` with "Add an update to the case file?" listing "What was learned". Click "Add update".
     - Expect the project's `page_blocks` to gain a subsection heading starting "Update: Kitchen rota case file" with `v2`, and nothing written twice (every block id is unique).
  6. **Width:** repeat at 390px. Expect no horizontal overflow at each stage, and take screenshots when `PS_SHOT_DIR` is set.

  Run it with the throwaway config at `$PS_SCRATCH/ps-playwright.config.mjs` (a copy of `apps/tasks/playwright.config.ts` pointing at the spec, using system Chrome, because the bundled headless shell is missing). Do not commit it.

- [ ] **Step 4: Commit**: `Problem Solver: scripted coach and walk cover Document` (with trailer).

---

### Task 12: Gate

- [ ] Run all root Problem Solver tests, all Tasks Problem Solver tests, the type gate and the browser walk at both widths. `npm run pre-pr-check` runs once, before the PR, at the end of Plan 8.
- [ ] Render the two new samples at 900 and 390 with `--audit`, and look at them beside the Plan 6 charts as a set: consistent type sizes, palette, ring and motion feel. Every audit prints clean.
- [ ] Check the public-repo rules over the diff:
  - `git diff origin/main --stat` has no `.ps-book` path.
  - Grep the diff for long runs of book wording (any sentence you did not write).
  - Grep for real names: there must be none in samples or fixtures.
- [ ] Commit any fixes: `Problem Solver: Document polish`. Do not push; Plan 8 continues on this branch.

---

## Hooks the later plans need

- **Plan 8 (Lightning):**
  - An escalated full session starts with `caseFile: null` and `caseFileDeclined: null`.
  - A Lightning run never writes a case file.
- **Final pass (filmstrips):**
  - The Document step's filmstrip should show the case file's versions from `caseFile.history` (v1, then each update), beside its runs.
  - The record's Document box can name where the case file is ("Case file v2 on the project page").
- **Final pass (live evaluation):** include an invented Document problem where the person offers a name only they would understand ("KR stuff 20261020 v1 Final"). The coach must challenge the private abbreviation, which the machine cannot catch.

## Decisions (Adam, 20 October 2026)

1. **No linked page. Decided: offer a new project.** The confirm card offers "New project: <name>", named by the Correspond rules. The project joins the session's links, so its page shows the Problem Solver chip. A linked project or task, or a task created in Implement, can be chosen instead.
2. **A late review after Document. Decided: append a dated update.**
   - A confirm card adds an "Update: <name with the new date and version>" section with only the changed sections, under the case file, as the next version.
   - Nothing already on the page is rewritten, so edits made there by hand stay.
3. **Correspond naming. Decided: the hard rules are strict; judgement is left to the coach.**
   - Refused: a name with no YYYYMMDD date, no version, no "Final", more than 260 characters, or characters other than letters, digits and spaces.
   - The coach judges whether it says what it holds, avoids private names and abbreviations, and matches related records. The checklist ticks live.
4. **Case file content. Decided: text blocks plus a link back.**
   - Headings and rich text only (existing block types), with a link that opens the session and its charts.
   - No chart snapshots and no new block type.

Choices this plan makes inside those answers (change them here if Adam disagrees):
- **260, not 280:** the book's Correspond card says 260 (the picture wins over the spec).
- **"Final" is always required:** Document is the last step of every model, so the case file it writes is the final version. An update keeps "Final" and gets the next version and today's date.
- **Composed, not written by the coach:** the spec's coach-schema `caseFile` field is replaced by `composeCaseFile`. It cannot invent content, and the page and the server compute the same thing.
- **Updates come from any change, not only a late review:** finishing knowledge management after the first write also offers an update.
  - The step learnings alone never do, because every step boundary adds one.
  - The offer waits while a Document tool is part-done and while a review is under way, so one update takes in the whole change.
- **Refusals land on accept and keep only:** a name that breaks a strict rule can still be challenged (so the person sees why), but it is never placed, not even with Keep it anyway.

## Done when

- The two Document tools each have:
  - a definition;
  - an emblem matching the book, with the checkpoint sent to Adam;
  - a renderer that matches its book chart, animates only on change, works at 390px, passes its tests and passes `--audit`.
- The naming validator enforces the five strict rules, and the coach is told to judge the other three. The 5 Cs chart ticks each rule as the name arrives.
- With a complete 5 Cs run, the case-file card offers to write the case file to a linked project or task, or to a new project named by the name.
  - Writing it puts heading and text blocks on that page with a link back, links the page to the problem and shows the chip there.
  - A retry never writes a block twice or makes a second project.
- A later change, including a late review after Document, offers a dated update that appends the next version's changed sections. A page that has gone can take a full copy elsewhere.
- The scripted coach and the browser walk cover the 5 Cs, a refused name, the write and an update after a late review, at both widths.
- All gates pass.
