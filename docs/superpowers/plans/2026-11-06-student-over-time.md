# Student page: Over time — build plan

Spec: [`docs/superpowers/specs/2026-11-06-student-over-time-design.md`](../specs/2026-11-06-student-over-time-design.md)
Mockup: [`docs/mockups/student-over-time.html`](../../mockups/student-over-time.html)
Branch: `claude/student-over-time` (worktree `../life-hub-student-over-time`)

Build in three chunks: server, then the two client chunks in parallel, then the walk. Use one PR with the phases as commits. No grove. Run the gate once at the end.

## Chunk 1: Server (notes + organiser read)

**Task 1. Private notes store.**
- Files: `netlify/functions/_shared/teacher-notes.mjs` (new) and `netlify/functions/_shared/profile.mjs`.
- `teacherNotes(store, classId, studentId)`, `saveTeacherNote(...)` and `deleteTeacherNote(...)` on key `teacher-notes/{classId}/{studentId}.json`. A note is `{ id, at, text, tag? }`. Text is trimmed and capped at 2,000 characters. A tag must match `^(dp|out|skill|fam|tech|kp|du|vocab):`.
- Add actions `notes`, `note_save` and `note_delete` to `teacherProfileAction` only.
- Tests in `tests/unit/teacher-notes.test.js`: save, edit, delete and list newest first; bad tag rejected; the student `profileAction` rejects all three actions with `bad_action`; nothing is written under the feedback doc prefix.

**Task 2. One student's organiser read.**
- Files: `netlify/functions/_shared/organiser.mjs` and `profile.mjs`.
- Add a `habits` action on `teacherProfileAction` that returns `{ organiser: { streak, avg_box, weekly: [{ week, right, seen }] }, redrafts: n, steps: { set, acted } }`. Read the student's Leitner state as the organiser already stores it. Never write, and never touch `seen_at`.
- "Acted on" means that after a next step was set, a later redraft or piece exists for that step's code. Reuse the existing redraft and next-step records. If the records can't support this, return `acted: null` and the UI hides the count.
- Tests: synthetic student with boxes and two redrafts; a student with no organiser gets zeros, not an error.

## Chunk 2: Over time logic (client, pure)

**Task 3. `apps/teaching/src/evidence/over-time.ts` (new).**
- `overTime(evidence, studentId, opts: { range: 'unit' | 'term' | 'year', today, terms, unitStart })` returns:
  - `weeks`: labels like "T4 W3"
  - `me` and `cls`: weekly means on latest attempts, with `null` for weeks without evidence
  - `events`: `[{ week, kind: 'quiz' | 'writing' | 'viva' | 'sprint', title }]`, taken from sources (`quiz:`, `work:`, `assess:`, viva columns)
  - `tags`: `[{ tag, kind, history, now, change, cls, band, evidence: [{ date, source, title, part, mark }] }]`
  - `moves`: `{ rising?, slipping?, stuck? }`, each with a reason string
- Add the thresholds to `PRIORITY` in `evidence/constants.ts` as `OVER_TIME`.
- Map tag kinds to chip names. `kp:` and `du:` both go under Deep understandings. Vocabulary series come from the Task 2 weekly data.
- Remove students who have left the class from `cls`.
- Tests in `tests/unit/over-time.test.js`: weekly bucketing across the holiday gap; latest attempt wins; the one-piece New band; no padded moves when nothing qualifies; a stuck mix-up from repeated `why.type === 'named'`; the range cut-offs.

## Chunk 3: The tab (client UI)

**Task 4. Tab plumbing.**
- Files: `student/profile-view.ts` and `teacher/student-profile-page.ts`.
- Add `overTime?: () => HTMLElement` to `RenderProfileOptions`. Build the fourth tab with an "Only you" badge only when both `teacher` and `overTime` are set. `?tab=over-time` selects it, and switching tabs updates the URL with `replaceState`.
- The teacher page passes `overTime: () => mountOverTime(...)`. The panel loads lazily on the first open.

**Task 5. `teacher/over-time-view.ts` + `over-time.css` (new).**
- Load in parallel: `httpMarkbookApi.load`, `loadInsightContext`, `deepApi.load` for the class's current unit, and the profile actions `habits` and `notes`. Reuse the `progress` payload the page already has for codes and pieces, and pass it in rather than fetching it again.
- Sections in mockup order: banner, range pills, move cards, SVG trend with event dots and legend, Every tag (filter chips only for kinds present, three sorts, expanding rows), deep understandings bars, codes grid with trends, pieces list, habits tiles, notes (textarea, tag picker from the student's tags, edit and delete).
- Row buttons:
  - **Make it a next step:** opens the existing personal next-step composer with the tag filled in, as a draft.
  - **Add to a group:** opens the existing saved-group picker.
  - **Open the tag:** navigates to the Markbook pattern for that tag.
- At 390px: the change and class columns fold into the subtitle; the trend uses every second week label; the deep understanding rows stack.
- Use existing tokens and patterns: `pm-` and `pg-` classes, the pill buttons, and the wide-table rule (scroll inside a page-width box).
- A test in `tests/unit/over-time-view.test.js` (jsdom): the tab is absent without `teacher`; with no evidence it shows the plain empty state; the filter chip hides rows; clicking a row opens its evidence.

## Chunk 4: Walk + ship

**Task 6.**
- Dev mock: add invented evidence for one seed student across 8+ weeks (quiz, assess, work, viva) in the mock fixtures. Do not touch `apps/tasks` fixtures, so grove is not triggered.
- Walk at desktop and 390px: open the tab, use every filter and sort, open a row, add, edit and delete a note, refresh on `?tab=over-time`, sign in as the student and confirm there is no tab and the note actions are refused.
- Check the diff for full-suite triggers, then run `npm run pre-pr-check`. Open the PR ready for review with auto-merge (merge commit).
- After deploy: walk it on the live site with a real class, and check Safari.
