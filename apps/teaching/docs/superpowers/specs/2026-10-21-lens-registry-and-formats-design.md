# Lens registry and block Formats

Date: 21 October 2026
Status: design, Adam's first answers folded in (21 Oct)
Scope: Teaching block engine (also runs in Tasks and Professional, where lenses stay off)

## Why

Every new thinking framework currently arrives as its own "qualifier", with
its own schema field, editor, view and menu entries (Kaplan in
`src/blocks/kaplan*.ts`, Discern in `src/blocks/discern*.ts`). Every new
question style threatens to become a new block type. Neither scales to the
dozens of frameworks and scaffolds Adam wants to use.

Two layers replace that pattern:

| Layer | Answers | Where it lives | Example |
| --- | --- | --- | --- |
| **Lens** | *How should students think about this?* | One "Add lens…" item in the block options menu, then a picker | Windows & Mirrors, Kaplan Patterns, Discern |
| **Format** | *What shape is this block?* | A Format dropdown at the top of a block's editor | Question set as a Human experience table |

A Format changes what the block looks like and what students fill in. A lens
sits on top of any format and adds a thinking process. Adding a new lens or
format should mean adding one registry entry, not a new block type, schema
field or menu button.

## What a lens is for

A lens walks a student through a thinking process one small step at a time.
The steps lower the cognitive load; the order of the steps is what makes the
final answer more sophisticated. **Every lens ends in writing.** Whatever the
steps were (notes, a choice, a diagram), the last step hands the student the
thing to write down and asks them to write it.

Student work in a lens is not a saved record. Notes are kept in the
browser's local storage as a convenience on the same device. That breaks on
shared school laptops, in a different browser, or after data is cleared, so
the design never relies on it. The **Write it down** step says plainly that
the page will not keep their answer, and asks them to write it in their book
or document now.

## Naming: "lens", not "qualifier"

"Lens" is the product word everywhere a teacher or student reads it. "Qualifier"
goes from all user-facing text:

- `kaplan-editor.ts`: "Add a Kaplan qualifier", "Add qualifier", "Save
  qualifier", "Remove qualifier", "… qualifier saved / removed" become the lens
  equivalents ("Add lens", "Save lens", "Remove lens", "Patterns lens saved").
- `kaplan-view.ts`: the strip's `aria-label="Kaplan qualifiers"` becomes
  "Lenses".
- Code comments that say "qualifier" are updated in the files this build
  touches.

Saved data keeps its field names (`qualifiers`, `discern`) so no lesson needs
migrating. Those names only appear in storage.

## Out of scope

- Migrating saved Kaplan or Discern data. Both keep their current fields.
- Saving student answers to the server. See "What a lens is for".
- Lenses in Tasks and Professional. `classroomExtras()` still switches them off.
- Any new frameworks beyond Windows & Mirrors. The registry makes them cheap
  later; this build proves it with one.

## Part 1: Lens registry

### The registry

New file `src/blocks/lenses/registry.ts`. Each entry:

```ts
type LensEntry = {
  id: string;                     // 'kaplan_patterns', 'discern', 'windows_mirrors'
  label: string;                  // 'Windows & Mirrors'
  group: string;                  // picker heading: 'Kaplan', 'Judgement', 'Literature'
  path: string;                   // one-line summary shown in the picker
  symbol: () => SVGSVGElement;
  canAttach: (block: Block) => boolean;
  isAttached: (block: Block) => boolean;
  // Storage adapter: hides where this lens's data sits on the block.
  read: (block: Block) => unknown | undefined;
  write: <T extends Block>(block: T, config: unknown) => T;
  remove: <T extends Block>(block: T) => T;
  // Either a stepped lens (data only) or a custom lens (own editor and view).
  kind: 'stepped' | 'custom';
  stepped?: SteppedLens;
  createSetup?: (ctx: LensSetupContext) => HTMLElement;              // custom only
  renderView?: (block: Block, opts: LensViewOptions) => HTMLElement;  // custom only
  onAttach?: string;              // event to dispatch, e.g. Discern's Confirm card
  onDetach?: string;
};

type LensLevel = 'support' | 'core' | 'extend';

type SteppedLens = {
  // Which levels this lens has written. A lens with only 'core' hides the level control.
  levels: LensLevel[];
  // Steps for this config, block and level. Any number; ids are stable.
  steps: (config: SteppedConfig, block: Block, level: LensLevel) => LensStep[];
  // The closing step. Always last, always present.
  writeItDown: (config: SteppedConfig, block: Block, level: LensLevel) => WriteItDown;
  // Optional fields this lens adds to the setup panel (e.g. Windows & Mirrors' "Answer with").
  setupFields?: (ctx: LensSetupContext) => HTMLElement;
};

type LensStep = { id: string; title: string; prompt: string; support: string;
                  input?: 'notes' | 'choice'; choices?: LensChoice[] };
type WriteItDown = { frame: string; checklist: string[]; example?: string };
```

- **Stepped lenses** are mostly data. They get Kaplan's existing setup flow
  (focus, notes or discussion, review each step) and its student workspace,
  print layout and local notes for free. Kaplan's three lenses and Windows &
  Mirrors are stepped.
- **Custom lenses** bring their own setup and view. Discern is custom (its
  scale, graph, server tails and linked Confirm card stay as they are). Its
  Confirm card already plays the Write it down role.

### The stepped engine changes from Kaplan's

Kaplan is hard-wired to exactly three steps (`kaplanSteps` returns a tuple;
the schema stores `prompts` and `supports` as three-item tuples). The engine
generalises this:

- **Any number of steps.** Teacher overrides are keyed by step id, not
  position. Kaplan's adapter maps its stored tuples to step ids, so saved
  Kaplan lenses read the same.
- **A choice step.** A step can ask the student to pick an option
  (Windows & Mirrors' "Student's choice"). Their pick is kept in the lens's
  local state, and later steps can depend on it.
- **The Write it down step** is added by the engine after the lens's own
  steps. See below.

### Write it down (every stepped lens)

The last step of every stepped lens. The student sees:

1. **What you found.** Their notes from each step, stacked under the step
   titles. In discussion mode, which has no typing, this becomes the step
   titles as a recap.
2. **The frame.** A sentence frame from the lens, e.g. "Through ___,
   [composer] reveals how ___ while forcing us to reflect on ___."
3. **Your answer.** A box, prefilled with the frame, where they write the
   finished sentence or paragraph in their own words. Notes are not
   auto-joined into prose, because stitched fragments read badly and do the
   thinking for them.
4. **Check it.** A short checklist from the lens (e.g. "Names a specific
   moment", "Uses a window verb").
5. **See an example.** A collapsed, accurate model answer.
6. **The handover.** "This page won't keep your answer. Write it in your
   book or document now." Two buttons: **Copy** (copies their answer) and
   **I've written it down** (collapses the lens and marks it done in local
   state).

In print, Write it down prints the frame, the checklist and ruled lines.

### Levels (every stepped lens)

Each stepped lens can be written at three levels of scaffolding, so one lens
supports the whole class:

| Level | Teacher label | Student label | What changes |
| --- | --- | --- | --- |
| `support` | Support | More help | Plain-language prompts, smaller steps, three verbs to pick from instead of a full bank, a fill-in-the-blanks frame, the example open by default |
| `core` | Core | Standard | The default wording, full verb bank, a sentence frame, example collapsed |
| `extend` | Extend | Stretch | Fewer hints, an extra step that asks for a tension or complication, no frame (a short challenge and the checklist instead), example collapsed |

- The teacher picks the starting level in setup (default Core).
- **Let students change level** (on by default) shows a small three-way
  switch at the top of the lens. Switching keeps the notes already written
  for steps that exist at both levels. The student's choice is kept in local
  state with their notes.
- Student-facing labels are "More help / Standard / Stretch", so nobody is
  labelled by ability on screen.
- The level a lens starts at, and the switch, print with it: a printed
  lens prints the teacher's chosen level only.
- A lens that has only written `core` hides the switch. Kaplan ships as
  Core only in this build; its Support and Extend wording can be added later
  as data, with no code change.

Kaplan gets frames too:

| Kaplan lens | Frame | Checklist |
| --- | --- | --- |
| Patterns | "Both ___ and ___ ___ [repeat / contrast / change], which suggests ___." | Two specific details · names the relationship · says what it reveals |
| Multiple Perspectives | "One reading of ___ is ___ because ___. Another is ___ because ___. The stronger reading is ___ because ___." | One detail kept in view · two readings · a judgement |
| Ethics | "___ raises the question of ___. I judge that ___ because ___, although ___." | A detail you can point to · what is at stake · a judgement with one complication |

### Folding in Kaplan

- `kaplan.ts`, `kaplan-view.ts` and `kaplan-editor.ts` become the generic
  **stepped lens** engine, moved to `lenses/stepped.ts`, `stepped-view.ts`,
  `stepped-editor.ts`. The Kaplan step text moves into three registry
  entries: `kaplan_patterns`, `kaplan_multiple_perspectives`, `kaplan_ethics`.
- Storage does not change. The Kaplan entries' adapters read and write
  `block.qualifiers` exactly as `withKaplanQualifier` and
  `withoutKaplanQualifier` do today. Saved lessons render the same, plus the
  new Write it down step.
- CSS class names (`kaplan-*`) stay for now so nothing visual moves.

### Folding in Discern

- One custom registry entry, `discern`, wrapping `createDiscernAuthor` and
  `renderDiscern`. Storage stays on `block.discern`. The Confirm card attach
  and detach events (`DISCERN_ATTACH_EVENT`, `DISCERN_DETACH_EVENT`) become
  the entry's `onAttach` / `onDetach`, so `mount-page.ts` keeps working.
- `netlify/functions/_shared/discern.mjs` is not touched.

### New lenses get one generic field

```ts
// blockLayout, beside the existing qualifiers and discern fields
lenses: z.array(z.object({
  id: z.string().min(1),          // registry id
  config: z.record(z.unknown())   // validated by the entry's own zod schema on read
})).max(6).optional()
```

New lenses (starting with Windows & Mirrors) store their data here. The
schema stays the same however many lenses get added. Unknown ids are kept
and ignored on render, so an older client never deletes a newer lens.

### Rendering

`renderBlock` in `render.ts` stops calling Kaplan and Discern by name. It loops
over registry entries attached to the block and appends each view, keeping
today's rule: on a single-question question set, the lens sits between the
prompt and the response space.

### Editors that skip the shell

The lens bar is added in `editorShell` (`editors.ts`). Some editors build
their own root and never get it. `createPeerFeedbackEditor` in
`peer-feedback.ts` is one, so peer feedback cannot carry a lens today even
though `renderBlock` would show one. Phase 1 lists every `case` in
`createBlockEditor` that bypasses `editorShell` and either wraps it or
mounts the lens bar directly. Peer feedback must have the lens bar, because
Windows & Mirrors targets it.

### The menu: no spaceship

Today the block options menu (⋯) lists "Add Kaplan qualifier" plus an Edit
and a Remove item for every attached lens, plus Discern's items. That grows
by two items per lens.

New menu:

- **Add lens…** (one item, always). It opens the setup panel showing a
  picker grouped by `group`, with each lens's symbol, label and `path`. Lenses
  already attached, or that cannot attach to this block, are hidden.
- Attached lenses show as chips in the attached strip, as now. Clicking a
  chip opens its setup. **Remove lens** lives in the setup panel. There are
  no per-lens Edit or Remove menu items.

## Part 2: Windows & Mirrors lens

- **id** `windows_mirrors`, **group** Literature, **label** Windows & Mirrors
- **path** "Find a moment → look outward, inward or both → write it"
- **symbol** a window frame beside a hand mirror
- **canAttach** the same blocks as Kaplan, including peer feedback
- **kind** stepped

### The idea, as the lens teaches it

- **Window: look outward.** The text lets you see a world that isn't yours:
  its time, place, culture and people. Window answers are *particular*.
  Test: *I see how they do things differently in their context.*
  Window verbs: reveals, shows, opens, displays, unveils, presents, depicts,
  illustrates, transports.
- **Mirror: look inward.** The text reflects people back at themselves,
  including you. Mirror answers are *universal*. Test: *I see they do the
  same basic human things I do.* Mirror verbs: reflects, confronts, exposes,
  illuminates, echoes, examines, challenges, captures, forces us to reflect on.
- **Everyday version** (shown on the student's-choice card): visiting a
  friend's house. The window is noticing how their family does things
  differently: different food, different rules, different celebrations. The
  mirror is noticing they still do what your family does: eat together,
  argue, look after each other.

### Setup

| Field | Control | Default |
| --- | --- | --- |
| What should students think about? | text, e.g. "prejudice" or "individual agency" | suggested from the question, as Kaplan does |
| Answer with | segmented pills: **Window** · **Mirror** · **Both** · **Student's choice** | Both |
| Level | segmented pills: **Support** · **Core** · **Extend** | Core |
| Let students change level | toggle | on |
| How will students work? | Thinking notes · Discussion (no typing) | Thinking notes |
| Example | optional text per level; replaces the built-in model answer | built-in |
| Review the steps | as Kaplan: edit any step's instruction and support | |

Config schema:

```ts
z.object({
  focus: z.string().trim().max(200).default(''),
  answer_with: z.enum(['window', 'mirror', 'both', 'choice']).default('both'),
  level: z.enum(['support', 'core', 'extend']).default('core'),
  student_level: z.boolean().default(true),
  mode: z.enum(['notes', 'discussion']).default('notes'),
  prompts: z.record(z.string().max(1200)).optional(),    // by `${level}.${stepId}`
  supports: z.record(z.string().max(1200).nullable()).optional(),
  examples: z.object({
    support: z.string().max(1200), core: z.string().max(1200), extend: z.string().max(1200)
  }).partial().optional()
})
```

### Steps for each setting

| Answer with | Support and Core | Extend adds |
| --- | --- | --- |
| Window | Pick your moment → Look outward → Write it down | Look closer (before Write it down) |
| Mirror | Pick your moment → Look inward → Write it down | Look closer |
| Both | Pick your moment → Look outward → Look inward → Write it down | Find the tension |
| Student's choice | Choose your lens → then the path they picked | as for the path |

Core step text ({focus} fills in as with Kaplan):

| Step id | Title | Prompt | Support |
| --- | --- | --- | --- |
| `choose` | Choose your lens | Will you look through a window, into a mirror, or both? | Three cards, each with its one-line test and the everyday version. "Both" notes that it is the hardest and strongest. |
| `moment` | Pick your moment | Choose one specific moment from the text that shows {focus}: a quotation, a scene, an image or a technique. | "The Hunger Games is about sacrifice" is a topic, not a moment. "Katniss volunteers for Prim at the reaping" is a moment: something you can point to. |
| `window` | Look outward | What does this moment show you about {focus} in the world of the text: its time, place and people? How is that different from your world? | Window verbs and the window test. |
| `mirror` | Look inward | What does this moment reflect about {focus} in people everywhere, including you and people you know? | Mirror verbs and the mirror test. |

Support rewrites the same steps in plainer words and splits the hardest one:

| Step id | Support prompt | Support help |
| --- | --- | --- |
| `moment` | Pick one part of the text you remember well. What happens? | "I chose the part where…" |
| `window` | What is life like for people in this story? How is it different from your life? | Pick a verb: **shows** · **reveals** · **displays**. "This shows that in [place], people…" |
| `mirror` | Have you, or people you know, ever felt or done something like this? | Pick a verb: **makes us think about** · **reflects** · **reminds us**. "This makes us think about…" |

Extend's extra steps:

| Step id | Title | Prompt |
| --- | --- | --- |
| `closer` | Look closer | What technique or choice by the composer makes this moment work as a window (or mirror)? What would be lost without it? |
| `tension` | Find the tension | Where do the window and the mirror pull against each other? What does the text's world make easy to judge that becomes harder to judge in ourselves? |

Write it down, for each path and level:

| Path | Support frame | Core frame | Extend challenge |
| --- | --- | --- | --- |
| Window | "When ___ happens, it shows that in ___, people ___." | "Through ___, [composer] reveals how ___ in [the world of the text], where ___." | Write two or three sentences that explain the world of the text and name the technique that shows it. |
| Mirror | "When ___ happens, it makes us think about ___." | "Through ___, [composer] forces us to reflect on ___. This suggests that people ___." | Write two or three sentences that name an uncomfortable truth the text shows about people, and why it is uncomfortable. |
| Both | "___ shows ___, and it makes us think about ___." | "Through ___, [composer] reveals how ___ while forcing us to reflect on ___." | Write a short paragraph that moves from the text's world to ourselves and names the tension between them. |

Checklists:

| Level | Checklist |
| --- | --- |
| Support | I named the part of the text · I used one of the verbs · I said something about people, not just what happens |
| Core | Names a specific moment · uses a window verb, a mirror verb or both (to match the path) · explains, rather than retells |
| Extend | Everything in Core · names a technique · names a tension or complication · the sentences link, not list |

### Built-in examples

One moment that almost every student knows from the book or the films,
shown every way, so students see the difference instead of reading unrelated
sentences. The moment: in *The Hunger Games* (Suzanne Collins), Katniss
volunteers as tribute at the reaping to take her younger sister Prim's
place.

| | Support | Core | Extend |
| --- | --- | --- | --- |
| **Window** | "When Katniss volunteers for Prim at the reaping, it shows that in Panem the Capitol makes children fight so the districts stay scared." | "Through Katniss volunteering at the reaping, Collins reveals how the Capitol uses a yearly ritual of child sacrifice to keep the districts afraid and obedient." | "Through the reaping, Collins exposes a regime that turns children's deaths into a public ceremony. Katniss's volunteering reveals the only choice the Capitol still allows: whose child dies, not whether one does." |
| **Mirror** | "When Katniss volunteers for Prim, it makes us think about how far we would go to protect someone we love." | "Through Katniss volunteering in Prim's place, Collins forces us to reflect on how far people will go to protect those they love. This suggests that love can make people braver than fear does." | "Katniss's sacrifice confronts us with an uncomfortable truth: self-sacrifice is admirable, yet it leaves the system untouched. Collins forces readers to ask whether protecting the people we love is the same as resisting injustice." |
| **Both** | "Katniss volunteering shows how cruel the Capitol is to the districts, and it makes us think about how far we would go for our family." | "Through Katniss volunteering at the reaping, Collins reveals how the Capitol rules through fear, while forcing us to reflect on how love can make ordinary people defy it." | "Collins reveals a Panem where the Capitol rules by staging children's deaths as entertainment, yet she also holds up a mirror to readers, whose appetite for watching others suffer on screen is uncomfortably close to the Capitol audience's." |

The teacher's Example field replaces these with a model from the class text,
one per level (any left blank fall back to the built-in one). The setup
panel shows the built-in example for the current Answer with and Level, so
the teacher sees what students will see.

### On a peer feedback block

`steps` returns reviewer-facing wording instead, and still ends in writing:

1. **Find the window.** Which verb or phrase shows what the text *reveals*
   about its world? Quote it.
2. **Find the mirror.** Where does the writing make the reader *reflect* on
   themselves or people in general? Quote it, or note that it is missing.
3. **Write it down.** Frame: "Your window is ___. Your mirror is ___. To
   sharpen it, ___." Checklist: quotes their words · one specific suggestion.

With Answer with set to Window or Mirror, the reviewer looks for that one
only.

## Part 3: Format dropdown

### The registry

New file `src/blocks/formats/registry.ts`:

```ts
type FormatEntry = {
  id: string;                    // 'standard', 'human_experience_table'
  blockType: Block['block_type'];
  label: string;
  hint: string;                  // one line under the dropdown
  createFields?: (ctx) => HTMLElement;   // extra editor fields for this format
  render: (block, mode, ctx) => HTMLElement;
};
```

The block editor shows a **Format** dropdown above the fields only when the
block type has two or more formats. Switching format keeps the question
prompts. Format-specific settings (such as table rows) are kept when you
switch away and back.

### Question set formats

Schema: `content.format: z.enum(['standard', 'human_experience_table', 'anchor_bridge']).default('standard')`
plus an optional `content.table` for the table format. Existing question sets
parse as `standard` and render exactly as now.

1. **Standard.** Today's numbered list.
2. **Human experience table.** Columns: Human experience | Conceptual focus |
   In one sentence | Window, mirror or both? (a three-way choice plus a
   "why" line). The teacher sets the row count (3 to 5). The first row can be
   a greyed example. The built-in one uses the same *Hunger Games* moment
   as the lens: Sacrifice | Love, fear, control | Love can push people to
   defy a system built on fear. | Both: a window into how the Capitol
   controls the districts, and a mirror on what we would risk for family.
   The set's first question becomes the instruction above
   the table. In print, the cells are empty boxes.
3. **Anchor & bridge.** Each question gets three labelled boxes instead of
   one: Anchor (a specific moment or quote), Human experience, Bridge ("This
   reveals that…"). Below them is the response frame from the viva lesson:
   "The text explores ___ through ___. In ___, ___, described as '___'. This
   reveals that ___. The text suggests that humans ___." This is the Three
   Component Framework without a new block.

Both new formats end the same way a lens does: the last thing on the block
is a box for the finished answer, with Copy, and the same "this page won't
keep your answer" line.

### Peer feedback

Peer feedback already has a shape switch: `content.mode`
(`comments` / `annotate`), set by the "How students give feedback" segmented
control in `peer-feedback.ts`. Its two values become peer feedback's Format
entries with no data change, and the control is replaced by the shared
Format dropdown. That way every block that changes shape does it through the
same control.

### Later formats (not this build)

These are listed to show where the 700 ideas go: Viva practice (timed prep
and response), Socratic seminar roles, Think–pair–share. Each one is a
Format entry.

## AI (Ann)

- Regenerate `netlify/functions/_shared/teaching-block-schema.mjs` with
  `node scripts/generate-alchemy-schema.mjs` so Ann can build question sets
  in any format and attach `lenses`.
- One line in `config/ann-protocol.md`: when Adam asks for a framework or
  question style, use a lens or format before reaching for a new block type.

## Build order (one PR, phases as commits)

1. **Lens registry.** Registry; stepped engine extracted from Kaplan with
   any-length steps, choice steps and Write it down; Kaplan frames; Kaplan
   and Discern adapters; "Add lens…" picker; render loop; "qualifier" →
   "lens" in all UI text; lens bar on editors that skip `editorShell` (peer
   feedback first). No schema change. Gate: existing `kaplan.test.ts`,
   `discern.test.ts` and `tests/browser/kaplan.spec.ts` pass, updated only
   for the new menu, wording and the extra step.
2. **Windows & Mirrors.** `lenses` field, the entry, all four Answer with
   paths at all three levels, the nine examples, the level switch, peer
   feedback wording, symbol. Tests: each path's step list at each level,
   choice step branching, switching level keeps shared notes, attach / edit /
   remove, schema round trip, unknown lens id kept, Write it down Copy,
   print at the teacher's level, 390px.
3. **Format dropdown.** Format registry, question set's three formats,
   peer feedback mode moved under Format, regenerate the schema, Ann
   protocol line. Tests: old question sets parse as standard, switching
   format keeps prompts, table and anchor views at 390px and in print.

`npm run pre-pr-check` before the PR, then auto-merge.

## Decisions (Adam, 21 Oct)

- The product word is **lens**; "qualifier" leaves the UI.
- Windows & Mirrors offers Window, Mirror, Both or Student's choice, each
  with an easy, accurate example.
- Lenses walk students through the process and always end in writing,
  because nothing they type is kept.
- The Notion lesson is not being updated; this build writes its own
  examples.
- Examples use a text students already know (*The Hunger Games*), not a
  set text they may not have studied.
- Stepped lenses have three levels (Support, Core, Extend) so one lens
  works for every student; the teacher sets the start, and students can
  switch unless the teacher turns that off.
