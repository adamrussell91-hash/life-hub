# Problem Solver Plan 6: Improve, the review that waits for results, and the reopen loop

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the three Improve tools: after action review, double-loop learning and feedback matrix. Each gets a definition, coach knowledge, an emblem and an animated diagram faithful to the book. Make Improve wait for real results. Leaving Implement with a review in place opens Improve in a waiting state. The review task's link, or Review now, starts the review with a snapshot of the tasks' live statuses. A review opened after the session has moved past Improve adds a new Improve pass and then returns. Double-loop learning can reopen Define or Analyse as a detour that comes back to Improve.

**Architecture:** The three tools are pure definitions in `packages/problem-solver/tools/`, registered in the tool index. One small generic hook comes first: `promptNote(run)`, a line the coach reads with the active run. The after action review uses it to require the fullest answer for "learned". The session gains three fields:
- `reviewState`: waiting, reviewing or done; the review's date; where to return to.
- `taskSnapshot`: task counts by status and the titles of overdue tasks, posted by the page.
- `detour`: the step reopened, and the step to come back to.

The session gains two actions, `start_review` and `task_status`, and one suggestion kind, `reopen_step`. One pure function, `nextPhase(session)` in `steps.mjs`, decides where Move on goes: back from a detour, back to where a late review began, or the next plan step. The server, the coach panel's button label and the page all use it. The page never lets the server write Tasks. It reads task details through `tasksApi`, builds the snapshot and posts it. Each diagram is a renderer in `packages/problem-solver/render/`, following the v1 contract and the Plan 5 addendum, registered in the canvas and the preview harness.

**Tech Stack:** Plain ESM with JSDoc (tools, steps, server), TypeScript renderers and page code (Vite, Tasks app), Web Animations API, `node:test` for root tests, Vitest + happy-dom for renderer and page tests, the preview harness with `--audit`, Playwright on the Tasks mock API for the walk.

**Spec:** `docs/superpowers/specs/2026-10-19-problem-solver-full-process-design.md`, these sections:
- Tool catalogue → Improve
- Experience 5 (carry-forward) and 7 (Improve and reopening)
- Diagrams: Double-loop, Feedback matrix, After action review
- Emblems
- Coach knowledge: the Improve chapter and triggers
- Architecture: the `reopen_step` suggestion; the actions
- Errors
- Testing

It builds on Plans 3, 4 and 5 (`docs/superpowers/plans/2026-10-19-problem-solver-plan-{3-step-engine,4-analyse-devise,5-decide-implement}.md`), all done and in PR adamrussell91-hash/life-hub#971. The "Hooks the later plans need" section at the end of Plan 5 lists what this plan picks up.

**Worktree and branch:** `/Users/example/Projects/life-hub-ps-process`, branch `claude/problem-solver-improve` (cut from `claude/problem-solver-process` at `76382e50`). Run every command from the worktree. Never touch `/Users/example/Projects/life-hub`.

**Book references (local only, never commit):** the Improve pages are rendered in `/Users/example/Projects/life-hub-ps-process/.ps-book/` (git-excluded):
- `improve-intro.png` (p.131)
- `double-loop-intro.png` (p.133) and `double-loop.png` (p.135)
- `feedback-matrix.png` (p.137, part one) and `feedback-matrix-2.png` (p.139, part two)
- `aar-intro.png` (p.141) and `after-action-review.png` (p.143)
- `emblem-sheet.png` (p.163)

If one is missing, re-render it from `~/Downloads/scan_adam.russell_2026-10-19-11-19-09.pdf`. Scan page *k* holds book pages 2k+98 and 2k+99, so the pages above are k = 16 to 22. In zsh, write each command out rather than looping over pairs:
1. `pdftoppm -f <k> -l <k> -r 150 -png -singlefile <pdf> <name>`
2. `sips -r 90 <name>.png`
3. `sips -c 1240 877 --cropOffset 0 877 <name>.png`

Open the image with the Read tool before building a tool's emblem or renderer.

**The pictures differ from the spec's Diagrams table, and the pictures win:**
- **Double-loop:** the boxes are yellow (Consequences, Action strategy, Governing variables), red (Problem) and blue (Solution); only the loops and arrows are blue.
- **After action review:** the four bars are equal in size. They are yellow, yellow, red and blue, with a red square, a blue triangle, a yellow triangle and a yellow equals sign.

The book's wording must not be copied into the repo (it is public). Write labels, prompts and questions in our own words. Short generic headings are ordinary words and may be used: "Problem", "Solution", "Consequences", "Action strategy", "Governing variables", "Match", "Mismatch", "Single-loop learning", "Double-loop learning", "Suggestions", "Compliments", "Changes", "Questions", "Do more", "Question", "Change", "Why", "How", "Part one", "Part two".

**Commands used throughout:**

- One root test file: `node --import ./scripts/test-network-guard.mjs --test tests/unit/<file>.test.js`
- All root Problem Solver tests: `node --import ./scripts/test-network-guard.mjs --test tests/unit/problem-solver-*.test.js`
- One Tasks test file: `cd apps/tasks && npx vitest run tests/unit/<file>.test.ts`
- All Tasks Problem Solver tests: `cd apps/tasks && npx vitest run tests/unit/problem-solver`
- Type gate (the Tasks app has about 125 unrelated pre-existing errors): `cd apps/tasks && npx tsc --noEmit -p . 2>&1 | grep "error TS" | grep -v TS6059 | grep -i -E "problem-solver|page-editor"` must print nothing.
- Preview with audit: `PS_PREVIEW_CHROMIUM="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" node scripts/problem-solver-preview.mjs <tool> "$PS_SCRATCH/preview" --audit`. `$PS_SCRATCH` is the executing session's scratchpad directory. The audit must print `audit: clean` at every width.

---

## Execution notes (read first)

- **Before Task 1:**
  - Check PR adamrussell91-hash/life-hub#971 has merged: `gh pr view 971 --json state`.
  - If it has, merge `origin/main` into this branch and run the root and Tasks Problem Solver tests.
  - If it has not, work on regardless (this branch already holds everything in it), and merge `main` before the PR.
- **One PR for Plans 6, 7 and 8.**
  - This plan adds commits to `claude/problem-solver-improve`. It does not push or open a PR. The PR is opened when Plan 8 is done, because each PR costs Adam money.
  - Each task ends in one commit with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
  - Auto mode refuses `git reset --hard` and force-push here. Sync branches by merging.
- **Review weight follows complexity:**
  - **Full review** (spec-compliance reviewer, then code-quality reviewer, then fixes): Task 4 (session), Task 8 (review on the page), Task 11 (double-loop renderer) and Task 12 (feedback matrix renderer).
  - **Single controller check:** every other task. The controller reads the diff, runs the task's tests, looks at both preview PNGs beside the book page and reads the audit.
- **Human checkpoint:** Task 2 (emblems). Later tasks may proceed while Adam looks.
- **Adam's decisions** are listed under "Decisions" at the end. The plan is written to them.

---

## File map

| File | Responsibility | Change |
| --- | --- | --- |
| `packages/problem-solver/tools/{after-action-review,double-loop,feedback-matrix}.mjs` | Improve tools | Create |
| `packages/problem-solver/tools/index.mjs` | Register 3 tools | Modify |
| `packages/problem-solver/steps.mjs` | `nextPhase(session)`, `pastStep(session, stepId)` | Modify |
| `packages/problem-solver/types.ts` | Tool ids, `waiting` step status, `PsReviewState`, `PsTaskSnapshot`, `PsDetour`, `reopen_step`, two actions | Modify |
| `packages/problem-solver/glyphs/tools/*.svg`, `packages/problem-solver/glyphs.ts` | 3 emblems | Create / Modify |
| `netlify/functions/_shared/problem-solver/session.mjs` | Waiting, `startReview`, `taskStatus`, `reopenStep`, `reopenProblem`, Move on through `nextPhase` | Modify |
| `netlify/functions/_shared/problem-solver/migrate.mjs` | Default the three new fields on read | Modify |
| `netlify/functions/_shared/problem-solver/coach-schema.mjs` | `reopen_step` suggestion | Modify |
| `netlify/functions/_shared/problem-solver/coach.mjs` | Drop a reopen that fails the gate; drop tool suggestions while waiting | Modify |
| `netlify/functions/_shared/problem-solver/prompts.mjs` | Rubric, `promptNote`, review, task status and detour lines, Improve carry-forward | Modify |
| `netlify/functions/_shared/problem-solver/knowledge/{selection,triggers}.mjs` | Improve guide and triggers | Modify |
| `netlify/functions/_shared/problem-solver/service.mjs` | Two actions | Modify |
| `netlify/functions/_shared/problem-solver/scripted-coach.mjs` | Improve tools, waiting, review opening, reopen hint | Modify |
| `apps/tasks/scripts/mock-api.ts` | Nothing new expected; check the two actions pass through | Check |
| `apps/tasks/src/views/problem-solver/task-bridge.ts` | `details`, pure `taskSnapshot` | Modify |
| `apps/tasks/src/views/problem-solver/review-panel.ts` | Waiting panel and the review banner | Create |
| `apps/tasks/src/views/problem-solver/view.ts` | `reviewEntry` replaces `resumeTarget`; snapshot posting; panel wiring | Modify |
| `apps/tasks/src/views/problem-solver/coach-panel.ts` | Reopen suggestion card; Move on label from `nextPhase` | Modify |
| `apps/tasks/src/views/problem-solver/decor.ts` | Track: stored status for steps after the current one; `waiting` | Modify |
| `packages/problem-solver/render/record.ts` | `waiting` step state | Modify |
| `packages/problem-solver/render/{after-action-review,double-loop,feedback-matrix}.ts` | Diagrams | Create |
| `packages/problem-solver/problem-solver.css` | One commented section per new diagram, the waiting panel and the waiting state | Modify |
| `apps/tasks/src/views/problem-solver/canvas.ts` | Register renderers | Modify |
| `scripts/problem-solver-preview.mjs`, `scripts/problem-solver-preview-samples.mjs` | Renderer registry, samples | Modify |
| `apps/tasks/tests/browser/problem-solver.spec.mjs` | Walk the wait, the review, the reopen and a late review | Modify |

---

## Shared renderer contract (every diagram task)

Plan 4's "Shared renderer contract" applies unchanged, and so does Plan 5's "Addendum: lessons from the Plan 4 reviews" (items 1–15 and the extra baseline tests 6–8). Read both before building any renderer here:
- `docs/superpowers/plans/2026-10-19-problem-solver-plan-4-analyse-devise.md`
- `docs/superpowers/plans/2026-10-19-problem-solver-plan-5-decide-implement.md`

Also read these renderers:
- `packages/problem-solver/render/dmaic.ts`: bands, a travelling state and a loop arrow.
- `packages/problem-solver/render/swot.ts`: grids of items with details.
- `packages/problem-solver/render/analogical-reasoning.ts`: a looping flow with a travelling token.

Every renderer test file has the eight baseline tests plus the tool's own.

---

### Task 1: The three Improve tools and the `promptNote` hook

**Files:**
- Create: `packages/problem-solver/tools/after-action-review.mjs`, `double-loop.mjs`, `feedback-matrix.mjs`
- Modify: `packages/problem-solver/tools/index.mjs`, `packages/problem-solver/types.ts`, `netlify/functions/_shared/problem-solver/prompts.mjs`
- Test: `tests/unit/problem-solver-improve-tools.test.js`, `tests/unit/problem-solver-prompts.test.js`

`promptNote(run) => string | null` is an optional tool hook: one line the coach reads under the active run, for judgements the machine cannot make itself. The after action review uses it to ask for the fullest answer in "learned", rather than refusing to place a shorter one, because a refusal would fail the coach's turn instead of letting it challenge.

- [ ] **Step 1: Failing tests**

```js
// tests/unit/problem-solver-improve-tools.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { addEdge, canEdge, checkNode, isComplete, newRun, nextSlots, placeNode } from '../../packages/problem-solver/machine.mjs';
import { TOOLS, toolsForBookStep } from '../../packages/problem-solver/tools/index.mjs';
import { loopStage, recurs } from '../../packages/problem-solver/tools/double-loop.mjs';
import { satellitesOf } from '../../packages/problem-solver/tools/feedback-matrix.mjs';
import { learnedShare, longestEarlier } from '../../packages/problem-solver/tools/after-action-review.mjs';

let n = 0;
const put = (run, slot, extra = {}) => placeNode(run, { id: `v${(n += 1)}`, slot, text: slot, title: slot, state: 'accepted', ...extra });
const idOf = (run, slot) => run.nodes.find((x) => x.slot === slot).id;
const link = (run, from, to, kind) => addEdge(run, { from: idOf(run, from), to: idOf(run, to), kind });

test('improve step lists its three tools in order', () => {
  assert.deepEqual(toolsForBookStep('improve'), ['after_action_review', 'double_loop', 'feedback_matrix']);
});

test('after action review: four answers in order; the coach is told how full "learned" must be', () => {
  let r = newRun('after_action_review', 'r');
  const answer = (slot, text) => placeNode(r, { id: slot, slot, text, title: slot, state: 'accepted' });
  assert.equal(TOOLS.after_action_review.promptNote(r), null);
  for (const [slot, text] of [
    ['intended', 'Publish the rota a week ahead'],
    ['achieved', 'Published on time three weeks out of four'],
    ['differences', 'The fourth week a manager was off sick and nobody else could sign it off']
  ]) {
    assert.deepEqual(nextSlots(r), [slot]);
    r = answer(slot, text);
  }
  assert.equal(longestEarlier(r), 15);
  assert.match(TOOLS.after_action_review.promptNote(r), /longer than 15 words/);
  assert.deepEqual(nextSlots(r), ['learned']);
  assert.equal(isComplete(r), false);
  r = answer('learned', 'A single person signing off is a weak point, so two people now hold the sign-off, and the rota is drafted on Monday so a sick day still leaves time to publish it on Wednesday');
  assert.equal(isComplete(r), true);
  assert.deepEqual(nextSlots(r), []);
  assert.equal(TOOLS.after_action_review.promptNote(r), null);
  const share = learnedShare(r);
  assert.ok(share > 0.4 && share < 0.6, `learned share ${share}`);
});

test('double loop: problem, single loop, recurs; a recurring problem opens the outer loop', () => {
  let r = newRun('double_loop', 'r');
  for (const slot of ['problem', 'single']) {
    assert.deepEqual(nextSlots(r), [slot]);
    r = put(r, slot);
  }
  assert.equal(loopStage(r), 'action');
  assert.deepEqual(nextSlots(r), ['recurs']);
  assert.match(checkNode(r, { slot: 'recurs', text: 'It came back' }, []), /one of yes, no/);
  r = put(r, 'recurs', { tag: 'yes' });
  assert.equal(recurs(r), 'yes');
  assert.equal(loopStage(r), 'consequences');
  assert.deepEqual(nextSlots(r), ['governing:1']);
  assert.equal(isComplete(r), false);
  r = put(r, 'governing:1');
  assert.equal(loopStage(r), 'governing');
  assert.deepEqual(nextSlots(r), ['governing:2', 'reframe']);
  r = put(r, 'reframe');
  assert.deepEqual(nextSlots(r), ['strategy:1']);
  r = put(r, 'strategy:1');
  assert.deepEqual(nextSlots(r), ['strategy:2', 'test']);
  r = put(r, 'test');
  assert.equal(isComplete(r), true);
  assert.deepEqual(nextSlots(r), ['monitor']);
  r = put(r, 'monitor');
  assert.equal(loopStage(r), 'solution');
  assert.deepEqual(nextSlots(r), []);
});

test('double loop: a problem that does not recur is complete after the single loop; monitor stays optional', () => {
  let r = newRun('double_loop', 'r');
  r = put(put(r, 'problem'), 'single');
  r = put(r, 'recurs', { tag: 'no' });
  assert.equal(recurs(r), 'no');
  assert.equal(isComplete(r), true);
  assert.deepEqual(nextSlots(r), ['monitor']);
});

test('feedback matrix: three quadrants open themes; why and how hang from a theme; an action needs a theme with a how', () => {
  let r = newRun('feedback_matrix', 'r');
  assert.deepEqual(nextSlots(r), ['suggestion:1', 'compliment:1', 'change:1', 'question:1']);
  r = put(r, 'suggestion:1');
  r = put(r, 'compliment:1');
  assert.equal(nextSlots(r).includes('theme:1'), false);
  r = put(r, 'change:1');
  assert.deepEqual(nextSlots(r), ['suggestion:2', 'compliment:2', 'change:2', 'question:1', 'theme:1']);
  assert.match(checkNode(r, { slot: 'theme:1', text: 'x' }, []), /one of do_more, question, change/);
  r = put(r, 'theme:1', { tag: 'change' });
  assert.ok(nextSlots(r).includes('why:1') && nextSlots(r).includes('how:1'));
  assert.equal(nextSlots(r).includes('action:1'), false);
  assert.match(checkNode(r, { slot: 'how:1', text: 'x' }, []), /Link each how to the theme/);
  r = link(put(r, 'how:1'), 'how:1', 'theme:1', 'of');
  r = link(put(r, 'why:1'), 'why:1', 'theme:1', 'of');
  assert.equal(canEdge(r, idOf(r, 'why:1'), idOf(r, 'theme:1'), 'of'), false, 'a satellite hangs from one theme');
  assert.deepEqual(satellitesOf(r, idOf(r, 'theme:1')).how.map((x) => x.slot), ['how:1']);
  assert.equal(isComplete(r), false);
  assert.ok(nextSlots(r).includes('action:1'));
  r = put(r, 'action:1');
  assert.equal(isComplete(r), true);
});

test('feedback matrix: at most four of each satellite per theme', () => {
  let r = newRun('feedback_matrix', 'r');
  for (const slot of ['suggestion:1', 'compliment:1', 'change:1']) r = put(r, slot);
  r = put(r, 'theme:1', { tag: 'do_more' });
  for (let i = 1; i <= 4; i += 1) r = link(put(r, `how:${i}`), `how:${i}`, 'theme:1', 'of');
  r = put(r, 'how:5');
  assert.equal(canEdge(r, idOf(r, 'how:5'), idOf(r, 'theme:1'), 'of'), false);
});
```

Append to `tests/unit/problem-solver-prompts.test.js`:

```js
test('a tool\'s promptNote reaches the coach under the active run', () => {
  let s = inTool('after_action_review');
  for (const [slot, text] of [['intended', 'Publish the rota a week ahead'], ['achieved', 'Three weeks out of four'], ['differences', 'One sick day stopped the sign-off']]) {
    s = applyCoachTurn({ ...s, runner: { status: 'idle', mode: 'turn', error: null } }, turn({ node: { slot, text } }), deps);
  }
  assert.match(buildCoachPrompt(s).user, /Note: .*longer than 6 words/);
});
```

(`inTool` accepts any registered tool and puts it in Define. That is fine for prompt building.)

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement**

```js
// packages/problem-solver/tools/after-action-review.mjs
import { hasSlot } from '../slots.mjs';

export const AAR_SLOTS = Object.freeze(['intended', 'achieved', 'differences', 'learned']);
const words = (text) => String(text ?? '').trim().split(/\s+/).filter(Boolean).length;
const textOf = (run, slot) => run.nodes.find((node) => node.slot === slot)?.text ?? '';

/** Word count of the longest of the first three answers. */
export function longestEarlier(run) {
  return Math.max(0, ...AAR_SLOTS.slice(0, 3).map((slot) => words(textOf(run, slot))));
}

/** The share of the review's words spent on what was learned (0 when nothing is placed). */
export function learnedShare(run) {
  const total = AAR_SLOTS.reduce((sum, slot) => sum + words(textOf(run, slot)), 0);
  return total ? words(textOf(run, 'learned')) / total : 0;
}

export const afterActionReview = Object.freeze({
  id: 'after_action_review',
  name: 'After action review',
  kind: 'review',
  step: 'improve',
  when: 'Soon after an activity, a milestone or a pilot: compare what was meant to happen with what did, find why, and spend most of the time on what was learned. Works alone in five minutes or with a team, without rank.',
  failureModes: [
    'Describing the plan instead of what actually happened.',
    'Blaming a person for a difference that a process allowed.',
    'Rushing the learning: it should take at least half the review.',
    'Waiting so long that the details are forgotten.'
  ],
  steps: [
    { id: 'intended', title: 'Set out to achieve', prompt: 'What were you trying to achieve? Use the goal and measures set earlier.' },
    { id: 'achieved', title: 'Achieved', prompt: 'What actually happened? Facts and measures, not impressions.' },
    { id: 'differences', title: 'Why the difference', prompt: 'Why did the result differ from the aim, for better or worse? Look at the process, not the people.' },
    { id: 'learned', title: 'Learned', prompt: 'What will you keep, change or try next time? This is the heart of the review.' }
  ],
  slots: {
    intended: 'What you set out to achieve',
    achieved: 'What actually happened, with measures',
    differences: 'Why the result differed from the aim',
    learned: 'What you learned and will carry forward (the fullest answer)'
  },
  edgeKinds: [],
  nextSlots(run) {
    const missing = AAR_SLOTS.find((slot) => !hasSlot(run, slot));
    return missing ? [missing] : [];
  },
  complete(run) {
    return AAR_SLOTS.every((slot) => hasSlot(run, slot));
  },
  promptNote(run) {
    if (hasSlot(run, 'learned') || !hasSlot(run, 'differences')) return null;
    return `Learned is the heart of the review. Accept it only if it is longer than ${longestEarlier(run)} words (the longest answer so far); if it is shorter, challenge and ask what else they learned.`;
  }
});
```

```js
// packages/problem-solver/tools/double-loop.mjs
import { countSlots, hasSlot, nextIndexed, open, parseSlot } from '../slots.mjs';

/** 'yes' when the problem recurs (the outer loop is open), 'no', or null before it is answered. */
export function recurs(run) {
  return run.nodes.find((node) => node.slot === 'recurs')?.tag ?? null;
}

/** The box of the book's chart each slot belongs to. */
export const LOOP_STAGE = Object.freeze({
  problem: 'problem',
  single: 'action',
  recurs: 'consequences',
  governing: 'governing',
  reframe: 'governing',
  strategy: 'action',
  test: 'consequences',
  monitor: 'solution'
});

/** The box the latest node sits in (where the travelling marker rests), 'problem' at the start. */
export function loopStage(run) {
  const last = run.nodes.at(-1);
  return last ? LOOP_STAGE[parseSlot(last.slot)?.name] ?? 'problem' : 'problem';
}

export const doubleLoop = Object.freeze({
  id: 'double_loop',
  name: 'Double-loop learning',
  kind: 'review',
  step: 'improve',
  when: 'A problem keeps coming back, or a fix did not hold: correct it within the current rules first, then question the rules, norms and assumptions that keep producing it (Argyris and Schön).',
  failureModes: [
    'Another single-loop fix for a problem that keeps recurring.',
    'Naming a symptom as the governing assumption.',
    'Changing everything at once instead of testing on a small scale.',
    'Blaming people rather than the rules they work within.'
  ],
  steps: [
    { id: 'problem', title: 'Define the problem', prompt: 'From what you know, name the immediate issue to solve.' },
    { id: 'single', title: 'Single loop', prompt: 'How was it corrected within the current system and processes?' },
    { id: 'recurs', title: 'Does it recur?', prompt: 'Did the problem persist or come back? Yes or no, and the evidence.' },
    { id: 'governing', title: 'Question the norms', prompt: 'Which assumptions, rules or beliefs keep producing it?' },
    { id: 'reframe', title: 'Reframe', prompt: 'Look at it from other perspectives and root-cause tools: what is the problem really?' },
    { id: 'strategy', title: 'New strategies', prompt: 'What would address the deeper issue?' },
    { id: 'test', title: 'Test small', prompt: 'How will you try it on a small scale first, and what counts as success?' },
    { id: 'monitor', title: 'Monitor and reflect', prompt: 'Who watches the outcome, and when do you go round again?' }
  ],
  slots: {
    problem: 'The immediate issue to solve',
    single: 'The correction made within the current system',
    recurs: 'Whether the problem persisted or came back, with evidence',
    governing: 'An assumption, rule, norm or belief that keeps producing the problem',
    reframe: 'The problem seen afresh, after questioning the norms',
    strategy: 'A new strategy aimed at the deeper issue',
    test: 'How the change is tested on a small scale, and what counts as success',
    monitor: 'How the outcome is monitored, and when to go round again'
  },
  nodeTags: { recurs: ['yes', 'no'] },
  edgeKinds: [],
  nextSlots(run) {
    for (const slot of ['problem', 'single', 'recurs']) if (!hasSlot(run, slot)) return [slot];
    if (recurs(run) === 'no') return open(hasSlot(run, 'monitor') ? null : 'monitor');
    if (!countSlots(run, 'governing')) return ['governing:1'];
    if (!hasSlot(run, 'reframe')) return open(nextIndexed(run, 'governing', 6), 'reframe');
    if (!countSlots(run, 'strategy')) return ['strategy:1'];
    if (!hasSlot(run, 'test')) return open(nextIndexed(run, 'strategy', 4), 'test');
    return open(hasSlot(run, 'monitor') ? null : 'monitor');
  },
  complete(run) {
    if (!hasSlot(run, 'problem') || !hasSlot(run, 'single') || !recurs(run)) return false;
    return recurs(run) === 'no' || (countSlots(run, 'governing') > 0 && hasSlot(run, 'reframe') && countSlots(run, 'strategy') > 0 && hasSlot(run, 'test'));
  }
});
```

```js
// packages/problem-solver/tools/feedback-matrix.mjs
import { countSlots, nextIndexed, open, parseSlot } from '../slots.mjs';

export const FEEDBACK_QUADRANTS = Object.freeze(['suggestion', 'compliment', 'change', 'question']);
export const THEME_TAGS = Object.freeze(['do_more', 'question', 'change']);
const PER_QUADRANT = 6;
const PER_THEME = 4;
const nameOf = (run, id) => parseSlot(run.nodes.find((node) => node.id === id)?.slot)?.name;

/** The why and how nodes hanging from one theme, in placement order. */
export function satellitesOf(run, themeId) {
  const out = { why: [], how: [] };
  for (const edge of run.edges) {
    if (edge.kind !== 'of' || edge.to !== themeId) continue;
    const node = run.nodes.find((item) => item.id === edge.from);
    const name = parseSlot(node?.slot)?.name;
    if (name === 'why' || name === 'how') out[name].push(node);
  }
  return out;
}

const filledQuadrants = (run) => FEEDBACK_QUADRANTS.filter((q) => countSlots(run, q) > 0).length;
const themeWithHow = (run) => run.nodes.some((node) => parseSlot(node.slot)?.name === 'theme' && satellitesOf(run, node.id).how.length > 0);

export const feedbackMatrix = Object.freeze({
  id: 'feedback_matrix',
  name: 'Feedback matrix',
  kind: 'review',
  step: 'improve',
  when: 'Feedback from yourself or others needs sorting into something you can act on: what to try, keep, stop and clarify, then the themes that matter most, why they matter and how to act.',
  failureModes: [
    'Only collecting compliments, or only complaints.',
    'Treating every comment as equally important instead of choosing themes.',
    'Themes with no "how", so nothing changes.',
    'Feedback about people rather than the work or the process.'
  ],
  steps: [
    { id: 'collect', title: 'Part one: sort the feedback', prompt: 'Your own and others\': suggestions to try, compliments to keep, changes to stop or remove, questions to clarify.' },
    { id: 'themes', title: 'Part two: choose themes', prompt: 'Pick the themes with the most impact: something to do more of, a question to settle, or a change to make.' },
    { id: 'why_how', title: 'Ask why and how', prompt: 'For each theme ask why it matters and how to act on it.' },
    { id: 'act', title: 'Act', prompt: 'Turn the hows into actions; for what works, how to repeat it elsewhere.' }
  ],
  slots: {
    suggestion: 'A suggestion: something to try or improve',
    compliment: 'A compliment: something to keep doing',
    change: 'A change: something to stop or remove',
    question: 'A question: something unclear to settle',
    theme: 'A theme with the most impact',
    why: 'Why the theme matters (a root cause or a priority)',
    how: 'How to act on the theme',
    action: 'An action to take'
  },
  nodeTags: { theme: THEME_TAGS },
  edgeKinds: ['of'],
  requiredLinks: {
    why: { kind: 'of', message: 'Link each why to the theme it explains (link kind "of", from the why to the theme).' },
    how: { kind: 'of', message: 'Link each how to the theme it acts on (link kind "of", from the how to the theme).' }
  },
  nextSlots(run) {
    const items = FEEDBACK_QUADRANTS.map((q) => nextIndexed(run, q, PER_QUADRANT));
    if (filledQuadrants(run) < 3) return open(...items);
    const themes = countSlots(run, 'theme') > 0;
    return open(
      ...items,
      nextIndexed(run, 'theme', 4),
      themes ? nextIndexed(run, 'why', 16) : null,
      themes ? nextIndexed(run, 'how', 16) : null,
      themeWithHow(run) ? nextIndexed(run, 'action', 6) : null
    );
  },
  canEdge(run, from, to, kind) {
    const name = nameOf(run, from);
    return kind === 'of' && (name === 'why' || name === 'how') && nameOf(run, to) === 'theme' && !run.edges.some((edge) => edge.kind === 'of' && edge.from === from) && satellitesOf(run, to)[name].length < PER_THEME;
  },
  complete(run) {
    return filledQuadrants(run) >= 3 && themeWithHow(run) && countSlots(run, 'action') > 0;
  }
});
```

- `tools/index.mjs`: import the three and add them after `eisenhower` in this order: `after_action_review: afterActionReview`, `double_loop: doubleLoop`, `feedback_matrix: feedbackMatrix`.
- `types.ts`: add `'after_action_review' | 'double_loop' | 'feedback_matrix'` to `PsToolId`. `glyphs.ts` needs emblems for them (Task 2). Until then, give the three ids the same temporary fallback Plan 5 Task 3 used, so the type gate stays clean.
- `prompts.mjs` `runLines`: after the `Waiting on:` entry, add `...(def.promptNote?.(run) ? [`Note: ${def.promptNote(run)}`] : [])`.

- [ ] **Step 4: Run** the new file, `problem-solver-prompts`, `problem-solver-catalogue`, `problem-solver-tools` and `problem-solver-steps`. Expect PASS. If the catalogue test checks every tool has an emblem, it may need the same temporary fallback.

- [ ] **Step 5: Commit**: `Problem Solver: Improve tool definitions` (with trailer).

---

### Task 2: Emblems for the three tools, then the HUMAN CHECKPOINT

**Files:**
- Create: `packages/problem-solver/glyphs/tools/after_action_review.svg`, `double_loop.svg`, `feedback_matrix.svg`
- Modify: `packages/problem-solver/glyphs.ts` (drop the Task 1 fallback)
- Test: `apps/tasks/tests/unit/problem-solver-glyphs.test.ts` (already checks that every tool has an emblem), `apps/tasks/tests/unit/problem-solver-view.test.ts`

- [ ] **Step 1: Draw the emblems.** Open `.ps-book/emblem-sheet.png` (they are the last column, rows 1–3) and each tool's page, where the emblem sits beside the title. Every emblem is a circle in viewBox `0 0 100 100` with literal book fills (copy the hex values from `glyphs/tools/smart.svg`), no ids and no strokes.
  - **double_loop:** a yellow disc. A red circle on the left overlaps a blue circle on the right, both about 40% of the disc's width; the blue sits over the red.
  - **feedback_matrix:** a red disc. A yellow square in the middle. A blue square peeks out at its top left, and a second blue square peeks out at its bottom right, each offset so only an L-shaped edge shows.
  - **after_action_review:** a blue disc. A red square sits low and to the right. Over it, a yellow chevron (an upward-pointing triangle outline with a thick yellow edge and a red inside) leans from the lower left.

  Where this list and the sheet disagree, follow the sheet.
- [ ] **Step 2:** Import the three SVGs in `glyphs.ts`, add them to `EMBLEMS`, and drop the fallback.
- [ ] **Step 3: Contact sheet.**
  - Build a throwaway HTML page in the scratchpad with all 30 emblems at 96px and 24px on the paper background.
  - Screenshot it with the Chrome path (reuse `node_modules/playwright-core`) to `$PS_SCRATCH/preview/emblems-plan6.png`.
  - Compare it with `.ps-book/emblem-sheet.png`, and fix any emblem that does not read as its book counterpart.
- [ ] **Step 4:** Run the glyph and view tests, the type gate and all Problem Solver tests. Add a view test that `[data-step="improve"]` on the landing shelf contains the three Improve tool names. Commit: `Problem Solver: Improve emblems`.
- [ ] **Step 5: HUMAN CHECKPOINT.** The controller sends `emblems-plan6.png` to Adam (SendUserFile) and asks for approval. Later tasks may proceed meanwhile. Requested changes become a fix commit before the plan finishes.

---

### Task 3: `nextPhase`, `pastStep` and the new session types

**Files:**
- Modify: `packages/problem-solver/steps.mjs`, `packages/problem-solver/types.ts`
- Test: `tests/unit/problem-solver-steps.test.js`

`nextPhase(session)` is the one place that decides where Move on goes. The server's `moveOn`, the coach panel's button label and the page's review banner all call it.

- [ ] **Step 1: Failing tests** (append to `tests/unit/problem-solver-steps.test.js`; merge the import):

```js
import { nextPhase, pastStep } from '../../packages/problem-solver/steps.mjs';

const at = (phase, extra = {}) => ({ model: { id: 'seven_step' }, phase, steps: {}, reviewState: null, detour: null, ...extra });

test('nextPhase: the next plan step, null at the end', () => {
  assert.equal(nextPhase(at('implement')), 'improve');
  assert.equal(nextPhase(at('document')), null);
  assert.equal(nextPhase({ model: null, phase: 'frame' }), null);
});

test('nextPhase: a reopened step returns to where it was reopened from', () => {
  assert.equal(nextPhase(at('define', { detour: { from: 'improve', to: 'define', reason: 'r', at: 't' } })), 'improve');
});

test('nextPhase: a late review returns to where it began, or finishes', () => {
  const review = (returnTo) => at('improve', { reviewState: { status: 'reviewing', due: null, returnTo, startedAt: 't' } });
  assert.equal(nextPhase(review('document')), 'document');
  assert.equal(nextPhase(review('finished')), null);
  assert.equal(nextPhase(review(null)), 'document');
  assert.equal(nextPhase(at('evaluate', { model: { id: 'polya' } })), 'document');
});

test('pastStep: true once the session is beyond a step, or finished', () => {
  assert.equal(pastStep(at('document'), 'improve'), true);
  assert.equal(pastStep(at('finished'), 'improve'), true);
  assert.equal(pastStep(at('improve'), 'improve'), false);
  assert.equal(pastStep(at('implement'), 'improve'), false);
});
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement** in `steps.mjs`:

```js
/**
 * Where Move on goes from the session's current step: back from a reopened step
 * (`detour`), back to where a late review began (`reviewState.returnTo`), otherwise
 * the next plan step. Null means the session finishes.
 */
export function nextPhase(session) {
  if (!session.model) return null;
  if (session.detour && session.detour.to === session.phase) return session.detour.from;
  const review = session.reviewState;
  if (review?.status === 'reviewing' && review.returnTo && session.phase === planStepForBook(session.model.id, 'improve')) {
    return review.returnTo === 'finished' ? null : review.returnTo;
  }
  return nextStepAfter(session.model.id, session.phase);
}

/** True when the session has moved beyond plan step `stepId` (or finished). */
export function pastStep(session, stepId) {
  if (session.phase === 'finished') return true;
  const order = stepPlan(session.model.id).map((s) => s.step);
  const here = order.indexOf(session.phase);
  return here >= 0 && here > order.indexOf(stepId);
}
```

Update the `chosenOption` comment: "(Plan 6) Improve" becomes "Improve's carry-forward".

In `types.ts`:

```ts
export type PsStepStatus = 'open' | 'done' | 'skipped' | 'waiting';

/** Improve's review: waiting for results, under way, or done. `returnTo` is where a late review goes back to. */
export type PsReviewState = { status: 'waiting' | 'reviewing' | 'done'; due: string | null; returnTo: string | null; startedAt: string | null };
/** Counts of the problem's tasks by live status, and overdue titles. Posted by the page; deleted tasks are left out. */
export type PsTaskSnapshot = { at: string; byStatus: Record<'open' | 'in_progress' | 'deferred' | 'done' | 'dead' | 'unknown', number>; overdue: string[] };
/** A step reopened from Improve; Move on returns to `from`. */
export type PsDetour = { from: string; to: string; reason: string; at: string };
```

Add to `PsSession`: `reviewState: PsReviewState | null; taskSnapshot: PsTaskSnapshot | null; detour: PsDetour | null;`.

Add to `PsSuggestion`: `| { kind: 'reopen_step'; step: 'define' | 'analyse'; reason: string }`.

Add `'start_review' | 'task_status'` to `PsAction`. Add `reviewDue?: string | null` to `PsSummary`.

- [ ] **Step 4: Run** the steps tests and the type gate (expect new type errors only where Task 4 or Task 8 will fix them; note them and carry on). Commit: `Problem Solver: nextPhase and the review types` (with trailer).

---

### Task 4: Session: waiting, the review, the snapshot and the reopen loop (FULL REVIEW)

**Files:**
- Modify: `netlify/functions/_shared/problem-solver/session.mjs`, `netlify/functions/_shared/problem-solver/migrate.mjs`
- Test: `tests/unit/problem-solver-session.test.js`, `tests/unit/problem-solver-migrate.test.js`

- [ ] **Step 1: Failing tests.** Append to `tests/unit/problem-solver-session.test.js`, and add `startReview, taskStatus, reopenProblem, waitingForReview` to its import.

```js
import { nextPhase } from '../../packages/problem-solver/steps.mjs';

const idle = (s) => ({ ...s, runner: { status: 'idle', mode: 'turn', error: null } });

/** A seven-step session moved on to `phase`; the steps before it are skipped untouched. */
function at(phase) {
  let s = idle(framed());
  while (s.phase !== phase) s = idle(moveOn(s, deps));
  return s;
}

/** In Implement with a finished 15% run, so leaving it proposes a review. */
function implementDone() {
  let s = idle(acceptSuggestion({ ...at('implement'), suggestion: { kind: 'next_tool', tool: 'fifteen_percent', reason: 'r' } }, deps));
  for (const [slot, text] of [['reflect', 'We control which day the rota goes out'], ['action:1', 'Move publish day to Wednesday'], ['action:2', 'Ask for swaps by Tuesday']]) {
    s = idle(applyCoachTurn(s, coach({ node: { slot, text } }), deps));
  }
  return idle(applyCoachTurn(s, coach({ node: { slot: 'chosen:1', text: 'Move publish day now' }, edges: [{ from: 'chosen:1', to: 'action:1', kind: 'picks' }] }), deps));
}

const snapshot = { byStatus: { open: 1, done: 2, bogus: 9 }, overdue: ['Ask for swaps by Tuesday', 7] };

test('leaving a finished Implement opens Improve waiting for the review', () => {
  const s = idle(moveOn(implementDone(), deps));
  assert.equal(s.phase, 'improve');
  assert.equal(s.reviewProposal.status, 'proposed');
  assert.deepEqual(s.reviewState, { status: 'waiting', due: s.reviewProposal.due, returnTo: null, startedAt: null });
  assert.equal(waitingForReview(s), true);
});

test('Implement skipped untouched leaves no review, so Improve does not wait', () => {
  const s = idle(moveOn(at('implement'), deps));
  assert.equal(s.phase, 'improve');
  assert.equal(s.reviewState, null);
});

test('while Improve waits, the coach suggests no tool', () => {
  let s = applyCoachTurn(moveOn(implementDone(), deps), coach({}), deps);
  assert.equal(s.pendingLearning, 'implement');
  s = applyCoachTurn(idle(s), coach({ learning: 'I plan better with a date.', suggestion: { kind: 'next_tool', tool: 'after_action_review', reason: 'r' } }), deps);
  assert.equal(s.suggestion, null);
});

test('moving on while waiting marks Improve waiting and keeps the review open', () => {
  const s = idle(moveOn(idle(moveOn(implementDone(), deps)), deps));
  assert.equal(s.phase, 'document');
  assert.equal(s.steps.improve.status, 'waiting');
  assert.equal(s.reviewState.status, 'waiting');
});

test('start_review in a waiting Improve starts it with the task snapshot', () => {
  let s = idle(moveOn(implementDone(), deps));
  s = startReview(s, { snapshot }, deps);
  assert.equal(s.reviewState.status, 'reviewing');
  assert.equal(s.reviewState.startedAt, deps.now());
  assert.deepEqual(s.taskSnapshot, { at: deps.now(), byStatus: { open: 1, in_progress: 0, deferred: 0, done: 2, dead: 0, unknown: 0 }, overdue: ['Ask for swaps by Tuesday'] });
  assert.equal(s.runner.status, 'queued');
  assert.equal(s.turns.at(-1).text, 'Let\'s review how it went.');
  const again = startReview(idle(s), {}, deps);
  assert.equal(again.turns.length, s.turns.length, 'starting twice changes nothing');
});

test('start_review from Implement leaves it straight into the review', () => {
  const s = startReview({ ...implementDone(), reviewTaskId: 'task9', reviewProposal: { title: 'Review: Late rota', due: '2026-11-02', reason: '', status: 'confirmed' } }, {}, deps);
  assert.equal(s.phase, 'improve');
  assert.equal(s.reviewState.status, 'reviewing');
  assert.equal(s.reviewState.due, '2026-11-02');
  assert.equal(s.runner.mode, 'boundary');
});

test('a late review reopens Improve, then returns to where the session was', () => {
  let s = idle(moveOn(implementDone(), deps));
  s = idle(moveOn(s, deps));
  assert.equal(s.phase, 'document');
  let late = idle(startReview(s, {}, deps));
  assert.equal(late.phase, 'improve');
  assert.equal(late.steps.improve.status, 'open');
  assert.equal(late.reviewState.returnTo, 'document');
  assert.equal(nextPhase(late), 'document');
  late = idle(moveOn(late, deps));
  assert.equal(late.phase, 'document');
  assert.equal(late.reviewState.status, 'done');

  s = idle(moveOn(s, deps));
  assert.equal(s.status, 'finished');
  s = idle(startReview(s, {}, deps));
  assert.equal(s.status, 'active');
  assert.equal(s.reviewState.returnTo, 'finished');
  s = idle(moveOn(s, deps));
  assert.equal(s.phase, 'finished');
  assert.equal(s.status, 'finished');
});

test('start_review needs a live review, and is refused before Implement is done', () => {
  assert.throws(() => startReview(at('improve'), {}, deps), /no review to start/);
  assert.throws(() => startReview({ ...at('decide'), reviewTaskId: 'task9' }, {}, deps), /once Implement is done/);
});

test('setting the review aside while waiting lets Improve run now', () => {
  const s = dismissReview(idle(moveOn(implementDone(), deps)), deps);
  assert.equal(s.reviewState, null);
  assert.equal(s.suggestion?.tool, 'after_action_review');
});

test('task_status stores a cleaned snapshot without calling the coach; the same snapshot is a no-op', () => {
  let s = idle(dismissReview(idle(moveOn(implementDone(), deps)), deps));
  s = taskStatus(s, { snapshot }, deps);
  assert.equal(s.taskSnapshot.byStatus.done, 2);
  assert.equal(s.runner.status, 'idle');
  assert.equal(taskStatus(s, { snapshot }, deps), s);
  assert.throws(() => taskStatus(s, { snapshot: 'x' }, deps), /must be an object/);
});

/** Improve with a double-loop run that has named a governing assumption. */
function inDoubleLoop() {
  let s = idle(dismissReview(idle(moveOn(implementDone(), deps)), deps));
  s = idle(acceptSuggestion({ ...s, suggestion: { kind: 'next_tool', tool: 'double_loop', reason: 'r' } }, deps));
  for (const [slot, text, tag] of [['problem', 'The rota is still late'], ['single', 'We moved the publish day'], ['recurs', 'Late again in week four', 'yes'], ['governing:1', 'Only the manager may sign it off']]) {
    s = idle(applyCoachTurn(s, coach({ node: { slot, text, ...(tag ? { tag } : {}) } }), deps));
  }
  return s;
}

test('reopening Define from Improve is a detour; moving on returns to Improve', () => {
  let s = inDoubleLoop();
  assert.equal(reopenProblem(s, 'define'), null);
  assert.match(reopenProblem(s, 'contradiction'), /no contradiction step/);
  const loopRun = activeRun(s).id;
  s = acceptSuggestion({ ...s, suggestion: { kind: 'reopen_step', step: 'define', reason: 'The sign-off rule was never questioned.' } }, deps);
  assert.equal(s.phase, 'define');
  assert.deepEqual(s.detour, { from: 'improve', to: 'define', reason: 'The sign-off rule was never questioned.', at: deps.now() });
  assert.equal(s.steps.improve.runs.find((run) => run.id === loopRun).status, 'done');
  assert.equal(s.steps.define.status, 'open');
  assert.equal(s.runner.mode, 'turn');
  assert.equal(nextPhase(s), 'improve');
  s = moveOn(idle(s), deps);
  assert.equal(s.phase, 'improve');
  assert.equal(s.detour, null);
  assert.equal(s.runner.mode, 'boundary');
  assert.equal(s.runner.leaving, 'define');
});

test('reopen is refused while waiting and before double-loop names a governing assumption', () => {
  const waiting = idle(moveOn(implementDone(), deps));
  assert.match(reopenProblem(waiting, 'define'), /waiting/);
  assert.match(reopenProblem(idle(dismissReview(waiting, deps)), 'define'), /governing assumption/);
  assert.match(reopenProblem(at('decide'), 'define'), /only from Improve/);
});

test('the summary row carries the review date while waiting', () => {
  assert.equal(summaryRow(idle(moveOn(implementDone(), deps))).reviewDue, idle(moveOn(implementDone(), deps)).reviewProposal.due);
  assert.equal(summaryRow(at('decide')).reviewDue, null);
});
```

Also add `'reviewDue'` to the key list in the existing test "say appends a user turn and queues; summary rows are small".

In `tests/unit/problem-solver-migrate.test.js`:
- Add a test that a v2 session without the three fields gains `reviewState: null, taskSnapshot: null, detour: null`.
- Update the "v2 sessions and index rows pass through unchanged" fixture so it already carries the three fields. The test's point stays: a complete v2 session is untouched.

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement** in `session.mjs`. Import `nextPhase`, `pastStep`, `planStepForBook` (with the existing steps imports) and `parseSlot` from `packages/problem-solver/slots.mjs`.

```js
const SNAPSHOT_STATUSES = ['open', 'in_progress', 'deferred', 'done', 'dead', 'unknown'];

/** A review exists to wait for: created, or proposed and not set aside. */
const reviewLive = (session) => Boolean(session.reviewTaskId) || ['proposed', 'confirmed'].includes(session.reviewProposal?.status);

export function waitingForReview(session) {
  return session.reviewState?.status === 'waiting' && inBook(session, session.phase, 'improve');
}

/** A clean snapshot, or null when none was sent. Unknown statuses are dropped; removed tasks are never counted. */
function cleanSnapshot(raw, deps) {
  if (raw == null) return null;
  if (typeof raw !== 'object' || Array.isArray(raw)) throw fail(400, 'validation_error', 'A task snapshot must be an object.');
  const count = (value) => (Number.isInteger(value) && value >= 0 && value <= 500 ? value : 0);
  return {
    at: deps.now(),
    byStatus: Object.fromEntries(SNAPSHOT_STATUSES.map((key) => [key, count(raw.byStatus?.[key])])),
    overdue: (Array.isArray(raw.overdue) ? raw.overdue : []).filter((title) => typeof title === 'string' && title.trim()).slice(0, 10).map((title) => title.trim().slice(0, TITLE_MAX))
  };
}

const sameSnapshot = (a, b) => Boolean(a && b) && JSON.stringify([a.byStatus, a.overdue]) === JSON.stringify([b.byStatus, b.overdue]);
```

`openingSuggestion`: return null when `waitingForReview(session)`.

`applyCoachTurn`: extend `quiet` to `next.phase === 'finished' || mode === 'boundary' || waitingForReview(next)`.

**`moveOn(session, deps, options = {})`**, replacing its body after the `step` check:

```js
  const leaving = session.phase;
  const runs = step.runs.map((run) => (run.status === 'active' ? { ...run, status: 'done' } : run));
  const kept = runs.some((run) => run.status !== 'switched' && isRunComplete(run));
  const status = kept ? 'done' : waitingForReview(session) ? 'waiting' : 'skipped';
  const nextId = nextPhase(session);
  let next = withStep({ ...session, suggestion: null, pendingKeep: null }, leaving, { runs, status });
  if (inBook(session, leaving, 'implement') && status === 'done' && !session.reviewTaskId && !session.reviewProposal) {
    next = { ...next, reviewProposal: { title: reviewTitle(session), due: addDays(deps.now(), REVIEW_AFTER_DAYS), reason: 'A first look at how the plan is going.', status: 'proposed' } };
  }
  // Back from a reopened step: the detour is over.
  if (session.detour?.to === leaving) next = { ...next, detour: null };
  // Leaving the review: done. Leaving Implement for Improve with a review in place: wait for it.
  if (session.reviewState?.status === 'reviewing' && inBook(session, leaving, 'improve')) {
    next = { ...next, reviewState: { ...session.reviewState, status: 'done' } };
  } else if (nextId && inBook(session, leaving, 'implement') && inBook(session, nextId, 'improve') && reviewLive(next)) {
    const due = next.reviewProposal?.due ?? null;
    next = { ...next, reviewState: options.review ? { status: 'reviewing', due, returnTo: null, startedAt: deps.now() } : { status: 'waiting', due, returnTo: null, startedAt: null } };
  }
  next = { ...next, turns: [...next.turns, userTurn(nextId ? 'Move on.' : 'That is everything.', deps)] };
  next = nextId ? withStep({ ...next, phase: nextId }, nextId, { status: 'open' }) : { ...next, phase: 'finished', status: 'finished' };
  return queue(touch(next, deps), 'boundary', leaving);
```

Entering a step always sets it `open`, so a step re-entered after a detour or for a late review is `open` until it is left again. Its runs stay.

**`startReview`, `taskStatus`, `reopenProblem`, `reopenStep`:**

```js
/**
 * Start Improve's review on real results. From the step before Improve it leaves that step
 * straight into the review. In Improve it starts now. Past Improve (a later step, or
 * finished) it reopens Improve for a new pass and returns afterwards. Idempotent once reviewing.
 */
export function startReview(session, payload, deps) {
  if (session.status === 'archived') throw fail(409, 'action_not_allowed', 'This problem is archived.');
  const improve = session.model ? planStepForBook(session.model.id, 'improve') : null;
  if (!improve) throw fail(409, 'action_not_allowed', 'This problem has no Improve step.');
  if (session.reviewState?.status === 'reviewing' && session.phase === improve) return session;
  if (!reviewLive(session)) throw fail(409, 'action_not_allowed', 'There is no review to start.');
  if (session.detour) throw fail(409, 'action_not_allowed', 'Finish the reopened step first.');
  const snap = cleanSnapshot(payload?.snapshot, deps);
  let next = snap ? { ...session, taskSnapshot: snap } : session;
  if (session.phase !== 'finished' && nextPhase(session) === improve) return moveOn(next, deps, { review: true });
  const due = session.reviewProposal?.due ?? null;
  const returnTo = session.phase === improve ? null : session.phase;
  if (returnTo && !pastStep(session, improve)) throw fail(409, 'action_not_allowed', 'The review opens once Implement is done.');
  next = { ...next, status: 'active', phase: improve, suggestion: null, pendingKeep: null, reviewState: { status: 'reviewing', due, returnTo, startedAt: deps.now() } };
  next = withStep(next, improve, { status: 'open' });
  const text = returnTo ? 'Time to review how it went.' : 'Let\'s review how it went.';
  return queue(touch({ ...next, turns: [...next.turns, userTurn(text, deps)] }, deps));
}

/** The page's latest snapshot of the problem's tasks. No coach call; an unchanged snapshot is a no-op. */
export function taskStatus(session, payload, deps) {
  if (!session.model) throw fail(409, 'action_not_allowed', 'There are no tasks yet.');
  if (payload?.snapshot == null) throw fail(400, 'validation_error', 'A task snapshot is required.');
  const snap = cleanSnapshot(payload.snapshot, deps);
  return sameSnapshot(snap, session.taskSnapshot) ? session : touch({ ...session, taskSnapshot: snap }, deps);
}

/** Why `book` cannot be reopened now, or null when it can. Read by the coach parser and the accept. */
export function reopenProblem(session, book) {
  if (!session.model || !inBook(session, session.phase, 'improve')) return 'Reopen only from Improve.';
  if (session.detour) return 'A step is already reopened.';
  if (waitingForReview(session)) return 'Improve is waiting for the review; do not reopen now.';
  const target = planStepForBook(session.model.id, book);
  if (!target || !session.steps[target]) return `There is no ${book} step in this problem to reopen.`;
  const named = currentStep(session).runs.some((run) => run.tool === 'double_loop' && run.nodes.some((node) => parseSlot(node.slot)?.name === 'governing'));
  return named ? null : 'Reopen only after double-loop learning has named a governing assumption.';
}

function reopenStep(session, suggestion, deps) {
  const problem = reopenProblem(session, suggestion.step);
  if (problem) throw fail(409, 'action_not_allowed', problem);
  const from = session.phase;
  const target = planStepForBook(session.model.id, suggestion.step);
  const runs = currentStep(session).runs.map((run) => (run.status === 'active' ? { ...run, status: 'done' } : run));
  let next = withStep({ ...session, suggestion: null, pendingKeep: null }, from, { runs });
  next = withStep({ ...next, phase: target, detour: { from, to: target, reason: suggestion.reason, at: deps.now() } }, target, { status: 'open' });
  return queue(touch({ ...next, turns: [...next.turns, userTurn(`Reopen ${stepName(session.model.id, target)}.`, deps)] }, deps));
}
```

- `acceptSuggestion`: before the `currentStep` check, add `if (suggestion.kind === 'reopen_step') return reopenStep({ ...session, suggestion: null }, suggestion, deps);`.
- `dismissReview`: when `session.reviewState?.status === 'waiting'`, also set `reviewState: null` and, if the session is in an Improve step with no active run, `suggestion: openingSuggestion(next)`. Compute it on the session after the change, because `openingSuggestion` reads `waitingForReview`.
- `setReviewTask`: when the session is waiting, update `reviewState.due` to the confirmed date.
- `createSession`: add `reviewState: null, taskSnapshot: null, detour: null`.
- `summaryRow`: add `reviewDue: session.reviewState?.status === 'waiting' ? session.reviewState.due : null`.

In `migrate.mjs`, add the three fields to `TASK_FIELDS`. Rename it `LATER_FIELDS` and update its comment: "Sessions saved before Plans 5 and 6 gain these fields".

- [ ] **Step 4: Run** the session, migrate, steps and prompts tests. Expect PASS. (The plan's tool, steps and session code was dry-run against these tests on 20 October before the plan was committed: all new tests passed.) Then run every root Problem Solver test, because `moveOn` changed.

- [ ] **Step 5: Commit**: `Problem Solver: Improve waits for the review; late reviews and the reopen loop` (with trailer).

---

### Task 5: Coach schema, parser and the service actions

**Files:**
- Modify: `netlify/functions/_shared/problem-solver/coach-schema.mjs`, `coach.mjs`, `service.mjs`
- Test: `tests/unit/problem-solver-coach-schema.test.js`, `tests/unit/problem-solver-coach.test.js`, `tests/unit/problem-solver-service.test.js`

- [ ] **Step 1: Failing tests**
  - **Schema:** `validateCoachTurn` with `suggestion: { kind: 'reopen_step', step: 'define', reason: 'r' }` returns `{ kind: 'reopen_step', step: 'define', reason: 'r' }`. With `step: 'devise'` it fails with `/reopen_step needs step define or analyse/`.
  - **Parser:** build a session with the session-test helpers' approach (`createSession` → `applyCoachTurn` → `acceptSuggestion` → `moveOn` with an idle runner) into Improve without a double-loop run. A model reply that suggests `reopen_step` passes, with its suggestion dropped (`turn.suggestion === null`) and no repair call.
  - **Parser while waiting:** in a waiting Improve, a reply with `next_tool after_action_review` passes with the suggestion dropped.
  - **Service:** `start_review` and `task_status` are accepted actions. `task_status` while the coach is busy gets 409 `busy`, like the others.

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement**

In `coach-schema.mjs` `suggestionOf`, before the final `return { value: null }`:

```js
  if (raw.kind === 'reopen_step') {
    if (!['define', 'analyse'].includes(raw.step)) return { error: 'reopen_step needs step define or analyse.' };
    return { value: { kind: 'reopen_step', step: raw.step, reason } };
  }
```

In `coach.mjs` `parse`, after the `next_tool`/`switch_tool` check (import `reopenProblem` and `waitingForReview` from `./session.mjs`):

```js
  // A reopen the session would refuse, or any tool suggestion while Improve waits, is dropped; the turn survives.
  if (suggested?.kind === 'reopen_step' && reopenProblem(session, suggested.step)) result.value = { ...result.value, suggestion: null };
  if (waitingForReview(session) && result.value.suggestion && result.value.suggestion.kind !== 'next_step') result.value = { ...result.value, suggestion: null };
```

In `service.mjs` `ACTIONS` (import `startReview` and `taskStatus`):

```js
    start_review: (s, body) => startReview(s, body.payload ?? {}, deps),
    task_status: (s, body) => taskStatus(s, body.payload ?? {}, deps),
```

- [ ] **Step 4: Run** those three test files and `problem-solver-http`. Expect PASS.

- [ ] **Step 5: Commit**: `Problem Solver: reopen suggestion, review actions` (with trailer).

---

### Task 6: Coach knowledge and prompt lines for Improve

**Files:**
- Modify: `netlify/functions/_shared/problem-solver/knowledge/selection.mjs`, `knowledge/triggers.mjs`, `prompts.mjs`
- Test: `tests/unit/problem-solver-knowledge.test.js`, `tests/unit/problem-solver-prompts.test.js`

The chapter paragraph for Improve already exists (Plan 3).

- [ ] **Step 1: Failing tests**

Extend the step lists in `problem-solver-knowledge.test.js`'s Decide and Implement tests to include `'improve'` (the guide names every Improve tool; at least four short triggers).

Append to `problem-solver-prompts.test.js`:

```js
const idleRunner = { status: 'idle', mode: 'turn', error: null };
const improveAt = (extra) => ({ ...inTool(), phase: 'improve', steps: { ...inTool().steps, improve: { runs: [], status: 'open', objection: null } }, runner: idleRunner, ...extra });

test('rubric explains the review, the wait and reopen_step', () => {
  for (const word of ['reopen_step', 'IMPROVE IS WAITING', '"step":"define|analyse"']) assert.ok(RUBRIC.includes(word), word);
});

test('a waiting Improve holds tools and names the review date', () => {
  const s = improveAt({ reviewProposal: { title: 'Review: Late work.', due: '2026-11-02', reason: '', status: 'proposed' }, reviewState: { status: 'waiting', due: '2026-11-02', returnTo: null, startedAt: null } });
  const prompt = buildCoachPrompt(s);
  assert.match(prompt.user, /IMPROVE IS WAITING/);
  assert.match(prompt.user, /2026-11-02/);
  assert.match(prompt.system[1], /CURRENT STEP: Improve/);
  assert.match(prompt.system[1], /after_action_review \(After action review\)/);
  assert.match(prompt.system[1], /CARRY FORWARD:/);
});

test('a review in progress carries the task snapshot', () => {
  const s = improveAt({
    reviewState: { status: 'reviewing', due: '2026-11-02', returnTo: 'document', startedAt: '2026-11-02T09:00:00.000Z' },
    taskSnapshot: { at: '2026-11-02T09:00:00.000Z', byStatus: { open: 1, in_progress: 0, deferred: 0, done: 2, dead: 0, unknown: 0 }, overdue: ['Ask for swaps'] }
  });
  const { user } = buildCoachPrompt(s);
  assert.match(user, /REVIEW IN PROGRESS since 2026-11-02; afterwards the session returns to Document/);
  assert.match(user, /TASK STATUS \(as of 2026-11-02\): 3 tasks: 1 not started, 2 done; overdue: "Ask for swaps"/);
});

test('a reopened step tells the coach why and where Move on returns', () => {
  const s = { ...inTool(), detour: { from: 'improve', to: 'define', reason: 'The sign-off rule was never questioned.', at: 't' } };
  assert.match(buildCoachPrompt(s).user, /REOPENED: Define was reopened from Improve because: The sign-off rule was never questioned\..*returns to Improve/s);
});
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement**

Add to `SELECTION`:

```js
  improve: 'Choose from what the review needs. Looking back soon after an activity, a milestone or a pilot: `after_action_review`, the usual first tool and the one a review opens with. A problem that keeps coming back, or a fix that did not hold: `double_loop`, which questions the assumptions behind the usual fix. Feedback from yourself or others to sort into what to try, keep, stop and clarify: `feedback_matrix`. Review the process that produced the solution as well as the solution. If double-loop learning shows a governing assumption was wrong at the root, you may offer to reopen Define or Analyse with "reopen_step" and a one-sentence reason; never reopen otherwise.'
```

Add to `STEP_TRIGGERS`:

```js
  improve: [
    'Blaming a person for what a process or system allowed (logical_reasoning).',
    'Skipping or rushing what was learned (metacognition).',
    'A single-loop fix offered for a problem that keeps recurring (analysis).',
    'Results claimed with no measure, or the plan described instead of what happened (critical_thinking).',
    'Only the solution reviewed, never the process that produced it (metacognition).'
  ]
```

In `prompts.mjs`:

- **`CARRY.improve`:** `'CARRY FORWARD: in the after action review, seed "set out to achieve" from the SMART goal in Define, DMAIC\'s Measure and the CHOSEN OPTION, and seed "achieved" from TASK STATUS. In double-loop learning, the problem is the gap the review found. Confirm before placing.'`
- **RUBRIC, SESSION SHAPE:** add item 8:
  > 8. Improve: when the state says IMPROVE IS WAITING, the results are not in yet. After the learning answer, say Improve picks up at the review on its date, that they can press Review now if results are already in, or move on. Do not open tools or place nodes. In a review, look at what actually happened, open with the after action review, and use TASK STATUS as evidence. When double-loop learning finds a governing assumption was wrong at the root, you may suggest "reopen_step" with step define or analyse and a one-sentence reason. Moving on from the reopened step returns to Improve.
- **RUBRIC, OUTPUT:** change the suggestion shape to `"suggestion":{"kind":"next_tool|switch_tool|next_step|reopen_step","tool":"...","step":"define|analyse","reason":"..."}|null`. Add: "Include "step" only with reopen_step, and "tool" only with next_tool or switch_tool."
- **`reviewLines(session)`**, pushed after the CHOSEN OPTION line:

```js
const STATUS_WORDS = { open: 'not started', in_progress: 'in progress', deferred: 'deferred', done: 'done', dead: 'dropped', unknown: 'could not be checked' };

function reviewLines(session) {
  const lines = [];
  const state = session.reviewState;
  const name = (step) => (step === 'finished' ? 'finished' : stepName(session.model.id, step));
  if (state?.status === 'waiting') lines.push(`IMPROVE IS WAITING for results. The review is ${session.reviewTaskId ? 'a task' : 'proposed'} for ${state.due ?? 'a date not yet set'}. Do not suggest a tool or place nodes.`);
  if (state?.status === 'reviewing') lines.push(`REVIEW IN PROGRESS since ${String(state.startedAt).slice(0, 10)}${state.returnTo ? `; afterwards the session returns to ${name(state.returnTo)}` : ''}. Look at what actually happened, not the plan.`);
  const snap = session.taskSnapshot;
  if (snap) {
    const counts = Object.entries(STATUS_WORDS).filter(([key]) => snap.byStatus[key] > 0).map(([key, words]) => `${snap.byStatus[key]} ${words}`);
    const total = Object.values(snap.byStatus).reduce((sum, value) => sum + value, 0);
    const overdue = snap.overdue.length ? `; overdue: ${snap.overdue.map((title) => `"${title}"`).join(', ')}` : '';
    lines.push(`TASK STATUS (as of ${snap.at.slice(0, 10)}): ${total} ${total === 1 ? 'task' : 'tasks'}${counts.length ? `: ${counts.join(', ')}` : ''}${overdue}`);
  }
  const detour = session.detour;
  if (detour && detour.to === session.phase) lines.push(`REOPENED: ${name(detour.to)} was reopened from ${name(detour.from)} because: ${detour.reason} Use a fresh tool run here; earlier runs stay. When it has what it needs, suggest next_step: moving on returns to ${name(detour.from)}.`);
  return lines;
}
```

- Push `...reviewLines(session)` into `parts` straight after the CHOSEN OPTION block (guard with `session.model`).
- In the `AWAITING LEARNING` text, when `waitingForReview(session)`, replace the "orient them … suggest its first tool" clause with: " Then say Improve picks up at the review, and do not suggest a tool."

- [ ] **Step 4: Run** the knowledge and prompts tests. Expect PASS.

- [ ] **Step 5: Commit**: `Problem Solver: coach knowledge for Improve and the review` (with trailer).

---

### Task 7: The task snapshot on the page

**Files:**
- Modify: `apps/tasks/src/views/problem-solver/task-bridge.ts`
- Test: `apps/tasks/tests/unit/problem-solver-task-bridge.test.ts`

- [ ] **Step 1: Failing tests**

```ts
import { taskSnapshot } from '../../src/views/problem-solver/task-bridge';

describe('taskSnapshot', () => {
  it('counts confirmed tasks by live status, lists overdue open ones and leaves deleted tasks out', () => {
    const proposals = [
      { id: 'p1', title: 'Draft rota', status: 'confirmed', due: null, taskId: 't1', source: { runId: 'r', nodeId: 'n1' } },
      { id: 'p2', title: 'Ask for swaps', status: 'confirmed', due: null, taskId: 't2', source: { runId: 'r', nodeId: 'n2' } },
      { id: 'p3', title: 'Old', status: 'confirmed', due: null, taskId: 't3', source: { runId: 'r', nodeId: 'n3' } },
      { id: 'p4', title: 'Idea', status: 'proposed', due: null, source: { runId: 'r', nodeId: 'n4' } }
    ] as PsProposedTask[];
    const details = {
      t1: { status: 'done', due_date: '2026-10-25', title: 'Draft rota' },
      t2: { status: 'open', due_date: '2026-10-28', title: 'Ask for swaps' },
      t3: 'removed' as const
    };
    expect(taskSnapshot(proposals, details, '2026-11-02')).toEqual({
      byStatus: { open: 1, in_progress: 0, deferred: 0, done: 1, dead: 0, unknown: 0 },
      overdue: ['Ask for swaps']
    });
  });
});
```

Also test that `bridge.details(proposals)` returns the task, `'removed'` (404) or `'unknown'`, and that `bridge.statuses` still returns the same map as before (status, `'removed'` or `'unknown'`) and still dismisses removed proposals.

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement**

```ts
export type TaskDetail = { status: string; due_date?: string | null; title?: string } | 'removed' | 'unknown';
const SNAPSHOT_STATUSES = ['open', 'in_progress', 'deferred', 'done', 'dead', 'unknown'] as const;

/** Counts by live status and overdue titles for the coach. Deleted tasks are never counted (Plan 5, Decision 8). */
export function taskSnapshot(proposals: PsProposedTask[], details: Record<string, TaskDetail>, today: string): { byStatus: Record<(typeof SNAPSHOT_STATUSES)[number], number>; overdue: string[] } {
  const byStatus = Object.fromEntries(SNAPSHOT_STATUSES.map((key) => [key, 0])) as Record<(typeof SNAPSHOT_STATUSES)[number], number>;
  const overdue: string[] = [];
  for (const p of proposals) {
    if (p.status !== 'confirmed' || !p.taskId) continue;
    const detail = details[p.taskId];
    if (!detail || detail === 'removed') continue;
    if (detail === 'unknown') { byStatus.unknown += 1; continue; }
    const key = (SNAPSHOT_STATUSES as readonly string[]).includes(detail.status) ? (detail.status as (typeof SNAPSHOT_STATUSES)[number]) : 'unknown';
    byStatus[key] += 1;
    if (detail.due_date && detail.due_date < today && !['done', 'dead'].includes(detail.status)) overdue.push(detail.title || p.title);
  }
  return { byStatus, overdue };
}
```

Split the bridge's fetch loop into `details(proposals)` (returns `Record<taskId, TaskDetail>` and queues the removed dismissals as before). `statuses(proposals)` becomes `details` mapped to `status | 'removed' | 'unknown'`. `Deps.getTask` already returns the full task; widen its type to include `due_date` and `title` if needed.

- [ ] **Step 4: Run** the bridge tests and the type gate. Expect PASS.

- [ ] **Step 5: Commit**: `Problem Solver: task snapshot for the review` (with trailer).

---

### Task 8: The waiting panel, the review banner and snapshot posting (FULL REVIEW)

**Files:**
- Create: `apps/tasks/src/views/problem-solver/review-panel.ts`
- Modify: `apps/tasks/src/views/problem-solver/view.ts`, `coach-panel.ts`, `packages/problem-solver/problem-solver.css`
- Test: `apps/tasks/tests/unit/problem-solver-review-panel.test.ts`, `apps/tasks/tests/unit/problem-solver-view.test.ts`, `apps/tasks/tests/unit/problem-solver-coach-panel.test.ts`

- [ ] **Step 1: Failing tests**

`reviewEntry(session, wanted)` replaces `resumeTarget` in `view.ts`. Replace its tests in `problem-solver-view.test.ts` with:
- `{ kind: 'move' }` for a seven-step session in `implement` with a `reviewTaskId` and `wanted = 'improve'`.
- `{ kind: 'start' }` in a waiting `improve`.
- `{ kind: 'reopen' }` in `document` and when `finished`.
- null when:
  - `wanted` is not `'improve'`;
  - there is no live review (no task and no proposed or confirmed proposal);
  - the review is already in progress;
  - a detour is open;
  - the session is before Implement.
- `'evaluate'` is the step for a polya session (`{ kind: 'move', step: 'evaluate' }` from polya `implement`).

`problem-solver-review-panel.test.ts`:
- `mountReviewPanel({ start })` returns `{ el, update(session) }`.
- **Hidden:** the panel is hidden unless the session is waiting in its Improve step.
- **Waiting:**
  - It shows a `[role="status"]` line "Improve picks up at your review on <date>." Format the date with `new Date(`${due}T00:00:00`).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })`. The test checks the line contains "2 Nov" for a due date of 2026-11-02.
  - It shows a "Review now" button and a muted note "Or move on; the review brings you back here."
  - Clicking "Review now" calls `start()` once and disables the button until the next `update`.
- **Banner:** `reviewBanner(entry, start)` returns a `div.ps-resume[role="status"]` with these texts and button labels:
  - `move`: "This review picks up at Improve." / "Start the review"
  - `start`: "Your review is due." / "Start the review"
  - `reopen`: "This problem has moved on. The review adds a new Improve pass, then brings you back." / "Review the results"

`problem-solver-coach-panel.test.ts`:
- A `reopen_step` suggestion renders the title "Reopen: Define", the reason, and the buttons "Reopen it" (`accept_suggestion`) and "Not now".
- In a session with `detour { from: 'improve', to: 'define' }`, the Move on button reads "Move on to Improve".
- While waiting, the Move on button reads "Move on to Document".

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement**
  - **`view.ts`:**
    - Export `reviewEntry(session, wanted)`. It returns `{ kind: 'move' | 'start' | 'reopen'; step }` or null.
    - The live-review test mirrors the server: `reviewTaskId`, or a proposal with status `proposed` or `confirmed`.
    - It uses `planStepForBook(model, 'improve')`, `nextPhase` and `pastStep`, with the null cases above.
  - **`renderSession`:**
    - Build the banner from `reviewEntry(session, hashQuery().get('step'))` with `reviewBanner`.
    - Mount `mountReviewPanel({ start: () => startReview() })` at the top of `bench`, before `canvasHost`, and call `panel.update(session)` in `render`.
    - `startReview()`:
      1. Remove the banner.
      2. Build the snapshot: `taskSnapshot(session.proposedTasks ?? [], await bridge.details(session.proposedTasks ?? []), today)`, where `today` is the local date as `YYYY-MM-DD`.
      3. Call `paint(await problemSolverApi.actWith(session, 'start_review', { snapshot }))`, then `settle()`.
      4. Errors go through `flash`. A conflict refetches, like `act`.
  - **Snapshot posting:**
    - After `refreshStatuses` builds its map, when the session is in an Improve plan step, not waiting, with at least one confirmed task, build the snapshot from the same details.
    - When its counts or overdue titles differ from `session.taskSnapshot`, post it with `confirmed('task_status', { snapshot })`.
    - Do this once per changed snapshot (keep the last posted key), so a status refresh never loops.
    - `refreshStatuses` should call `bridge.details` once and derive both the chart statuses and the snapshot from it.
  - **`coach-panel.ts`:**
    - Suggestion card: for `reopen_step` the title is `Reopen: ${stepName(model, planStepForBook(model, step))}` and the accept button is "Reopen it".
    - Move on button: use `nextPhase(session)` instead of `nextStepAfter` for its label ("Move on to <name>", or "Finish" when null).
  - **CSS:** add a `/* Review panel */` section.
    - The panel is a paper card with a 3px dashed blue top border, the status line at `--text` 15px, and the note in the muted ink.
    - "Review now" is a primary button, at least 44px.
    - It works at 390px with no horizontal overflow.

- [ ] **Step 4: Run** the three test files, all Tasks Problem Solver tests and the type gate. Expect PASS.

- [ ] **Step 5: Commit**: `Problem Solver: the review waits, starts from its link, and carries task status` (with trailer).

---

### Task 9: The record and the track show waiting and paused steps

**Files:**
- Modify: `packages/problem-solver/render/record.ts`, `apps/tasks/src/views/problem-solver/decor.ts`, `packages/problem-solver/problem-solver.css`
- Test: `apps/tasks/tests/unit/problem-solver-record.test.ts`, `apps/tasks/tests/unit/problem-solver-view.test.ts` (the track's tests live there)

A step that is waiting, or paused, should not look either finished or untouched. A step is paused when it is the step a detour returns to, or the step a late review returns to.

- [ ] **Step 1: Failing tests**
  - **`stepState`:**
    - It returns `'waiting'` for a step with status `waiting`.
    - It returns `'waiting'` for `detour.from` while the detour is open, and for `reviewState.returnTo` while reviewing.
    - The current step stays `'current'`.
    - During a detour from Improve to Define, Analyse to Implement keep their stored states: `done` or `skipped`, not `future`.
  - **Record words:** the record's words for `waiting` are "Waiting", and the box carries `data-state="waiting"`.
  - **Track:** during a detour to Define, the track marks Improve `waiting` and Analyse to Implement with their stored states, not `future`.

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement**
  - **`record.ts`:**
    - Add `'waiting'` to `StepState`.
    - In `stepState`, after the `current` check, return `'waiting'` for the three cases above.
    - A step with stored status `done` or `skipped` returns it wherever it sits, not only before the current step.
    - Add `waiting: 'Waiting'` to the words.
  - **`decor.ts`:**
    - In the track's `stateOf`, use the stored status for any step that has one: `done` or `skipped` as stored, and `waiting` for status `waiting`, a detour's `from`, or a late review's `returnTo`.
    - Fall back to the index comparison only for steps with no stored state.
  - **CSS:** waiting boxes and track dots get a dashed 1.5px ink outline on paper, at full opacity (they are not ghosts).

- [ ] **Step 4: Run** the record and track tests and the type gate. Expect PASS.

- [ ] **Step 5: Commit**: `Problem Solver: record and track show waiting and paused steps` (with trailer).

---

## Renderer tasks (10–12)

Each task gives:
- the book page;
- the class prefix and container name;
- the composition, how it builds and the phone layout;
- the tool-specific tests, on top of the eight baseline tests.

Follow the shared contract and the Plan 5 addendum for everything else. Each renderer:
- registers in `canvas.ts` `RENDERERS` and in `scripts/problem-solver-preview.mjs` `RENDERERS`;
- adds an invented sample to `SAMPLES`, with no real names, one contested node and a full run;
- must pass `--audit` at 900 and 390.

### Task 10: After action review renderer (`render/after-action-review.ts`, `createAfterActionReviewView`, prefix `ps-aar`, container `aar`)

**Book:** p.143 (`after-action-review.png`).
- **Bars:** four equal horizontal bars stacked with even gaps, each with a shape at its left and its heading beside it:
  1. Yellow bar, red square: "Set out to achieve"
  2. Yellow bar, blue triangle: "Achieved"
  3. Red bar, yellow triangle: "Why the difference"
  4. Blue bar, yellow equals sign (two stacked bars): "Learned"
- **Fills:** `data-fill="yellow|yellow|red|blue"`. Headings are `__title`. White text on red and blue, `--ps-on-yellow` on yellow.

**Build:**
- **Bars:** the four bars show from the start as faint outlines (paper with a 1px ink rule at 0.35 opacity), because the four questions are the tool.
- **Accepted answers:** each answer fills its bar's colour from left to right (`clip-path: inset(0 100% 0 0)` → `inset(0 0 0 0)`, 420ms). The shape pops in (scale 0.6 → 1). The answer text appears under the heading in the bar, clamped to three lines, with the full text in the details card. The bar grows in height to fit; the four stay equal width.
- **Learned share:** a thin ink gauge under the four bars shows `learnedShare(run)` against a tick at 50%, with the meta label "Time on learning: 52% (aim for half)". It appears once `learned` is placed and morphs on change.

**Phone (390):** bars full width; shapes 28px; the heading on one line (`__title` 12px minimum) and the answer below it.

**Tool tests:**
- The four `[data-bar]` exist before any node, with `data-filled="false"`.
- Placing `achieved` fills bar 2 only.
- The gauge (`[data-share]`) is absent until `learned` exists, and then reads the rounded percent.
- A contested `differences` shows the contested tag on bar 3.

### Task 11: Double-loop renderer (`render/double-loop.ts`, `createDoubleLoopView`, prefix `ps-dloop`, container `dloop`) — FULL REVIEW

**Book:** p.135 (`double-loop.png`). Look at it closely.

**Loops (an SVG layer, `aria-hidden`):**
- A large blue circle is the outer loop, with blue arrowheads running clockwise.
- A smaller blue ellipse in its upper half is the inner single loop, also with arrowheads.
- The two meet at the right, where the Problem box sits.

**Boxes (HTML over the SVG, absolutely positioned in percentages of a square stage, `data-shape`):**
- Yellow "Consequences" at the top left of the outer loop.
- Yellow "Action strategy" at the left.
- Red "Problem" at the right, on the junction, with a small italic "Start here" pointer.
- Yellow "Governing variables" at the bottom.
- Blue "Solution" outside the loops at the top right.
- From Consequences, a blue "Match" arrow curves to Solution, and a thin "Mismatch" arrow runs down to Problem.

**Labels:** "Single-loop learning" in the inner loop, and "Double-loop learning" by the outer loop at the bottom right, both small ink meta.

**Slot to box mapping (`LOOP_STAGE`):**
- Problem: `problem`.
- Action strategy: `single`, then each `strategy:N` as a second line marked "New".
- Consequences: `recurs`, with the tag shown as "Mismatch: it came back" or "Match: it held", then `test`.
- Governing variables: each `governing:N` as a listed item, then `reframe`, marked "Reframed".
- Solution: `monitor`.

A box with several entries shows the latest and a count ("+2"), with all of them in its details card.

**Build:**
- Boxes appear faint until they have an entry, then fill.
- The inner loop path draws in (stroke-dashoffset) once `single` exists.
- **Outer loop:** draws only when `recurs` is `yes`, together with the Mismatch arrow lighting. When `recurs` is `no`, the Match arrow lights and the outer loop stays faint.
- A travelling marker (a 12px ink dot with a paper ring) rests on the box of `loopStage(run)`. On change it moves along the loop between the two boxes (a FLIP move between measured box centres is acceptable; it does not need to follow the curve).

**Phone (390):** the stage scales to the container. Boxes show their heading and a code (P, A, C, G, S) only, with the latest entry in the details card. A key list under the stage pairs each code with its heading and latest entry, and is the 44px target (addendum item 13). The loop SVG keeps its stroke width with `vector-effect: non-scaling-stroke`.

**Tool tests:**
- `[data-loop="outer"]` has `data-drawn="false"` until `recurs` is `yes`, then `"true"`.
- With `recurs` `no`, `[data-arrow="match"]` is lit and the outer loop is not drawn.
- The marker's `data-stage` follows `loopStage` (`problem` → `action` → `consequences` → `governing`).
- Two governing entries show "+1" on the Governing box and both in its details card.
- Undo of the `recurs` node un-draws the outer loop with no animation left running.

### Task 12: Feedback matrix renderer (`render/feedback-matrix.ts`, `createFeedbackMatrixView`, prefix `ps-fbm`, container `fbm`) — FULL REVIEW

**Book:** p.137 (`feedback-matrix.png`, part one) and p.139 (`feedback-matrix-2.png`, part two).

**Part one:** a square 2×2 grid with no gaps:
- yellow "Suggestions" top left;
- blue "Compliments" top right;
- red "Changes" bottom left;
- yellow "Questions" bottom right.

At the centre, four symbol discs touch, one per quadrant:
- a blue disc with a yellow plus (Suggestions);
- a yellow disc with a blue tick (Compliments);
- a yellow disc with a blue cross (Changes);
- a blue disc with a yellow question mark (Questions).

Each quadrant's heading sits at its outer corner (`__title`), and its items are a vertical list of pills under the heading (the pill text is the node title; the full text is in details). With more than three items, the quadrant shows three and "+N more" (a button that opens a details list).

**Part two** appears under part one once a theme exists, headed "Part two". Each theme is a large circle coloured by its tag:
- `do_more`: blue, "Do more"
- `question`: yellow, "Question"
- `change`: red, "Change"

Its why and how satellites are small circles around it, joined by short lines:
- why: blue;
- how: yellow, or blue on a yellow theme (the picture);
- lines take the satellite's colour.

Satellites spread evenly on an arc away from the next cluster; the angles are recomputed on update and satellites glide to them. The theme circle shows the theme title; satellites show "Why" or "How" with the text in details. Actions appear as a numbered list "Actions" under the clusters, each item a card with a 3px blue left border.

**Build:**
- Pills drop into quadrants (translateY 8px → 0, fade).
- Symbol discs show from the start.
- A theme circle scales in; satellites grow out from it along their line (the line draws in, then the circle pops).

**Phone (390):** the grid stays 2×2 with headings shortened to the codes S, C, X and Q plus a key under the grid. Pills show titles clamped to one line. Clusters stack in a single column, each in a box of fixed height, with satellites on a full ring.

**Tool tests:**
- The four quadrants and four symbol discs exist with no nodes.
- A `change:1` pill lands in `[data-quadrant="change"]`.
- Part two (`[data-part="two"]`) is absent until a theme exists.
- A `how` linked to a theme is a satellite of that cluster (`[data-for="<themeId>"]`).
- A theme tagged `question` is yellow, and its how satellites are blue.
- A fourth pill in a quadrant shows "+1 more".
- Undo of a theme removes its satellites and lines.

---

### Task 13: Scripted coach and the browser walk through Improve

**Files:**
- Modify: `netlify/functions/_shared/problem-solver/scripted-coach.mjs`, `apps/tasks/tests/browser/problem-solver.spec.mjs`
- Test: `tests/unit/problem-solver-scripted.test.js`

- [ ] **Step 1: Failing tests** (`tests/unit/problem-solver-scripted.test.js`):
  - **Waiting:** after the boundary turn that leaves Implement with a review in place, the next scripted turn (with a learning answer) records the learning, gives no suggestion, and says "Improve picks up at your review on <due>."
  - **Review opening:** in a reviewing Improve with no tool open, the scripted turn suggests `after_action_review`. Once it is started, the first message begins "Let's look at how it went." and, with a snapshot, adds "<done> of <total> tasks are done."
  - **After action review:** answers place in order. A `learned` answer with fewer words than the longest earlier answer is challenged with a message asking for more. A longer one is accepted.
  - **Double loop:** the `recurs` answer is tagged `yes` when it starts with "yes" or contains "again", "came back" or "recur", and `no` otherwise.
  - **Reopen hint:** in a double-loop run with a governing node, the answer `reopen: define` gives a clarify turn with `suggestion: { kind: 'reopen_step', step: 'define', reason: <a fixed sentence> }`.
  - **Next tool hint:** `next: double_loop` in an Improve step gives `suggestion: { kind: 'next_tool', tool: 'double_loop' }` when the tool is in the step.
  - **Feedback themes:**
    - A theme answer is tagged `do_more` when it contains "more" or "keep", `question` when it contains "?" or "unclear", and `change` otherwise.
    - Why and how link `of` the latest theme.

- [ ] **Step 2: Implement** in the scripted coach (deterministic, local dev and tests only). Follow the existing patterns: slot hints, `linksFor` and the six-word challenge threshold on text after any prefix.

- [ ] **Step 3: Browser walk.** Extend the spec where Plan 5's walk ends (the review task chip opens the problem):

  1. **Waiting:** the problem page shows `.ps-review-panel` with "Improve picks up at your review on", and the record's Improve box has `data-state="current"`.
  2. **Start from the link:**
     - Go to `#/problem-solver?id=<id>&step=improve`. Expect `.ps-resume` with "Your review is due."
     - Patch one of the walk's tasks to `done` through the mock API, then click "Start the review".
     - Expect the suggestion "Next: After action review". Start it.
     - Expect the coach's first message to contain "1 of 1 tasks are done" (or the walk's actual counts).
  3. **After action review:**
     - Answer the first three questions with sentences of at least eight words.
     - Answer `learned` with a short sentence of six or seven words (enough to clear the six-word threshold, shorter than the longest earlier answer). Expect a challenge.
     - Answer with a sentence longer than every earlier answer. Expect `.ps-aar [data-bar][data-filled="true"]` ×4 and `[data-share]`.
  4. **Double loop and reopen:**
     - Answer `next: double_loop`, then start it.
     - Answer: the problem; the single loop; `yes, it came back again in week four`; a governing assumption.
     - Expect `.ps-dloop [data-loop="outer"][data-drawn="true"]`.
     - Answer `reopen: define`. Expect the card "Reopen: Define". Click "Reopen it".
     - Expect the track's Define dot to be current, and the record's Improve box `data-state="waiting"`.
     - Click "Move on to Improve" and answer the learning question. Expect Improve current again, with the double-loop run in its filmstrip.
  5. **Late review:**
     - Move on to Document, then Finish.
     - Open `&step=improve` again. Expect "This problem has moved on" and click "Review the results".
     - Expect Improve current and `status` active.
     - Click Finish. Expect the problem finished again.
  6. **Width:** repeat at 390px. Expect no horizontal overflow at each stage, and take screenshots when `PS_SHOT_DIR` is set.

  Run it with the throwaway config at `$PS_SCRATCH/ps-playwright.config.mjs` (a copy of `apps/tasks/playwright.config.ts` pointing at the spec). Do not commit it.

- [ ] **Step 4: Commit**: `Problem Solver: scripted coach and walk cover Improve` (with trailer).

---

### Task 14: Gate

- [ ] Run all root Problem Solver tests, all Tasks Problem Solver tests, the type gate, `npm run pre-pr-check` (exit 0) and the browser walk at both widths.
- [ ] Render the three new samples at 900 and 390 with `--audit`, and look at them beside the Plan 5 charts as a set: consistent type sizes, palette, ring and motion feel. Every audit prints clean.
- [ ] Check the public-repo rules over the diff:
  - `git diff claude/problem-solver-process --stat` has no `.ps-book` path.
  - Grep the diff for long runs of book wording (any sentence you did not write).
  - Grep for real names: there must be none in samples or fixtures.
- [ ] Commit any fixes: `Problem Solver: Improve polish`. Do not push; Plan 7 continues on this branch.

---

## Hooks the later plans need

- **Plan 7 (Document):**
  - **After a late review:** a late review returns to Document through `reviewState.returnTo`, so Document must cope with being re-entered with its earlier runs.
  - **The case file should include:**
    - the latest after action review's "learned";
    - any double-loop strategies;
    - the feedback matrix actions.
  - **Reuse:**
    - `task-cards.ts` for the case-file confirm card;
    - `confirmed()` for writes;
    - `problemSolverChips` on a project created for the case file.
- **Final pass (live evaluation):** the coach must challenge blame in Improve (spec, Testing). Include an invented Improve problem where the person blames a colleague.
- **Plan 8 (Lightning):** nothing here blocks it. An escalated session starts with `reviewState`, `taskSnapshot` and `detour` null.
- **Filmstrips (final pass):** an Improve step can now have runs from several passes (before and after a late review). Show the pass boundary in the step's filmstrip using `reviewState.startedAt`.

## Decisions (Adam, 20 October 2026)

1. **Improve right after Implement. Decided: wait for the review.**
   - Leaving Implement with a live review (created, or proposed and not set aside) opens Improve waiting.
   - The boundary learning question is the short process check. The coach then says Improve picks up at the review, and suggests no tool.
   - The page shows the waiting panel with Review now.
   - The review task's link, or Review now, starts the after action review on real results, with the tasks' live statuses as a snapshot.
   - Setting the review aside ends the wait, and Improve runs at once.
2. **After a reopened step. Decided: back to Improve.**
   - Moving on from a step reopened by double-loop learning returns straight to Improve.
   - The steps in between keep what they had, and the coach may suggest revisiting one in conversation if the change affects it.
3. **A review opened after Improve. Decided: reopen Improve.**
   - The review adds a new Improve pass on the real results. Earlier runs stay.
   - Moving on returns to where the session was: Document, or finished.

Choices this plan makes inside those answers (change them here if Adam disagrees):
- **Deleted tasks:** the coach never sees deleted tasks in the task snapshot, consistent with Plan 5, Decision 8.
- **Reopen targets:** only Define or Analyse can be reopened (the spec's loop), only from Improve, only after double-loop learning has named a governing assumption, never while waiting, and one at a time.
- **No tasks from Improve:** Improve tools propose no tasks. The coach turns double-loop strategies and feedback actions into a conversation about the next step; real tasks stay an Implement thing.
- **The pictures win:** the after action review's bars are equal (the book's picture); the 50% guidance shows as a gauge, not a bigger bar. The double-loop boxes follow the picture's yellow, red and blue, not the spec's "two blue loops" alone.

## Done when

- The three Improve tools each have:
  - a definition;
  - an emblem matching the book, with the checkpoint sent to Adam;
  - a renderer that matches its book chart, animates only on change, works at 390px, passes its tests and passes `--audit`.
- Leaving a finished Implement opens Improve waiting for the review, with no tool suggested and the waiting panel shown. The record and track show waiting steps as waiting.
- The review task's link and Review now start the review. The coach sees the task snapshot and opens with the after action review, seeded from SMART, DMAIC's Measure and the chosen option.
- A late review reopens Improve and returns to Document or finished.
- The after action review asks for a fuller "learned" when it is not the longest answer.
- Double-loop learning that names a governing assumption can reopen Define or Analyse. Move on comes back to Improve, and earlier runs stay.
- The scripted coach and the browser walk cover the wait, the review, the reopen and a late review, at both widths.
- All gates pass.
