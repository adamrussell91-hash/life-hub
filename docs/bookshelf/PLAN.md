# Knowledge Hub Bookshelf

Three views of the same books, built in this order. Mockups: Fore-edge (shelf + descent), Atlas (book as a map), Wireless (shelf as a radio dial).

## Decisions (Adam, 03/10/26)

- Old notes have no page. Adam places them by rough guess (the **Place loose pages** sheet). **Read my notes** fills any page the note text already names, marked as a guess.
- Book facts (pages, chapters, edition): ~200 books is too many to paste one by one. **Fill book facts** sends every book without a page count to Claude (Opus 5.5, one Message Batch, background, half price) and fills only blank fields, marked "estimated". Books Claude doesn't recognise are listed; those go through **Book facts → Copy ChatGPT prompt** by hand (prompt in `src/shelf/facts.ts`). Pasting real facts replaces an estimate.
- Book covers: Adam supplies a folder; Cursor adds them (job 0 below).
- Reading now: The Knowledge Gene, The Origins of Political Order, The Enigma of Reason (just started). Set in Book facts.
- Radio bands = existing Notebooks (set per book in Book facts).
- A one-off pass over book notes to read stance and gaps is approved (it's the **Read my notes** button; it reads note text, no model call).
- Wireless episodes generate only when Adam presses Tune in.
- Shelf keeps the rail; inside a book is immersive (rail and header hidden, Esc or ← Bookshelf returns).
- Phone layouts may differ in form (390px).
- Claude builds the UI. Cursor may take back-end grunt work only (see below).

## Data

Notes stay in the data repo. The Bookshelf keeps its own Netlify Blobs store, `knowledge-shelf`, behind `/api/knowledge/shelf`:

| Key | Holds |
|-----|-------|
| `books` | per title: author, edition, pages, chapters `[{label, title, start}]`, notebook, reading `{page}` |
| `placements` | per note id: page, guessed, stance (supports / complicates / extends), gaps, themes, lastOpened |

`src/shelf/model.ts` `buildShelf()` is the one model every view reads (failure register V4).

## Phase 1: Fore-edge (this PR)

- Bookshelf in the rail (Library), `#bookshelf`, `#bookshelf/<book>`, `#bookshelf/<book>/<note>`.
- Shelf: books flat, page-edge out, stance lines at their page, navy reading ribbon, sand slips for loose notes, notebook plaques, search threads across books.
- Inside a book: whole-book strip with scroll bracket, chapters, page column, note cards at their depth, links out to other books (click to walk into that book at that page). Phone: chapter-grouped list.
- Book facts sheet, Place loose pages sheet, Read my notes, reading page.
- New From-a-book notes save their page, stance and gaps automatically.

## Phase 2: Atlas

Regions from note tags (closed topic vocabulary, `archive/keywordGraph.ts`), fallback `archive/showAllCommunities.ts`. Deterministic, cached canvas terrain. Towns, roads (links), peaks (complicates), fog (gaps), sea routes (links to other books), fading by lastOpened. "By page" pill switches to the Fore-edge descent.

## Phase 3: Wireless

Dial built from notebooks as bands. New Podcast scope by book origin (today `podcast/select.ts` scopes by tag/area only) and a `broadcast` mode: cold open, features, counterpoints, crosstalk, phone-in (gaps). Counter fader maps to the existing `disagreement` dial. "Hold this thought" saves a note with book, page and episode time.

## Cursor: back-end grunt only

Not UI. Each item ships with tests and passes `npm run pre-pr-check`.

0. **Book covers (do first).** Adam has a folder of cover images. The UI is already wired: a cover shows in the book's header, in Book facts and in the Reading now card, and its colour sets the book's spine colour.
   - For each image, find the book's exact title as it appears on the Bookshelf (the note's book origin). Skip any image with no matching book and list it in the PR.
   - Save it as `apps/knowledge/public/books/<file>`, where `<file>` is `coverFileName(title)` from `src/shelf/covers.ts` (e.g. `why-dont-students-like-school.jpg`). JPEG, 600px tall, quality about 80, under 120 KB. Strip metadata.
   - Add one entry per cover to `apps/knowledge/src/shelf/covers.json`, keyed by the lower-case title (`bookKey(title)`): `"make it stick": { "file": "make-it-stick.jpg", "swatch": 7 }`.
   - `swatch`: average the cover's pixels (ignore near-white and near-black), then `nearestSwatchIndex(r, g, b)` from `src/shelf/palette.ts`. Do not invent colours.
   - `src/shelf/covers.test.ts` must pass: every entry points at a real file and a valid swatch.
   - Do not touch `view.ts`, `bookshelf.css` or any layout. If a cover looks wrong in the UI, report it; Claude fixes the UI.

1. **Themes for Atlas regions (Phase 2).** For each book note, pick up to 3 themes from the closed topic vocabulary (`canonicalTopicTag`) using its tags, and write them as `themes` via `POST /api/knowledge/shelf {op:"place"}`. Never overwrite a field that already has a value. Report counts per book.
2. **Book-note count report.** Count notes per book origin in production and post the table in the PR. This is the check that the Atlas has enough towns per book.

Failure register entries that apply to any UI change here: L1, L5, L9, S3, S4, V1, V3, V4, V5.
