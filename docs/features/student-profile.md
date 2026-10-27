# Student profile: progress map

A student opens `/s/classes/<class>/profile` (the **My progress** link at the top of the class page) and sees their unit map in grey. It fills in colour as they finish lessons, and four bars fill as their work shows consistent top-end capacity. No login, no names stored, no new student data beyond done records.

Spec: `docs/superpowers/specs/2026-10-27-student-profile-progress-map-design.md`.

## Running it

1. Add **Learning → Done** at the bottom of each lesson students should be able to finish. The button text is the only setting.
2. A student whose device already holds a class claim taps once ("I've finished this (Done as AR)"). A new device shows an initials box; Done claims the initials (same messages as quizzes for unknown or taken initials) and then records the lesson.
3. A submitted quiz counts as done without a tick. There is no student undo.
4. **My progress** shows the class's current unit: lessons in order, support / extension / option lessons indented, quiz diamonds, a gold ring and "Next up" on the first core lesson not yet done. Support, extension and option lessons the student isn't assigned (the gradebook's `took` tick) are faded and dashed but still open, and fill when done.
5. Four bars sit above the map. Pale = building, strong = mastered. Students never see scores, percentages, counts, bands or any comparison.

## Mastery rules

All thresholds live in `apps/teaching/src/evidence/constants.ts` (`BANDS`, `MASTERY`) and `apps/teaching/src/skills/model.ts` (`RUNG_THRESHOLDS`).

- **Understanding, Responding, Concepts:** a checkpoint is a quiz with at least `BANDS.minQuestions` tagged questions averaging `BANDS.secure` (80%) or more. One checkpoint is building; `MASTERY.checkpoints` (2) separate quizzes is mastered.
- **Skills:** a checkpoint is one quiz or assessed piece. Capable or Skilled is building; Accomplished or Excellent on two separate checkpoints is mastered.
- "Separate" means different source columns or quizzes, not two questions in one.
- The server computes this (`profile-evidence.mjs`, bundled from `evidence/server-entry.ts`) and sends only fractions. The highest fractions per student and unit are kept (`profile/{class}/{student}/fills/{unit}`) so a bar never falls.
- What each bar is measured against (the item universe) is written up in the spec.

## Implementation

- Student endpoint: `POST /api/published/profile/:class` (`published-profile.mjs`, in `PUBLIC_STUDENT_API_ROUTES`). Actions `status`, `claim`, `done`. The student is whoever the device's class claim says; a student id in the request is ignored.
- Teacher endpoint: `POST /api/classes/:id/profile` (`class-profile.mjs`, operator session). Actions `list`, `remove`. The markbook `load` also returns `done` for the gradebook.
- Storage: `profile/{class}/{student}/done/{lesson}` `{ at, via }`, create-only; `profile/{class}/{student}/fills/{unit}`.
- Code: `_shared/profile.mjs`, `profile-done.mjs`, `profile-items.mjs`; `apps/teaching/src/student/profile-view.ts`, `blocks/done.ts`, `evidence/mastery.ts`.

## Verification

```bash
node --test tests/unit/profile.test.js tests/unit/profile-evidence.test.js tests/unit/markbook.test.js
cd apps/teaching && npx vitest run tests/unit/mastery.test.ts tests/unit/done-block.test.ts tests/unit/profile-view.test.ts
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium node tests/browser/profile.spec.mjs
```

Screenshots land in `/tmp/profile-*.png`.
