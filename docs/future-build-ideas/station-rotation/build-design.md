# Station Rotation: build design

**Status:** promoted to build by Adam, 9 Nov 2026. This is the brief a new session builds from. Concept and reasoning: [../station-rotation.md](../station-rotation.md). Clickable mockup: [mockup.html](mockup.html) (open `mockup.html#written`, `#pretest` and so on for each view).

**One PR.** Build everything below on one branch and open **one** PR, with the phases as commits. Do not open a PR per phase: each PR costs a Netlify deploy preview. Run `npm run pre-pr-check` before opening it, and again before each push to it.

Every example (classes, students, texts, the reef scenario) is invented. Keep it that way in code, tests, fixtures and screenshots.

## What it is

A fifth lesson type, **Station Rotation**, beside Lecture, Tutorial, Design Sprint and Case Study. Students move around a **map** of stations. Each station is a short sequence of existing blocks with a standard card layout. A **pretest** sets each student's level at each station. **Gates** stop students skipping past a misconception: a multiple-choice hinge, or (for senior classes) a written answer checked by AI. What each student collects goes onto an **evidence board** that feeds a **finale**. A **teacher station** takes small groups routed by the pretest.

## Decided (do not reopen)

- **Self-paced only in v1.** No bell mode, no rotation grid. The teacher calls groups to the teacher station.
- **Teacher station is in v1.**
- **Pretest: three questions per station.** Score to level: 0 or 1 → Support, 2 → Core, 3 → Extend. No self-rating anywhere.
- **Knowledge type picks the mode.** Each station declares a knowledge type and the builder suggests blocks. It is a suggestion, never a lock, and it is never matched to the student.
- **Gates are always practice.** Passing or missing a gate never writes a mark to the markbook.
- **Written gates use the standard lane** (`claude-sonnet-5-5`), not the fast lane.
- **Evidence board is cards and links only.** Drag and link with a word from the teacher's list. No drawing, no free notes. Saved on the server per student.
- **Control dial** reuses `guided / standard / open` from the Design Sprint.

## Out of scope for this PR

- Bell mode and the rotation grid
- The jigsaw preset
- Spaced follow-up quizzes after the lesson
- A reusable station library across lessons. In v1 stations live in the lesson.
- Presets beyond setting the defaults of path, dial and evidence. Carousel and Choice board just preset those fields.

## Pattern to copy

Follow the Design Sprint and Case Study, which are built the same way. Read these first:

| Piece | Copy from |
|---|---|
| Lesson type enum | `pedagogical_mode` in `apps/teaching/src/schemas/lesson.ts` and `published-lesson.ts` (add `station_rotation`); `apps/teaching/src/curriculum/pedagogical-mode.ts` |
| Settings on the lesson | `sprint: SprintSettingsSchema` and `case: CaseSettingsSchema` in `lesson.ts`; add `rotation: RotationSettingsSchema` |
| Publish checks | `sprintIssues` and `caseIssues` called from `PublishableLessonSchema`; add `rotationIssues` |
| Sections tagged as parts | `sprint_phase` on `section` blocks (`teaching-block-schema.mjs`, `sprint/model.ts` `sprintParts`); add `rotation_station: string` (station id) and `rotation_finale: true` |
| Feature folder | `apps/teaching/src/sprint/` and `apps/teaching/src/case-study/` (schema, model, rules, editor-tabs, player, rail, map, api, css) → `apps/teaching/src/rotation/` |
| Teacher endpoint | `netlify/functions/sprint.mjs` (`/api/lessons/:id/sprint`, operator handler) → `rotation.mjs` at `/api/lessons/:id/rotation` |
| Student endpoint | `netlify/functions/published-sprint.mjs` (`/api/published/sprint/:id`, public student handler, rate limit, body cap) → `published-rotation.mjs` at `/api/published/rotation/:id` |
| Server logic and schema | `netlify/functions/_shared/sprint.mjs`, `sprint-schema.mjs` → `rotation.mjs`, `rotation-schema.mjs` |
| Hinge gate | `hinge_question` block: `gate`, `pace: 'independent'`, `backup`, reason. `apps/teaching/src/blocks/hinge-question/independent.ts`, `netlify/functions/hinge.mjs`, `published-hinge.mjs` |
| Evidence board | `concept_map` block's canvas mode (`GraphNodeSchema` x/y, `GraphEdgeSchema` label) |
| Teacher station | `with_teacher` block |
| Exit checks and pretest questions | `quiz_question` kinds and `apps/teaching/src/quiz/core.ts` marking |
| AI marking | `apps/teaching/src/ai/answer-marking-jobs.ts` (`LONG_SYSTEM`, opaque ids, verdict parsing), `apps/teaching/src/ai/job-runner.ts` (`TEACHING_AI_MODELS`, `PRICES`, `estimateCostUsd`, `usdToAud`) |
| Technique list | `apps/teaching/src/blocks/literary-elements.ts` |
| Design tokens | `packages/design-kit/tokens.css`; the mockup uses only these |

The Case Study and Sprint players let quiz questions be refused in `PublishableLessonSchema`. Station Rotation **needs** `quiz_question` blocks (exit checks, pretest), so do not add it to that stray-quiz rule.

## Data

### Settings (`lesson.rotation`)

```ts
RotationSettings = {
  class_id: string,
  dial: 'guided' | 'standard' | 'open',            // default 'standard'
  fade_dial: boolean,                               // default true: Extend passed at 2 stations opens route choice
  path: 'fixed' | 'free_all' | 'choose_n' | 'must_may' | 'unlocks',  // default 'free_all'
  choose_n?: number,                                // path 'choose_n'
  evidence: 'board' | 'list',                       // default 'board'
  link_words: string[],                             // 2–6, default ['causes', 'makes worse', 'is evidence for', 'slows recovery of']
  stations: Station[],                              // 2–8 plus at most one teacher station
  pretest: PretestItem[],                           // exactly 3 per non-teacher station
  finale: { lock?: LockQuestion, formats: string[], debrief: string[] },
  story?: { title: string, intro: string },        // breakout framing; optional
  behind_fallback: 'choose_n_minus_1' | 'skip_finale_build' | 'none'
}

Station = {
  id: string,                                       // matches the section's rotation_station
  title: string,
  kind: 'facts' | 'concepts' | 'procedures' | 'analysis' | 'perspectives' | 'teacher',
  strand?: SkillStrand,                             // existing SKILL_STRANDS
  outcomes: string[],
  minutes: number, seats: number,
  location?: string,                                // "Back bench"; a QR code links to the station
  must_do?: boolean,                                // path 'must_may'
  unlock_after?: string[],                          // path 'unlocks'
  token?: string,                                   // one letter or short code, breakout only
  piece: string,                                    // the evidence card text the station produces (teacher-written default)
  offline_code?: string                             // marks an offline station done
}

PretestItem = { station: string, question: QuizQuestion, misconception?: boolean }  // misconception: missing it routes to the teacher station
LockQuestion = { prompt, options, correct_id }      // a multiple-choice integration question; no ciphers
```

### Station content

Each station's section holds ordinary blocks in this order, which the editor seeds:

1. **Arrival recall**: one `quiz_question` drawn from a station the student has already done (`arrival_from: 'previous' | stationId`).
2. **Goal**: one `rich_text` line.
3. **Steps**: any blocks. Blocks can be tagged per level (`level: 'support' | 'core' | 'extend'`, absent = all levels).
4. **Hints**: up to 3, opened one at a time and logged.
5. **Gate** (optional): a `hinge_question` with `gate: true`, or a **written gate** (below). Blocks after it get `gate_view: 'blurred' | 'hidden'` (default blurred).
6. **Done when**: a list.
7. **Exit check**: one or two `quiz_question` blocks, answered individually.
8. **Collect**: shown by the player, not a block.

### Written gate

A new block kind `written_gate`:

```ts
{
  prompt: string, passage: string, marks: 1–6,
  idea: string,                                     // "isolation": what each effect must link to
  checks: ('technique_named' | 'exact_quote' | 'technique_fits' | 'effect_linked')[],  // per mark
  different_techniques: boolean,
  pass_at: number, pass_at_support?: number,
  answer_key?: { quote: string, techniques: string[] }[],
  max_checks: number,                               // default 3
  model_answer?: string                             // teacher only, never sent to students
}
```

### Per-student state (server)

One record per student per lesson, saved on the server (never only on the device):

```ts
{ pretest: Record<itemId, answerId>, levels: Record<stationId, 'support'|'core'|'extend'>, level_overrides: Record<stationId, level>,
  done: stationId[], collected: stationId[], hints: Record<stationId, number>,
  gates: Record<stationId, { attempts: Attempt[], state: 'open'|'backup'|'flagged'|'passed'|'unlocked' }>,
  exits: Record<stationId, { correct: boolean, at }>,
  board: { pos: Record<stationId, {x, y}>, links: { from, to, word }[] },
  teacher_group?: string, called_at?: string, hand_up_at?: string,
  finale: { lock_passed?: boolean, build?: string, format?: string, debrief?: Record<string, string> } }
```

Written-gate attempts store the full text, the rule results, the AI verdicts and reasons, and the time, so the teacher can see how the writing changed.

## Screens

The mockup is the reference for layout and copy. Match it unless this brief says otherwise.

### Teacher: build (editor tab)

- Preset row (Carousel, Choice board, Teacher-led, Breakout). Each one only sets path, dial and evidence.
- Station list: title, knowledge type picker with a suggested mode ("Suggests: Retrieval: flashcards and quiz"), strand, minutes, seats, levels chip, gate chip, exit check chip, Edit. Edit opens the station's section in the existing block editor.
- Path, pacing note ("Self-paced; call groups to the teacher station"), evidence (board or list), behind-schedule fallback.
- Control dial table showing what each setting changes.
- **Time budget**: pretest (about 30 s a question) + station minutes + 1 min per move + finale, against the scheduled lesson length from the timetable when the lesson is scheduled, otherwise 60 min. Warn when over; the teacher station adds no time.
- Pretest editor: three questions per station, with a "misconception" tick on each.

### Student

- **Pretest**: one question at a time, with the right answer shown straight after each. Levels fill in beside it.
- **Map**: station cards placed on a map (teacher-set positions, auto-laid out by default), each showing state (done, recommended, full, locked), minutes, seats taken and the student's level. A teacher-station card pulses when the student is called. Finale card shows pieces left. At 390px the map becomes a list in the same order.
- **Evidence board** tab: cards, drag to arrange, tap one card then another to link with a word. "Saved" line. At 390px a list with an "Add a link" row instead of dragging.
- **Station card**: as in the content order above. The level switch shows the pretest level and lets the student change it under Standard or Open control, and the change is logged.
- **Hinge gate**: options, a reason (at least 3 words), Check. Miss → reteach card naming the misconception + the backup question. Miss again → flagged, added to the next teacher-station group, reteach card stays, student can leave and come back.
- **Written gate**: see below.
- **Finale**: lock question, build with the board's cards and links already in place, format choice per the dial, debrief prompts, pretest-to-exit-check growth per station.

### Teacher: live

- Summary row: time left against the plan with the fallback link, stations done, help queue length, groups waiting.
- Room map: a dot per student at their current station; red for stuck (three hints and no exit check, a gate miss, or a hand up).
- Teacher station: groups from the pretest (who, which misconception questions they missed, a short script), "Got it" / "Needs more" ticks, **Call group**.
- Help queue, oldest first.
- Hint heat (station × level) and gate misses.
- Coverage: knowledge types and strands per student.
- Written-gate queue: flagged students and appeals, each with the answer and every check; **Pass** and **Keep closed** buttons. The teacher's decision wins.
- **Open gate** for any one student.

## The written gate: live AI check

This is the one new piece of architecture. Today AI marking is a batch the teacher starts, and `answer-marking-jobs.ts` says students never call it. A written gate is a check the **student** starts and waits on.

**Endpoint:** `POST /api/published/rotation/:id` with `action: 'check_writing'`, from the public student handler. Body cap as the sprint (40 KB); text cap 3,000 characters.

**Order of work:**

1. **Refuse before calling the model** if: the gate is already open; the student is out of checks; the text is unchanged from the last check (normalise case and whitespace); the per-student rate limit is hit (1 check per 20 s); or the class's daily cap is reached.
2. **Rule checks, no AI** (pure functions, unit tested): split into points (quotes inside quotation marks; full stops inside quotes do not end a sentence); each quote is word for word in the passage (case and curly-quote insensitive); the named technique is in `literary-elements`; enough different techniques when required. A failed rule check is final for that check and needs no AI.
3. **AI judgement** (standard lane), only for points that passed the rules: does the technique really work in that quote, and does the explanation link to the idea? The prompt holds the passage, the question, the idea, the answer key if any, and the student's points as quoted data under opaque ids. No names, no initials, no class.
4. **Verdict per check:** `pass`, `fail` with a reason of at most 25 words that points to the problem without writing the answer, or `unsure`.
5. **Combine:** any `unsure` → the gate goes to the teacher's queue and the student sees "Your teacher will look at this one". The AI never closes a gate on an unsure.

**Prompt injection:** the student's text is data. Before the call, a rule check flags text that addresses the marker ("mark this", "ignore", "3/3", "you are"); flagged text goes straight to the teacher, not the model. The model's reply must parse against a strict schema; anything else counts as `unsure`.

**Feedback by attempt:** attempt 1 names the failing check and a general pointer; attempt 2 a more specific pointer; after `max_checks` the teacher is flagged. Feedback never includes a corrected quote, a technique name the student didn't use, or a model sentence. Unit test this with model replies that try to.

**Appeal:** "I think the checker got this wrong" puts the answer in the teacher's queue. The verdict stands until the teacher decides.

**Cost guards:**
- Show the estimate in the gate editor: about A$0.01 a check, about A$0.55 for 28 students at two checks each. Use `estimateCostUsd` and `usdToAud`.
- Daily cap per class, default A$3, set in the gate editor. At the cap, written gates turn into teacher checks for the rest of the day and the student is told so.
- Record each check's real cost the way other Teaching AI jobs do.
- Replace the estimate with measured figures from the first real dry run, and note them in this file.

**AI down or timeout (15 s):** the check doesn't count against the student's attempts; the gate goes to the teacher queue.

## Publish checks (`rotationIssues`)

In the teacher's words, like `sprintIssues`:

- At least 2 stations, at most 8, plus at most one teacher station.
- Every station has a section, a goal and at least one exit check.
- Exactly 3 pretest questions per non-teacher station.
- A gate's blurred blocks come after the gate.
- Written gates: passage, prompt, idea, at least one check, `pass_at` ≤ `marks`.
- `choose_n` is less than the number of stations; `unlock_after` refers to real stations with no loops.
- A class is set.
- A breakout with tokens has a lock question.

## Edge cases

- **Student misses the pretest:** levels come from their last quiz on the unit, otherwise Core. They can still take it.
- **Absent, then back next lesson:** state is on the server; they carry on.
- **Station full:** the card shows Full and recommendations route around it; the student can still open it (seats are a guide, not a lock).
- **Teacher calls a group while a student is mid-station:** the station is paused, not lost.
- **Gate flagged and the teacher never acts:** the student can still do every other station and the finale except anything that depends on that station's piece.
- **Unlock loop or a removed station:** caught at publish.
- **Teacher edits a published rotation:** do what the sprint does for edits after publishing (check `sprint.mjs` and `lesson-publish.mjs` first); students keep their state for stations that still exist.
- **Two devices:** last write wins per field; the board saves positions and links separately so a drag on one device doesn't wipe links from another.

## Markbook

Gates write nothing. Exit checks and the pretest are practice evidence. They feed the existing evidence and knowledge-piece views like other quiz answers, with no assessment column. The finale build can be marked like any extended response if the teacher adds a column, as the sprint does.

## UI failure register

Checks for this feature from [docs/CURSOR-UI-FAILURES.md](../../CURSOR-UI-FAILURES.md):

- **L1, L2**: map cards and station cards size to content; station cards in the list share the right edge at 1440.
- **R1, R2, R3, R5**: at 390 the map becomes a list, the board becomes the list with "Add a link", and no view scrolls sideways. Nothing that is on desktop is missing on phone.
- **V1**: blurred and hidden gated blocks use `inert` and real hiding; check `[hidden]` isn't overridden by a `display: grid` class (this happened in the mockup).
- **V2, V4**: the level shown on the map, on the station card and in the passport always agree.
- **V5**: a failed board save or writing check says why and keeps the student's text.
- **V7**: a live update does not reset the student's open tab (Map or Board) or scroll position.
- **V10**: pretest and gate options never reveal the answer by style or order before the student answers.
- **D1, D3**: cost figures say "estimate" until measured; screenshots in the PR use invented data, never a real class.
- **D12**: the teacher views show student names from the class, never ids.
- **C1, C11**: board link labels don't collide with cards; arrows stop at card edges.
- **I3**: every demo-looking button in the mockup has a real action or is left out.
- **I9**: a board drag saves without waiting on the AI or anything else.
- **I10**: no `alert`, `confirm` or `prompt`.

## Tests

- **Unit:** settings schema and defaults; `rotationIssues`; pretest score to level; dial fade rule; recommendation (skips full and done, respects path); unlock graph; written-gate rules (point splitting with full stops inside quotes, exact-quote match, technique list, different techniques, unchanged-text refusal); the injection pre-check; AI reply parsing (pass, fail, unsure, malformed → unsure, a reply that writes the answer → stripped and logged); cost cap.
- **Integration:** student endpoint actions (pretest answer, open station, hint, gate check, exit check, collect, board move, board link, hand up, finale) and teacher actions (call group, open gate, pass or keep closed, fallback).
- **Browser:** one Playwright run of the mockup's flow on a seeded invented lesson, at 1280 and 390: pretest → map → station → gate miss, reteach, pass → exit check → board link → finale. `--trace off`.

## Phases (commits in one PR)

1. `station_rotation` mode, `rotation` settings schema (client and server), `rotation_station` and `rotation_finale` on sections, `rotationIssues`, defaults and presets. Tests.
2. Editor tab: station list, knowledge type suggestions, path, dial, evidence, time budget, pretest editor. Station Edit opens the section.
3. Student endpoint and state; student player: pretest, map (and phone list), station card with levels, hints, exit check, collect, passport.
4. Teacher station and live view: pretest routing, call group, room map, help queue, hint heat, coverage.
5. Hinge gates: `gate_view` on blocks after a gate, reteach, backup, flag, teacher open.
6. Evidence board on the concept map canvas, finale (lock, build with board, debrief, growth).
7. Written gate: block, editor (with cost estimate and cap), rule checks, live AI check, appeal, teacher queue, cost recording.
8. Playwright flow, screenshots at 1280 and 390 on invented data, `npm run pre-pr-check`, open the one PR.

## History

- 9 Nov 2026: written from the concept doc and mockup after Adam promoted it to build.
