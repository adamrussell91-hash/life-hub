# Meeting Guides: design

23 October 2026. Professional hub, meeting page.

## Why

In a meeting with a student, Adam wanted to work out the student's motivation type and had nothing at hand. The theory is in his EDST5321 notes (Notion, University Hub). The tool should be quick to pull up mid-meeting, walk him through the right questions, and end in a drawn result, as polished as Problem Solver and Decision Maker.

## Decisions (Adam, 23 Oct)

- **A shelf of guides.** Motivation is the first. More guides follow the same way.
- **Not a block.** Blocks are shared with Teaching, and this is only ever used in meetings.
- **Adam drives.** He asks the prompts out loud in his own words and taps what he hears. The student never fills anything in.
- **One run, one context.** A run gives a mix across the whole continuum for one context, named in a free-text box ("English", "quesadilla making"). There is no per-subject grid. Another context is another run.
- **The placement is Adam's.** Taps suggest a mix and he sets the final bars. No AI places a student on the continuum.
- **An extra check for the hard call.** The guide includes a step to separate introjected from identified regulation.
- **Reuse the Decision Maker engine, slimmed.** Use its chart core and scales chart, and leave its coach, session machine and task links behind.
- **The result is a drawn card with suggestions.** It is saved on the meeting page and reaches the student's profile through the tag In the room already gives.
- **The AI writes moves, not labels.** When Clare drafts the meeting summary, she reads the card and writes suggested next moves. She never writes "he has an introjected motivation style".

## Sources (Adam's Notion, paraphrased, cited in the guide)

- EDST5321 Week 3 lecture covers the six-point continuum, autonomous vs controlled, the RAI, multiple motives, and the student-voice example for each type. Taylor et al. (2014): identified regulation predicts achievement more strongly than intrinsic. Vansteenkiste et al. (2009): motivation profiles.
- McGregor, Jung & Evans (2025), *Motivational profiles of gifted students in science* (Gifted Education notebook), uses the CRAI with gifted NSW students. Four profiles: low motivation; low self-determination with control; high self-determination; high self-determination with high motivation. Need-supportive teaching predicts the autonomous profiles.
- Vansteenkiste et al. (2018), *Fostering personal meaning and self-relevance* (EDST5321 note): the continuum is not a stage model, and pressure is not an on-ramp to valuing. Introjection is a mixed blessing. Autonomy-supportive moves: a specific rationale from the student's own goals, acknowledging negative feelings, invitational language, choice. Rationales work best after the student's view is heard.
- EDST5321 Week 2: the undermining effect, and informational vs controlling limits.

The repo is public. The guide text is our own wording with citations, and no lecture text is copied.

## 1. Where it lives

- A **Guides** button in the meeting page's during-meeting strip (`apps/professional/src/views/meeting-page.ts`, beside **✎ Read a photo**). It also shows after the meeting, so a guide can be filled in straight afterwards.
- It opens a side panel. On a phone (390px) the panel takes the full screen.
- The panel's first view is the shelf: one card per guide, each with its emblem, name and one line. The shelf has one card at launch, Motivation (SDT).
- The panel needs a tagged attendee. With one student in the room it picks them. With several, it asks which person this run is about. With nobody, it says "Add them to In the room first" and links to the room.

## 2. Guides are data

`apps/professional/src/guides/` holds:

- `registry.ts` lists the guides: id, name, line, emblem, palette.
- `motivation-sdt.ts` holds the motivation guide's steps, scales, scoring, profiles and moves.
- `runner.ts` is the slim step runner: context, prompt steps, check step, then set the mix and save. It knows nothing specific to SDT.

A guide declares:

- `steps`: prompt cards, each with an `ask` (the question to put in your own words), `listenFor` (two or three things a student might say) and a tap scale.
- `checks`: extra cards that adjust the suggestion, shown when their condition is met.
- `scales`: the result bars.
- `suggest(answers)`: turns taps into a suggested 0–10 value per scale. It is a pure function and unit tested.
- `profile(values)`: names the profile. It is a pure function and unit tested.
- `moves(profile, values)`: picks two or three suggested moves.

## 3. The motivation run

1. **Context.** A free-text box ("What's this about?"), required, with recent contexts for this student offered as chips.
2. **Six prompts**, one per type, in continuum order. Each is a "why do you…?" ask in the CRAI style, with what to listen for from the Week 3 examples:
   - Amotivation: "I don't really know why", "I can't see the point".
   - External: "Because Mum makes me", "So I don't get in trouble".
   - Introjected: "I'd feel guilty if I didn't", "I don't want to look bad".
   - Identified: "It helps me get better", "It matters for what I want to do".
   - Integrated: "It's part of who I am".
   - Intrinsic: "I just love it".

   Taps: *not at all · a bit · quite a lot · very much*, plus an optional "his words" quote line.
3. **The check.** It shows when the introjected and identified taps are both at least *a bit*, or are within one step of each other. It offers two probes; the wording is Claude's suggestion and Adam can change it:
   - "If nobody would ever know or check, would you still do it?" A yes leans identified, and a no leans introjected.
   - "How does it feel when you skip it: guilty or tense, or more like a missed chance?" Guilty or tense leans introjected.

   Each answer moves the suggestion between the two bars by one step. Adam can skip the check.
4. **Set the mix.** The scales chart opens with the suggested values. Adam drags or taps each bar to his judgement and presses **Save**. Only saved values are kept, so the suggestion is never stored as the result.

## 4. The result card

The chart is drawn from data by the Decision Maker scales renderer (`packages/decision-book/render/scales.ts`, `axes` mode, `dated`, `min: 0`) inside a guide card frame:

- **The bars.** Six bars, amotivation → intrinsic, with two shaded zones behind them: controlled (external, introjected) and autonomous (identified, integrated, intrinsic). Amotivation sits apart at the left.
- **The lean.** One marker on a controlled ↔ autonomous line, computed RAI-style. Weights: external −2, introjected −1, identified +1, integrated +1, intrinsic +2. Amotivation is left out of the lean and shown on its own bar. The marker is drawn without a number.
- **The profile name.** Calculated from the autonomous and controlled means, in the McGregor / Vansteenkiste four-way split. Adam can change it from a menu. The wording describes the pattern in this context ("In English: high self-determination with control"), never the child.
- **Suggested moves.** Two or three short lines matched to the profile, in can-do wording, for example:
  - "Give a reason from his own goals for the parts he finds dull."
  - "Say out loud that it's boring before asking for effort."
  - "Offer a choice of how or in what order."
- **His words.** Up to three quotes from the run.
- **History.** Earlier saves for the same student and the same context are drawn over the bars, newest solid, up to three, dated. This is the renderer's existing `dated` mode.
- **Citation.** A small "SDT continuum · Ryan & Deci; profiles after McGregor et al. 2025" line.

## 5. Where it saves

- **Store.** A `guide_runs` record holds: id, guide id, meeting id, person ref, context, answers, quotes, check answers, final values, profile, moves, created and updated. It is stored with the other Professional records in the private store, and no student data enters the repo. One run can be edited until the meeting is closed.
- **Meeting page.** A **Guides** section shows the run cards, outside the notes block page, so the block engine is untouched.
- **Notes.** One plain line is appended to the notes ("Motivation guide · English · see card"), which keeps the run findable from the notes.
- **Student profile.** The run shows on the person's timeline (People: notes, tasks, meetings, events) as a guide entry with a small chart, linked to the meeting. The profile also gets a "Motivation" strip with the latest card per context.

## 6. Clare reads the card

- **Context.** `clareContext()` on the meeting page gains the meeting's guide runs as structured text: context, final values, profile and moves.
- **Prompt rule.** The summary prompt (`netlify/functions/_shared/clare-comms.mjs`) gets a new rule: guide results are Adam's professional read, and they become suggested next moves and things to watch, in can-do wording. Never name a motivation type or profile as a trait of the student, and never quote the scores.
- **Eval.** One summary eval case with a guide run attached checks that the output has a suggested move and none of the six type names used as a label.

## 7. Look

- Each guide has its own palette and emblem, drawn as SVG from data like Problem Solver and Decision Maker.
- The Motivation emblem is a candidate design for the mockup: a line from a hollow ring (controlled) to a filled disc (autonomous).
- The mockups come before any build, shown to Adam for approval: shelf, prompt card, check card, set-the-mix, result card, and the profile strip, at desktop and 390px. They live in `docs/mockups/meeting-guides/`.

## 8. What reuse means

- **Import, don't copy.** Professional imports `packages/decision-book/render/core.ts` and `render/scales.ts` (plus `families/scales.mjs` for `valuesOf` and `historyOf`), through the same alias approach the block engine uses.
- **The guide owns its colours.** The guide card maps the chart's `red`, `green`, `ink` and `tint` fills to the guide's own palette with CSS tokens. This is the same token-remap trick Decision Maker used on Problem Solver.
- **Left behind:** the coach, the machine, lightning, task bridges, review sync, skills ribbon and case file.
- **If the import pulls in too much.** If the core turns out to drag in Problem Solver modules Professional can't build, the fallback is a slim `scales` renderer in `packages/guides/`, drawn the same way. The plan decides which after a build check.

## 9. Cost

- **Running it** makes no AI calls. Only the existing ✦ Summarise click costs anything, as now.
- **The build** is much smaller than Decision Maker: one guide, one reused chart, a runner, a store, a profile strip and a prompt rule. The plan states an estimate measured against the Decision Maker build.

## 10. Tests

- **Units:** `suggest`, `profile`, `moves`, the check's trigger and nudge, and the lean.
- **Runner:** step order, check shown and skipped, nothing saved until Save.
- **Store:** create, edit, and history by person and context.
- **Clare:** context includes runs, and the summary eval case passes.
- **Browser:** walk at desktop and 390px with a test student. Run, adjust, save, then see the card on the meeting, the note line, the profile strip and a second run's history overlay.
- **Gate:** `npm run pre-pr-check` before the PR.

## Out of scope

- Other guides; the shelf is built for them.
- Student self-report mode.
- Starting a guide from the profile without a meeting.
- Any AI that scores or places.

## Changes decided while planning (23 Oct)

These override the sections above where they differ.

1. **The chart is a slim Professional chart** (`apps/professional/src/guides/continuum-chart.ts`), not an import of Decision Maker's `scales` renderer. That renderer uses number boxes in horizontal rows and Problem Solver's run shape, and the approved mockup needs drag handles, zones and a lean marker. It keeps Decision Maker's ideas: drawn from data, dated history overlays, and colours as tokens.
2. **Runs live on the meeting record** as `guide_runs` (validated like `decisions`), not in a separate store. History comes from `listMeetings()`.
3. **When the check shows:** whenever introjected and identified were both tapped at least "a bit". The probe answers are netted, so mixed answers leave the suggestion unchanged.
4. **A run can be edited at any time.**
5. **Clare gets each run's context and moves only**, never the profile name or the values.
6. **No pronouns in product copy**, because the tool can't know a student's pronouns.
