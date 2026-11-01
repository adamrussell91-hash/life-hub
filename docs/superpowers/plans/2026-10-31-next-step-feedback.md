# Next Step Feedback Implementation Plan

> **For agentic workers:** Execute in the three chunks below, one subagent per chunk (A, then B and C in parallel), then Task 10 in the main session. Steps use checkbox (`- [ ]`) syntax. Read the spec and both mockups before starting.

**Goal:** Each skill-tagged writing question in a Teaching lesson shows the student one positive next step, picked from the question's bank by the student's repeating code on that skill and their rung. The student taps the sentence where they took it, and the teacher sees that pick when marking.

**Architecture:**
- Codes gain `skill` and a five-line `ladder` in the library blob. A pure module (`next-steps.mjs`) holds the shared rules: rung index, wording check, bank source hash, the per-skill step choice.
- Writing questions (`question_set` items and quiz written kinds) carry `skills[]` and a `next_steps` bank. Banks are filled by a fast-lane Teaching AI job on the teacher's press. Students never call a model.
- A new `steps` action on the claim-gated student profile endpoint returns `{ skill → { rung, code } }`. The client picks the bank line.
- The student's pick saves as work part `step.{index}` (question sets) or `step` in the quiz save, and freezes with the hand-in.

**Tech Stack:**
- Netlify Functions (ESM `.mjs`) and Netlify Blobs.
- Zod in `apps/teaching/src/schemas/block.ts`, bundled to the server by `node scripts/generate-alchemy-schema.mjs`.
- Vanilla TS DOM with `el()` / `button()` from `@/quiz/dom`.
- Tests: `node --test tests/unit/<file>.test.js` (server), `npx vitest run <file>` in `apps/teaching` (client).

**Spec:** `docs/superpowers/specs/2026-10-31-next-step-feedback-design.md`
**Mockups:** `docs/mockups/next-step/next-step.html`, `docs/mockups/next-step/next-step-bank.html`
**Worktree:** `../life-hub-next-step` on branch `claude/next-step`. Other sessions work in `life-hub-quiz-initials`: never switch branches there. If `node_modules` is missing, symlink it from `../life-hub-quiz-initials/node_modules` (see the student-progress build).

**Settled with the teacher (31 Oct):**
1. Repeating code but no rung on that skill → the **Capable** line.
2. **Done** appears on **every** writing box (question-set questions and quiz written answers), so the loop feels the same everywhere. On a box with no step, Done just turns the answer into its read view with a small *Saved* tick; there is no Show me where.

**House rules for every task:**
- Public repo. Invented students only (Ava Nguyen, Noah Patel, Ella Chen, Jack Lee, Mia Torres) and invented questions and ladder text. Department wording lives in Blobs only.
- Student-facing and ladder/bank strings are positive and additive. `checkWording` (Task 1) is the rule.
- One PR at the end. Commit after each task. Run only the tests named in a task. `npm run pre-pr-check` once, in Task 10.

---

## File map

| File | Status | Responsibility |
|---|---|---|
| `netlify/functions/_shared/next-steps.mjs` | new | `RUNG_ORDER`, `rungIndex`, `checkWording`, `bankSource`, `stepsBySkill` |
| `netlify/functions/_shared/feedback-codes.mjs` | modify | `skill`, `ladder` on a code; seed placeholder ladders |
| `netlify/functions/_shared/progress-patterns.mjs` | modify | Export `ranked` |
| `apps/teaching/src/schemas/block.ts` | modify | `skills`, `next_steps` on `QuestionItemSchema` |
| `apps/teaching/src/quiz/core.ts` | modify | `next_steps` on written kinds |
| `netlify/functions/_shared/alchemy-schema.mjs` (generated) | regenerate | — |
| `netlify/functions/_shared/profile.mjs` | modify | `steps` action |
| `netlify/functions/_shared/profile-feedback.mjs` | modify | `stepsFor(store, classId, studentId)` |
| `netlify/functions/_shared/lesson-work.mjs` | modify | `PART` accepts `step.N`; hand-in copies step parts |
| `netlify/functions/_shared/quiz.mjs` | modify | `step` in save / submit payload |
| `apps/teaching/src/student/work-sync.ts` | modify | Client `PART` regex matches the server |
| `apps/teaching/src/ai/next-step-jobs.ts` | new | Job prompts and output checks for bank fill and ladder draft |
| `apps/teaching/src/blocks/feedback-codes-editor.ts` | modify | Skill select, ladder rows, wording flags, Draft ladders |
| `apps/teaching/src/skills/chip-picker.ts` | new | Multi-select continuum chips |
| `apps/teaching/src/blocks/next-step-bank.ts` | new | Builder bank panel |
| `apps/teaching/src/quiz/builder.ts` | modify | Chip picker in place of `skillSelect`; bank panel |
| question-set editor (in `apps/teaching/src/blocks/editors.ts`) | modify | Chip picker and bank panel per question |
| `apps/teaching/src/student/next-step.ts` | new | Student line, Done, Show me where, tick |
| `apps/teaching/src/blocks/render.ts` | modify | Mount the student line on question-set answers |
| quiz student render (written kinds) | modify | Mount the student line |
| `apps/teaching/src/marking/mark-piece.ts` | modify | Student pick layer and "Their next step" header |
| `apps/teaching/src/styles/next-step.css` | new | All new styles |
| `apps/teaching/scripts/mock-api.ts` | modify | Mock codes, ladders, banks, rungs and picks |

---

## Chunk A: server (Tasks 1–5)

### Task 1: Shared rules and code fields

**Files:** create `netlify/functions/_shared/next-steps.mjs`; modify `feedback-codes.mjs`, `progress-patterns.mjs`; test `tests/unit/next-steps.test.js`.

- [ ] Create `next-steps.mjs`:

```js
/**
 * Next steps in writing boxes: the shared rules. Pure.
 * A code's ladder has one line per placement rung, below → excellent.
 */
export const RUNG_ORDER = ['below', 'capable', 'skilled', 'accomplished', 'excellent'];
export const LADDER_MAX = 160;

/** Index into a ladder or bank. No rung yet means the Capable line. */
export function rungIndex(rung) {
  const i = RUNG_ORDER.indexOf(rung);
  return i === -1 ? 1 : i;
}

const BANNED = /\b(not|no longer|without|never|rather than|instead of|don'?t|doesn'?t|isn'?t|lacks?|weak|fails?)\b|^this is\b/i;

/** Problems with one line of student-facing wording; empty means it passes. */
export function checkWording(line, max = LADDER_MAX) {
  const out = [];
  const t = String(line ?? '').trim();
  if (!t) out.push('empty');
  if (t.length > max) out.push('too_long');
  const hit = t.match(BANNED);
  if (hit) out.push(`word:${hit[0].toLowerCase()}`);
  return out;
}

/** What a bank entry was built from, so the builder can tell when it is stale. */
export function bankSource(question, skills, ladder) {
  const s = JSON.stringify([String(question).trim(), [...skills].sort(), ladder]);
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

/**
 * For each skill, the student's top growth code linked to it and their rung.
 * `ranked` rows are already ordered most hits first, most recent first.
 */
export function stepsBySkill(rankedGrowth, codesById, rungs) {
  const skills = {};
  for (const [skill, rung] of Object.entries(rungs)) skills[skill] = { rung, code: null };
  for (const r of rankedGrowth) {
    const c = codesById.get(r.code_id);
    if (!c?.skill) continue;
    const s = (skills[c.skill] ??= { rung: null, code: null });
    if (!s.code) s.code = { id: c.id, code: c.code, colour: c.colour, hits: r.hit };
  }
  return skills;
}
```

- [ ] In `progress-patterns.mjs`, `export function ranked`.
- [ ] In `feedback-codes.mjs`: accept and clean optional `skill` (same regex as `SkillRefSchema`) and `ladder` (array of exactly 5 strings, each trimmed, ≤ `LADDER_MAX`; drop the field if malformed). Add short invented placeholder ladders and skills to the composition defaults, written to pass `checkWording`. Rewrite any default descriptor that fails `checkWording` (e.g. `comp_ac` "This is retelling the text…", `comp_ar` "…do not earn marks", `comp_as`/`comp_sd` "instead of") into positive wording.
- [ ] Tests: `rungIndex` (null → 1, each rung), `checkWording` (passes a positive line; flags `not`, `instead of`, "This is…", over-length), `bankSource` changes when any input changes and ignores skill order, `stepsBySkill` (code without skill ignored; first ranked code per skill wins; rung-only skills present with `code: null`), and that every default code passes `checkWording` on descriptor and ladder.
- [ ] Run `node --test tests/unit/next-steps.test.js tests/unit/feedback-codes.test.js` (the latter if it exists). Commit.

### Task 2: Schema fields on writing questions

**Files:** `apps/teaching/src/schemas/block.ts`, `apps/teaching/src/quiz/core.ts`; regenerate.

- [ ] Add a shared `NextStepBankSchema` in `block.ts`:

```ts
export const NextStepEntrySchema = z.object({
  lines: z.array(z.string().max(160)).length(5),
  edited: z.array(z.boolean()).length(5),
  source: z.string().max(32)
});
export const NextStepBankSchema = z.record(z.string().min(1).max(64), NextStepEntrySchema);
```

- [ ] `QuestionItemSchema`: add `skills: z.array(SkillRef).max(4).optional()` and `next_steps: NextStepBankSchema.optional()`. Reuse the `strand.sub` regex from `quiz/core.ts`.
- [ ] `quiz/core.ts` written kinds (`extended_response`, `explain_effect`): add `next_steps: NextStepBankSchema.optional()`. Keep `skills` as is.
- [ ] Check the publish path keeps both fields (search publish-strip filters: the hinge build found two). They are not student data, so they publish.
- [ ] `node scripts/generate-alchemy-schema.mjs`. Run the existing block-schema and quiz-core tests. Commit.

### Task 3: `steps` action

**Files:** `profile-feedback.mjs`, `profile.mjs`; test `tests/unit/profile-steps.test.js`.

- [ ] `stepsFor(store, classId, studentId)` in `profile-feedback.mjs`:
  - `pieces = studentPieces(...)`, library from `readFeedbackCodes`.
  - `rungs`: for every `skill:` key in `targetKeys(pieces)`, `targetRow(pieces, key).now`, keyed by the bare `strand.sub`.
  - `stepsBySkill(ranked(pieces, library, false), byId(library), rungs)`.
  - Returns `{ need: null, skills }`.
- [ ] `profile.mjs`: `case 'steps'`, after the same claim check as `progress`. No claim → `{ need: 'initials' }`. Requires a safe `lesson_id` only for logging, not filtering (all skills are returned; the lesson is small).
- [ ] Tests with an in-memory store: no claim; claim and no pieces → `{ skills: {} }`; two skills, one with a linked repeating code and a rung, one with a rung only.
- [ ] Run the new test. Commit.

### Task 4: Saving the pick

**Files:** `lesson-work.mjs`, `quiz.mjs`, `apps/teaching/src/student/work-sync.ts`.

- [ ] `PART = /^(answers|step\.\d{1,3}|(format|lens|kaplan)\..+)$/` on the server; the client regex at `work-sync.ts:32` matches exactly. A step part's value is `{ code_id, line, start, end, skipped? }` (`line` is the step text the student saw, ≤ 160 chars, so marking never depends on a bank regenerated since), stored as a JSON string field `pick` so the existing `{[field]: text}` shape holds; validate on save (`start < end`, both ≤ answer length, or `skipped: true`).
- [ ] Hand-in: copy `step.*` parts into the frozen hand-in record with the answers.
- [ ] `quiz.mjs` `save` / `submit`: accept optional `step` with the same shape, stored with the written answer.
- [ ] Extend the existing lesson-work and quiz save tests with one accept and one reject case each. Run them. Commit.

### Task 5: AI jobs for banks and ladders

**Files:** create `apps/teaching/src/ai/next-step-jobs.ts`; wire into the job runner's action list; regenerate `teaching-ai-runtime.mjs` (`node scripts/generate-teaching-ai-runtime.mjs`).

- [ ] Job `next_steps_fill` (fast lane, add to `MECHANICAL_ACTIONS`). Input: `{ lesson_id, items: [{ block_id, index, question, skills }] }`. For each item, read the codes linked to its skills, the continuum `i_can` / `next_move` for each skill's rungs, and each code's ladder. The model returns, per code, five lines rewritten for the question. Validate each with `checkWording`; regenerate failing lines once; still failing → keep the ladder line and mark it for the teacher. Write `next_steps[code_id] = { lines, edited: [false×5], source: bankSource(...) }`, keeping any `edited: true` lines from the existing bank. Saves to the **draft** lesson only.
- [ ] Job `ladders_draft` (standard lane). Reads the library and continuum, returns a ladder and positive descriptor rewrite for every code that has a skill. Writes nothing: the result goes back to the editor for review.
- [ ] Both log through `appendUsageLog` like other jobs. Expose an estimate (input tokens counted from the assembled prompt × model price via `estimateCostUsd`) on a dry-run call, so the UI can show A$ before running. Use the existing USD→AUD constant if there is one; otherwise add one beside `estimateCostUsd`.
- [ ] Unit test the pure parts: prompt assembly includes question, skills and ladders; output validation keeps edited lines and falls back on failure. Run it. Commit.

---

## Chunk B: teacher UI (Tasks 6–8)

### Task 6: Codes editor

**Files:** `apps/teaching/src/blocks/feedback-codes-editor.ts`, `next-step.css`.

- [ ] Per code: a **Skill** `skillSelect` (with an empty option) and, when a skill is set, five **ladder** rows labelled with the placement rung names (Building to Capable … Excellent; reuse `placeName` from `progress/story-text.ts`).
- [ ] Inline wording flags from a client copy of `checkWording` (put it in `apps/teaching/src/progress/wording.ts` and test it with the same cases). Flags show under the field and on the descriptor and strength descriptor. Saving is allowed, flags are advisory.
- [ ] **Draft ladders** button: shows the A$ estimate, runs `ladders_draft` on confirm, then fills each code's ladder and a suggested descriptor into the form for review (nothing saved until the teacher saves).
- [ ] Vitest for `wording.ts`. Commit.

### Task 7: Builder skill chips and bank panel

**Files:** create `apps/teaching/src/skills/chip-picker.ts`, `apps/teaching/src/blocks/next-step-bank.ts`; modify the question-set editor in `editors.ts`, `quiz/builder.ts`.

- [ ] `chipPicker(selected, skills, onChange, max = 4)`: continuum sub-strands grouped by strand, chips styled like `.dots-plan__chip` (copy the CSS into `next-step.css`), `aria-pressed`, 44px targets, "+ Skill" opens the strand groups.
- [ ] Question-set editor: under each question, **Skills this box practises** chip picker. Quiz builder: replace the single `skillSelect` at `quiz/builder.ts:1108` with the chip picker for every kind (the field is already an array).
- [ ] `nextStepBank(item, codes, onChange)`: renders only when the item has skills. Collapsed head `Next steps for this box · N codes · 5N lines`. Open: one tab per linked code (chip + label), five rung rows, each `contenteditable` plain text that sets `edited[i] = true` on change and runs the wording check. Footer: **Regenerate {code}** and, when `source` differs from `bankSource(now)`, a *Ladder changed* note. Empty bank → **Make next steps** with the A$ estimate.
- [ ] Lesson toolbar: **Make next steps for all boxes** sends every tagged item with an empty or stale bank in one `next_steps_fill` job; the builder reloads the draft when the job finishes (same pattern as Ann's jobs).
- [ ] Vitest: bank panel hidden without skills; edit flags `edited`; stale note when the question text changes. Commit.

### Task 8: Marking page shows the pick

**Files:** `apps/teaching/src/marking/mark-piece.ts`, the quiz written-answer marking view, `next-step.css`.

- [ ] When the frozen hand-in (or quiz answer) has a non-skipped step pick: header block **Their next step · {code}** with the pick's stored `line`.
- [ ] Draw the pick as its own `Mark` layer with a dashed outline in the code colour (`var(--pastel-{colour}-ink)`), under the teacher's highlights, and the caption *"{Initials}'s own {code} pick."* It is not tappable and never saved as a teacher tag.
- [ ] Vitest: pick layer renders; skipped pick renders nothing. Commit.

---

## Chunk C: student UI (Task 9)

### Task 9: The line, Done, Show me where, tick

**Files:** create `apps/teaching/src/student/next-step.ts`; modify `blocks/render.ts` (question-set answers, around `render.ts:852`), the quiz written-kind student render, `student/lesson-view.ts`, `next-step.css`.

- [ ] `lesson-view.ts`: once per lesson load, when the class claim exists, call `apiPost('/api/published/profile/{class}', { action: 'steps', lesson_id, class_token })`, cache the `skills` map, and pass a `stepFor(item)` function into block rendering.
- [ ] `stepFor(item)`: from `item.skills`, collect `{skill, rung, code}` where `code` exists and `item.next_steps?.[code.id]` exists; pick most `hits`, then first; return `{ code, colour, line: bank.lines[rungIndex(rung)] }` or null. Fix the result per box for the page session.
- [ ] `mountNextStep(host, step, answer, save)`:
  1. Line above the box: code chip (`pg-code pg-code--{colour}`), **Next step:** and the line. Fades to 0.7 once the box has text.
  2. **Done** under every writing box. With no step, Done shows the read view and a small *Saved* tick; tapping the read view reopens editing. With a step, on press: read view of the answer split into sentences (`/(?<=[.!?])\s+/`, keep offsets), prompt "Where did you {step as a question}?". For the prompt, use the fixed text **"Where did you take this step? Tap that sentence."** (no generated question in this build).
  3. Tap selects one sentence (code highlight + small code tag). **Save** writes `{ code_id, start, end, line }`; **Not this time** writes `{ code_id, skipped: true, line }`. Tapping the read view reopens editing.
  4. After save: a tick line in the code colour, *"Step taken."*; the pick stays highlighted in the read view.
- [ ] Question sets save via work sync part `step.{index}` (`pick` field). Quiz written answers send `step` with the next `save`.
- [ ] Untagged boxes, no step, or no claim: no line, but Done still shows (point 2).
- [ ] 390px: line wraps at full width; sentence targets ≥ 44px tall.
- [ ] Vitest for `stepFor` (tie rule, no rung → Capable, missing bank → null) and sentence splitting with offsets. Commit.

---

## Task 10: Mock data, browser walk, gate, PR (main session)

- [ ] `apps/teaching/scripts/mock-api.ts`: in the seed class, give two codes a skill and an invented ladder; a lesson with a question set (one tagged question, one untagged) and a quiz written question, both with banks; `steps` replies for two invented students on different rungs with the same repeating code; one handed-in piece with a pick.
- [ ] Walk in the dev mock at desktop and 390px: codes editor ladder + flags; tag a box, open its bank, edit a line, see *edited*; change the question text and see *Ladder changed*; view as both students and see different lines; Done → tap → Save → tick; Not this time; untagged box shows no line but Done gives the read view and *Saved*; marking page shows the dashed pick and header. Restart the preview after server edits (the mock caches handler modules).
- [ ] Do **not** run `next_steps_fill` or `ladders_draft` against the live API. Those need the teacher's go with the A$ estimate.
- [ ] `npm run pre-pr-check` (exit 0). Push, open one ready PR, enable auto-merge (merge commit).

---

## Self-review notes

- Spec coverage: decisions table → Tasks 1, 3, 7, 9; code library → 1, 5, 6; builder → 7; marking → 8; data → 2, 4; serving → 3, 9; generation and cost → 5, 6, 7, 10; scope Out items are untouched; testing → each task + 10.
- Deliberate narrowing from the spec: the Show me where prompt is fixed text ("Where did you take this step?") and the tick says "Step taken.", where the mockup used step-specific wording. Step-specific prompts would need a sixth generated line per rung; add later if wanted.
- The pick stores the line text it was shown, so marking never depends on a bank that may have been regenerated since.
