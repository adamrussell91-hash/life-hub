# Teaching WalkThrus across Teaching and Professional

Teaching WalkThrus is a book of 50 classroom techniques. Each technique is set out as five illustrated steps, grouped into six colour-coded series: Behaviour and relationships, Curriculum planning, Explaining and modelling, Questioning and feedback, Practice and retrieval, and Mode B teaching. The book also has framework chapters (Rosenshine, Willingham, MARGE, Wiliam's five strategies, Berger) and a How section on coaching and professional learning. Adam wants the techniques woven through both hubs: as notes inside lessons, as professional learning goals, as prompts in unit planning and as a frame for coaching.

It is a concept doc, not a build brief. Nothing builds from it until Adam names a slice.

## Privacy and copyright (read first)

- **The book's wording never enters this repo.** Step text, technique write-ups and framework summaries live only in private `life-hub-data`, read with an authenticated request. Code, tests, fixtures, screenshots and this doc hold technique IDs, names, series and page numbers only.
- **No book artwork.** Icons and hexagon illustrations are custom drawings made for Life Hub (Adam is commissioning them). Do not trace or copy the book's figures.
- Student-facing views never show the WalkThru mark or its text.

## Adam's asks (28 Oct 2026)

Four uses:

1. **Specialised teacher notes in a lesson**, so a technique like cold calling can be run properly in the room.
2. **A new professional learning section in Professional** that uses the WalkThrus to plan and monitor professional learning goals.
3. **A scaffold for unit plans and other curriculum planning documents** in Teaching.
4. **Specialised blocks for coaching and mentoring** with colleagues.

Then, after a read of the book against those uses:

- **Show where it came from.** When something is suggested because of the WalkThrus, that origin is visible through its own iconography: "this came from WalkThrus".
- **Teacher notes keep the book's steps word for word** as the thing to follow, with space for Adam's own notes alongside.
- **Pattern spotting feeds the professional learning table.** Some form of monitoring notices repeated learning problems and pushes a suggested goal to Professional.
- **Specific icons, not a generic one.** Each technique and each framework gets its own mark, used wherever that thing appears (blocks, unit plan fields, goals). Hovering shows the WalkThru text.
- **The professional learning page is a hexagon board.** Hexagons form clusters, arrows can be drawn between and around them, and clicking a hexagon reveals more. Everything is smoothly animated. Reference images show the book's cluster maps: hexagons labelled with series and page (for example `Q&F | 96`), a big hex for the focus technique with related ones touching it, and a zoom from a hex into its five-step strip.
- **Expansions are coming.** WalkThrus has many follow-up volumes (the reference images show a second colour of hexagon for techniques from other volumes). The model must take new sets later without rework. Adam's frame: hexagons and expansions, like a certain island-trading board game. The game-design angle is the next round of thinking (see Open questions).
- **Parked for now:** unseen observations and running CPD cycles do not fit Adam's current context. They are worth keeping as templates in a coaching engine or as Meeting Guides later.

## Core model: three layers

| Layer | What it is | Lives in | Edited by |
|---|---|---|---|
| **Master** | The book's technique: name, series, page, five steps word for word | Private `life-hub-data`, read-only | Nobody |
| **Adapted** | Adam's version for a context, e.g. "cold calling for Year 10" | Attached to a professional learning goal | Adam, during Develop and Adapt |
| **On the day** | The lesson's teacher note: master steps plus Adam's notes for that lesson (which question, which students) | The lesson | Adam, per lesson |

- A lesson note with a goal behind it pulls in the adapted notes. A lesson note with no goal shows the master steps and a blank notes area.
- The master is never edited. This keeps one fixed reference point while every adaptation stays tied to a real context, which is the book's own argument against techniques drifting as they are passed on.

## ADAPT is the goal's life cycle, not a lesson structure

The book's footer on every technique is Attempt, Develop, Adapt, Practise, Test. In Life Hub it becomes the stages a professional learning goal moves through:

- **Attempt, Develop, Adapt** happen on the goal page: try the steps, add finer detail, reshape them for the class or subject.
- **Practise** happens across lessons. Each lesson that uses the technique counts as one rep. A quick "how did it go" after the lesson logs back to the goal.
- **Test** happens on the goal, using student evidence (quiz and markbook results before and after), not just how it felt.
- **One active technique at a time**, held for several cycles. Moving on is a deliberate "keep going / move on" decision, not goals quietly piling up.

## Flow 1: from student problem to WalkThru (with visible origin)

The book's preferred starting point is a student learning problem drawn from evidence, not a teacher preference.

1. **Evidence** comes from Teaching: quiz evidence tags, markbook Patterns and Next steps.
2. **Problem type** is one of six: recall, fluency, recognising what the question asks, dexterity with procedures, sophistication of responses, working under time.
3. **Series**: the problem maps to a series (habits to Behaviour and relationships, recall and fluency to Practice and retrieval, understanding to Explaining and modelling, quality to independent practice).
4. **Technique**: a specific WalkThru is suggested.

Where it lands depends on scale:

- **One-off problem → lesson planning.** The next lesson for that class gets a suggested teacher note, e.g. "reteach using Feedback as actions".
- **Repeated pattern → professional learning.** The same problem type across several quizzes or classes proposes a goal on the Professional board.

Every suggestion carries the technique's icon. Hovering shows the chain: evidence → problem type → series → technique.

## Pattern monitor (cheap by design)

- **Plain counting rules, no agent.** Example thresholds: the same problem type on 3 or more quizzes within 3 weeks, or in 2 or more classes. Thresholds are settings.
- **Runs on save** of a quiz result or markbook change, not on a schedule.
- **Output is a suggested goal** on the Professional board, with the evidence attached. Adam accepts or dismisses. Dismissed patterns stay quiet until the evidence grows.
- **AI is optional** and only for wording a summary of the pattern. If it is ever added, show the plan and A$ cost first.

## Use 1: teacher notes in lessons

- A WalkThru mode on the existing teacher-only `teacher_note` block: master steps on top, Adam's notes beside or under each step.
- **Auto-attach to matching blocks.** Blocks that already embody a technique carry its icon and can open its note: hinge question → Check for understanding; quiz deck → Quizzing; faded examples → Worked examples and backward fading; cold call queue idea → Cold calling; markbook feedback → Whole class feedback.
- **Mental rehearsal.** A "walk through it" view shows the five steps one at a time before the lesson (Focus view could host this).

## Use 2: professional learning board (Professional hub)

Clickable mockup: [teaching-walkthrus-board-mockup.html](teaching-walkthrus-board-mockup.html). It uses invented demo data and placeholder icons. The grey lines in the step panel stand in for the book's wording.

**Catan mapping (no points, ever).** The board is styled as a real Catan board: one island in a wooden frame, a sandy shore and a blue sea, on a table. Each series is a terrain: Questioning and feedback is Fields, Practice and retrieval is Hills, Curriculum planning is Mountains, Explaining and modelling is Forest, Behaviour and relationships is Pasture, and Mode B is a Fishery. A desert sits in the middle. Each tile carries a cream number token showing the book page, with dots for how often the technique is used in lessons; busy tiles turn red, like Catan's 6 and 8. Adam's pieces are red wood. Hex tiles are techniques. Buildings show ADAPT progress: an outline house for trying, a house for practising, a city once Test passes on student evidence. Roads are the arrows Adam draws: a road on the shared edge between neighbouring hexes, a curved arrow over the sea for distant ones. Dots under each name show how often the technique appears in lessons. The robber is the pattern monitor, sitting on the tile that would fix a student problem. Harbours are where the board trades with Teaching (Markbook, Lessons, Unit plans). Framework chapters are cards in hand, played onto unit plans as lenses. Later volumes wait face-down on the table beside the board, like an expansion box, and turn over when opened. Nothing scores: the board grows only when students improve.

- A hexagon board. Each technique is a hex in its series colour, labelled with its custom icon and a `series | page` code.
- Hexes cluster by relationship; the focus technique is large, related ones touch it.
- Adam can draw arrows between and around hexes (sequence, "leads to", "supports").
- Clicking a hex zooms into its five-step strip and the goal's ADAPT stage, rep log and before/after evidence.
- Suggested goals from the pattern monitor arrive at the edge of the board, waiting to be placed.
- Smooth animation throughout: cluster growth, zoom in and out, arrows drawing on.

## Use 3: unit planning and scope and sequence

- Planning fields that come from the book carry the matching icon, with hover text:
  - review schedule across the unit (Rosenshine's daily, weekly and monthly review; Weekly and monthly review)
  - anticipated misconceptions (Head on misconceptions)
  - vocabulary to teach on purpose (Deliberate vocabulary development)
  - reading plan (Plan for reading)
  - knowledge organiser (Using a knowledge organiser)
  - core vs hinterland (Deliver core; signpost hinterland)
  - small-step sequence (Sequence concepts in small steps)
  - tiered questions (Tiered questions and problems)
  - homework as guided study, enquiry projects
- **Framework lenses for a whole unit**, added to the existing lens registry: Rosenshine, Willingham (what will students think about; story structure), MARGE, Wiliam's five strategies, Berger (drafts, critique, making work public). The hover names the source as a framework chapter, not a WalkThru.

## Use 4: coaching and mentoring blocks

- The coachee picks the technique.
- The observation sheet is scoped to that technique's five steps only, so there are no surprises.
- Feedback is written against each step, not at the person: both people look at the shared steps side by side.
- Each cycle ends with "keep working on this" or "move to a new technique".
- **Parked templates:** unseen observation (agree a technique in the morning, teach unobserved, review at the end of the day) and a CPD cycle session plan. Both fit the Meeting Guides engine if Adam's context changes.

## Expansions

- Every technique belongs to a **set** (the first book, later volumes, any subject-specific books). A set carries its own hex colour.
- Series codes and page numbers are per set, so `Q&F | 96` stays unambiguous once more books arrive.
- Adding a set means adding private data and icons, not code changes.

## Icons

- One custom icon per technique (50 in the first set) and per framework (5), plus a series colour.
- The same icon is used everywhere the technique appears: hex, block badge, planning field, suggestion chip, goal.
- Icons are original artwork, so they can live in the public repo. Text on hover is fetched privately.

## What already exists to build on

| Piece | Where | Use here |
|---|---|---|
| Teacher note block | `teacher_note` in `apps/teaching/src/blocks/` | Host the on-the-day WalkThru note |
| Lens registry | `apps/teaching/src/blocks/lenses/registry.ts` | Add the five framework lenses |
| Markbook Patterns and Next steps | `apps/teaching/src/markbook/patterns-view.ts`, `next-view.ts` | Evidence source for the pattern monitor |
| Quiz evidence tags | `apps/teaching/src/quiz/teacher-panel.ts` | Problem-type signal |
| Meeting Guides | `apps/professional/src/guides/` | Home for coaching, unseen observation and CPD templates |
| Observations tab | `apps/professional/src/components/observations-tab.ts` | Possible home for step-scoped observation sheets |
| Excalidraw whiteboard | `packages/whiteboard` | Possible engine for drawn arrows, or a reference for a custom one |
| Cold call queue idea | [cold-call-queue.md](cold-call-queue.md) | First lesson block to carry a WalkThru icon |
| Rules Book glyphs | Decision and Change Book tools | Precedent for a custom icon set drawn to one style |

## Open questions

- **The game layer.** How far does the island-trading board game idea go: tiles, resources, building on a technique, trading between sets, expansion boards? Next round of thinking.
- Should the hex board be a free canvas (Adam places hexes) or an auto-layout (clusters arrange themselves from relationships), or auto-layout with pinning?
- Are arrows typed (sequence, supports, contrasts) or free lines with a label?
- Where do the six problem-type tags come from: existing evidence tags mapped across, or a new tag set?
- Does a dismissed suggested goal ever come back, and on what rule?
- How is a lesson rep logged with the least friction: a one-tap rating on the teacher note after the lesson?

## History

- 28 Oct 2026: Restyled the mockup in the WalkThrus cluster look: white page, flat-topped hexes in series clusters with white gaps, black series and page tab, bold caps titles, line icons, progress piece in a black badge. Colour now shows the set (yellow set 1, blue set 2, green set 3). Arrows are a knot with a chevron on shared edges and thin black lines through the white space otherwise. Opening a tile raises its five-step strip on a connector, with a magnifier to close. The panel shows ADAPT as a chain of five hexes with a repeat loop.
- 28 Oct 2026: Restyled the mockup as a Catan board (terrains, tokens, red wooden pieces, expansion box on the table).
- 28 Oct 2026: Added the board mockup and the Catan mapping (no points).
- 28 Oct 2026: Created from a read of the book against Adam's four uses, and Adam's follow-up decisions (three layers, ADAPT as goal life cycle, pattern monitor, specific icons, hexagon board, expansions, parked coaching templates).
