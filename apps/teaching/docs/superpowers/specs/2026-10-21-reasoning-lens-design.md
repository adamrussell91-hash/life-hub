# Reasoning: a lens and a question set Format

Date: 21 October 2026
Status: design, mockups approved by Adam (21 Oct)
Scope: Teaching block engine. Builds on the lens registry and Format control (PR 1013).

## Why

Students meet deductive, inductive and abductive reasoning across English,
maths, science and philosophy, but rarely see the shape of their own
thinking. Adam's reference is the "Types of Logic" chart: deductive goes from
the general to the specific (one box branching into many), inductive from the
specific to the general (many boxes joining into one), abductive joins
scattered clues into a best explanation (a dot network ending in an insight).
Deductive and inductive are the more analytical end; abductive the more
creative.

Students **build that chart** one small step at a time, then **write up the
response in their books** with a sentence frame. Three levels.

Sources in Adam's notes: *Argument Forms and Fallacies* (Hanscomb: plausible
arguments, hidden premises, Acceptable / Relevant / Sufficient), *A Framework
for Mathematical Proof* (induction spots the pattern, abduction proposes why,
deduction verifies), *Reasoning* (valid versus sound).

## Two surfaces, one engine

| Surface | What it is | Where it lives |
| --- | --- | --- |
| **Reasoning lens** | Attaches to an existing block, like Windows & Mirrors. | `src/blocks/lenses/reasoning.ts`, one entry in `STEPPED_LENSES` |
| **Reasoning chart Format** | A question set shape. Each question gets its own chart and Write it down. | `question_set` formats in `src/blocks/formats/registry.ts`, renderer in `src/blocks/formats/reasoning-chart.ts` |

Both read from one shared module, `src/blocks/reasoning/`:

- `types.ts`: logic type ids `deductive | inductive | abductive | all_three`,
  plus `choice` where the student picks.
- `steps.ts`: the steps for each type at each level (data only).
- `examples.ts`: the Hunger Games worked examples, one per step per type.
- `chart.ts`: draws the chart from the steps and the student's answers
  (screen and print).
- `walk.ts`: the step panel (question, hint, example, box, check, Back / Next),
  shared so the lens and the Format behave the same.

No new block type, no new menu button.

## The three charts

Each chart takes the shape of its diagram. Nodes are the student's own words.
Finished nodes are white cards; the current node is pastel blue with a wave
border; future nodes are dashed outlines. Connectors are drawn in SVG.

| Type | Shape | Nodes (Standard) | Colour |
| --- | --- | --- | --- |
| Deductive | One box branching out (general → specific) | Rule → This one → So it must | Pastel blue |
| Inductive | Many boxes joining (specific → general) | Example 1, 2, 3 → Pattern → So probably | Pastel blue |
| Abductive | Dot network → dotted line → insight | Clue 1, 2, 3 → Maybe 1, 2 → Best explanation | Pastel peach |

Above the chart, a quiet axis label names the direction (Specific → General,
General → Specific, Clues → Best guess). On phones (under 40rem) the chart
turns vertical: inputs stack above the node they feed.

**All three** chains the charts in proof order: inductive (spot the pattern),
then abductive (explain why), then deductive (check it must follow). Each
chart's conclusion seeds the next chart's first node. Offered at Core and
Extend only.

## The steps

One plain question per step. Every step has: a title (the node name), a
question, a hint on where to look, a Hunger Games example, and a sentence
starter. No step uses a bare technical word: "Case" is never a label.

### Inductive

1. **Example 1.** Find a moment where something happens. *Hint:* who is
   involved, and what happens to them? *Starter:* In ___, ___ happens to ___.
2. **Example 2.** Find another moment where the same kind of thing happens.
3. **Example 3** (Core, Extend). Find one more. Three examples make a stronger
   pattern than two.
4. **Pattern.** What is the same in every example? *Hint:* read them side by
   side, ignore what is different; what is left is the pattern. *Check:* tick
   each example the pattern fits; ticked cards show "✓ fits" on the chart.
   *Starter:* Every time ___, ___.
5. **So probably.** If the pattern keeps going, what happens next? Pick how
   sure: Certainly · Probably · Possibly. *Starter:* So ___ will probably ___.
6. **Break it** (Extend). What could make this time different?

### Abductive

1. **Clue 1.** What is strange or surprising? *Starter:* It is strange that ___.
2. **Clue 2.** Find another detail about the same person or event.
3. **Clue 3** (Core, Extend). Find one more. A clue that seems to go against
   the others is useful.
4. **Maybe 1.** What could explain your clues? *Starter:* Maybe ___.
5. **Maybe 2** (Core, Extend). Think of a different reason.
6. **Test.** Which maybe explains the most clues? A tick grid: clues down the
   side, maybes across the top. Skipped at Support (one maybe).
7. **Best explanation.** *Starter:* I think ___ because it explains ___.
8. **Prove me wrong** (Extend). What detail would break your explanation?

### Deductive

1. **Rule.** What is always true in this world? *Hint:* words like always,
   every, must. *Starter:* In ___, every ___ must ___.
2. **This one.** Who or what does the rule apply to here? *Starter:* ___ is a ___.
3. **So it must.** Put the rule and this one together. *Check:* does it
   really have to follow? (ticks against Rule and This one). *Starter:* So ___ must ___.
4. **Hidden gap** (Extend). Is the rule really always true? Valid is not the
   same as sound: name the exception the rule leaves out.

### Worked examples (Hunger Games, a text students already know)

- Inductive: District 12 tributes died on day one last year · only one
  District 12 winner in fifty years · District 12 tributes are thinner than
  the Careers → Every time District 12 sends tributes, they lose → Katniss
  will probably die. Break it: she can hunt, and Haymitch starts helping.
- Abductive: Haymitch is drunk at the reaping · mocks Katniss and Peeta ·
  starts helping once they stand up to him → Maybe he is cruel / Maybe he has
  watched every tribute he mentored die → the second explains all three clues.
- Deductive: every year one girl from each district must go → Prim is a girl
  from District 12 and her name was drawn → Prim must go. Hidden gap: anyone
  can volunteer, and Katniss does.

Teachers can replace the example per level (as Windows & Mirrors allows).

## Levels

Teacher sets the level; students may switch (More help / Standard / Stretch)
unless the teacher turns that off. Same rule as other lenses.

| | Support · More help | Core · Standard | Extend · Stretch |
| --- | --- | --- | --- |
| Worked example | Always shown | Behind "Show me an example" | Hidden |
| Sentence starter | Pre-filled in the box | Faint text under the box | None |
| Evidence nodes | 2 examples / 2 clues | 3 | 3 |
| Abductive maybes | 1, no test grid | 2 + test grid | 2 + test grid |
| Extra step | none | none | Break it · Prove me wrong · Hidden gap |
| Write it down | Sentence frame | Sentence frame | Writing challenge |

Next is refused, with an inline message, when the box is empty or still
holds the untouched starter.

## Write it down

Every walk ends in Write it down (the existing lens step): the finished chart
stays above as the plan, then the frame or challenge, a checklist, Copy, and
the handover line telling them the page will not keep their answer.

| Type | Support frame | Core frame | Extend challenge |
| --- | --- | --- | --- |
| Inductive | Every time ___, ___. So ___ will probably ___. | In ___, ___ and ___, ___ happens, so ___ probably ___. | Two sentences: the pattern and its conclusion, then the case that could break it. |
| Abductive | The clues are ___ and ___, so I think ___. | The best explanation for ___ is ___, because ___. | Two sentences: your explanation and why it beats the other, then what would prove it wrong. |
| Deductive | Because ___, and ___ is ___, ___ must ___. | Because ___ always ___, and ___ is ___, it must be that ___. | Two sentences: the argument, then whether its rule holds up. |

Checklists (Core): names specific evidence from the text · uses the type's
signal word (must / probably / best explanation) · explains rather than
retells. Extend adds: names the weakness (break, wrong, gap).

## The lens

- `id: 'reasoning'`, label **Reasoning**, group **Thinking**, symbol: the
  chosen type's diagram drawn small (the picker uses the inductive tree).
- Config (`ReasoningConfigSchema` in `src/schemas/lens.ts`): `focus`,
  `logic: deductive | inductive | abductive | all_three | choice` (default
  `choice`), `level`, `student_level`, `mode`, `prompts`, `supports`,
  `examples` (same override shape as Windows & Mirrors).
- Setup: a **Logic** pill row (Deductive · Inductive · Abductive · All three ·
  Student's choice) and the example preview, like Windows & Mirrors'
  Answer with.
- Student's choice opens on the three diagram cards on the analytical to
  creative line (mockup 1), then the chosen walk.
- Peer feedback: the reader names which logic the writer used, finds the
  evidence and the conclusion in their words, and judges whether the step
  between them holds (Extend: what one change would strengthen it).

### Engine change

The stepped engine renders text steps. Reasoning needs the chart above the
steps and two non-text steps (the fit check and the test grid). Add two
optional hooks to `SteppedLens` in `src/blocks/lenses/types.ts`:

- `header?(config, ctx, notes) → HTMLElement`: drawn above the step panel and
  redrawn when notes change. Reasoning returns the chart.
- `stepInput?(step, ctx, notes, update) → HTMLElement | undefined`: a custom
  input for a step; `undefined` falls back to the textarea. Reasoning returns
  the tick list and tick grid. Ticks are stored in `notes` as JSON strings
  under the step id.

Kaplan and Windows & Mirrors do not implement them and are unchanged.

## The Format

- New `question_set` format `reasoning_chart`, label **Reasoning chart**,
  hint: "Each question gets a logic chart students build step by step, then a
  sentence frame to write it up."
- Schema: `format` enum gains `reasoning_chart`; `QuestionItemSchema` gains
  optional `logic` (same enum as the lens, default `choice`); question set
  content gains optional `reasoning: { level, student_level }`, kept when
  switching format away and back (as `table` is).
- Editor: each question row gets the Logic pill row when this format is
  chosen; the block gets one level control.
- Student view: each question shows its prompt, the chart, and the step panel
  inline (no chip to open it). One question's walk is open at a time; the
  others show their chart so far.
- Answers stay on the device only, keyed
  `${lesson}.${block}.format.reasoning_chart.${questionId}`, like the other
  formats.

## Print

Chart drawn with empty nodes and ruled lines inside each; under it the
numbered step questions with hints (examples at Support only), then the
frame or challenge, ruled lines and the checklist. Student's choice prints
all three diagram cards with "Circle one".

## Style

Matches `kaplan.css` (cotton glass): paper panel with the wave left border,
underline step tabs, navy question, "For example" eyebrow with an italic
example, glass input, navy Next button that names the next step
("Next: So probably"). Chart cards use white, `--pastel-blue` and
`--pastel-peach`. New rules go in `src/styles/reasoning.css`; no new tokens.
Check against `docs/CURSOR-UI-FAILURES.md` before review.

## Out of scope

- Saving student answers to the server.
- AI marking or feedback on the chart.
- The Inference Loop ("If X, then what does it mean?"); a separate lens later.
- Lenses in Tasks and Professional (`classroomExtras()` keeps them off).

## Testing

- Unit: steps per type and level (counts, Extend-only steps present only at
  Extend), Next refusal on empty or untouched starter, test grid ticks
  saved per clue and maybe, schema defaults and
  round-trip of `logic` per question, format switch keeps `reasoning`.
- Browser (Playwright): walk inductive at Standard to Write it down on desktop
  and 390px; abductive test grid; Student's choice picker; print snapshot.
- Visual check in the preview at desktop and 390px before the PR.
