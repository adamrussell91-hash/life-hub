# Book prep for Codex: turning a book PDF into a book pack

This is the brief for Codex. Give it the whole file plus the book's PDF. Codex turns the book
into a **book pack**: a folder of checked, structured data. Claude then builds the Life Hub tool
from the pack without rereading the book.

Problem Solver and Decision Maker were both built from books, and most of that cost went on
three jobs: reading poor page text, finding where the graphic kit's model data disagreed with
the printed page, and fitting each model to the engine. The pack moves all three jobs to you,
and `scripts/book-pack/check.mjs` proves the result before Claude starts.

---

## Prompt to paste into Codex

> You are preparing a book so that Claude can build a coaching tool from it in the Life Hub
> project. Read `docs/book-packs/CODEX-BOOK-PREP.md` in the life-hub repo and follow it exactly.
>
> - Book PDF: `<path to PDF>`
> - Cover image: `<path to the largest cover image you have>`
> - Pack slug: `<short-kebab-name>` (for example `get-things-done`)
> - Id prefix: `<two letters>` (for example `gt`; never `dm` or `ps`)
> - Life Hub repo, read only: `~/Projects/life-hub`
> - Write the pack only to: `~/Projects/life-hub-data/book-packs/<slug>/`
>
> Finish only when `node scripts/book-pack/check.mjs ~/Projects/life-hub-data/book-packs/<slug>`
> exits 0, run from the life-hub repo. Then write a short summary covering: entries kept, merged
> and cut; reuse matches; proposed new families; open questions; and every fact still marked
> `unsure`.

---

## Hard rules

1. **Never write inside the life-hub repo.** It is public. Book text, page images, figure
   crops and quotes go only in the private pack folder. Do not commit to life-hub, open a PR
   on it, or edit its scripts.
2. **Write coaching in your own words.** `when`, `failureModes`, `steps` and `exercise` must be
   your words. The checker rejects any run of 8 or more words copied from the page text. The
   book's own labels (axis names, quadrant names, step names) may be used as labels.
3. **The printed page beats everything.** That includes the figures, any graphic kit, your
   memory of the technique, and the "standard" version you have seen elsewhere. When the book
   differs from the well-known version, record the book's version and note the difference.
4. **Never guess.** If a page is unreadable or a structure is ambiguous, mark the fact `unsure`
   and add an open question. A guess that looks confident costs more to unpick than a gap.
5. **Do not design the tool.** Propose a session shape in `process.md`, but leave decisions to
   Adam (in `questions.md`) and leave the code to Claude.

---

## Step by step

### 1. Pages

Extract text with `pdftotext -layout`, falling back to OCR only for pages without a text
layer. Write one file per page to `pages/`, named by its **printed** page number:
`pages/012.txt`. Front matter that has no printed number becomes `pages/fm-01.txt`.

Many PDFs are ebook conversions with no printed page numbers on the page. In that case, work
out the mapping from the book's own cross-references (for example "see p. 10"), and check it
against at least three of them. Record the mapping and its evidence in `book.json`.

Clean the text: rejoin hyphenated line breaks, drop running headers and footers, and keep list
numbering. Do not summarise.

### 2. Figures

Render each figure with `pdftoppm -r 150` and crop it to `figures/<page>-<n>.png`. Then add an
entry to `figures.json` describing what the figure *means*, not what it looks like:

```json
{
  "id": "010-1",
  "page": 10,
  "caption": "the printed caption, if any",
  "role": "structure | example | illustration | decorative",
  "means": "Four 25-minute blocks separated by short breaks; Wi-Fi off before, on after.",
  "entry": "gt_pomodoro"
}
```

- **structure**: the figure carries a model's structure (axes, cells, flow, stages). Its
  meaning must appear in that entry's `structure`, with facts citing the page.
- **example**: a filled-in example of the structure.
- **illustration**: it restates the text and adds nothing to the structure.
- **decorative**: it is mood only, with no information.

Hand-drawn or odd graphics are normal. Claude redraws every chart from data, so the
figure's job is evidence, not artwork.

### 3. Book overview: `book.json`

```json
{
  "slug": "get-things-done",
  "title": "…",
  "authors": ["…"],
  "edition": "English edition, year, publisher",
  "prefix": "gt",
  "source": { "file": "original filename", "pdfPages": 110, "text": "digital | ocr | mixed" },
  "pageMap": {
    "method": "printed | offset | table",
    "offset": 1,
    "evidence": [{ "crossRef": "p. 10 (The Pomodoro Technique)", "pdfPage": 9 }]
  },
  "kind": "catalogue | process | mixed",
  "sections": [
    { "key": "doing_things", "title": "Doing things", "pages": [8, 40] }
  ],
  "missing": ["printed pages or parts not in the PDF"]
}
```

`kind` matters most. **catalogue** means independent entries you dip into (The Decision Book).
**process** means ordered stages you work through (Problem Solver's toolkit). **mixed** means
both. Section `key`s are lower snake case.

### 4. One file per entry: `entries/<id>.json`

Every chapter, technique or model gets a file, including the ones you recommend cutting.
Ids are `<prefix>_<snake_name>`, using only lower-case letters and underscores, e.g.
`gt_five_second_rule`.

```json
{
  "id": "gt_pomodoro",
  "title": "The Pomodoro Technique",
  "section": "doing_things",
  "pages": [10, 11],
  "verdict": "keep | merge | cut",
  "verdictWhy": "One line. Merge names the entry it folds into.",
  "mergeInto": null,
  "tier": "worksheet | lens | essay",
  "reuse": null,
  "family": "path",
  "proposedFamily": null,
  "structure": { "variant": "stages", "stages": [] },
  "facts": [
    {
      "claim": "A work block lasts 25 minutes",
      "page": 10,
      "anchor": "up to 12 words that locate it on the page",
      "check": "matched | corrected | unsure",
      "note": ""
    }
  ],
  "when": "One sentence on the situation this fits, in your words.",
  "failureModes": ["Three ways people get it wrong, in your words."],
  "steps": [{ "id": "set_up", "title": "Short title", "prompt": "What the coach asks, in your words." }],
  "exercise": "One concrete thing to try this week.",
  "seeAlso": ["gt_five_second_rule"],
  "pairsWell": ["kanban"],
  "figures": ["010-1"],
  "openQuestions": []
}
```

Field notes:

- **tier**:
  - `worksheet`: the person fills it in (a chart, list or flow).
  - `lens`: a way of seeing that the coach applies, with little or nothing to fill in.
  - `essay`: an argument or story with no usable structure. Essays usually get `cut` or
    `merge`, which is fine: say so plainly.
- **verdict**: be honest. Adam cuts what he would never use. A pack that says "12 of 40
  entries are essays, cut them" saves a whole build plan.
- **reuse**: if the entry is already a Life Hub tool, set
  `{ "tool": "<existing id>", "fit": "exact | variant", "differences": ["…"] }`.
  Run `node scripts/book-pack/check.mjs --tools` to list every existing tool with its id,
  name and family. A `variant` lists exactly where this book's version differs, citing pages.
  Reuse saves the most build time, so check every entry.
- **family**: use one of the engine's chart families where it fits. Read the header comment
  of each file in `packages/decision-book/families/` and copy its config shape exactly into
  `structure`:

  | family | shape |
  |--------|-------|
  | `quadrant` | 2×2 on two labelled axes |
  | `plot` | named points on 1–10 axes; bubbles, bands, several plots |
  | `scales` | profiles: opposed pairs, independent axes, or shares of 100 |
  | `curve` | a conceptual curve over named regions; the person marks where they stand (shapes: `u rise fall s bell tail spike chasm lag`) |
  | `tension` | forces around a centre: `pull`, `gap` or `triangle` |
  | `path` | ordered steps: yes/no `flow`, `stages` (optionally looping), or `layers` |
  | `list` | grouped entries: `checklist rows lanes routes pyramid roles` |

  For a well-made example of each, see `packages/decision-book/models/section-1.mjs` to
  `section-4.mjs`: each model's `chart` object is exactly what goes in `structure`.
  The checker builds every entry with the real factory, so a malformed structure fails.
- **proposedFamily**: when nothing fits (a timer, a habit tracker, a recurring routine, a
  board), set `family: "proposed"` and give
  `{ "name": "timer", "why": "…", "shape": "the data it would need", "entries": ["gt_…"] }`.
  Before proposing a family, try hard to fit an existing one: a new family costs a build
  plan, while a forced fit costs only an awkward chart. Group entries under the fewest
  proposed families.
- **facts**: every structural claim must cite a page inside the entry's pages, with an anchor
  phrase. This covers axes and their direction, cell positions, stage order, counts, timings
  and labels. Then reread each page against your structure and set `check`:
  - `matched`: it agrees.
  - `corrected`: you found and fixed an error, and the note says what changed.
  - `unsure`: you could not settle it, and you have added an open question.
- **seeAlso**: only the book's own cross-references, resolved to ids.
  **pairsWell**: your own suggestions. These may be existing tool ids, but must not repeat
  `seeAlso`.
- **step ids**: lower snake case, unique within the entry. Never use `choose`, which is
  reserved.

### 5. `overlap.md`

A table of every entry that matches an existing tool or another entry in this book, with the
verdict on each. Also flag entries that overlap the earlier books (Problem Solver and Decision
Maker). The `--tools` list covers both.

### 6. `process.md`

One page that answers:

- What shape is the book (catalogue, process or mixed), and what does that imply for a session?
- A proposed session flow in three to five stages, and what the coach does at each.
- A quick route, if the book has one: a two-minute version for when time is short.
- Natural groupings of the kept entries (the sections, or better ones).
- Which Life Hub hub and tab it most naturally sits in, and why. This is a suggestion only.

### 7. `questions.md`

Questions for Adam, each with your recommended answer. Ask only what changes the build, such
as scope, overlaps, cuts and placement.

### 8. Graphics library: `graphics/`

You will be given the book's cover. Every graphic in the library is built from the cover's
visual language. This is the step most likely to be rushed, so it has the most rules. **A
library of generic icons in the right colours fails.** Each mark must be a deliberate piece
of design that says something true about its entry.

**Do not draw charts.** Claude's renderers draw every chart from `structure`. The library is
only the identity, the section emblems and one emblem per entry.

#### 8a. Write the language first: `graphics/LANGUAGE.md`

Before drawing anything, study the cover and write down its rules, with numbers:

- **Motifs.** List every motif on the cover and what each stands for. On *The Get Things Done
  Book*, these are:
  - a red gear inside two blue circular arrows (the process, the cycle);
  - a blue and red target with a dark dart (the goal, the finish);
  - a dotted vertical line between them.

  The emblems are built from these, the way Decision Maker's are built from its cover's red
  disc, green disc, arrows and dotted line.
- **Geometry.** Stroke widths (a fixed set of two or three, in viewBox units), line caps and
  joins, the arrowhead shape (copy the cover's chunky triangular heads, with angle and size),
  gear tooth count and shape, ring proportions, dot spacing on dotted lines, and corner radii.
- **Grid.** Model emblems use `viewBox="0 0 140 140"` with a 20-unit safe margin. Section
  emblems use `0 0 240 240`. Say how marks sit on the grid.
- **Colour use.** Use at most three palette colours per emblem, plus paper as negative space.
  Say which colour means what (for example, blue for process and red for the target or action).
- **Distinctness.** Say how 40 emblems will stay distinguishable: each one shows its entry's
  structure (Pomodoro is four blocks with breaks; Kanban is columns; the 5 Whys is a chain
  drilling down), drawn in the cover's motifs.

#### 8b. Palette: `graphics/palette.json`

Sample the colours from the cover image you are given. In a small screenshot they read
roughly as: paper `#fefef7`, ink near-black, blue around `#4572a3`, red around `#d24c3a`,
and a dark slate dart. Sample from the best image you have and record the exact values.

Then propose a **screen** version. Decision Maker brightened its print colours at Adam's
request. Give both versions, and say which you recommend and why.

```json
{
  "print":  { "paper": "#…", "ink": "#…", "blue": "#…", "red": "#…", "slate": "#…" },
  "screen": { "paper": "#…", "ink": "#…", "blue": "#…", "red": "#…", "slate": "#…" },
  "tints":  { "blue_tint": "#…", "red_tint": "#…", "soft": "#…", "line": "#…" },
  "labels": { "red_label": "#… (a red that holds 4.5:1 for small text, if the main red does not)" },
  "strokes": [6, 9],
  "recommend": "screen",
  "why": "…"
}
```

Colour names are lower snake case and may differ by book. The checker computes contrast in
both `print` and `screen`:

- ink on paper must reach at least 7:1;
- each other main colour must reach at least 3:1 against paper (big shapes);
- each `labels` colour must reach at least 4.5:1 against paper or ink.

#### 8c. The files

```text
graphics/
  LANGUAGE.md
  palette.json
  graphics.json              manifest: one record per SVG
  identity/book-emblem.svg   the cover pair as one mark (viewBox 0 0 140 140)
  identity/book-emblem-mono.svg
  identity/wordmark.svg
  sections/<section_key>.svg one per section in book.json (viewBox 0 0 240 240)
  models/<entry_id>.svg      one per kept entry that does not reuse a tool (viewBox 0 0 140 140)
  contact-sheet.html         every SVG at 140, 48 and 24 px, on paper and on ink
  contact-sheet.png          a screenshot of that page
  critique.md                your review rounds
```

`graphics.json` entry:

```json
{ "file": "models/gt_pomodoro.svg", "for": "gt_pomodoro", "title": "The Pomodoro Technique",
  "concept": "Four blocks inside the cover's cycle arrows: work, pause, repeat.",
  "motifs": ["cycle_arrows", "blocks"] }
```

#### 8d. SVG rules (the checker enforces these)

- Write the SVG by hand, so the coordinates mean something. Use integers or one decimal
  place, and no editor metadata, `matrix()` transforms or converter output.
- Start every file with `<title>` matching its `graphics.json` title. `role="img"` goes on
  the root.
- Use only `svg`, `title`, `g`, `path`, `circle`, `ellipse`, `rect`, `line`, `polyline` and
  `polygon`. Do not use `text`, `image`, `style`, `script`, `foreignObject`, gradients,
  filters, masks or `use`.
- Every `fill` and `stroke` is a palette hex (any of its sets), `none` or `currentColor`.
- Every `stroke-width` comes from `palette.json`'s `strokes`.
- Size limits: models at most 3 KB, sections and identity at most 6 KB.
- No two emblems may be identical, and none may be a copy of a common icon set (Material,
  Lucide, Font Awesome, emoji).

#### 8e. Look at your own work: `critique.md`

1. Build `contact-sheet.html` and screenshot it to `contact-sheet.png`. Use headless Chrome,
   or `npx playwright screenshot`.
2. **Open the PNG and look at it.** For every emblem, write a line in `critique.md` that
   answers these questions:
   - Does it read at 24 px?
   - Can it be told apart from its neighbours?
   - Is it clearly from this cover?
   - Does it show its entry's structure?
   - Does any stroke clip at the edge?
3. Fix what fails and repeat. Do at least **two** rounds, each headed `## Round N` with
   what you changed.

The checker fails the pack if `contact-sheet.png` is older than any SVG, so the sheet must
be rebuilt after the last change.

---

## Pack layout

```text
book-packs/<slug>/
  book.json
  pages/            one .txt per printed page (private)
  figures/          figure crops (private)
  figures.json
  entries/          one .json per entry
  overlap.md
  process.md
  questions.md
  graphics/         palette, language, emblems, contact sheet, critique (step 8)
```

## The checker

From the life-hub repo:

```bash
node scripts/book-pack/check.mjs ~/Projects/life-hub-data/book-packs/<slug>
```

```bash
node scripts/book-pack/check.mjs --tools
```

The checker covers:

- **Every entry:**
  - fields, ids and prefix
  - pages, and a page file for each one
  - verdicts and tiers
  - reuse ids
  - family names
  - each structure, built through the real family factory
  - facts cite pages inside the entry
  - step ids, including the reserved `choose`
  - `seeAlso` and `pairsWell` resolve and do not repeat each other
- **Figures:** they point at real entries.
- **Copying:** no coaching field shares 8 or more words in a row with the page text.
- **Graphics:**
  - one emblem for every section and every kept entry, plus the three identity files
  - viewBox, title, allowed elements, palette colours, stroke widths and file size
  - no duplicate emblems
  - palette contrast
  - two critique rounds, and a contact sheet newer than every SVG

It prints errors, which must be fixed, and warnings, which must be read. It ends with a count
of `unsure` facts. The pack is done when the checker exits 0.
