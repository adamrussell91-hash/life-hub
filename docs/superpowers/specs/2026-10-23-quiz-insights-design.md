# Quiz insights and follow-through — design

23 October 2026. Approved in conversation with Adam; mockups shown inline there.

## Why

A pre-test on identifying techniques shows each student's marks in the markbook but says little about the quiz itself. Adam wants three things from quiz and assessment data:

- **Macro:** descriptive statistics and movement over time, to see whether the teaching is working.
- **Patterns:** which techniques (or outcomes, or skills) the class and each student are weakest and most confident in, and *why* answers were wrong.
- **Follow-through:** when the data can't support a decision yet, flag it and make a short follow-up quiz easy; carry each student's weak areas forward so feedback and practice can use them later.

It has to work for every quiz kind and for assessment criteria without building new data screens each time.

Research basis (Wiliam; Christodoulou; classical item analysis): collect data to make decisions; question- and answer-level patterns beat totals for deciding what to teach; individual scores from short quizzes are noisy, so class and tag patterns carry the weight and individual changes are labelled rough; confident errors matter most.

## Scope

This build: the evidence layer, insight views and follow-up flow (pieces 1–3).

Later builds, designed for but not built here: focus areas feeding written feedback (Voice marking, annotation, Ann comment drafts), and personalised practice that weights each student's weak tags. Both read the evidence layer and the student focus list defined below; neither needs its own data system.

## Concepts

### Tags

One string format for everything a mark can be about:

| Prefix | Example | Source |
|---|---|---|
| `tech:` | `tech:simile` | `technique_id` on quote_technique options and spot_technique targets |
| `fam:` | `fam:Descriptive` | the technique's family in `literary-elements.json` |
| `out:` | `out:{outcome id}` | question `outcomes` (falling back to the lesson's), criterion outcomes |
| `skill:` | `skill:reading.inference` | new optional question `skills`; criterion skill refs |

- Technique tags imply their family tag.
- Question schema gains `skills: SkillRef[]` (optional, max 8), mirroring `outcomes`. The builder gets the same picker treatment as outcomes.
- Outcome ids are normalised through the outcome catalogue, as `evidenceFor` already does.

### Evidence record

```ts
type Evidence = {
  student: string;          // student_id
  source: string;           // 'quiz:{lessonId}' | 'assess:{columnId}'
  item: string;             // question id or criterion id
  date: string;             // YYYY-MM-DD (submission day or column date)
  tags: string[];
  share: number | null;     // awarded / max, null while waiting to be marked
  confidence: 1 | 2 | 3 | null;
  why: Why[];               // empty when full marks or unknown
};
type Why =
  | { type: 'option'; id: string }               // picked a wrong option
  | { type: 'named'; as: string; target: string } // tech: ids: named target as another technique
  | { type: 'not_found'; target: string }        // didn't select the words
  | { type: 'placement'; id: string }            // ordering / categorise / matching item misplaced
  | { type: 'code'; id: string };                // teacher feedback code
```

- A spot_technique question yields one record per target, so a question testing simile and juxtaposition counts towards each separately, and "found but named wrong" (half credit) is told apart from "not found".
- Quizzes use the **first attempt**, matching the markbook.
- Hand-marked kinds (short answer, extended response, explain effect) get `why` only from feedback codes.

### Bands and thresholds

All in one constants file so they can be tuned.

- Per tag (class or student): **Weak** < 50%, **Secure** ≥ 80% (and mean confidence ≥ 2.5 when the quiz asked), otherwise **Developing**.
- A tag with evidence from only one question is labelled **"1 question"** instead of a band.
- Student groups and focus areas need ≥ 2 evidence items for that student and tag.

## Units

### 1. Evidence adapters — `apps/teaching/src/quiz/core.ts` (shared with the server via the generated runtime)

`evidenceFromAnswer(question, key, response, awarded, confidence, codes)` returns `Evidence` fields minus student, source and date. One case per quiz kind. A new quiz kind adds one case; nothing downstream changes.

Assessment criteria get `evidenceFromCriterion(column, criterion, mark)` in `apps/teaching/src/evidence/`.

Rerun `scripts/generate-teaching-ai-runtime.mjs` after core.ts changes.

### 2. Statistics — `apps/teaching/src/evidence/stats.ts`

Pure functions over `Evidence[]`, knowing nothing about quiz kinds:

- `summary(scores)`: n, mean, median, sample SD, min, max, Q1–Q3.
- `reliability(matrix)`: Cronbach's alpha (equals KR-20 for right/wrong items); shown only with ≥ 5 attempts and ≥ 3 questions.
- `itemStats(matrix)`: facility and discrimination (corrected item–total correlation); discrimination shown with ≥ 10 attempts.
  - Flags: **Too easy** at facility ≥ 95%, **Too hard** at ≤ 5%, **Check question** when discrimination < 0.
- `byTag(evidence, prefix)`: mean, half-credit share, mean confidence, question count, band, and per-band student counts.
- `mixUps(evidence)`: counted `why` entries per tag, most common first.
- `confidenceQuadrants(evidence)`: sure and right, sure but wrong, unsure but right, unsure and wrong. "Sure" is 3; "unsure" is 1. A 2 counts in neither.
- `flags(evidence)` — each flag names its tags and students:
  - **Sure but wrong:** ≥ 2 students gave confidence 3 and less than full marks on the same tag.
  - **Possible guessing:** on a tag, ≥ 25% of full-mark answers were given at confidence 1.
  - **Too little evidence:** a tag tested by one question.
  - **Outlier:** a student below 50% on a tag the class is Secure on.
- `trend(evidence, tag?)`: per source in date order, the class median and IQR of share (all tags, or one tag).
- `compare(before, after)`: per tag class change, counts of students moving up or down a band, and per-student change, which is labelled rough in the UI.
- `focusFor(evidence, student, pins)`:
  - up to 3 weakest tags with ≥ 3 items and mean < 60%, with that student's top mix-ups and codes;
  - plus pinned tags, minus dismissed ones;
  - and Secure tags with ≥ 3 items and mean ≥ 80%.

### 3. Server — `netlify/functions/_shared/quiz.mjs`, `markbook.mjs`

- **Results rows** gain `why`, `tags` and `codes`. The markbook's quiz rows gain `why` and `tags`.
- **Marks with codes.** A value in `quiz/{lesson}/marks/{device}~{n}` may be a number (as now) or `{ marks, codes }`. Readers accept both, so no migration is needed. The `mark` action accepts `codes` (ids from the feedback-code library).
- **Closed.** A quiz is closed when `closes_at` has passed. **Close now** sets `closes_at` to the current time.
- **Saved copy** at `quiz/{lesson}/evidence` holds `{ version, built_at, evidence, stats }`.
  - Built on the first read of a quiz that is closed and has no answers waiting to be marked.
  - Deleted by `mark`, `reset`, `clear_all`, publishing a new key version, and any change to `closes_at`. The next read rebuilds it.
  - Reads of open quizzes compute live.
  - The markbook load uses saved copies where they exist.
- **Follow-up settings** on the quiz key `settings`:
  - `for_students: string[]` — the `claim` action rejects initials outside the list with "This quiz is for a small group."
  - `follow_up_of: lessonId`
  - `compare_with: lessonId`
- **Flag dismissals** are stored at `quiz/{lesson}/flags` as `{ dismissed: flagId[] }`. A flag id is stable from its type plus its tags.
- **Focus pins** go in the markbook record as `focus: { [studentId]: { pinned: tag[], dismissed: tag[] } }`, saved through the existing etag CAS and save queue.
- **Criterion codes:** `AssessmentMark` gains `codes?: { [criterionId]: codeId[] }`. Markbook schemas (client `schema.ts` and `markbook-schema.mjs`) are updated together.

### 4. Quiz Results view — `apps/teaching/src/quiz/teacher-panel.ts` plus new `apps/teaching/src/evidence/views/`

The Results tab, top to bottom:

1. **Header** with Closed and saved status, and **Close now** while the quiz is open.
2. **Summary cards:** attempts out of the class, mean, median, SD, middle half, reliability. Below them, a **dot plot** of scores with the IQR band and median line.
3. **By tag**, weakest first.
   - Tag switch: Technique / Family / Outcome / Skill. It defaults to the most specific tag type the quiz has; tag types the quiz has no evidence for are hidden.
   - Each row has a two-part bar (full marks dark, half credit light), a band label and mean confidence.
4. **Follow up:** flag cards with **Ann drafts follow-up quiz** and **Dismiss**. Once a follow-up exists, the card shows its status and outcome.
5. **Mix-ups:** wrong-name, wrong-option, placement and code counts per tag.
6. **Confidence:** the four quadrants. Sure-but-wrong lists the students.
7. **Questions:** the existing per-question rows plus facility, discrimination and quality flags.
8. **Compare with** panel, when `compare_with` is set.
9. Then the existing question × student grid, attempts list, release and clear controls.

**Settings** gains **Compare with** (a picker of the class's other quizzes) and shows `for_students` for follow-ups.

### 5. Markbook Patterns view and student panel — `apps/teaching/src/markbook/`

The **Outcomes** toggle becomes **Grid · Patterns**. Patterns replaces `outcomes-view.ts`; with the tag switch set to Outcome, it covers what Outcomes showed.

- **Class over time:** median line and IQR band per quiz and assessment, in date order.
- **Tags table:** now, change since first evidence, sparkline, evidence count, and weak / developing / secure counts.
  - Tapping a count lists those students, with **Ann drafts follow-up quiz** for that group.
- **Students × tags heatmap.** Tapping a cell lists the evidence behind it (source, question, answer). At 390px it scrolls sideways with the name column sticky.

The **student panel** opens from a student name, as a full-screen sheet on phones. It has:

- overall mark and quiz sparkline;
- focus areas with **Pin** and **Dismiss**;
- secure tags;
- a confidence summary with follow-up outcomes.

### 6. Feedback-code chips — `apps/teaching/src/evidence/code-chips.ts`

One component that shows the Composition codes as toggle chips, with **More codes** for the Viva and Speaking groups. Each chip's tooltip is its descriptor.

- **Quiz attempt view:** under the mark control, shown when awarded < max. Saved with the mark.
- **Markbook assessment panel:** under each criterion's mark, shown when the mark < max. Saved in `AssessmentMark.codes`.

### 7. Follow-up flow

1. **Start.** Triggered from a quiz flag or a Patterns group.
2. **Plan sheet**, in the shared overlay. It shows:
   - tags;
   - students, as tick boxes;
   - question count (default 5, range 3–10);
   - what Ann receives: tags, question prompts, wrong responses and mix-up counts, with **no names or initials**;
   - an estimated cost taken from recorded costs of past Ann quiz jobs.

   Buttons: **Draft** and **Cancel**.
3. **Job.** A new Ann recipe in the teaching AI job runner. It creates a draft lesson in the same unit, placed after the original, titled "Follow-up: {tag names}". The lesson holds a quiz with `for_students` and `follow_up_of` set. Questions target the recorded mix-ups and use the quiz kinds that produced the evidence.
4. **Review.** Adam reviews and publishes in the lesson editor. The original flag shows **Follow-up ready**, linking to the new lesson; the follow-up shows **Following up ←**.
5. **Close the loop.** When the follow-up closes with nothing left to mark, the original flag shows the outcome ("3 of 4 now right"). Its evidence joins the tag trends and focus areas like any quiz.

## Error handling

- A saved copy that fails to parse or has an old `version` is deleted and rebuilt.
- A failed rebuild falls back to a live computation and logs the error.
- Evidence with a missing key version (rows from an older published key) is skipped, as the attempt view already does.
- Removed students are excluded from class statistics and shown only when "show removed" is on.
- Stats below their minimum n show "–" with a tooltip giving the reason ("Needs 5 attempts").
- A failed Ann job leaves the flag as it was and shows the job error; nothing is half-created. The lesson is written only on success.
- Every focus pin write goes through the markbook save queue with rollback on conflict.

## Testing

- **Unit tests:**
  - an adapter case for every quiz kind, including spot_technique not-found vs named-wrong;
  - stats against worked examples (median and IQR, alpha, corrected item–total correlation, band and flag edges);
  - trend and compare;
  - `focusFor` with pins and dismissals;
  - the rules that delete the saved copy;
  - `for_students` rejection;
  - old numeric marks reading correctly;
  - the criterion codes schema.
- **Fixtures** use invented names only.
- **Browser walk** on the mock API at 1280px and 390px:
  - the Results view with a closed, saved quiz and with an open one;
  - Patterns;
  - the student panel;
  - chips in both places;
  - the plan sheet up to **Draft**.
- `npm run pre-pr-check` passes.
- **Not verified locally:** a real Ann follow-up job, which needs Adam's go and costs money.

## Build shape

One PR on `claude/quiz-insights`. Each phase is a commit:

1. tags, the question `skills` field and adapters
2. stats
3. server rows, saved copies and Close now
4. the Results view and Compare with
5. Patterns and the student panel
6. chips
7. the follow-up flow
