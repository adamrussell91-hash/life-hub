# Comparative judgement block — design (Level 2)

11 November 2026. Approved by Adam on 10 November as "Level 2": comparative judgement plus the research-informed extras below. Built overnight without check-ins, so every decision is recorded here with its reason. Invented examples only.

## What it is

A Teaching Hub block, `comparative_judgement`, that points at one written question (a `short_answer` question inside a `question_set` block) in this lesson or another lesson in the unit. Its pool is the class's answers to that question. Students (and the teacher) see two anonymised answers side by side and pick the better one against one holistic criterion. A Bradley–Terry model turns the choices into a scale.

Research base, in one line each:

- **Thurstone (1927), Pollitt (2012), Jones & Alcock (2014):** people judge relative quality more reliably than absolute quality; pairwise judgements of whole pieces give reliable scales for writing that rubrics struggle with.
- **Bradley & Terry (1952), Hunter (2004):** the pairwise model, and the MM algorithm that fits it without a solver.
- **Bramley (2015), Bramley & Vitello (2019):** adaptive pairing inflates scale separation reliability (SSR). So we report a second, judge-split reliability and never let SSR alone say "reliable".
- **Verhavert et al. (2019):** about 10–14 comparisons per script for reliability ≈ .70–.80. Our default (8 per student, ~30 students) gives ~16 per answer.
- **Sadler (1989, 2009), Nicol (2014), Bartholomew et al. (2019):** judging peers' work builds evaluative knowledge ("guild knowledge") and improves the judge's own later work, more than receiving feedback does.
- **Kruger & Dunning (1999), Panadero et al. (2017):** prediction then comparison is a calibration exercise; students' self-estimates improve when checked against a reference.
- **Gentner, Loewenstein & Thompson (2003), Schwartz & Bransford (1998):** contrasting cases make features visible; two close answers side by side is the strongest prompt for discussion.

## Decisions

| # | Decision | Reason |
|---|----------|--------|
| D1 | The pool is a **snapshot** taken when the teacher presses Start judging. Refresh adds late answers and keeps everyone's id. | CJ needs fixed texts: an answer edited mid-round would make earlier judgements about a different piece. |
| D2 | An answer's text comes from the hand-in (`work_handins/…`) when there is one, else the latest saved work (`work/{lesson}/{owner}`). | Those are the two places question-set writing reaches the server today (`lesson-work.mjs`); no new hand-in path. |
| D3 | Pool items get opaque ids: `a` + first 12 hex of sha256(round salt + kind + ref). The salt is per class round and never leaves the server. | Ids can't be reversed to a student and differ between classes and rounds. |
| D4 | Students receive only `{ id, text }` for answers. No names, initials, student ids, anchor flags or marks. | Ranking results are sensitive. Tested on the server (anonymisation test). |
| D5 | Teacher-only config (calibration picks and reasons, anchors, weights, out-of) is read from the **draft** lesson on the server and stripped from the student copy at publish. The block must also exist in the published lesson. | The published lesson is the student copy, so it can't hold answers the students are about to be asked. Same live check as peer feedback. |
| D6 | One server blob per judge (`judges/{key}`), written only by that judge. The round blob is written only by the teacher. | No races between students; matches peer feedback's one-writer rule. |
| D7 | **Bradley–Terry by MM with a weak prior**: every item gets 0.5 of a virtual win and 0.5 of a virtual loss against a fixed reference. θ = log strength, centred at 0. SE from Fisher information. | Plain MM diverges for an answer that wins (or loses) every time, which is common with few comparisons. The prior keeps estimates finite and shrinks thin evidence towards the middle. |
| D8 | **Reliability shown two ways**: SSR = (var θ − mean SE²) / var θ, and **split-half**: judges split at random into two halves, each half fitted, θs correlated, Spearman–Brown corrected, averaged over 20 splits (needs ≥ 4 judges). | SSR is inflated by adaptive pairing (Bramley 2015); split-half across judges is the check recommended for that (Verhavert et al. 2018). |
| D9 | **"Reliable enough" signal** uses the lower of the two when split-half exists: ≥ .80 "Reliable enough for marks", ≥ .70 "Reliable enough for feedback", else "Keep judging", with average comparisons per answer and a hint of how many more judgements it would take to reach ~12 per answer. | Common CJ thresholds (.70 formative, .80 summative). Showing comparisons per answer lets the teacher stop when it stops adding value. |
| D10 | **Adaptive pairing after a warm-up.** Until every eligible answer has 3 comparisons, pick the least-compared answer and a random partner (least-compared preferred). After that, pick the least-compared answer and choose its partner at random, weighted by exp(−(Δθ)² / 0.5), among pairs this judge hasn't seen. Left/right is random. | Random start avoids locking in early noise; close pairs carry most information (p ≈ .5); weighting rather than "always closest" limits SSR inflation and keeps variety. |
| D11 | A judge never sees their own answer and never the same pair twice (either order). A student stops being offered pairs at 2 × their target. | Brief; also bias (people favour their own work). |
| D12 | **Calibration first (students)**: up to 3 teacher-written anchor pairs. The student picks, then sees "You chose B. Your teacher chose A because …". Calibration choices are stored but **not** used in the fit. | Builds shared standards before judging (Sadler). Calibration texts are teacher exemplars, so no student work appears before the round. |
| D13 | **Before judging, students predict** whether their own answer sits in the top, middle or bottom third. Skipped when they have no answer in the pool. | Prediction then feedback is a calibration exercise for self-assessment. |
| D14 | **Reasons, not just clicks**: an optional one-line reason and criterion chips the teacher sets, tickable under **each** answer ("what this answer does well"). Teacher view shows, per chip, how often it was ticked on the winning side vs the losing side. | Chips on both sides let the class see which features separate winners from losers, not just which features are common. |
| D15 | **Judge misfit** (teacher only): infit mean square per judge = Σ(x − p)² / Σ p(1 − p). Flagged when > mean + 2 SD across judges with ≥ 3 judgements each (needs ≥ 3 such judges). When "Down-weight misfitting judges" is on (default), flagged judges' choices count 0.5 and the scale is refitted once. | Pollitt (2012) uses infit > mean + 2 SD. One refit keeps it stable and explainable. |
| D16 | **Teacher judges too**, in the same blind view. Teacher judgements are weighted 1×, 2× (default) or 3×. | Teacher judgement carries more evaluative experience; weighting rather than overriding keeps the class's judgements in the scale. |
| D17 | **Contrasting cases on Display**: "Talk about this pair" shows the most contested close pair (judged ≥ 2 times with the split nearest 50/50; otherwise the two neighbouring answers with the smallest θ gap), as Answer A and Answer B. "Strong answers" shows the top 3 student answers. No names, ranks or numbers on Display. | Contrasting cases make quality features visible for whole-class talk; anonymous so nobody is singled out. |
| D18 | **Reflect after judging**: one improvement the student would now make to their own answer. A button takes them to their answer to make it (same lesson: scrolls to the block; other lesson: opens it). | The existing redraft flow starts from the teacher returning a marked piece (`piece_feedback`), so it can't open cheaply from here. Going straight to their own answer is the cheap route and keeps their writing in one place. |
| D19 | Students **never see a rank number** or anyone's name. Their own third is shown only when the teacher turns on "Show students their third" (off by default) and the scale is "reliable enough for feedback". | Ranking is sensitive; the third is coarse and only shown when the scale can bear it. |
| D20 | **Anchors and marks**: the teacher can paste up to 6 anchor answers, each with an optional known mark. Anchors join the pool (judged blind like any answer) and are labelled "Anchor" to the teacher only. With ≥ 2 marked anchors spread over at least 2 marks, a least-squares line mark = a + bθ maps the scale to marks, clamped to 0..out of and rounded to 0.5. Push to Markbook makes an assessment column with one criterion ("Overall", max = out of) and writes each student's fitted mark. | Anchors fix the scale to known standards (common in CJ moderation). A straight line through anchors is the simplest defensible mapping; pushing marks is the teacher's explicit act. |
| D21 | All maths runs on the server in one pure module with no imports (`cj-maths.mjs`), unit-tested, and reused in the dev preview's fake server. No AI calls anywhere. | Adam rejects runtime AI cost; pure module is testable and portable. |
| D22 | Print: the criterion, the chips, and each calibration pair side by side with "Which is better? Why?" lines. No student answers print. | A sensible paper version of calibration; student work never goes to paper by accident. |
| D23 | Classes without a list can't take part ("Your teacher hasn’t added a class list yet"). | Nobody can be told apart, so "never your own answer" can't hold. Same rule as lesson work. |

## Block content (`comparative_judgement`)

```ts
content: {
  title?: string                         // max 200
  source: { lesson_id: string; block_id: string; question_id: string }  // lesson_id '' = this lesson
  criterion: string                      // max 300, default 'Which answer is stronger overall?'
  chips: string[]                        // max 8, each max 40; default ['Precise quote', 'Clear argument', 'Analyses effect']
  calibration: Array<{ id: string; left: string; right: string; better: 'left' | 'right'; reason: string }>  // max 3; texts max 4000, reason max 300
  anchors: Array<{ id: string; text: string; mark: number | null }>      // max 6; text max 4000
  per_student: number                    // int 4..20, default 8
  show_third: boolean                    // default false
  teacher_weight: 1 | 2 | 3              // default 2
  downweight_misfits: boolean            // default true
  out_of: number                         // 1..100, default 20
}
```

Student copy (visibility.ts): `calibration` keeps only `id`, `left`, `right`; `anchors`, `teacher_weight`, `downweight_misfits`, `out_of` go.

## Server storage

```
cj/{lesson}/{block}/{class}/round          { open, salt, started_at, refreshed_at, source, pool: { [itemId]: { text, kind: 'student'|'anchor', ref } } }   teacher only
cj/{lesson}/{block}/{class}/judges/{key}   { calibration: [{ id, choice }], prediction, judgements: [{ left, right, winner, chips: { left: number[], right: number[] }, reason, at }], reflection, at }
```

`key` is `s_{studentId}` for a student, `teacher` for the teacher.

## Endpoints

- Student: `POST /api/published/comparative-judgement/:lesson/:block` (public student gate, rate limited, listed in `public-student-routes.mjs`). Body `{ class_id, class_token, action, … }`. Actions: `status`, `claim`, `calibrate { index, choice }`, `predict { third }`, `next`, `judge { left, right, winner, chips, reason }`, `reflect { text }`.
- Teacher: `POST /api/lessons/:lesson/comparative-judgement/:block` (operator gate). Body `{ class_id, action, … }`. Actions: `classes`, `status`, `start`, `refresh`, `close`, `open`, `next`, `judge`, `results`, `display`, `push_marks { title }`.

Phases a student moves through: `closed` → `calibrate` → `predict` → `judge` → `reflect` → `done`.

## Teacher view

Class picker, then: Start judging / Refresh pool / Close; pool size and anchors; progress per student (judged / target, calibrated, predicted, reflected); "Judge a pair" (teacher judging, blind); Results: the reliability signal, ranked list (names to the teacher; anchors labelled), what made winners win (chips), judges to check (misfit), predictions vs actual third, reflections, marks mapping and Push to Markbook. Display mode shows only "Talk about this pair" and "Strong answers".

## Not in this build

- Item (answer) misfit shown to the teacher (computed, not displayed beyond the contested pair).
- Using calibration agreement to weight judges.
- Opening the existing redraft flow (D18).
- Real-class, live and Safari walks: unwalked until Adam runs it with a class.
