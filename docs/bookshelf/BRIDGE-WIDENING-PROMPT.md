# Cursor prompt: widen Bridge and regrade the Idea notes

**Paste this whole file into Cursor.** It follows `BOOK-NOTE-KINDS-BRIEF.md` (#672). Branch from `main` **after** Claude's kinds-fixes PR is merged: that PR changes `knowledge-shelf-kinds.mjs` (save-time grading keeps an existing kind, batch apply keeps Clementine's kinds, unreadable rows retry once) and adds `docs/bookshelf/kind-heldout-bridge.json`.

Read `docs/CURSOR-UI-FAILURES.md` first, especially **P6**, which comes from #672.

---

## What Adam wants

The first production run gave 211 of 292 book notes the kind `idea` and only 22 `bridge`. About 135 book notes have a section such as "Implications for Practice", "Implications for teaching" or "Implications for Learning and Development". Many of these carry a neuroscience, motivation or curriculum idea into the classroom, and the grader called them `idea` because the prompt said a closing section wasn't enough.

Adam wants **Bridge widened** so that a real teaching or learning section counts. Then every note currently graded `idea` is regraded **only to decide whether it stays `idea` or becomes `bridge`**.

## 1. The new Bridge definition (exact wording)

In `KIND_SYSTEM` (`netlify/functions/_shared/knowledge-shelf-kinds.mjs`), and in the Bridge row of the kinds table in both copies of `clementine-book-note.md`:

**Replace the `- bridge:` line with:**

```
- bridge: the page carries the idea out of the book's own subject: into teaching, learning, schools or curriculum, or into another field or book
```

**Replace these three sentences** ("A short closing tip for teachers is not enough for bridge…", "Clinical or in-domain professional implications…", and "When the page is organised around interpretive caution…") **with:**

```
A note is bridge when carrying the idea out is its main job, OR when it has a substantial section that does it: a heading of its own with at least a full paragraph or three points about teaching, learning, schools, curriculum or another field. A one-line tip is not enough.
Not bridge: practical steps that restate the book's own advice (a habits book's habit tips, a reasoning book's checklist), clinical or medical practice, and sections that only point ahead to later chapters. Those stay idea, case or person.
For bridge, quote the evidence from that section.
When the page is organised around rival accounts, a correction or an open question, choose debate, even if it also has an implications section.
```

Leave everything else in `KIND_SYSTEM` as it is, including the precedence `debate > bridge > case > person > idea`.

**P6:** don't add anything else to the prompt. No wording, titles or examples from `kind-gold.json` or `kind-heldout-bridge.json`. If the gates below fail, change the general definitions, show the diff, and score again on **both** sets.

## 2. Idea-only regrade

- `startKindsJob(store, { onlyKind, regrade, ids })`: when `onlyKind` is set, the batch takes only notes whose placement has `kind === onlyKind` and `kindBy === "claude"`. Never `adam`, never `clementine`. Store `onlyKind` on the job.
- `POST { op: "kinds-start", onlyKind: "idea", regrade: true }` passes it through. `onlyKind` must be one of the five kinds (`SHELF_KINDS`), or the request is refused with a message naming them.
- **Apply rule for an `onlyKind: "idea"` job** (in `checkKindsJob`):
  - Result `bridge` → write `kind: "bridge"`, `kindBy: "claude"`, `kindGuessed`, `kindReason`, `kindAt`, as usual.
  - Any other result → **leave the placement untouched**, keeping the existing `idea` with its old `kindGuessed` and `kindReason`. Results of `person`, `case` or `debate` are counted as `suggestedOther` and listed by note title in the job summary. They are not applied.
  - Re-check at apply time: if the placement's kind is no longer `idea` from `claude` (Adam or Clementine changed it during the batch), skip it (**W6**).
- `scripts/run-kinds-batch.mjs`: add `--only-kind idea` (it implies `--regrade`).
- Job summary fields: `examined`, `toBridge`, `stayedIdea`, `suggestedOther` (count plus titles), `guessed`, `downgraded`, `unreadable`, and `toBridgeByBook`.

## 3. Dry run first (writes nothing)

Extend `npm run grade-kinds` (`apps/knowledge/scripts/grade-kinds.ts`):
- `--held-out docs/bookshelf/kind-heldout-bridge.json`: scores bridge / not-bridge agreement on those 20 notes, listing every miss with its title, label, graded kind and reason.
- `--only-kind idea --placements <file>`: grades only the notes a placements export lists as `idea` from `claude`. Export the live placements read-only with the same environment `run-kinds-batch.mjs` uses. Never write to the store in a dry run.

It prints:
1. The gold score on `kind-gold.json` (v2: Math Anxiety and Engagement and Disaffection are now `bridge`).
2. The held-out score on `kind-heldout-bridge.json`.
3. For the idea set: `toBridge`, `stayedIdea`, `suggestedOther`, and `toBridgeByBook`.
4. 15 random idea → bridge flips with quoted evidence.
5. 10 random notes that **stayed** idea even though they have an implications or practice heading, each with its reason.

## Gates before the production run

- Gold **≥ 27/30**.
- Held-out **≥ 17/20**, with every miss listed. Don't edit either set to fit the grader.
- `toBridgeByBook` is plausible:
  - Clinical textbooks shouldn't flip wholesale; only their notes with an educational section should.
  - Atomic Habits and Critical Thinking practical-steps notes should mostly stay `idea`.
  - Education books (Motivation at School, Student Engagement, Deep Thinking, Ausubel) flipping heavily is expected.
- Paste the full dry-run output into the PR. **Adam reads it before the production run.**

## Must not

- Regrade or change any note whose kind isn't `idea`, or whose `kindBy` is `adam` or `clementine`.
- Apply any result other than `bridge` in this run.
- Change the model, `FACTS_MODEL` or the batch pattern.
- Touch the Bookshelf views (`apps/knowledge/src/shelf/*View.ts`, `view.ts`, `wireless*.ts`, `*Layout.ts`, `bookshelf.css`). Those are Claude's.
- Edit note bodies in the data repo.

## Failure modes (`docs/CURSOR-UI-FAILURES.md`)

| ID | Check for this change |
|---|---|
| **P6** Tuned on its own test set | The PR shows the prompt diff and confirms no phrase from either label set appears in it. It reports gold and held-out scores. |
| **W6** Batch overwrites a newer value | A test changes a note from `idea` to `adam` / `person` between start and apply; the apply skips it. |
| **D1** Made-up precision | A low-confidence `bridge` keeps `kindGuessed: true`. Test it. |
| **D6** Degenerate distribution | `toBridgeByBook` is in the PR. If every book flips, or none does, investigate before running. |
| **V4** One definition | The bridge wording appears in `KIND_SYSTEM` and the two Clementine prompt copies only; the two copies stay identical. |
| **P3** Silent half-fix | After the production run, the live count of `bridge` is reported next to the old 22, and of `idea` next to the old 211. |
| **P5** Partial build | Steps 1–3 and the production run are all in scope. If you stop early, the PR title starts `PARTIAL:`. |

## Verify (in the PR body)

1. `npm run pre-pr-check`: exit 0.
2. Tests:
   - `onlyKind` filtering (`claude` idea only)
   - only `bridge` applied
   - `suggestedOther` counted and not applied
   - the W6 skip
   - an invalid `onlyKind` refused with a message
3. The full dry-run output (sections 1–5 above).
4. **After Adam OKs the dry run:** `node scripts/run-kinds-batch.mjs --data-dir <knowledge-hub-data> --only-kind idea`, then paste the job summary and the new live split across all five kinds.

## Files you'll touch

`netlify/functions/_shared/knowledge-shelf-kinds.mjs`, `netlify/functions/knowledge-shelf.mjs`, `scripts/run-kinds-batch.mjs`, `apps/knowledge/scripts/grade-kinds.ts`, `apps/knowledge/prompts/clementine-book-note.md`, `config/knowledge/clementine-book-note.md`, `tests/unit/knowledge-shelf-kinds.test.js`, and `apps/knowledge/src/shelf/kindGrade.test.ts` if the parse tests need the new wording.
