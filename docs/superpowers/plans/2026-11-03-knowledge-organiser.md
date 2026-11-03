# Knowledge Organiser Implementation Plan

Spec: [`docs/superpowers/specs/2026-11-03-knowledge-organiser-design.md`](../specs/2026-11-03-knowledge-organiser-design.md). Mockup: [`docs/mockups/knowledge-organiser.html`](../../mockups/knowledge-organiser.html).

**Goal:** a unit-level organiser the teacher grows lesson by lesson, with a student tab, Leitner practice saved under class initials, Ann line suggestions, a class run view and print.

**How it's built:** few big chunks, one PR, phases as commits, one `npm run pre-pr-check` at the end. No per-task reviewers. Chunk agents don't commit and run only their own new tests. Public repo, so tests and fixtures use invented data. Never run grove or the full Tasks suite.

## Shared contract

All chunks build to this. Change it only by telling the coordinator.

### Stored shapes

```
unit_organisers/{unit}
{ sections: [{ id, name, kind: 'table'|'list'|'sequence',
               columns?: [{ id, label, hide }],           // tables only, 2 to 4
               lines: [{ id, cells: string[], lesson_id?, piece_id? }] }],  // list and sequence lines have one cell
  week?: { section_id, due: 'YYYY-MM-DD', reason }, updated_at }

organiser_practice/{class}/{workOwner(class, student)}
{ boxes: { [line_id]: { box: 1..5, due: 'YYYY-MM-DD', last: 'YYYY-MM-DD' } }, at }
```

Limits: `ORGANISER_LIMITS = { sections: 8, lines: 200, cell: 400, reason: 80, columns: 4, name: 60 }`. Ids from `randomBytes`, prefixed `os_`, `oc_`, `ol_`.

### Teacher endpoint: `/api/units/:unit/organiser` (operator gate)

- `GET ?class=ID` returns `{ organiser, status: { [line_id]: 'released'|'waiting'|'lesson_gone' }, sheet? }`. `status` is released if released for any class that has the unit, or the lesson is published when no class has it. `sheet` is the released sheet for that class, for Run and Print.
- `POST { op, ... }` applies one change to a strong read and returns the same payload without `sheet`:
  `add_section { name, kind, columns? }`, `update_section { section_id, name?, kind?, columns? }` (cells follow column ids; removed columns drop their cell, new ones add `''`; table to list joins non-empty cells with ` - `, list to table gets two default columns with the second hidden), `delete_section`, `move_section { section_id, to }`, `add_lines { section_id, lines: [{ cells, lesson_id?, piece_id? }] }`, `update_line { line_id, cells?, lesson_id?, piece_id? }` (null clears), `delete_line { line_id }`, `move_line { line_id, section_id?, to }`, `set_week { week | null }`.

### Student endpoint: `/api/published/organiser/:class` (public student gate, POST, same guards as `published-profile.mjs`)

- `{ action: 'load', class_token }` returns:
  ```
  { need: null|'initials'|'no_list',
    sheets: [{ unit_id, title, current: boolean,
               week?: { section_id, section_name, due, reason },
               sections: [{ id, name, kind, columns?: [{ id, label, hide }],
                            lines: [{ id, cells, fresh: boolean }] }] }],
    practice: null | { today: number, cards: Card[], next: { date, count } | null } }
  Card = { line_id, section, cue_label, cue, answer_label, answer, more: [{ label, text }], builds?: string }
  ```
  `sheets` omits units with no released lines. `practice` is null unless the device holds a claim. `fresh` means released in the last 7 days. No piece ids or lesson ids reach students, and `builds` is the deep understanding's claim text.
- `{ action: 'review', class_token, results: [{ line_id, result: 'got'|'again' }] }`, up to 40. 403 `need_initials` with no claim. Unknown or unreleased line ids are ignored. Returns `{ today, next }`.
- `{ action: 'lesson', class_token, lesson_id }` returns `{ lines: string[] }`, the first cell of each released line from that lesson, for the end-of-lesson card.

### Rules

- **Release:** `lessonReleases` maps each lesson to its release day. A lesson needs a live draft and a published snapshot. The class date is the earliest non-skipped schedule row for that class and lesson. A future date means not released. Release day is the later of publish day and class date. A line with no lesson is always released and has no release day.
- **Days:** `sydneyDay(date)`, `addDays(day, n)`, Australia/Sydney, server only.
- **Cards:** table sections with at least one hidden and one shown column. Cue is the first shown column, answer the first hidden. Lines with an empty cue or answer make no card. A line joins the day after its release day.
- **Leitner:** `GAPS = [1, 3, 7, 14, 28]`. `applyResult(entry, result, today)`:
  - `again`: `{ box: 1, due: today, last: today }`.
  - `got` with `entry.last === today`: box unchanged, `due = today + gap(box)`. This covers both a resend and Got it on a repeat.
  - `got` otherwise: box up one (a new card counts as box 1), top is 5, `due = today + gap(box)`, `last = today`.
- **Today's cards:** `due <= today`, oldest first, then new cards in sheet order, capped at `20 - done today`, where done today means `last === today && due > today`. A card with `due === today && last === today` is a repeat and doesn't count against the cap.

## Chunk A: server (first, on its own)

Files:
- Create `netlify/functions/_shared/organiser-model.mjs`: pure code. `ORGANISER_LIMITS`, `sydneyDay`, `addDays`, `applyChange`, `releasedSheet`, `buildCards`, `applyResult`, `todaysCards`.
- Create `netlify/functions/_shared/organiser.mjs`: `organiserTeacherAction`, `organiserStudentAction`, `OrganiserError`, `lessonReleases`, `organiserKey`.
- Create `netlify/functions/organiser.mjs` (pattern: `anthology-knowledge.mjs`) and `netlify/functions/published-organiser.mjs` (pattern: `published-profile.mjs`).
- Create `netlify/functions/_shared/organiser-suggest.mjs`: `estimateOrganiserSuggest`, `runOrganiserSuggest`, `ORGANISER_SUGGEST_JOB_KIND = 'organiser_suggest'`, and `checkProposals` (pure).
- Modify `netlify/functions/ai-jobs.mjs`, `netlify/functions/ai-job-run.mjs`, `netlify/functions/_shared/teaching-ai-job-run.mjs`: add the kind the way `quiz_ai_mark` is added, including `dry_run` returning `{ estimate }` with `cost_aud`, the usage log and the deadline. The job record ends with `proposals: [{ section_id|new_section, cells, piece_id? , tag }]`. It writes nothing to the organiser.
- Modify unit hard delete in `apps/teaching/netlify/functions/_shared/lifecycle.mts`, or wherever it lives, to remove the blob.
- Test `tests/unit/organiser-model.test.js`, `tests/unit/organiser.test.js`, `tests/unit/organiser-suggest.test.js`, covering the Tests section of the spec. Assert unreleased text is absent from `JSON.stringify` of the student response.

Run: `node --import ./scripts/test-network-guard.mjs --test tests/unit/organiser*.test.js`.

## Chunk B: teacher UI (after A, alongside C)

Files:
- Create `apps/teaching/src/organiser/types.ts`, `api.ts`, `organiser.css` (shared with C; written first by this chunk, prefix `.ko-`, tokens from the mockup).
- Create `apps/teaching/src/organiser/sheet-editor.ts`: `mountOrganiserSection(host, { unit, lessons, classes, curriculum })`. The Set for this week box, sections, Usually hide pills, Add line, Paste, Bring in, reorder, Print, Run with the class, and the routine as help text in plain words.
- Create `apps/teaching/src/organiser/bring-in.ts`: pieces from `unit.deep_understandings` (first lesson via `deep/derive.ts`), Anthology items (`collectAnthology`), Knowledge plan `must` and `words` (`knowledge/plan.ts`). Skips text already on the sheet.
- Create `apps/teaching/src/organiser/lesson-card.ts`: `mountOrganiserCard(host, { lesson })`, with Add a line and Ann, suggest lines. The label shows the `dry_run` cost. It polls `/api/ai/jobs/:id` the way `quiz/ai-mark-run.ts` does, shows tick boxes, and Add these lines calls `add_lines`. It never opens chat.
- Create `apps/teaching/src/organiser/run-view.ts` and its route `/units/:id/organiser/run?class=`.
- Create `apps/teaching/src/organiser/print.ts`: `printOrganiser(sheet)`, used by both sides. Two pages, full and blank.
- Modify `teacher/sections/units.ts` (host after `deepHost`), `teacher/lesson-canvas/mount-page.ts` (card after `syllabus.element`, only with `lesson.unit_id`), `teacher/lesson-display.ts` (a chrome link to the run view), and the router.

Cell edits debounce and go one at a time per line. Test `apps/teaching/tests/unit/organiser-editor.test.ts`: paste parsing, bring-in skipping, no-card warning.

## Chunk C: student UI (after A, alongside B)

Files:
- Create `apps/teaching/src/organiser/student-panel.ts`: `renderOrganiserPanel(load, { classId, reload })`. Banner, Practise and Start, unit switch, folded sections with counts and "N new", Print my organiser.
- Create `apps/teaching/src/organiser/test-myself.ts`: Read, Cover, Check. Hide pills, typed cells, a tick per row, go again, Cover everything. Nothing saved.
- Create `apps/teaching/src/organiser/practice.ts`: the session, per the mockup. Again repeats in the session. Results post one at a time, failures queue in local storage under `teaching.organiser.pending.{class}` and go with the next `review`. Done screen shows next due.
- Create `apps/teaching/src/organiser/lesson-end-card.ts`: `mountOrganiserEndCard(content, { lessonId, classId })`.
- Modify `student/profile-view.ts`: `renderProfile` takes `options.organiser`, loaded in parallel with `progress`, and a failure leaves it null. Add the Organiser tab, change the early return per the spec, honour `?tab=organiser`, no tab with `options.teacher`, and a no-list class sees the sheet without the initials box.
- Modify `student/lesson-view.ts`: mount the card after content for plain lessons only, with `workClass` or the class found by `classForPlainLesson`, before the footer.

Student text says what students can do. No scores or marks. Test `apps/teaching/tests/unit/organiser-student.test.ts` and extend `profile-view.test.ts` per the spec.

## Chunk D: finish (coordinator)

1. Typecheck and fix anything between chunks. Commit in spec order.
2. Walk every mockup screen in the browser at desktop and 390px against dev mock data.
3. Measure Ann's cost on a synthetic lesson and report it.
4. Check the diff for full-suite triggers, run `npm run pre-pr-check`, open the PR with auto-merge.
