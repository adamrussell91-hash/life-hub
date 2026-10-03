# Build brief: book-note kinds (for Cursor)

**Paste this whole file into Cursor.** Book notes get a **kind** that says what the note is doing, replacing the old supports / complicates / extends **stance**. Every book note ends up with exactly one kind. This brief is the data layer and the grading pass. The Bookshelf views (colours, legend, Wireless, Islands, Atlas) are **Claude's**, per `docs/bookshelf/PLAN.md` ("Claude builds the UI. Cursor may take back-end grunt work only").

Before you start, read `docs/CURSOR-UI-FAILURES.md` (your `.cursor/rules/ui-failure-register.mdc` already requires it) and `docs/bookshelf/PLAN.md`.

---

## Why the stance is being replaced

Verified on `main` (41486bd) and `knowledge-hub-data` (d55350c) on 03/10/26:

- 292 book notes across 22 books. Read with the app's own `stanceFromBody`, **6 have a stance (all supports), 0 complicates, 0 extends, 286 none**. Only 12 notes have a "How this bears on the book" section, and none has a `Verdict:` line.
- Book notes are information *on* something in the book, so "does the web agree with the book" is almost always yes. The grade carries no information.
- A sample of 30 notes (3 from each of 10 books) shows what notes actually do: about two thirds condense the book's own content, and one third go out to look up a person, an idea or a case the book mentions. Some weigh rival accounts or correct a popular version; some draw out what an idea means for teaching. A keyword pass over all 292 found debate-type headings in about 39 notes and bridge-type headings ("implications for practice", "for teachers") in about 135.

## The five kinds

| Kind | Group | The note's main job |
|---|---|---|
| `person` | crystallised | Who someone is and what they contributed |
| `idea` | crystallised | A concept, term, mechanism or the book's argument, explained |
| `case` | crystallised | A specific event, study, example or story |
| `debate` | fluid | Where knowledge isn't settled: rival accounts, critics, a popular version that's wrong, an open question |
| `bridge` | fluid | Where the idea leads out of the book: implications for teaching or learning, or a link to another field or book |

**Every book note gets one kind. None is ever left blank.** Low confidence means `kindGuessed: true`, never no kind.

**Precedence when two fit:** `debate` > `bridge` > `case` > `person` > `idea`. `idea` is the kind used only when nothing else fits, and it is the easy default a lazy grader will reach for (it is the new "supports"). The prompt says so in those words.

---

## Build

### 1. Schema (`apps/knowledge/src/shelf/schema.ts`, `netlify/functions/_shared/knowledge-shelf.mjs`)

- `ShelfKindSchema = z.enum(["person", "idea", "case", "debate", "bridge"])`, plus `FLUID_KINDS = ["debate", "bridge"]` and `KIND_PRECEDENCE` in that order. Export them; every other file imports these (**V4**).
- `PlacementSchema` gains:
  - `kind: ShelfKindSchema.optional()`
  - `kindGuessed: z.boolean().optional()`
  - `kindBy: z.enum(["adam", "clementine", "claude"]).optional()`: who set it
  - `kindReason: z.string().max(300).optional()`: one line, shown to Adam
  - `kindAt: z.string().optional()`
- `cleanPlacement` in `knowledge-shelf.mjs`: validate the same fields, with a `SHELF_KINDS` constant mirroring the enum. Error text names the five kinds.
- **Leave `stance` exactly as it is.** The views still read it. Claude removes it after switching the views to `kind`.

### 2. Reading a kind out of a note (`apps/knowledge/src/shelf/model.ts`)

- `kindFromBody(body)`: reads a line `Kind: person|idea|case|debate|bridge` (same tolerance as the `Verdict:` reader: leading `>`, `*`, `-`, bold, a full-width colon). Unlike `stanceFromBody`, there is **no prose fallback**: no `Kind:` line means `undefined`.
- `buildShelf()` / `toNote()` carry `kind` and `kindGuessed` onto `BookNote` next to `stance`.
- `placementForBookNote` (`record.ts`) and `fillFromBody` (`backfill.ts`) set `kind` with `kindBy: "clementine"` when the line is present. **Read my notes** never overwrites an existing kind.

### 3. Clementine writes the kind (`apps/knowledge/prompts/clementine-book-note.md` and `config/knowledge/clementine-book-note.md`; the two are identical today, so keep them that way)

- Replace the `Verdict: supports|complicates|extends` instruction with: open the note with one plain line, exactly `Kind: <one of the five>`, with the five definitions and the precedence in a short table.
- Keep "How this bears on the book" as a section (tests in `loadFromDisk.test.ts` expect it) but drop the supports/complicates/extends framing. Rewrite it as "what this adds to your reading of the book".
- Update `bookNote.test.ts` / `loadFromDisk.test.ts` for the new wording.

### 4. The grader (`apps/knowledge/src/shelf/kindGrade.ts`, new; shared by the server op and the CLI)

- `kindPrompt(note)`: input is the title, book label, locus and body (first 6,000 characters).
- Asks for JSON only:
  `{ "kind": "...", "fallback": "person|idea|case", "evidence": "a sentence quoted from the note", "reason": "one line", "confidence": 0.0 }`
  - `fallback` is always one of the three crystallised kinds: the best crystallised fit, used if the fluid grade can't be backed up.
- The prompt states the precedence and what each kind needs:
  - `debate` needs a quoted sentence showing the disagreement, the correction or the open question.
  - `bridge` needs a quoted sentence pointing outside the book (to practice, teaching or another field).
  - `idea` only when nothing else fits.
  - **Do not use any note from `docs/bookshelf/kind-gold.json` as an example in the prompt.**
- `parseKindGrade(text, body)`:
  - A `debate` or `bridge` grade whose `evidence` isn't found in the body (compare with whitespace and case normalised) **is downgraded to `fallback`** and marked guessed, with the reason prefixed "Downgraded: quote not found."
  - `confidence` below 0.7, missing or non-numeric → `kindGuessed: true`.
  - An unparseable reply is retried once. If it fails again: `kind = "idea"`, `kindGuessed: true`, reason "Grader reply unreadable." It is counted separately in the summary.
  - The result is **always** one of the five kinds.
- Model: `FACTS_MODEL` from `knowledge-shelf-facts.mjs`. Do not add or change model ids.

### 5. Server ops (`netlify/functions/knowledge-shelf.mjs` + `_shared/knowledge-shelf-kinds.mjs`, new)

Mirror the book-facts batch pattern (`knowledge-shelf-facts.mjs`) rather than inventing a new one.

- `POST { op: "kinds-start", ids?: string[], regrade?: boolean }`: one Message Batch for every book note in the manifest that has no kind (or every note when `regrade` is true). **Never** includes notes with `kindBy: "adam"`. `regrade` also skips `kindBy: "clementine"`. Refuses while a batch is running.
- `POST { op: "kinds-check" }`: when the batch has ended, applies each result once as a placement patch with `kindBy: "claude"` and `kindAt`, and records the totals on the job: per kind, guessed, downgraded, unreadable.
- `POST { op: "kind", pageId }`: grades one note synchronously. It is used when a book note is saved without a `Kind:` line (write-it-yourself notes, or Clementine missing it), and is called from `recordBookNote` after placing. A failure never fails the note save (same rule as placing today).
- `POST { op: "place" }` already accepts `kind` patches. When Adam sets a kind, the client sends `kindBy: "adam"`, `kindGuessed: false`.
- Placements are read with `consistency: 'strong'` before every merge (already true in `getJSON`; keep it, **W5**).

### 6. Dry run CLI (`apps/knowledge/scripts/grade-kinds.ts`, `npm run grade-kinds` in `apps/knowledge`)

Flags: `--data-dir <path>` (required), `--book "<label>"`, `--limit N`, `--gold docs/bookshelf/kind-gold.json`. **Dry run only**: it calls the grader through `kindGrade.ts` directly and writes nothing. The real run is `kinds-start` against production.

It prints:
1. The total per kind, plus guessed, downgraded and unreadable counts.
2. The split per book, one row per book.
3. **Agreement with the gold set:** overall (n/30), a confusion table, and every miss with its title, gold kind, graded kind and reason.
4. Ten random `debate` and ten random `bridge` grades with their quoted evidence.

---

## The gate before the real run

`docs/bookshelf/kind-gold.json` is Claude's draft label for 30 sampled notes. **Adam confirms or corrects it and sets `"confirmed": true` first.** Then:

- Gold agreement **≥ 24/30**, with no fluid gold note (debate or bridge) graded `idea`. If it misses, fix the prompt and run again. Never edit gold labels to fit the grader.
- The per-book split must look plausible: textbooks (Purves, Clinical Neuroanatomy, Exploring the Brain, A Textbook of Neuroanatomy, Greenstein) heavily `idea` is expected; The Knowledge Gene with no `person` would not be. If every book comes out the same, investigate before going further (**D6**).
- Paste the CLI output into the PR. **Adam reads it before `kinds-start` runs on production.**

---

## Must not

- Leave any book note without a kind after `kinds-check` applies (a test asserts it).
- Overwrite a kind with `kindBy: "adam"`, ever. Don't overwrite `kindBy: "clementine"` unless `regrade` is set.
- Edit note bodies in the data repo. Kinds live in shelf placements only.
- Remove or rename `stance`, or touch `apps/knowledge/src/shelf/*View.ts`, `view.ts`, `wireless.ts`, `wirelessModel.ts`, `*Layout.ts` or `bookshelf.css`. Those are Claude's. If a type change breaks one of them, add `kind` alongside and keep it compiling; don't restyle anything.
- Run a scheduled or nightly grading pass. Grading happens on save (`op: "kind"`) and on demand (`kinds-start`).
- Add model ids or change `FACTS_MODEL`.

## Failure modes (from `docs/CURSOR-UI-FAILURES.md`)

| ID | Check for this feature |
|---|---|
| **D1** Made-up precision | `kindGuessed` is true for every low-confidence, downgraded or unreadable grade. A test feeds each case and asserts it. |
| **D4** Mapping tables that miss real values | `kindFromBody` and `parseKindGrade` are tested against real note text from the data repo (at least one per kind from the gold set), not invented strings. |
| **D6** Derived metric from partial input / degenerate distribution | The CLI prints the per-book split, and the PR records it. An all-one-kind result is investigated before shipping. |
| **V4** Parts disagree | One enum, one precedence list, one `kindFromBody`. Grep the diff: the five kind strings appear as literals only in `schema.ts` and the `SHELF_KINDS` mirror (plus tests and the prompt). |
| **V5** Save failure hides the reason | `kinds-start`, `kinds-check` and `kind` errors return the server's message (no API key, batch already running, unknown pageId). Tests cover each. |
| **W2** Works in tests, not in prod | One test drives `kinds-start` → `kinds-check` through the real handler with a fake Anthropic batch and a fake store, then runs `buildShelf()` and asserts every book note has a `kind`. |
| **W5** Read-modify-write | `kinds-check` merges into placements read with strong consistency. A test with a lagging store shows no placement written during the batch is lost. |
| **P3** Silent half-fix | Adam's complaint, reproduced and gone: after the run, the count of book notes with no kind is 0, and the split is not one kind. |
| **P4** Roadmap talk | No user-visible string mentions phases or later work. |
| **P5** Partial build | Steps 1–6 are all in scope. If you stop early, the PR title starts `PARTIAL:`. |

## Verify (in the PR body)

1. `npm run pre-pr-check` from the repo root: exit 0.
2. Unit tests:
   - `kindFromBody` variants
   - `parseKindGrade`: precedence, a missing quote downgraded to `fallback`, low confidence marked guessed, an unreadable reply retried and then defaulted
   - `cleanPlacement` validation
   - adam and clementine kinds never overwritten
   - the W2 end-to-end test
3. `npm run grade-kinds -- --data-dir <knowledge-hub-data> --gold ../../docs/bookshelf/kind-gold.json` output, in full: totals, the per-book split, gold agreement with misses, and the debate and bridge evidence samples.
4. **After Adam OKs the dry run:** run `kinds-start` on production, then `kinds-check`, and paste the job totals. Then show a count from the live `/api/knowledge/shelf` placements: book notes with no kind = 0.

## Files you'll touch

`apps/knowledge/src/shelf/{schema,model,record,backfill,client}.ts` (+ tests), `apps/knowledge/src/shelf/kindGrade.ts` (new, + test), `apps/knowledge/scripts/grade-kinds.ts` (new), `apps/knowledge/package.json`, `apps/knowledge/prompts/clementine-book-note.md`, `config/knowledge/clementine-book-note.md`, `apps/knowledge/src/chat/bookNote.test.ts`, `apps/knowledge/src/clementine/loadFromDisk.test.ts`, `netlify/functions/knowledge-shelf.mjs`, `netlify/functions/_shared/knowledge-shelf.mjs`, `netlify/functions/_shared/knowledge-shelf-kinds.mjs` (new) (+ tests).

## After this lands (Claude, not Cursor)

The views switch from `stance` to `kind`:
- five colours in two families (crystallised calm, fluid bright) and a legend
- `debate` notes as Islands and Atlas peaks, and the "contested island"
- Wireless segments: Backstory (person, case), Explains (idea), Counterpoint (debate), So what (bridge)
- guessed kinds drawn like guessed pages, with a one-tap correction that saves `kindBy: "adam"`

Then `stance` is removed.
