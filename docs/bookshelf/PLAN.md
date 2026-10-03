# Knowledge Hub Bookshelf

Three views of the same books, built in this order. Mockups: Fore-edge (shelf + descent), Atlas (book as a map), Wireless (shelf as a radio dial).

## Decisions (Adam, 03/10/26)

- Old notes have no page. Adam places them by rough guess (the **Place loose pages** sheet). **Read my notes** fills any page the note text already names, marked as a guess.
- Book facts (pages, chapters, edition): ~200 books is too many to paste one by one. **Fill book facts** sends every book without a page count to Claude (Opus 5.5, one Message Batch, background, half price) and fills only blank fields, marked "estimated". Books Claude doesn't recognise are listed; those go through **Book facts → Copy ChatGPT prompt** by hand (prompt in `src/shelf/facts.ts`). Pasting real facts replaces an estimate.
- Book covers: Adam supplies a folder; Cursor adds them (job 0 below).
- Reading now: The Knowledge Gene, The Origins of Political Order, The Enigma of Reason (just started). Set in Book facts. The Enigma of Reason has no notes yet, so it goes on with **Add a book**.
- Cursor's production count (manifest `3e2db217`): 298 book notes across 23 books. The book origin "~10%" is a mistake: its one note ("Design Flaws in Traditional Education…") moves to a notebook via the note's origin pill, and the book then leaves the shelf on its own.
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

## Phase 1: Fore-edge (built)

- Bookshelf in the rail (Library), `#bookshelf`, `#bookshelf/<book>`, `#bookshelf/<book>/<note>`.
- Shelf: books flat, page-edge out, stance lines at their page, navy reading ribbon, sand slips for loose notes, notebook plaques, search threads across books.
- Inside a book: whole-book strip with scroll bracket, chapters, page column, note cards at their depth, links out to other books (click to walk into that book at that page). Phone: chapter-grouped list.
- Book facts sheet, Place loose pages sheet, Read my notes, reading page.
- New From-a-book notes save their page, stance and gaps automatically. The prompt asks for a `Verdict: supports|complicates|extends` line, which the stance reader prefers; a chapter-only locus ("ch 3") lands at the chapter's first page as a guess.
- Write-it-yourself notes with a book origin get a **Page in <book>** field in compose; it places the note on save.

## Phase 2: Atlas (built)

Inside a book, **Map** (default, remembered per viewer) or **By page** (the Fore-edge descent).

- **Provinces are chapters**, west → east in reading order (`src/shelf/atlasLayout.ts`). Long books merge adjacent chapters into at most 8 provinces, balanced by page span. Books without chapters fall back to themes: each note settles under its least common theme (placement `themes`, else its closed-vocabulary tags).
- **Towns** are notes: navy supports, sage extends, High Sea ink peaks for complicates, grey for stance not read yet. Size follows excerpt length and links. A ring marks notes settled this week; towns untouched for six months fade.
- **Fog** covers chapters with no notes yet ("Not written about yet · pp. x–y"), and each note's first open question drifts offshore as a fog patch.
- **Roads** are links between notes in the book. **Sea routes** run to other books, one per book with a count; clicking one walks into that book at the linked note.
- **Loose pages** (no page yet) sit on an island offshore.
- **Terrain** (`atlasTerrain.ts`) is note gravity: a hill per town, wider humps per province, contour bands, a navy coast and sea ripples, in kit pastels then the graph palette. It's rendered once per book shape and cached for the last three books.
- **Interaction** (`atlasView.ts`): drag, wheel or pinch zoom, double-click, arrow keys, and +/−/fit. Towns are buttons and open a card with Open note and See it by page. Labels are placed greedily so none overlap. Phones get a bottom-sheet card. An unfold animation plays on entry unless reduced motion is set.

## Phase 3: Wireless (built)

A **Shelf / Wireless** toggle on the Bookshelf (remembered per viewer, `knowledge-hub:shelf-room`). Code: `apps/knowledge/src/shelf/wirelessModel.ts` (pure: dial, signal, running order), `wireless.ts` (view + player), `wireless.css`.

- **Dial.** Notebooks are bands, busiest first, Unfiled last; books are stations on the AM 9 kHz grid (531–1602). Spines blur and pick up static with distance from the needle. Drag the glass (desktop: the needle follows; phone: the band slides under a fixed needle), turn the knob (drag or scroll), ‹ › for the next station, arrow keys on the glass (Shift or PageUp/Down jumps stations), 1–4 for presets. Presets are reading-now books, then the busiest. The needle remembers its station (`knowledge-hub:wireless-station`).
- **Tune in** starts a Podcast episode with `mode: "broadcast"`, `sourcePageIds` = the book's notes in the running order, and `modeDial: { book, author, order }`, where `order` is one `pageId | segment | page` line per note. Episodes generate only on press; the last broadcast per book is remembered in the browser (`knowledge-hub:wireless-episodes`) and Tune in replays it from where you stopped. **Cut a new broadcast** makes a fresh one.
- **Running order** (`runningOrder`): cold open (most-connected supporting note), then kept notes in page order: feature (supports or no stance), counterpoint (complicates), extends, crosstalk (links to another book's note), then a phone-in of up to 4 notes' open questions. Lengths cap the notes at 10 / 20 / 34.
- **Mixer.** Supports, Counter, Extends and Crosstalk faders set the share of each kept for the *next* broadcast. Counter also sets the Podcast `disagreement` dial (mild / medium / sharp). Length pills map to the Podcast `length` dial.
- **On air.** Running order (estimated times marked ≈ until recorded), waveform coloured by segment (bars are drawn per spoken line; widths use clip durations once loaded), transport with previous/next segment, Now card with Open note and Skip <segment>s, and Retune. **Hold this thought** pauses and opens Chat → From a book at that book and page.
- **Backend.** `parseEpisodeCommission` accepts `sourcePageIds` (deduped, max 120); `runGenerate` retrieves only inside them and errors honestly when none are indexed. `select.ts` queries a broadcast by book title and author. `prompts/clementine-podcast.md` has a Broadcast mode section.
- **Last broadcast** comes from the Podcast library (any device): the newest `broadcast` episode whose `modeDial.book` matches, with its running order rebuilt from `modeDial.order`. This browser's memory is the fallback.
- **Address.** On air is `#bookshelf/~air/<book>`. Back returns to the dial; reloading or coming Back from a note replays the saved broadcast and never cuts a new one.
- **Hold this thought** opens Chat → From a book at the page, with the composer pre-filled: book, page, time in the episode, segment, and the line being spoken.
- **Waveform**: lines that have played draw their real loudness, decoded from the clip, when storage allows the cross-origin read; other lines keep drawn bars.
- **Podcast page** names broadcasts "Wireless · <book>".
- **Errors** carry the Worker's detail through the Netlify proxy (`podcastFailureMessage`), so "Podcast start failed" says why.
- **Deploy.** The podcast kernel runs in the research Worker, which is deployed by hand: run `npm run research:deploy` from `apps/knowledge` after merge. Until then Tune in shows "The radio needs the research Worker redeployed".

## Cursor: back-end grunt only

Done: covers (#656, #658), Atlas themes (#652), the note count (298 notes across 23 books, 03/10/26). Kept below for the record.

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
