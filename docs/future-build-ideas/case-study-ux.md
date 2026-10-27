# Case Study: student experience and setup

Companion to [case-study-pedagogy.md](case-study-pedagogy.md). That doc says *what* a case study is for and which modules serve which outcome. This one says how Teaching should play it: the look and feel, the student screens, which existing blocks fill which module, what is new, how a teacher sets one up, and how it runs both in class and at a student's own pace.

**Status:** concept doc. Nothing builds from this yet. Clickable mockups: the student side, [case-study/mockup.html](case-study/mockup.html), and the teacher's builder for Flow A, [case-study/builder.html](case-study/builder.html).

---

## 1. Look and feel

A case study looks like every other Teaching lesson: the same banner hero with the title on it, the navy class card, white block cards, Inter, pastel chips, and the dotted glyph rail that the sprint, Problem Solver and Decision Maker already use. What makes it a case study is the **layout and the moves**, not a new visual style. (An earlier mockup tried manila folders, envelopes and stamps. It read as a game, so it was dropped.)

### Two columns: the case and your work

- **The case** is the left column: each document is an ordinary block card with a pastel type chip (Memo, Data, News, Transcript, Update) and its source line. A part that hasn't opened yet is the lecture's dashed hidden-beat card with a lock and one line saying what opens it.
- **Your work** is the right column, a sticky panel, so the evidence never scrolls away while the student reasons. Other lesson types put content and activity in one stream; this one keeps them side by side.
- **Phones:** one column, with a two-button switch fixed at the bottom (**The case · Your work**), styled like the lecture's bottom bar. A small orange dot on **The case** says something new has arrived there. Selecting text in the case and tapping **Use as evidence** jumps back to your work with the quote added.

### The rail

Five stations with the student-facing names **Brief · The case · Decide · Outcome · Rules** (Frame, Meet, Work, Test, Extract). Same behaviour as the sprint rail: the current station breathes and is underlined, done stations get the green tick, later ones are faded and can't be opened. The line under each station says where it stands ("Part 2 to come", "Locked 2:41 pm", "After one objection").

### The moves

- **Help on every step.** A small **?** sits at the top right of every step in the work column. It opens the sprint's coach (`sprint/form-kit.ts` `coach()`):
  - a "Do this" line;
  - three folds: **💡 Why this step**, **👀 See an example** and **🆘 I'm stuck**.

  Examples use an invented topic, so they never give away the case, which is the same rule as the sprint's guidance. The help text comes built in for each stage, and the teacher can rewrite it in the builder. Nobody working at home is left stranded on a step they don't understand.
- **Use as evidence.** Select a line in any document; a small dark button offers to add it. Quotes sit in your work as pastel-blue chips with their source, and the document they came from shows **Cited**.
- **Lock in.** The decision is the usual option cards plus a confidence slider and a "Because…" box. **Lock in my decision** turns it into a quiet locked card: the choice, a confidence bar and the time it was locked. It can't be edited.
- **Outcome.** "What happened" arrives at the top of the case column as a card with a navy border and its source. Your work shows your first take beside what you locked in (peach if you changed your mind), the locked card again, and the class spread. Documents you never cited get a **Not used** chip.
- **Class rules.** The Extract stage shows the class's rules as block cards, each with pastel chips for the cases that tested it (Held, Needs a condition, Broke). You mark each rule against this case and write your own from a three-box frame.

### Settings and blocks underneath

It's a mode like the others: `pedagogical_mode: 'case_study'`, with `lesson.case` holding the stages, flow, case documents, decision, outcome, transfer case, pace and support. Inside the Decide stage the teacher drops ordinary blocks, and they render in the work column. Three things are mode-level and can't be blocks: the case column stays beside the work throughout, the locked decision is carried to the Outcome, and the class rules outlive the lesson.

---

## 2. Two paces: in class and on their own

A case study can be core (taught live), or a **support**, **extension** or **optional** lesson on the unit route, which a student often does at home on their own. The same lesson has to work both ways. One setting, `pace`, decides who turns the page (the same word the continuum line already uses):

| | **Teacher pace** (in class) | **Own pace** (at home or independent) |
|---|---|---|
| Who opens the next tab | Teacher, from the board | The student, when the current step is done |
| Unopened parts | Teacher releases | Open when the student answers the prompt before them |
| The Outcome | Teacher reveals to the whole room at once | Opens when the student locks in their decision. Optional: hold it until a date so the class sees it together |
| Class spread at the Outcome | Live, everyone in the room | Everyone who has decided so far. If fewer than 5, "You're early. Come back after [date] to see where others landed" |
| Discussion | Teacher-led, from the board's commit spread | Replaced by **the strongest objection**: the teacher writes 1–3 objections in setup. The student answers one before the Outcome opens. Ann can draft them in setup, with the usual cost confirmation. Ann does not argue live |
| Rebuttal round (T3) | `peer_feedback` between groups | Objection from the teacher's set, or from a classmate who has already decided (anonymous, as peer feedback does now) |
| "Teacher names the lens" (Flow B) | Teacher builds it on the board from the class's notice grid | Pre-written lens card that opens after the student's grid has at least 3 entries, then shows their entries next to it |
| Class rules | Proposed, teacher merges live | Proposed, then waits in the teacher's queue; student sees "Sent to the class rules" |
| Transfer check | Timed, in silence | Timer optional; still alone; still locked once sent |
| Leaving and coming back | n/a | Everything saves as they go. On return: "Back where you left off", open at the tab they were on |

A teacher-paced lesson can switch to own pace afterwards, for anyone absent. Their decision locks and the outcome opens the same way. They see the class spread at once because the class has already decided.

### Support, extension and optional

The route role sets sensible defaults, which the teacher can change. It uses the sprint's `support` setting (guided, standard, open) and the lens levels (support, core, extend) that already exist.

| Role | Default flow | Scaffolding | Case |
|---|---|---|---|
| **Support** (a detour for students who need it) | Short Flow A: Brief → File (whole case) → Commit → Outcome → Rule of thumb → Transfer check | `guided`: sentence frames on, lenses at support level, a worked first link in the cause trace, 2–3 option decision | An anchor case close to what they know (M4) |
| **Extension** | Flow B or C | `open`: no frames, lenses at extend level, free-text position rather than options, a counterfactual and a pre-mortem | Harder transfer case, further from the studied case on the surface |
| **Optional** | As built | `standard` | As built |
| **Core** | As built, usually teacher pace | `standard` | As built |

Support and extension students working on their own also see **their place in the unit**: a small line on the Brief tab saying which core lesson this branches from and which class rule it works on. The detour stays connected to the class's work.

---

## 3. Tab by tab

**Brief** (Frame). The question in the case's voice, large: "You are the head of the water authority. The dam is at 30%. What do you do?" Then the first take in the work column: a choice or prediction and one line of why. It's recorded and comes back at the Outcome ("You first said…"). The file is still closed.

**The case** (Meet). The case column fills. Whole case (M2): every document at once. Layered (M1): part 1, a short question in the work column, then part 2 opens. Case pair (M3): the case column splits into two, Case A and Case B, with matching sheets level so the eye compares across. Anchor-then-step (M4): the anchor case is labelled "You know this one" and opens first.

**Decide** (Work). The modules the teacher chose, one at a time in the work column, the case beside them. It always ends with locking in the decision (W5). Everywhere a student reasons, they can cite: select in the case, **Use as evidence**, and a quoted chip lands in the pad, linked back to its sheet.

**Outcome** (Test). The locked decision comes back: their decision and confidence, their first take if it changed, what actually happened with its source, and the class spread (no names). One prompt: "What did the case tell you that you didn't use?", with the sheets they never cited lightly marked. Then the pre-mortem or the strongest objection if chosen.

**Rules** (Extract). Write a rule of thumb from a frame: "When ___, ___ tends to follow, as long as ___." On a second or later case, mark each existing rule against this case: **held**, **needs a condition**, **broke**. Last, the unseen case: a fresh short case, answered alone. Its question includes "Which class rule helped?" That pick is the evidence of transfer in Kolodner's sense: spontaneous reminding of an earlier case.

### Across the unit

- **Class rules on the unit page**, each rule with chips for the cases that tested it. The second case teaches more than the first because students test the first case's rules against it.
- **Calibration.** Every locked decision carries a confidence. Across a unit, a strip shows how sure each student was and how it went, case by case. The aim is calibrated confidence; right answers matter less.
- **Unseen-case results in the markbook** as Starting · Showing · Strong, one column per transfer check.

---

## 4. Which block does which module

Blocks keep their behaviour but are rendered in the work column.

| Module | Fill with | Fit | Notes |
|---|---|---|---|
| **F1 Pose the decision** | **Decision** (new), first-take setting | new | Not locked, no confidence. |
| **F2 Predict** | Decision (first take) or `continuum_line` | good | Continuum suits a degree ("how likely…"); its re-place-with-why matches the Outcome's job. |
| **F3 Name the lens** | `definition`, `rich_text`, `thinking_move` | good | Skipped in Flow B by design. |
| **M1–M4 Meet** | **Case file** (new) | new | `card_stack` is the nearest block today but is display-only: no release, no citing, no pairs. |
| **W1 Notice grid** | **Compare grid** (new); `brainstorm` groups layout at a pinch | partial | Brainstorm can't sort "same / different / only A / only B". |
| **W2 Apply a lens** | `question_set` + a lens | good | Add **IRAC** and **Toulmin** to `STEPPED_LENSES`, an entry each. The Reasoning lens and reasoning-chart Format also fit. |
| **W3 Trace the cause** | **Cause trace** (new); `timeline` at a pinch | partial | Timeline orders events; it can't rate links or hold "what would change my mind". |
| **W4 Counterfactual** | `question_set` + **Counterfactual** Format | good | "If ___ had been different, then ___, because ___." |
| **W5 Commit** | **Decision** (new), locked setting | new | `hinge_question` needs a right answer and thresholds; a case decision has neither. |
| **T1 Reveal** | Outcome tab (mode screen) | new | |
| **T2 Pre-mortem** | `question_set` + **Pre-mortem** Format | good | |
| **T3 Rebuttal** | `peer_feedback` (class) or teacher's objections (own pace) | good | |
| **E1 Name the pattern** | `question_set` + **Rule of thumb** Format, or `analogy_transfer` | good | `analogy_transfer` suits extension. |
| **E2 Rules table** | **Class rules** (new, unit-level) | new | |
| **E3 Transfer check** | Second case file + `question_set` + rule picker | partial | |
| Discussion | `with_teacher`, `note_cue`, `thinking_reflection` | good | Teacher pace only; hidden at own pace. |

`past_rounds` can bring a decision or objection round back on a later day.

---

## 5. What's new

1. **Case file**: sheets by type (memo, table, clipping, image, transcript, timeline, short video), grouped into parts that open in turn, one case or two side by side, select-to-cite.
2. **Decision**: options or free text, confidence, reason with evidence chips. First-take and locked settings. Stored server-side like hinge answers.
3. **Class rules**: per class and unit. A rule has wording, conditions and a mark for each case that tested it. Proposals queue for teacher approval.
4. **Compare grid** and **Cause trace**.
5. **Own-pace engine**: student-driven unlocks, the Outcome's hold-until date, the "early" state for the class spread, resume.
6. Formats and lenses (registry entries): Counterfactual, Pre-mortem, Rule of thumb, IRAC, Toulmin.

---

## 6. The teacher's side

### Setting up a case (editor tabs)

1. **Purpose.** First field, required: *"On a case they haven't seen, students will be able to…"*. Tick the outcomes it leans on; the ticks suggest a flow. Pick **pace** and **support**. If the lesson already has a route role, these come pre-set from it (section 2).
2. **Case.** Write or paste the file, split into instalments. The decision and options. The outcome, **with a source**; publish is blocked without one. For a pair, a three-box **selection check**: shared structure, the two or three differences that matter, how the surfaces differ.
3. **Flow.** The five tabs as a column of module chips. Decision and Transfer check show a lock. Flows A, B and C are presets.
4. **Own pace.** Shown when pace is own, or when the route role isn't core: the 1–3 strongest objections, the lens card for Flow B, the Outcome's hold-until date.
5. **Transfer case.** A second short file plus the question. Reminder: same structure, different surface.
6. **Groups**, only for a group decision or rebuttal. Reuse sprint groups.

Ann can draft objections, counterfactual prompts, the pre-mortem and a first transfer case, and check the transfer case against the purpose, each behind the usual cost confirmation.

### The board

**Teacher pace:** release and reveal buttons. A commit spread: options across, confidence up, a named dot per student. Tap two confident dots on opposite sides to mark a pair for discussion. Evidence heat shows which sheets students cited and which they ignored. In Flow B, the notice grid board.

**Own pace:** a progress view: who is at which tab, decisions locked so far (with confidence), rule proposals waiting, transfer checks to mark. A support or extension case shows only the students routed to it.

---

## 7. Reuse from the other hubs

Much of this already exists elsewhere in Life Hub. **The catch:** Problem Solver, Decision Maker, Rules Book and Get Things Done keep their logic and renderers in `packages/*`, but they're built around coach sessions in Tasks. So these are mostly "import the renderer and feed it case data" or "copy the pattern", not drop-ins.

| Case study piece | Reuse | How |
|---|---|---|
| Select-to-cite | `packages/design-kit/js/hub-pdf-viewer.js` (selection → `{quote}` → `onHighlight`); `apps/teaching/src/blocks/peer-annotate.ts` (tap or drag to pick words) | Copy the pattern for HTML documents. The PDF viewer can be used as-is if a teacher uploads the case as a PDF |
| Image and map documents | `hub-media-viewer.js`, `hub-image-annotate.js`, `hub-places-map.js` | Drop-in; the map needs its config |
| Confidence slider | `design-kit/js/adaptive-slider.js` (`createAdaptiveSlider`) | Drop-in |
| Locked decision card | `packages/decision-book/render/record.ts` (decision record with reasons, "If… then…" band, review date); `packages/problem-solver/render/choice-card.ts` | Copy the layout |
| "What would change my mind" | `packages/rules-book/render/commit.ts` ("What would overturn it" band) | Copy |
| Strongest objection, pre-mortem | Problem Solver's objection / contested node; `render/force-field.ts` (forces for and against) | Model and visual idea |
| Class spread, first take vs locked | Decision Book `plot` (points on two axes), `scales` (overlaid series, dated mode), `tension` gap (expected vs actual) | Adapt to options × confidence |
| Calibration across a unit | Life chart kit (`apps/life/js/app/chart-kit/`): bullseye rings, consistency strip, range bar | Promote the type to the shared library first, as `design-kit/CHARTS.md` requires |
| Cause trace | `packages/graph-blocks` (`LINK_VERBS` already has "causes", "leads to", "depends on"); `problem-solver/render/causal-map.ts` (strong links drawn thicker); `five-whys.ts` with evidence notes | Use graph-blocks and add a link strength (strong, weak, assumed) |
| Compare grid | `problem-solver/render/decision-matrix.ts` (grid with one-column pill tabs on phones); Professional's `organisations-compare.ts` | Copy the layout |
| Class rules, marked per case | Rules Book `tools/review.mjs`: what happened → did your reading hold → keep, adjust or drop, and what would make you drop it | Maps almost one to one onto Held / Needs a condition / Broke. Copy the model and the record shape from `catalogue.mjs` |
| Rail | `apps/teaching/src/sprint/rail.ts` (`buildRail`, `railState`) | Not shared today: Tasks has a copy in each tool's `decor.ts`. Generalise the Teaching one to take a station list and marks |
| Rail marks | Glyph sets in `packages/{problem-solver,decision-book,rules-book,get-things-done}/glyphs` | Pick or draw five in the same style |
| Teacher board | `sprint/group-board.ts` (spotlight without names, hold and release), `phase-decide.ts` (dots) | Copy |
| Ann drafting | `apps/teaching/src/ai/` (proposals, block recipes, jobs) and `alchemy/` | Reuse for drafting objections and the transfer case, behind the cost check |
| Chart help | `hub-chart-info.js` ("i" note on a chart) | Drop-in |

The biggest win is **Rules Book's review**: its three steps are the Extract stage almost word for word. The case study could share the rule model with Rules Book rather than inventing a second one.

---

## 8. Build order (if it's built)

One PR, phases as commits:

1. Mode shell: the two-column layout, rail, case documents, Decision block, the Outcome view, `lesson.case` settings and editor tabs, both paces. Runs a support-style Flow A with existing blocks.
2. Formats and lenses: Counterfactual, Pre-mortem, Rule of thumb, IRAC, Toulmin.
3. Class rules (storage, Rules stage, unit page) and transfer check with rule picker and markbook column.
4. Compare grid, two-case pair layout (Flow B), Cause trace.

The mockup comes first (desktop and 390px); get it approved before phase 1.

---

## 9. Questions for Adam

1. **Individual or group decision?** Proposed: individual by default, group as an option for the rebuttal round.
2. **Own-pace Outcome:** open straight after locking in (proposed), or hold for the class by default?
3. **Class rules scope:** per class and unit (proposed), or per course so it carries into the next unit?
4. **Calibration strip:** visible to students, or teacher-only at first?
5. **Can a support student see the core lesson's class rules,** or only the ones from cases they did?
