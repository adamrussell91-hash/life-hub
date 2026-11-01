# AI marking of short answers

Status: brief for a new branch. Write the spec from this, then build. Nothing here is decided beyond what Adam has said.

## Why

The deep understandings design (`docs/superpowers/specs/2026-11-01-deep-understandings-design.md`, branch `claude/deep-understandings`) tracks every knowledge piece from quiz evidence. Multiple choice only shows a student can recognise a fact. Cued recall needs a typed short answer, and the current marker can't judge one: a student who writes "the barbed wire fencing off Country" when the accepted answer is "devil's rope as fencing" gets marked wrong or waits for a person.

Adam's words: auto-marking recall "is a nightmare" unless AI marks it, and it should "flag the ones it's not confident on". He won't mark 28 × 5 one-line answers by hand after every retrieval quiz.

## What already exists

- `short_answer` in `apps/teaching/src/quiz/core.ts`: `accepted` (1–10 strings) and `case_sensitive`. The marker (`case 'text'`, around line 846) calls `matchText`:
  - `exact` → full marks
  - `near` → `{ score: null, pending: 'near_miss' }`, which waits for the teacher
  - anything else → zero
- A `null` share is an answer still waiting to be marked; evidence ignores it until it's marked (`apps/teaching/src/evidence/mastery.ts`).
- `extended_response` and `explain_effect` are `manual: true` kinds marked by the teacher.
- Teaching AI jobs: `apps/teaching/src/ai/job-runner.ts` (lanes `fast` = `claude-haiku-5-5`, `standard` = `claude-sonnet-5-5`, `PRICES`, `estimateCostUsd`, `usdToAud`). `apps/teaching/src/ai/next-step-jobs.ts` is the pattern to copy: a pure structured job with an injected `complete`, unit tested, bundled into the Teaching AI runtime.

## The idea

When a short answer is not an exact match, an AI job decides whether it means the same as the accepted answers.

- **Input per question:** the prompt, the accepted answers, an optional teacher "Looking for" note (the knowledge piece's text when the item is tagged `kp:`), and every student's non-exact answer to it.
- **Output per answer:** `right` / `wrong` / `unsure`, plus a short reason the teacher can read.
- `right` and `wrong` mark straight away. `unsure` goes to the teacher's existing marking queue as it does today.
- The teacher can overturn any AI mark; the overturn wins and is remembered. Option to discuss: an overturned "right" answer is added to `accepted`.
- Students see their mark as usual. The marker view shows it was AI marked, with the reason.

## Questions for the spec

1. **When it runs.** Straight after each submission (slower for students, more calls), or one batch per quiz when the teacher opens results or the live round ends? Lean: batch per quiz, one call per question.
2. **Which items.** Every short answer, or only ones the teacher turns on (a per-question "AI can mark this" switch)? Lean: on by default for `kp:`-tagged probes.
3. **Confidence.** Let the model answer `unsure` itself, or ask for a 0–1 confidence with a teacher-set cut-off? Lean: three-way answer; simpler and easier to test.
4. **Half marks.** Allowed, or only right/wrong for one-line recall?
5. **fill_gap.** Should near misses in fill-the-gap use the same job?
6. **Overturns feeding back.** Add to `accepted` automatically, ask the teacher, or never?
7. **Privacy.** Only answer text goes to the model: no student names or initials, just answer IDs.

## Cost (must be confirmed in the spec)

Confirm before building, as with all costly AI: a plan plus an A$ figure. Rough sum from the repo's own `PRICES` (Haiku 5.5: US$0.10 per million input tokens, US$0.50 per million output), using a guessed size, not a measured run:

- One class quiz: 28 students × 5 short answers = 140 answers.
- Input ≈ 5 calls × (~1,500 tokens of question and rules + 28 × ~30 tokens of answers) ≈ 12,000 tokens ≈ US$0.0012.
- Output ≈ 140 × ~40 tokens ≈ 5,600 tokens ≈ US$0.0028.
- About **US$0.004, roughly A$0.006 per class quiz**, on the fast lane.

The spec should replace this with a dry run's measured usage before Adam says yes.

## Done looks like

- Non-exact short answers are marked by the job, with `unsure` ones still waiting for the teacher.
- The marker view shows AI marks with reasons and lets the teacher overturn them.
- Evidence and knowledge-piece circles count AI marks the same as teacher marks.
- Unit tests for the job with an injected model reply: right, wrong, unsure, a malformed reply (everything stays waiting), and an answer that is empty or only whitespace.
- The cost is shown in A$ for each job run, like the other Teaching AI jobs.

## History

- 1 November 2026: brief written while designing deep understandings.
