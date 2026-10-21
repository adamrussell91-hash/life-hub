# Ann builds quizzes — build plan

**Goal:** In the lesson editor's AI panel, Adam asks Ann for a quiz ("ten questions on the causes of WWI, mix of types, from what I've given you"). Ann researches, writes the questions as real `quiz_question` blocks, and they arrive as one proposal card. Adam accepts, and the questions are in the lesson. No more ten-minute waits that end in an error.

**Status:** built 21 Oct 2026 on `claude/ann-quiz-builder` (decision A). What changed from the plan as written:
- The runner is a short tool loop, not one call plus a retry. A proposal that fails a check goes back to Ann as a tool error, she fixes it in the same job, and you only ever see a proposal that passed.
- Calls to Claude use the repo's raw `fetch` pattern (as Alchemy does) instead of adding `@anthropic-ai/sdk`.
- Questions carry no per-question `source` field. Sources are listed in Ann's message.
- An insert with no anchor into a non-empty lesson is still refused on Accept (an existing rule). The runner now asks Ann for a real anchor before the card is shown.
- While Ann researches, the panel keeps its rotating wait lines rather than showing a fixed "researching" line.

**Shipping:** one PR, with each phase as its own commit. Run `npm run pre-pr-check` first, then turn on auto-merge.

---

## What's true today (checked 21 Oct 2026 against `origin/main`)

1. **Ann's editor panel can't run at all.** `POST /api/ai/jobs` ([ai-jobs.mjs](../../../../../netlify/functions/ai-jobs.mjs)) saves a job as `working/queued`, but nothing in production picks it up. The only tick handles voice transcription. After 10 minutes the job becomes "Timed out waiting for a runner". The mock API completes jobs instantly, which is why tests and dev never caught it.
2. **A runner was already written, then stranded.** Commit `4d2cb4ee8` ("Teaching AI: run queued chat jobs on the server…") is on `origin/claude/dazzling-ptolemy-cgmmnb`. It was pushed 11 minutes *after* PR 863 merged, so it never reached main. It contains:
   - `apps/teaching/src/ai/job-runner.ts`: lanes (Haiku 5.5 for conversions, Sonnet 5.5 for judgement), one step up to a stronger setting when a proposal fails the checks, cost per job
   - the `/api/ai/job-run` background function and the job-creation kick
   - a bundle of the app's own prompt, tools and checks for the server (`teaching-ai-runtime.mjs`) plus a freshness test
   - prompt caching (stable persona, rules and recipes first)
   - unit and integration tests

   Main has moved on by about 609 commits, so it has to be ported, not cherry-picked blind.
3. **The proposal flow already has what we need.** `insert_blocks` takes up to 48 blocks above or below an anchor. The Accept, Reject and Regenerate cards and partial accept ([partial-accept.ts](../../../src/ai/partial-accept.ts)) already exist.
4. **The quiz engine is complete.** `quiz_question` supports 14 kinds ([quiz/core.ts](../../../src/quiz/core.ts)), and `checkQuestion()` gives plain-English problems ("Write the question.", "the ticked answer must exist"). A server copy exists at `netlify/functions/_shared/quiz-core.mjs`.
5. **Three gaps specific to quizzes:**
   - **Recipes:** `BLOCK_BUILD_RECIPES` doesn't mention `quiz_question` at all.
   - **Validation:** the block schema only checks a quiz question's `id` and `kind` (`QuizQuestionDraftSchema` is a `z.custom`). `validateMutatingProposal` never calls `checkQuestion`, so a half-written question would pass and land as "Not ready".
   - **Quiz-mode rule:** `quiz_question` only publishes in a lesson with `pedagogical_mode: 'quiz'` ([lesson.ts:52](../../../src/schemas/lesson.ts)). Proposals can't change the lesson's mode.
6. **Research is cheap to add.** The backend already uses Anthropic's server-side `web_search_20250305` tool, in [cognitive-context.mjs](../../../../../netlify/functions/_shared/cognitive-context.mjs) and with `pause_turn` handling in `anthropic-client.mjs`. Search for Adam's own Knowledge Hub notes already exists in Alchemy's tools (`search_notes` / `read_note` in [alchemy-agent.mjs](../../../../../netlify/functions/_shared/alchemy-agent.mjs)).

---

## Decision needed before building

**What happens when Adam asks for a quiz in a normal (non-quiz) lesson?**

- **A. Ann offers to switch it (recommended).** Add an optional `set_mode: 'quiz'` to the `insert_blocks` proposal. The card says "This also turns the lesson into a Quiz", and Accept applies both together. In a lesson that already has other teaching blocks, Ann asks first.
- **B. Ann uses classroom question blocks instead.** In a normal lesson she builds `question_set` / `self_check` / `cloze` (no auto-marking, no quiz player). She only uses `quiz_question` in Quiz lessons.
- **C. Ann refuses and explains.** She tells Adam to change the lesson type first. This is the cheapest option and the most annoying to use.

The plan below assumes **A**, with B as Ann's fallback when Adam says "not a quiz, just questions".

---

## Phases (one commit each)

### Phase 1: Port the stranded runner (makes Ann work in the editor at all)
- Rebuild `4d2cb4ee8` onto current main:
  - `job-runner.ts`
  - `ai-job-run.mjs` (background, 15-minute Netlify limit)
  - `teaching-ai-job-kick.mjs` and `teaching-ai-job-run.mjs`
  - the runtime generator, plus wiring into `pre-pr-check`'s generated-file check
- Resolve drift against today's `context.ts`, `ai-jobs.mjs`, `ai-job.mjs` and `chat.ts`.
- Remove `fixtureReplaceLessonProposal` as a production fallback: a "kernel missing" result must be an error, never a fake heading.
- Have the stale-job sweep and the panel both say what failed in plain words.
- **Verify:**
  - a real job on the live site goes queued → writing → done in under 2 minutes for "shorten this paragraph"
  - a deliberately broken API key produces an error within 30 seconds, not a 10-minute wait

### Phase 2: Teach Ann the quiz block
- Add a quiz recipe to `BLOCK_BUILD_RECIPES`:
  - the content shape of each of the 14 kinds (generated from `quiz/core.ts` so it can't drift, the same way `buildBlockSchemaExamples` works)
  - marks
  - when to use each kind (tier 1 for recall, tier 2 for structure, tier 3 is teacher-marked)
  - a limit: at most 30 questions per proposal (under the 48-block cap with room for a heading)
- Update the Ann protocol: write questions only from the info Adam gave plus cited research, and say which questions came from where.
- **Verify:** a unit test checks that the recipe mentions every kind in `QUIZ_QUESTION_KINDS`.

### Phase 3: Reject bad questions before they reach Adam
- In `validateMutatingProposal`, run `checkQuestion` on every `quiz_question` in the proposal tree. Collect the problems with each question's index.
- The runner's existing step-up retry gets those problems as its retry note ("Question 4: the ticked answer must exist"), so Ann fixes them once before giving up.
- Ids must be unique across the proposal and the existing lesson.
- **Verify:** unit tests for a missing prompt, a correct answer that isn't among the options, duplicate ids, and a `fill_gap` passage with no gaps. Each fails with the right message, and a fixed retry passes.

### Phase 4: Quiz mode on Accept (decision A)
- Add an optional `set_mode: 'quiz'` to `ProposeInsertBlocksSchema` and `propose_insert_blocks`.
- `apply-proposal.ts` sets `pedagogical_mode` in the same save as the inserted blocks, so Reject leaves both untouched.
- The proposal card shows a one-line notice when `set_mode` is present.
- When the lesson isn't in Quiz mode, the validator rejects any `quiz_question` proposal that doesn't set `set_mode: 'quiz'`.
- **Verify:**
  - accept → the lesson publishes as a Quiz, and the student quiz player shows the questions with answers stripped
  - reject → mode and blocks are unchanged
  - undo restores both

### Phase 5: Research
- Give the runner the server `web_search` tool (`max_uses: 5`) on the standard lane only, plus Alchemy's `search_notes` / `read_note` for Adam's Knowledge Hub.
- Handle `pause_turn` in the loop: reuse `anthropic-client.mjs` rather than the runner's single call.
- Write the sources into `job.response` as a short "Sources" list. Each question can carry an optional teacher-only `source` note.
- Media rule unchanged: any image URL (for `label_image`) must come from a search result, or the question kind isn't used.
- Phase updates onto the job (`searching` → `writing`) so the panel's ticker shows real progress.
- **Verify:** "10 questions on the 1916 Easter Rising" on the live site returns cited questions, and each source link loads.

### Phase 6: Card preview and a live check
- The proposal card lists each question with its kind, marks and answer. This reuses `answerLines()` from [quiz-question.ts](../../../src/blocks/quiz-question.ts).
- Partial accept lets Adam untick questions he doesn't want.
- **Live check** at desktop and 390px, run on the live site:
  1. Quiz lesson + pasted notes → 10 mixed questions
  2. Normal lesson → switch-to-Quiz card
  3. "Just questions, not a quiz" → `question_set`
  4. 40 questions → Ann says she'll split it into two proposals

---

## Must / Must not

- **Must:**
  - Every quiz question passes `checkQuestion` before Adam sees it.
  - Accept is the only way a lesson changes.
  - Each job records its cost.
  - Failures show within 30 seconds of happening, never as a 10-minute timeout.
- **Must not:**
  - invent image URLs
  - silently drop questions to fit a cap
  - change the lesson mode without the card saying so
  - add a second job system: reuse `ai_jobs/*`

## Rough cost and time

- **Model:** Sonnet 5.5 with about 5 searches.
- **Input:** roughly 30k cached prompt + lesson + about 20k of search results.
- **Output:** about 6k.
- **Cost:** about US$0.15–0.30 per 10-question quiz.
- **Time:** 1–3 minutes, well inside the 15-minute background limit and the 10-minute stale sweep.

## Files

- **New:**
  - `apps/teaching/src/ai/job-runner.ts`
  - `netlify/functions/ai-job-run.mjs`
  - `netlify/functions/_shared/teaching-ai-job-{kick,run}.mjs`
  - `netlify/functions/_shared/teaching-ai-runtime.mjs` (generated)
  - `scripts/generate-teaching-ai-runtime.mjs`
  - tests
- **Changed:**
  - `ai-jobs.mjs`, `ai-job.mjs`
  - `block-recipes.ts`, `validate-proposal.ts`, `proposals.ts`, `apply-proposal.ts`
  - `ai-panel.ts` (card), `ann-protocol.md`
  - the `pre-pr-check` generated-file list
