# Deep understandings (Willingham) — design

Date: 1 November 2026
Mockup: [`docs/mockups/deep-understandings.html`](../../mockups/deep-understandings.html) (Plan, Monitoring and Make one views; desktop and 390px)

## Why

The unit plan's "Framework lenses for this unit" buttons (`renderFrameworkLenses` in `apps/teaching/src/blocks/walkthru-note/planning.ts`, called from `apps/teaching/src/teacher/sections/units.ts`) drop a rich text block of student prompts into the plan. They don't plan anything. This is the first of five reworks, one per framework. Willingham comes first; Rosenshine, MARGE, Wiliam and Berger follow, each with its own spec.

Willingham's point: students start with shallow knowledge tied to the example they met it in, and only become flexible (deep) with many examples, comparison and retrieval. It can't be done for every fact in every lesson. So a unit picks **three or four deep understandings**, backward maps each one to the concrete knowledge it rests on, places that knowledge and the steps towards depth in lessons, and tracks every student along each one separately.

## What a deep understanding is

A unit-level record with:

- **Claim.** One sentence a top response would argue, naming what the composer does and what it does to meaning, in words that still make sense about an unseen text. Not a theme.
- **Why this one.** One line the teacher can say to a head teacher or parent.
- **Links.** At least one of the unit's syllabus dot points and at least one concept bullet. The pickers list only the dot points ticked on this unit and the concept bullets the syllabus links to those dot points (shown "via U4"). No catalogue-wide search: to use another dot point, add it to the unit first. Deep understandings are separate from the unit's textual concept lines.
- **Knowledge pieces.** Concrete facts, each in a tier:
  - Essential — the claim can't stand without it.
  - Strong — most of the class should hold it.
  - Sophisticated — extension students bring it into writing. Never counts towards Step 1.
  Aim for 8–12 Essential + Strong. A piece can belong to more than one deep understanding in the same unit.
- **Steps.** The same five for every unit, each with a unit fill-in line (what a student at this step would say about this unit) and an evidence task:
  1. Know the pieces
  2A. Explain it in one text
  2B. Explain it in a second text (breadth, not a new level)
  3. Compare when prompted
  4. Spot and use it unprompted (spot it in an unseen text, and use it in composition; record whether a hint was needed)

## Where knowledge pieces are taught and tested

No lesson dropdowns: a unit can hold 40–50 lessons and a piece lives in several of them.

- **Taught** = lessons containing a block tagged with the piece. The main route is tagging from inside the lesson editor (the block's tag control offers the unit's pieces). The Make one view also has a lesson finder: search by number, name or week, list grouped by week, tick many.
- **Tested** = lessons holding quiz items tagged with the piece, with an item count. Never set by hand. No items → a "Write items" button.
- **Step placement** comes from the evidence task: pick the task (a writing or quiz block) and its lesson and week come with it.

## Tags

New evidence tag kinds alongside `dp:`, `skill:`, `tech:`, `out:`, `fam:` in `apps/teaching/src/evidence/tags.ts`:

- `kp:<pieceId>` on quiz items and teaching blocks.
- `du:<duId>:<step>` on evidence tasks (`step` ∈ `2a`, `2b`, `3`, `4`).

`kindOf`, the tag labeller and the tag pickers learn both. Labels read from the unit's deep understandings.

## Data

`UnitSchema` (`apps/teaching/src/schemas/unit.ts`) gains an optional `deep_understandings` array (max 4):

```ts
{
  id: string,
  claim: string,
  why: string,
  dot_points: string[],      // min 1, from this unit's dot points
  concept_bullets: string[], // min 1, e.g. 'REP2'
  pieces: { id: string, text: string, tier: 'essential' | 'strong' | 'sophisticated' }[],
  shared_piece_ids: string[],          // pieces owned by another deep understanding in this unit
  steps: { step: '2a' | '2b' | '3' | '4', fill: string }[],
  // Steps the teacher has passed a student on, keyed by student. Step 1 is computed, never stored.
  student_steps: Record<string, { step: '2a' | '2b' | '3' | '4', at: string }>
}
```

Taught, tested and evidence placements are not stored here; they are derived from tags on lessons.

## Tracking a student

Students are tracked separately on each deep understanding.

**Piece circles** (per student, per piece), from `kp:` evidence:
- half green — right once
- full green — right on two separate days
- amber — wrong at last check (memory jog); feeds the next auto-picked retrieval quiz
- faded — not checked lately; also feeds retrieval
- solid outer ring — used in writing
- dashed outer ring — expected in a writing task and not used (an integration gap); hidden while amber

Evidence comes in three kinds: recognise (multiple choice with close distractors), cued recall (a hidden probe short-answer question whose marker view shows "Looking for: [piece]") and uncued use in writing (the teacher picks 2–3 target pieces per extended task and ticks used or not used when marking).

**Step 1 exit:** every Essential piece full green, and 80% of the Essential + Strong pieces introduced so far.

**Steps 2A–4** move only by teacher action from the evidence task's marking. Nothing moves a student back automatically. Leaving a piece out of writing is not forgetting: it becomes a dashed ring and a personal next step through the existing next-step feedback engine.

## Screens

**Plan (unit page).** Deep understanding cards (claim, why, link pills, peach gap warnings), "+ Deep understanding". An "Across the lessons" grid with one column per week (lesson count under each week), showing where each step sits and the gaps. The expanded card shows knowledge pieces by tier, the exit rule and the step ladder.

**Monitoring.**
- "What this unit is built to deliver": each deep understanding with claim, why and links, plus "Copy as a summary paragraph".
- "All three at once": one grid of every student against every deep understanding ("Ahead on X / behind on Y").
- "Where each student is": pick a deep understanding; step lanes 1, 2A, 2B, 3, 4, each with an ⓘ that says what to do with that group; student chips with pips, "4 wk" age and "N not used". Clicking a chip opens the evidence for the step, "known, not used" with the task it was missed in, and Next move (Send as a next step, Set a redo, Add to a regroup).
- Groups: "Doesn't remember it" and "Knows it, doesn't use it".
- Knowledge pieces table: Step 1 bar with the 80% line and the circle key.

**Make one.** Sections: 1 Claim (with claim checks) and Why; 2 Link it to the syllabus; 3 Knowledge pieces (tier control, text, Taught/Tested chips, lesson finder, "+ Use a piece from another deep understanding"); 4 Place the steps (fill-in, evidence task picker, teach chips with suggestions). The side panel "Ready to teach?" lists the gaps; it stacks under the form on narrow screens. A deep understanding shows on the plan as soon as it has a claim; gaps stay as peach warnings.

**Lesson editor.** The block tag control offers the unit's knowledge pieces and "Counts as evidence for step N". A "Builds towards" line on the lesson shows which pieces and steps it carries.

## What goes

- `renderFrameworkLenses` and `addFrameworkLens` for Willingham. The other four buttons stay until their own reworks.
- The `WILLINGHAM` student lens in `apps/teaching/src/blocks/lenses/framework-lenses.ts` stays; it is a lesson-level student prompt, not unit planning.

## Out of scope

- AI marking of one-line short answers. Probe items use the existing `accepted[]` list and manual marking. Any AI marking job needs its own plan and an A$ cost first.
- Ann writing knowledge pieces or quiz items. Adam writes them; Ann may advise.
- The other four frameworks.

## Testing

- Schema: `deep_understandings` validates and rejects a deep understanding missing a dot point or concept bullet; older units without it still load.
- Tags: `kp:` and `du:` parse and label; unknown IDs label as the raw value.
- Derivation: taught and tested lessons and step placement come out of tagged lessons; a piece shared by two deep understandings counts in both.
- Circles: half/full/amber/faded/ring/dashed from evidence fixtures, including two answers on one day counting as one day.
- Step 1 exit: Sophisticated ignored; only introduced pieces count; one Essential below full blocks the exit.
- Browser walk of Plan, Monitoring and Make one at desktop and 390px, plus tagging from the lesson editor.
- Fixtures use invented students and synthetic records only.
