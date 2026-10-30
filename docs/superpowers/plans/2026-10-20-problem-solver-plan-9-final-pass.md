# Problem Solver Plan 9: the final pass

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the full-process build so it can ship as one PR:
- close the skipped-step gap;
- mark review passes, case-file versions and a Lightning start on the record's filmstrips;
- give Lightning its Final-words moments;
- run the live evaluation of the real coach and fix what it finds;
- walk a whole seven-step session, plus Polya and TRIZ, in the browser;
- then gate, open the PR and turn on auto-merge.

**Architecture:** Small changes in the places that already own each concern:
- **The gap:** `applyCoachTurn` opens the next step's tool straight away when the step just left was untouched, because no learning question comes first.
- **The record:** Improve's review records `runsBefore`; the record renderer reads it, `caseFile.history` and `escalatedFrom`.
- **Live evaluation:** cases live in a pure module (`scripts/problem-solver-eval-cases.mjs`), unit-tested for how they build. The runner (`scripts/problem-solver-eval.mjs`) calls the real coach.
- **Walks:** the scripted coach takes a `model:` hint in framing, so the walks can choose Polya or TRIZ.

**Tech Stack:** as Plans 7 and 8.

**Spec:** `docs/superpowers/specs/2026-10-19-problem-solver-full-process-design.md`: Build order items 10 (Record and filmstrips), 12 (Final-words pass and the extended live evaluation) and 13 (Playwright walks, `pre-pr-check`, PR ready with auto-merge); Experience 9–10; Testing. It also covers the hooks at the end of Plans 6, 7 and 8.

**Worktree and branch:** `/Users/you/Projects/life-hub-ps-lightning`, branch `claude/problem-solver-document` (Plans 7 and 8 are on it). Never use `/Users/you/Projects/life-hub-ps-process`, which another session now uses, and never touch `/Users/you/Projects/life-hub`.

**Commands used throughout:**
- All root Problem Solver tests: `node --import ./scripts/test-network-guard.mjs --test tests/unit/problem-solver-*.test.js`
- All Tasks Problem Solver tests: `cd apps/tasks && npx vitest run tests/unit/problem-solver`
- Type gate: `cd apps/tasks && npx tsc --noEmit -p . 2>&1 | grep "error TS" | grep -v TS6059 | grep -i -E "problem-solver|page-editor"` must print nothing.
- Preview with audit: `PS_PREVIEW_CHROMIUM="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" node scripts/problem-solver-preview.mjs <name> "$PS_SCRATCH/preview" --audit`
- Browser walks: the throwaway config `$PS_SCRATCH/ps-playwright-ltn.config.mjs` (points at this worktree, system Chrome, port 5187, `reuseExistingServer: false`).
  - This worktree has no `@playwright/test` installed. Run it from `apps/tasks` with `/Users/you/Projects/life-hub-ps-process/apps/tasks/node_modules/.bin/playwright test -c <config>`.
  - For the run only, add a symlink at `apps/tasks/node_modules/@playwright/test` pointing to that worktree's package (the folder is git-ignored), and remove it afterwards. Do not commit the config.

---

## Execution notes (read first)

- **Rules from Plans 4–8. Copy this list into every subagent prompt:**
  - **Public repo:** no real names anywhere, and no copied book wording. Invented samples only.
  - **Git:** stage only your own files with explicit paths. Never use `git stash`, `git reset --hard` or force-push; sync branches by merging. Never touch `.claude/launch.json`.
  - **Page actions** go through the session sync (`confirmed()` then `settle()`).
  - **Shared rules** live in `packages/problem-solver/`.
  - **Renderer lessons:**
    - batch layout reads before writes;
    - a click on an aria-hidden key item must focus the real control;
    - named containers need a role;
    - removal tests use `[data-node~=...]`;
    - nothing animates on first paint, on a no-op update, on an undo, or under reduced motion;
    - text is at least 12px;
    - nothing overflows the page at 390px.
- **Commits:** each task ends in one commit with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Push only in Task 8.
- **Review weight:**
  - **Full review** (one opus reviewer, spec then quality): Task 3 (the record) and Task 7 (the walks).
  - **Single controller check:** everything else.
- **Dry run:** the code and tests in Tasks 1, 2 and 5 were run on 20 October before the plan was committed (380 root tests passed, plus 2 for the eval cases).

---

## File map

| File | Responsibility | Change |
| --- | --- | --- |
| `netlify/functions/_shared/problem-solver/session.mjs` | Opening tool after an untouched step; `reviewState.runsBefore` | Modify |
| `netlify/functions/_shared/problem-solver/prompts.mjs` | Boundary lines for an untouched step say to name the next tool | Modify |
| `netlify/functions/_shared/problem-solver/lightning-prompts.mjs` | Final-words lines | Modify |
| `packages/problem-solver/types.ts` | `PsReviewState.runsBefore` | Modify |
| `packages/problem-solver/render/record.ts`, `problem-solver.css` | Review divider, case-file chips, Lightning frame | Modify |
| `apps/tasks/src/views/problem-solver/canvas.ts` | Pass page links to the record | Modify |
| `scripts/problem-solver-eval-cases.mjs` | Eval cases, builders, judge | Create |
| `scripts/problem-solver-eval.mjs` | Runs the cases against the real coach | Modify |
| `netlify/functions/_shared/problem-solver/scripted-coach.mjs` | `model:` hint in framing | Modify |
| `apps/tasks/tests/browser/problem-solver.spec.mjs` | Seven-step walk; Polya and TRIZ checks | Modify |

---

### Task 1: The skipped-step gap

**Files:** `netlify/functions/_shared/problem-solver/session.mjs`, `prompts.mjs`; tests in `tests/unit/problem-solver-session.test.js`, `tests/unit/problem-solver-prompts.test.js`.

After an untouched step, there is no learning question, so nothing should hold back the next step's opening tool. Today it only appears once the person replies.

- [ ] **Step 1: Failing tests** (append to `problem-solver-session.test.js`; `at`, `idle`, `coach`, `deps` and `framed` exist):

```js
test('leaving a step untouched brings the next step\'s opening tool at once', () => {
  let s = moveOn(at('analyse'), deps);
  assert.equal(s.runner.mode, 'boundary');
  s = applyCoachTurn(s, coach({ verdict: 'clarify' }), deps);
  assert.equal(s.phase, 'devise');
  assert.equal(s.suggestion?.kind, 'next_tool', 'no reply needed first');
  assert.equal(s.pendingLearning, null);
});

test('leaving a step with work in it still asks the learning question before any tool', () => {
  let s = framed();
  s = idle(applyCoachTurn(s, coach({ node: { slot: 'problem', text: 'The rota changes too late for staff to plan.' } }), deps));
  s = applyCoachTurn(moveOn(s, deps), coach({ verdict: 'clarify' }), deps);
  assert.equal(s.suggestion, null);
  assert.equal(s.pendingLearning, 'define');
});
```

The existing test "a dismissed opening suggestion stays dismissed until the step changes" encodes the old gap at its end. Replace its last four lines (from `assert.notEqual(s.phase, 'general_problem');`) with:

```js
  assert.notEqual(s.phase, 'general_problem');
  assert.equal(s.suggestion?.kind, 'next_tool', 'a step left untouched opens the next step with its tool at once');
```

In `problem-solver-prompts.test.js`: the boundary prompt for an untouched skip no longer says "No tool suggestion yet". It says to name the step's first tool.

- [ ] **Step 2: Implement.** In `applyCoachTurn`, replace the `quiet` line:

```js
  // Leaving a step untouched asks no learning question, so the next step's opening tool comes at once.
  const untouched = mode === 'boundary' && skippedUntouched(next.steps?.[session.runner?.leaving]);
  const quiet = next.phase === 'finished' || (mode === 'boundary' && !untouched) || waitingForReview(next);
```

In `prompts.mjs`, in the two boundary branches for an untouched step (waiting and skipped), replace "No tool suggestion yet." with: "If the session goes on, end by naming the current step's first tool in one sentence; the page shows it as a suggestion." The coach parser still drops a suggestion in boundary mode, and the server's opening suggestion supplies it.

- [ ] **Step 3:** Run the root tests. Commit `Problem Solver: an untouched step opens the next tool at once`.

---

### Task 2: Mark where a review pass begins

**Files:** `session.mjs`, `packages/problem-solver/types.ts`; tests in `problem-solver-session.test.js`.

- [ ] **Step 1: Failing test:**

```js
test('a review records how many Improve runs came before it', () => {
  let s = idle(moveOn(implementDone(), deps));
  s = idle(moveOn(s, deps));
  s = idle(startReview(s, {}, deps));
  assert.equal(s.reviewState.runsBefore, 0);
  const t = startReview(idle(moveOn(implementDone(), deps)), {}, deps);
  assert.equal(t.reviewState.runsBefore, 0);
});
```

Add one more case where Improve already has a finished run before a late review: dismiss the review, run an after action review to completion, move on, create the review task, then start the review. Expect `runsBefore` to be 1.

- [ ] **Step 2: Implement:**
  - In `moveOn`'s review branch: `{ status: 'reviewing', due, returnTo: null, startedAt: deps.now(), runsBefore: next.steps[nextId]?.runs.length ?? 0 }`.
  - In `startReview`'s late branch: `{ status: 'reviewing', due, returnTo, startedAt: deps.now(), runsBefore: session.steps?.[improve]?.runs.length ?? 0 }`.
  - In `types.ts`: `PsReviewState` gains `runsBefore?: number` (older sessions lack it, and then no divider shows).
- [ ] **Step 3:** Run the root tests and the type gate. Commit `Problem Solver: a review remembers where its pass begins`.

---

### Task 3: Filmstrip additions on the record (FULL REVIEW)

**Files:** `packages/problem-solver/render/record.ts`, `packages/problem-solver/problem-solver.css`, `apps/tasks/src/views/problem-solver/canvas.ts`; tests in `apps/tasks/tests/unit/problem-solver-record-render.test.ts`.

Read `record.ts` and its test first. The filmstrip (`paintFilm`) already draws a strip of run cards per step. Add these three, each only when its data exists.

1. **Review pass marker:**
   - The condition: Improve's plan step (`planStepForBook(model, 'improve')`) has more runs than `reviewState.runsBefore`, and `runsBefore > 0`.
   - The marker: a divider inside that step's film, before the first run of the review pass. It is `li.ps-record__pass[role="separator"]`, reading "Review on <date>", with the date from `reviewState.startedAt` formatted like the review panel (`en-AU`, weekday, day, month).
   - If several reviews have happened, only the latest is marked (that is all `reviewState` keeps).
2. **Case file versions:**
   - When `session.caseFile` exists, the Document step's strip ends with one chip per `caseFile.history` entry, reading "Case file v<N>".
   - Each chip is a link (`a.ps-record__casefile`) to the page it was written on, from a new optional record option `pageHref(target): string`. Canvas passes `taskPageHash(id)` for tasks; for projects, use the existing project page hash helper (find it next to `taskPageHash` in `apps/tasks/src/domain/cards.ts`, or where the projects view builds its links).
   - Without `pageHref`, the chips are plain text.
3. **Lightning first frame:**
   - When `session.escalatedFrom` is set, the films begin with a strip headed "Lightning". It holds one card with the lightning glyph (`lightningGlyph` from `glyphs.ts`), the name "Quick route", and a note "Where this began".
   - The card is a link to `#/problem-solver?id=<escalatedFrom>`.
   - Ink and paper only.

Keep the record's signature-based repaint. Add `reviewState.runsBefore`, `reviewState.startedAt`, the case-file history versions and `escalatedFrom` to the signature, so these repaint when they change and not otherwise.

- [ ] **Tests:**
  - the divider appears only in the right place;
  - chips per version, linked when `pageHref` is given;
  - the Lightning strip comes first and links to the run;
  - nothing changes for a session without these;
  - a no-op update does not repaint.
- [ ] **Look at it** in the browser preview (the Tasks dev server with the mock API), on a session that has a late review, a written and updated case file, and an escalation. The Plan 7 and Plan 8 walks create both. Desktop and 390px, no overflow.
- [ ] Commit `Problem Solver: the record marks review passes, case-file versions and a Lightning start`.

---

### Task 4: Final words in Lightning, and a check of the full coach

**Files:** `netlify/functions/_shared/problem-solver/lightning-prompts.mjs`, `prompts.mjs` (only if the check finds a gap); tests in `tests/unit/problem-solver-lightning-coach.test.js`, `problem-solver-prompts.test.js`.

The full coach already carries the Final-words layer (`knowledge/final-words.mjs`) and asks the learning question at each boundary. Lightning has none of it.

- [ ] **Add to `LIGHTNING_RUBRIC`** a short FINAL WORDS section in our words:
  - At "What can I learn?", frame the answer as building the skill of solving problems, not only fixing this snag.
  - If the person sounds discouraged or stuck, one short line that being stuck is normal and the skill grows with practice, then carry on.
  - Name curiosity, an open mind or persistence when they show it, in a clause.
- [ ] **Check the full rubric:** the step layer for Document and Improve includes the Final-words layer. Every boundary prompt with work in the step asks "what they learned about how they solve problems". Fix only real gaps.
- [ ] **Tests:** the Lightning rubric contains "FINAL WORDS" and "practice". The boundary prompt test for a worked step still contains "how they solve problems".
- [ ] Commit `Problem Solver: Final words in Lightning`.

---

### Task 5: The live evaluation harness

**Files:**
- Create `scripts/problem-solver-eval-cases.mjs` and `tests/unit/problem-solver-eval-cases.test.js`.
- Rewrite `scripts/problem-solver-eval.mjs`.

- [ ] **Step 1: Failing test:**

```js
// tests/unit/problem-solver-eval-cases.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { CASES, judge, prepare } from '../../scripts/problem-solver-eval-cases.mjs';
import { activeRun } from '../../netlify/functions/_shared/problem-solver/session.mjs';
import { currentEntry } from '../../packages/problem-solver/lightning.mjs';
import { nextSlots } from '../../packages/problem-solver/machine.mjs';

test('every case builds a session at its step with its tool open and the answer last', () => {
  for (const c of CASES) {
    const s = prepare(c);
    assert.equal(s.turns.at(-1).text, c.answer, c.name);
    if (c.lightning) assert.ok(currentEntry(s.lightning), c.name);
    else assert.ok(nextSlots(activeRun(s)).length > 0, `${c.name}: an open slot`);
  }
  const doc = prepare(CASES.find((c) => c.name.startsWith('Document')));
  assert.deepEqual(nextSlots(activeRun(doc)), ['correspond']);
  const escalate = prepare(CASES.find((c) => c.name.includes('full process')));
  assert.equal(currentEntry(escalate.lightning).node, 'take_break');
});

test('judge: word limits, verdicts, suggestions and the Lightning step', () => {
  const blame = CASES.find((c) => c.name.includes('blaming'));
  const long = 'word '.repeat(20).trim();
  assert.equal(judge(blame, { verdict: 'challenge', message: long }), null);
  assert.match(judge(blame, { verdict: 'accept', message: long }), /verdict accept/);
  assert.match(judge(blame, { verdict: 'challenge', message: 'too short' }), /words/);
  const quick = CASES.find((c) => c.name.includes('stays quick'));
  assert.equal(judge(quick, { verdict: 'clarify', message: long, lightning: { node: 'start', answer: 'yes' } }), null);
  assert.match(judge(quick, { verdict: 'clarify', message: long, lightning: { node: 'start', answer: 'yes' }, suggestion: { kind: 'escalate' } }), /should not suggest/);
});
```

- [ ] **Step 2: Implement the cases module:**

```js
// scripts/problem-solver-eval-cases.mjs
// The live evaluation's cases: an invented problem placed at a step with a tool open, one
// answer, and what a good coach does with it. Pure session building (no model), so the
// cases are unit-tested; scripts/problem-solver-eval.mjs runs them against the real coach.
import { acceptSuggestion, applyCoachTurn, createSession, moveOn, say } from '../netlify/functions/_shared/problem-solver/session.mjs';
import { applyLightningTurn, createLightningSession } from '../netlify/functions/_shared/problem-solver/lightning-session.mjs';

let n = 0;
export const deps = { now: () => '2026-10-20T09:00:00.000Z', newId: () => `eval-${(n += 1)}` };
const idle = (s) => ({ ...s, runner: { status: 'idle', mode: 'turn', error: null } });
const turn = (fields) => ({ verdict: 'accept', message: 'ok', node: null, edges: [], skillsSeen: [], skillsMissing: [], frame: null, model: null, suggestion: null, summary: null, exitObjection: null, learning: null, proposeTasks: [], proposeReview: null, lightning: null, ...fields });

const FRAME = { goal: 'The weekly rota is fixed a week ahead', whatIsTrue: 'It changed late in three of the last four weeks', whatCanBeDone: 'Change when and how the rota is published' };

/** A seven-step session in `phase`, with `tool` open and `nodes` ([slot, text]) placed. */
export function atTool(phase, tool, nodes = [], title = 'The weekly rota keeps changing late') {
  let s = createSession({ text: title }, deps);
  s = idle(applyCoachTurn(s, turn({ frame: FRAME, model: { id: 'seven_step', reason: 'A real problem.' }, suggestion: { kind: 'next_tool', tool: 'five_whys', reason: 'r' } }), deps));
  s = idle(acceptSuggestion(s, deps));
  while (s.phase !== phase) s = idle(moveOn(s, deps));
  if (s.phase !== 'define') s = idle(acceptSuggestion({ ...s, suggestion: { kind: 'next_tool', tool, reason: 'r' } }, deps));
  for (const [slot, text, extra] of nodes) s = idle(applyCoachTurn(s, turn({ node: { slot, text, ...(extra ?? {}) } }), deps));
  return s;
}

/** A Lightning run walked through `steps`. */
export function lightningAt(text, steps = []) {
  let s = idle(createLightningSession({ text }, deps));
  for (const step of steps) s = idle(applyLightningTurn(s, turn({ verdict: 'clarify', lightning: step }), deps));
  return s;
}

/** Each case: build(), the person's answer, and the checks a good reply passes. */
export const CASES = [
  {
    name: 'Devise: converging before generating',
    build: () => atTool('devise', 'lotus_blossom', [['problem', 'The rota is published too late for staff to plan their week']]),
    answer: 'Let us just go with the first idea, moving the deadline to Wednesday; it is obviously the right one.',
    expect: { verdict: 'challenge' }
  },
  {
    name: 'Decide: a criterion too vague to rate',
    build: () => atTool('decide', 'decision_matrix'),
    answer: 'The first criterion is that it should be good.',
    expect: { verdict: 'challenge' }
  },
  {
    name: 'Decide: a strong criterion',
    build: () => atTool('decide', 'decision_matrix'),
    answer: 'Hours of notice staff get before their shifts, more is better, counted from the date the rota is published.',
    expect: { verdict: 'accept' }
  },
  {
    name: 'Implement: status quo left unexamined',
    build: () => atTool('implement', 'kanban'),
    answer: 'Leave it as it is; we have always published the rota on Friday and changing it would upset people.',
    expect: { verdict: 'challenge' }
  },
  {
    name: 'Improve: blaming a person',
    build: () => atTool('improve', 'after_action_review', [['intended', 'Publish the rota a full week ahead every week'], ['achieved', 'Published on time in three weeks out of four']]),
    answer: 'It went wrong because the new manager is careless and never checks anything.',
    expect: { verdict: 'challenge' }
  },
  {
    name: 'Improve: a process-focused difference',
    build: () => atTool('improve', 'after_action_review', [['intended', 'Publish the rota a full week ahead every week'], ['achieved', 'Published on time in three weeks out of four']]),
    answer: 'In the fourth week the only person allowed to sign off was off sick, and nobody else had the authority to publish.',
    expect: { verdict: 'accept' }
  },
  {
    name: 'Document: a name only the person would understand',
    build: () => atTool('document', 'five_cs', [['contextualise', 'So next term starts without the same scramble'], ['categorise', 'On the rota project page, open to all managers'], ['condense:1', 'Publish the rota on Wednesday, signed off by either of two people'], ['correct', 'Nothing in the record needs correcting at this point']]),
    answer: 'KR stuff 20261020 v1 Final',
    expect: { verdict: 'challenge' }
  },
  {
    name: 'Final words: discouraged',
    build: () => atTool('define', 'five_whys', [['problem', 'The weekly rota changes late in most weeks']]),
    answer: 'Honestly I am useless at this. I will never sort it out.',
    expect: { verdictNot: 'accept', message: /skill|practi|persist|keep going|curio|learn|normal|stuck/i }
  },
  {
    name: 'Lightning: should offer the full process',
    build: () => lightningAt('The shared printer jams for the whole department', [
      { node: 'start', answer: 'no' }, { node: 'goal', note: 'Print without jams' }, { node: 'subtract', answer: 'no' }, { node: 'one_step', answer: 'no' },
      { node: 'diagram', answer: 'no', note: 'Sketched the paper path' }, { node: 'work_backwards', answer: 'no' }, { node: 'make_list', answer: 'no' }
    ]),
    answer: 'No, a break did not help either. It affects four teams and their managers keep arguing about who should fix it.',
    lightning: true,
    expect: { suggestion: 'escalate' }
  },
  {
    name: 'Lightning: stays quick',
    build: () => lightningAt('My desk chair squeaks a little when I lean back'),
    answer: 'Yes, honestly I can live with it; it only squeaks when I lean right back.',
    lightning: true,
    expect: { suggestionNot: 'escalate', lightning: { node: 'start', answer: 'yes' } }
  }
];

/** The session the coach sees: the case's session with the answer said. */
export function prepare(testCase) {
  return say(testCase.build(), testCase.answer, deps);
}

/** Why a coach reply fails the case's checks, or null. */
export function judge(testCase, reply) {
  const words = String(reply.message ?? '').trim().split(/\s+/).filter(Boolean).length;
  const [min, max] = testCase.lightning ? [10, 50] : [15, 60];
  const e = testCase.expect;
  if (words < min || words > max) return `message is ${words} words (want ${min}-${max})`;
  if (e.verdict && reply.verdict !== e.verdict) return `verdict ${reply.verdict}, want ${e.verdict}`;
  if (e.verdictNot && reply.verdict === e.verdictNot) return `verdict should not be ${e.verdictNot}`;
  if (e.message && !e.message.test(reply.message)) return 'message makes no Final-words move';
  if (e.suggestion && reply.suggestion?.kind !== e.suggestion) return `suggestion ${reply.suggestion?.kind ?? 'none'}, want ${e.suggestion}`;
  if (e.suggestionNot && reply.suggestion?.kind === e.suggestionNot) return `should not suggest ${e.suggestionNot}`;
  if (e.lightning && (reply.lightning?.node !== e.lightning.node || reply.lightning?.answer !== e.lightning.answer)) return `lightning step ${JSON.stringify(reply.lightning)}, want ${JSON.stringify(e.lightning)}`;
  return null;
}
```

- [ ] **Step 3: Rewrite the runner** (`scripts/problem-solver-eval.mjs`):
  - Usage: `ANTHROPIC_API_KEY=... node scripts/problem-solver-eval.mjs [name filter]`.
  - It builds the model coach with `createModelCoach(anthropicModel(process.env))`. Runs each case (or only those whose name contains the filter) through `coach(prepare(c))` in turn, and prints `PASS`/`FAIL <name>: <reason>` with the verdict, word count, suggestion and message.
  - Exit code 1 if any case fails.
  - Keep the four v1 Define cases from the old script as extra cases in the module (`Define: vague cause`, and so on), built with `atTool('define', 'five_whys', [['problem', ...]])`.
- [ ] **Step 4:** Run the new test and all root tests. Commit `Problem Solver: live evaluation across every step and Lightning`.

---

### Task 6: Run the live evaluation and fix what it finds (controller with Adam)

This task makes paid API calls with Adam's key. The key is not stored locally (it lives in Netlify), so:

- [ ] The controller asks Adam to run, in a terminal tab in this worktree:
  - `ANTHROPIC_API_KEY=<key> node scripts/problem-solver-eval.mjs`
  - or `node --env-file=<a local file holding the key> scripts/problem-solver-eval.mjs`.

  The controller never types or handles the key itself. It reads the output with the terminal tool.
- [ ] For each failure, decide whether the coach or the case is wrong.
  - A case is wrong when the expectation is unfair, for example a strong answer the coach rightly probes. Then adjust the case.
  - The coach is wrong when, for example, it accepts blame or a vague criterion. Then make the smallest prompt change in our own words (in the step triggers, the selection guide or the rubric), with a unit test on the prompt text.
- [ ] Ask Adam to rerun only the failing cases (`node scripts/problem-solver-eval.mjs "<name part>"`) once. Record the final pass list for the PR description.
- [ ] Commit any prompt fixes: `Problem Solver: coach fixes from the live evaluation`.

---

### Task 7: The full walks (FULL REVIEW)

**Files:** `netlify/functions/_shared/problem-solver/scripted-coach.mjs`, `apps/tasks/tests/browser/problem-solver.spec.mjs`; tests in `tests/unit/problem-solver-scripted.test.js`.

- [ ] **Model hint.** In framing, a third answer containing `model: polya` or `model: triz` makes the scripted coach choose that model. It suggests that model's first tool: `five_whys` for both, because Polya's and TRIZ's first steps use Define tools. Unit test both.
- [ ] **Seven-step walk** (new test, desktop 900 and 390):
  - Frame a problem.
  - Use one tool in each step, answering with the scripted coach's hints (`option:`, `next:`, the column hints for Kanban). Use the step's default tool unless a hint is cheaper.
  - Skip one step untouched, and check its next step's suggestion appears **without a reply**. This is Task 1's fix.
  - Confirm one Kanban task and see it on the chart with its live status.
  - Check the record lights each step (done, current, skipped faint) and that a filmstrip card opens its chart (the morph).
  - Finish at Document after writing the case file.
  - Check for no overflow at each stage, and take screenshots when `PS_SHOT_DIR` is set.
- [ ] **Polya and TRIZ walks** (short; desktop and 390):
  - Frame with `model: polya`. Check the track shows Identify, Devise, Implement, Evaluate and Document (an extra).
  - Move on through every step to Finish, and check the record marks the skipped steps and the extra.
  - The same with `model: triz`. Its Contradiction step (General problem) offers the contradiction tool.
- [ ] Run the whole spec file at both widths. If a walk exposes a product bug, fix it in its own commit with a unit test.
- [ ] Commit `Problem Solver: seven-step, Polya and TRIZ walks`.

---

### Task 8: Gate, PR and auto-merge (controller)

- [ ] `git fetch origin` and `git merge origin/main` (no rebase). Regenerate generated files if the gate asks (for example `node scripts/generate-alchemy-schema.mjs`). Rerun all Problem Solver tests and the type gate.
- [ ] `npm run pre-pr-check` must exit 0. Two tests flake under load (`grove-annual-roaming`, `food-journal-photos`): rerun before blaming the change.
- [ ] Public-repo checks over `git diff origin/main`:
  - no `.ps-book` path;
  - no real names;
  - no copied book wording.
- [ ] Push `claude/problem-solver-document` with `git push -u origin claude/problem-solver-document`.
- [ ] Open the PR **ready** (not draft), "Problem Solver: Document, Lightning and the final pass". The body covers:
  - Plans 7, 8 and 9 in one PR, with links to the three plan files;
  - what each adds;
  - Adam's decisions;
  - the live evaluation result;
  - the walks run;
  - the follow-ups left (the polya/triz "finish early" gap noted in earlier plans).
  - End with the Claude Code line.
- [ ] Turn on auto-merge (merge commit). Bind the PR with the ccd_pr tools, read its CI, and offer Auto-fix.
- [ ] Update the live tracker (all tasks done, PR link).

---

## Decisions (Adam, 20 October 2026)

1. **Live evaluation: run it now and fix.** Extend the eval script and run it against the real coach with Adam's key (about 20 to 30 calls). Fix any prompt problems found, rerun the failures once, and put the results in the PR.
2. **Filmstrips: three additions.**
   - a review pass marker in Improve;
   - case-file version chips in Document;
   - a Lightning first frame on an escalated session.

   Step learnings are not added to the strips.
3. **Walks: one seven-step walk plus quick Polya and TRIZ checks**, at both widths. The Plan 6, 7 and 8 walks stay.

## Done when

- Leaving a step untouched opens the next step's tool at once.
- The record marks a review's pass, the case file's versions and a Lightning start.
- Lightning has its Final-words moments.
- The live evaluation passes, or each remaining failure is explained, and the results are in the PR.
- The seven-step, Polya and TRIZ walks pass at both widths, with every earlier walk.
- `pre-pr-check` exits 0, the PR is open and ready with auto-merge on, and Auto-fix is offered.
