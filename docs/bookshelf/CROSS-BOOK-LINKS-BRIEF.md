# Build brief: cross-book links (for Cursor)

**Paste this whole file into Cursor.** Adam wants cross-book links as a feature: the **Where they lead out** column inside a book (`apps/knowledge/src/shelf/view.ts`, descent view) is blank on every book because no book note links to a note in a different book. This build fills it.

Before you start, read `docs/CURSOR-UI-FAILURES.md` (your `.cursor/rules/ui-failure-register.mdc` already requires it) and `docs/bookshelf/PLAN.md`.

---

## What Adam wants

1. A pass that finds connections between notes in **different books** and grades each one with a **confidence** from 0 to 1.
2. **Confidence ≥ 0.80 → auto-approved.** The link is written straight away and appears in the descent view.
3. **Confidence < 0.80 → Adam decides.** It goes to his review queue with its score and reason, and he approves or dismisses it.

## What exists already (reuse it, don't build a second system)

Verified on `main` (0a06855) and the data repo on 03/10/26:

| Thing | Where | Fact |
|---|---|---|
| Link curator | `apps/knowledge/src/curator/` (`run.ts`, `propose.ts`, `candidates.ts`, `schema.ts`), CLI `apps/knowledge/scripts/run-curator.ts` (`npm run curator` in `apps/knowledge`) | Ranks candidates (lexical, plus vectors when `EMBEDDINGS_API_KEY` is set), asks Claude to judge them, writes `_curator/pending-proposals.json`. Relations: `related`, `builds-on`, `contrasts-with`. **No confidence field.** |
| Approve / dismiss | `netlify/functions/_shared/knowledge-curator.mjs` (`approveProposal`, `linkBoth`, `dismissProposal`, `applyCuratorAction`) | Approve writes `connected` on **both** `pages/<id>.json` files. Dismiss adds the pair to `_curator/dismissed.json`. |
| Review UI | `apps/knowledge/src/wiki/rail.ts` (`cardsHtml`) | Cards with Approve / Dismiss, plus Approve all / Dismiss all. |
| Bookshelf links | `apps/knowledge/src/shelf/model.ts:219` `buildShelf()` | `links` = each book note's `connected` ids whose target is a book note of a **different** book. `layout.ts` `orderedLinks` and `view.ts` render them as exits. |
| Data | `knowledge-hub-data` repo | 292 book notes across 22 books. 38 have any `connected`, **0 cross-book**. Pending queue: 2,257 proposals, **72 already cross-book**, never reviewed. |

**Why the curator never found these:** it only judges pages changed since `_curator/state.json` `lastProcessedSha`, capped by `RUN_CAP` (50), and candidates are drawn from the whole archive, so a book note's 15 candidates are mostly non-book notes. Old book notes are never compared with each other.

---

## Build

### 1. Confidence on every judgement (`src/curator/`)

- `propose.ts`: the prompt asks for `"confidence": 0.0–1.0` per proposal, with a rubric written into the prompt:
  - **0.9+**: same specific claim, mechanism, study or person; a reader of one note would clearly want the other.
  - **0.8–0.9**: one note directly builds on, applies or contradicts the other's specific point.
  - **0.6–0.8**: same topic, plausible but loose.
  - **< 0.6**: shared vocabulary only → return `related:false`.
- `parseJudgements`: read `confidence`, clamp it to [0, 1], and treat missing or non-numeric values as **0.5**. A malformed score must never auto-approve.
- `schema.ts`: add `confidence: z.number().min(0).max(1).optional()` to `PendingProposalSchema`. It stays optional because the 2,257 existing rows have no score. Mirror the change in `parsePendingProposal` in `knowledge-curator.mjs`, which currently **drops unknown fields**. Without that, the score is lost on the next approve/dismiss write.
- Constants in `schema.ts`: `AUTO_APPROVE_AT = 0.8`, `CROSS_BOOK_FLOOR = 0.6`. Anything below the floor is dropped, not queued.

### 2. A cross-book pass (new script, reusing curator pieces)

`apps/knowledge/scripts/run-cross-book.ts`, exposed as `npm run cross-book` in `apps/knowledge/package.json`. Flags: `--data-dir <path>`, `--dry-run`, `--book "<label>"` (one book only), `--limit N`.

- Group book notes the same way `buildShelf()` does: same `bookKey(origin.label)` for `origins[].kind === "book"`. **Import it from `src/shelf/model.ts`; don't re-derive it** (V8).
- For each book note, the candidate pool is **only book notes of other books**. Rank with the existing lexical/vector ranking and keep the top `CANDIDATE_CAP`.
- Send the judge the note body plus each candidate's title, excerpt **and book label**. Add one line to the prompt: "These are notes from different books. Link only when the ideas genuinely connect across the books."
- Skip a pair when its `pairKey` is already in `connected`, pending (including the existing 72), or `dismissed.json`.
- **≥ 0.80:** link both pages with the same `linkBoth` logic (`approveProposal`'s path) and append a record to a new `_curator/auto-approved.json`: `{ noteA, noteB, titleA, titleB, bookA, bookB, relation, rationale, confidence, approvedAt }`.
- **0.60–0.79:** append to `pending-proposals.json` with `confidence`.
- Judge each pair once, not once per side: if A→B was judged, skip B→A in this run.
- Print a summary: notes processed, pairs judged, auto-approved, queued, dropped, and the model and cost estimate.
- **Model:** use the same default `judgeLinks` uses. Do not change model ids. 292 notes × 1 call each is a one-off, not a cron.
- `--dry-run` writes nothing and prints the would-be auto-approvals and queue rows. **Run it on the real data first and paste the top 20 auto-approvals with their rationales into the PR body.** Adam reads them before the real run.

### 3. Ongoing: new book notes get cross-book candidates too

In `run.ts`, when the changed page is a book note, add the top 5 cross-book candidates to its normal candidate list. The same thresholds apply: ≥ 0.80 auto-approves, and lower scores are queued with their confidence. Keep `RUN_CAP`.

### 4. Make approved links actually show on the Bookshelf (must check)

`buildShelf()` reads `connected` from **`manifest.json`**, but `approveProposal` / `applyCuratorAction` only write `pages/<id>.json`. Check whether anything re-syncs the manifest (see `apps/knowledge/scripts/sync-manifest-from-pages.ts` and `knowledge-data.mjs` upsert). If it doesn't:
- The cross-book script updates the `connected` field of both manifest entries in the same run.
- `applyCuratorAction` does the same on approve. Re-read the manifest fresh before writing, using the sha-guarded put that `knowledge-data.mjs` already uses (**W5**). Never write a manifest loaded before a page write.

### 5. Review queue changes (`src/wiki/rail.ts`, small)

- Show the confidence on each card next to the relation, as a whole percent, e.g. `builds-on · 72%`. Old rows with no score show no percent: not "0%" and not "—%" (**D1**).
- When both notes are book notes of different books, show a `Cross-book` tag and each note's book label under its title.
- Sort by confidence, highest first. Unscored rows go last.
- A new **Auto-approved** section, collapsed by default, lists the last 50 rows of `auto-approved.json`, each with an **Unlink** button. Unlink removes both `connected` ids (pages and manifest), deletes the row, and adds the pair to `dismissed.json` so it is never re-proposed. Add `unlink` as a new action in `applyCuratorAction` and `/api` (same auth as approve).
- **Approve all** keeps working. Don't add an "approve all ≥ X" control unless Adam asks.

### 6. Bookshelf exits

No layout change. Check that the existing exits render once data exists. Each exit's label is the other book; under it, `p.<page> · <note title>`. Clicking it opens the other book at that note (it already does).

---

## Must not

- Change the 0.80 threshold or the 0.60 floor without Adam.
- Auto-approve anything whose confidence was missing, unparseable or defaulted.
- Run a scheduled or nightly full-archive model pass. The cross-book pass is a one-off command; ongoing work rides the existing curator run (step 3).
- Touch `apps/knowledge/src/shelf/view.ts` / `bookshelf.css` layout. PLAN.md: Claude builds Bookshelf UI. Report a broken exits column instead of restyling it.
- Rewrite or reformat the existing 2,257 pending rows beyond adding the optional field.
- Add a second link store. `connected` on pages (and manifest) stays the one source (**V8**).

## Failure modes (from `docs/CURSOR-UI-FAILURES.md`)

| ID | Check for this feature |
|---|---|
| **D1** Made-up precision | Unscored rows show no percent. Test: a fixture with `confidence` absent renders no `%`. |
| **V4** Parts disagree | The rail's "Cross-book" tag and the Bookshelf exits both use `bookKey` from `shelf/model.ts`. Test asserts one book-key function. |
| **V5** Save failure hides the reason | Approve, dismiss or unlink failures show the server message in the rail (`wikiError`), not a generic line. A test covers a 409. |
| **V8** Two renderers / stores | No new link store. Grep the diff for any write of links outside `connected`. |
| **W2** Works in tests, not in prod | One test drives `applyCuratorAction('approve')` end to end against a fake GitHub content store, then runs `buildShelf()` on the resulting manifest and asserts `book.links.length === 1`. |
| **W5** Read-modify-write | Manifest, pending, dismissed and auto-approved are each written with the sha from a read made *after* the page writes. Test with a store that 409s on a stale sha. |
| **I3** Silent empty states | Auto-approved section with zero rows says "Nothing auto-approved yet." |
| **R3** Breaks at 390 | 390px screenshot of a rail card with a long title, percent and Cross-book tag: nothing overflows. |
| **P3** Silent half-fix | Adam's complaint reproduced and gone (see Verify). |
| **P5** Partial build | Steps 1–5 are all in scope. If you stop early, the PR title starts `PARTIAL:`. |

## Verify (in the PR body)

1. `npm run pre-pr-check` from the repo root: exit 0.
2. Unit tests: confidence parse/clamp/default; threshold routing (0.80 → auto, 0.79 → queue, 0.59 → drop); pair dedupe against connected, pending and dismissed; same-book candidates excluded; unlink adds to dismissed.
3. `npm run cross-book -- --dry-run` on the real data repo: summary counts plus the top 20 would-be auto-approvals with book, note titles, confidence and rationale.
4. **After Adam OKs the dry run,** run it for real on `--book "The Neural Mind"` only, then open the live umbrella → Knowledge → Bookshelf → The Neural Mind → By page. Screenshot at 1440 and 390 showing exits in **Where they lead out**, then click one and screenshot the other book open at that note.
5. Then the full run, with the summary pasted into the PR.

## Files you'll touch

`apps/knowledge/src/curator/{propose,schema,run}.ts` (+ tests), `apps/knowledge/scripts/run-cross-book.ts` (new), `apps/knowledge/package.json`, `netlify/functions/_shared/knowledge-curator.mjs` (+ tests), the curator API function that routes actions, `apps/knowledge/src/api/wikiClient.ts`, `apps/knowledge/src/wiki/rail.ts` (+ CSS in the wiki rail stylesheet only).
