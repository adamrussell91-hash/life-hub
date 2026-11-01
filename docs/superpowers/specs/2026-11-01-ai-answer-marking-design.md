# AI marking of typed quiz answers

Status: approved in chat, 1 November 2026. Built on `claude/ai-answer-marking`. Brief: `docs/future-build-ideas/ai-short-answer-marking.md`.

## What Adam decided

- The AI can mark every typed quiz answer: `short_answer`, `fill_gap`, `explain_effect`, `extended_response`. Self-marked boxes stay out.
- Short answers and fill the gap: on by default. Each question has an "AI can mark this" switch to turn it off.
- Explain the effect and extended response: off by default; the teacher turns the switch on per question.
- No half marks for short answers: right, wrong or unsure. Fill the gap keeps its usual share per gap.
- Long answers are marked against the question's criteria ("How to mark it", and the model answer) when it has them. With neither, the AI still marks, against the question alone, and says so in its reason. It never refuses.
- The teacher can change any AI mark, edit its feedback or add their own. The teacher's mark always wins and is never overwritten by a later AI run.
- Overturning a short answer to right offers "Add to accepted answers". It adds the answer to the draft question; it takes effect for new attempts once the lesson is republished.
- Only answer text goes to the model, keyed by an opaque answer id. No names, initials, devices or class ids.

## How it works

### When it runs

Batch, by hand. The quiz results view shows **AI mark N answers · about A$x** whenever handed-in answers are waiting for the AI. The figure comes from a dry run of the same job (no model call). Pressing it queues one Teaching AI job for the quiz. Nothing runs without that press, so the cost is always seen first.

Until the job runs, a typed answer that isn't an exact match on an AI-markable question is waiting (`pending: 'ai'`). It counts nowhere, the same as a near miss today. Students see "Your teacher will check this one."

### The job (`quiz_ai_mark`)

`apps/teaching/src/ai/answer-marking-jobs.ts`. A pure job with an injected `complete`, the same pattern as `next-step-jobs.ts`, bundled into the Teaching AI runtime.

- **One call per question**, carrying every waiting answer to it. Long questions are split into calls of at most 12 answers.
- **Lanes:** short answer and fill the gap use `fast` (Haiku 5.5). Explain the effect and extended response use `standard` (Sonnet 5.5).
- **Input:** the prompt (plus the quote, technique or passage where the kind has one), the marks, the accepted answers or gap answers, the "Looking for" note or "How to mark it" guide, the model answer, and the answers as `{ id, text }`.
- **Output** (JSON, checked):
  - short answer: `{ id, verdict: 'right' | 'wrong' | 'unsure', reason }`
  - fill the gap: `{ id, gaps: { gapId: 'right' | 'wrong' | 'unsure' }, reason }`
  - long: `{ id, marks, unsure, reason, feedback }`. `marks` is a whole or half number from 0 to max. `feedback` is one to three sentences to the student, phrased as what they did and what to do next.
- A malformed reply, an unknown id or out-of-range marks: that answer stays waiting. An empty or whitespace-only answer is never sent; it is already wrong.
- Usage and A$ cost are logged like the other Teaching AI jobs and shown on the job.

### Storage

`quiz/{lesson}/ai-marks/{device}/{n}` holds `{ [questionId]: AiMark }`, written only by the job and separate from the teacher's `marks` record, so the two never race.

```ts
type AiMark = {
  marks: number | null;             // null when unsure
  verdict?: 'right' | 'wrong' | 'unsure';
  gaps?: Record<string, 'right' | 'wrong' | 'unsure'>;
  reason: string;                   // for the teacher
  feedback?: string;                // long answers: for the student
  model: string; at: string; job: string;
};
```

### Scoring order

In `scoreAttempt`: the teacher's mark, else the AI's mark, else the automatic mark. An AI `unsure` (or a fill-the-gap answer with any unsure gap) stays waiting. Evidence, the markbook and knowledge-piece circles read `awarded`, so AI marks count exactly like teacher marks.

The teacher's mark record gains an optional `comment` (`{ marks, codes?, comment? }`). Students see the teacher's comment, or else the AI's feedback, once the results are released.

## Screens

- **Builder:** an "AI can mark this" switch on the four kinds (on for short answer and fill the gap, off for long). Short answer also gets an optional "Looking for" note.
- **Results:** the AI mark button with its A$ figure, then a status line while the job runs, then "Marked 31 · 3 for you to check".
- **Attempt view:** an AI-marked row shows an **AI marked** tag and the reason. Long answers show the feedback in an editable box. "Save" turns the mark into a teacher mark with that comment. Unsure rows say "AI wasn't sure: reason", with the AI's suggested mark filled in where it gave one.
- **Student view:** the comment under the answer, once released.

## Cost

From the repo's `PRICES`, before a measured run:

- Short answers, 28 students × 5 questions: about A$0.01 per class quiz on Haiku.
- One extended response, 28 students: about A$0.30–0.40 on Sonnet.

The results button shows the dry-run figure for the actual answers before each run. A real run's measured cost is reported back to Adam before he relies on it.

## Out of scope

- Question-set writing boxes outside quizzes (they have their own marking).
- Running automatically on hand-in or at the end of a live round.
- A confidence slider.

## Tests

The job, with an injected model reply: right, wrong and unsure; fill the gap per gap; long marks and feedback; a malformed reply (everything stays waiting); an unknown id; out-of-range marks; and empty answers never sent. Scoring: teacher beats AI beats automatic, and unsure stays waiting. The server: dry run, run, teacher marks are skipped, no names reach the prompt.
