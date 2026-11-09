# Station Rotation: as built

The fifth lesson type, built from [the build design](../future-build-ideas/station-rotation/build-design.md). Every class, student, station and passage in the code, tests and screenshots is invented.

## Where it lives

| Piece | Files |
|---|---|
| Settings, public snapshot, presets, dial table | `apps/teaching/src/rotation/schema.ts` (server copy `netlify/functions/_shared/rotation-schema.mjs`) |
| Pure rules: levels, dial fade, path locks, recommendation, unlock graph, time budget, written-gate rules, injection pre-check, reply parsing, feedback | `apps/teaching/src/rotation/rules.ts` (server copy `rotation-rules.mjs`) |
| Publish checks, card roles and levels | `apps/teaching/src/rotation/model.ts` (`rotationIssues`), `seed.ts` |
| Teacher build tabs | `editor.ts`, `editor-tabs.ts` |
| Teacher live view | `live.ts` |
| Student player | `player.ts`, `station-card.ts`, `board.ts` |
| Server state and actions | `netlify/functions/_shared/rotation.mjs`, endpoints `rotation.mjs` and `published-rotation.mjs` |
| Written gate live check | `netlify/functions/_shared/rotation-writing.mjs` |
| Tests | `tests/unit/rotation*.test.js`, `apps/teaching/tests/unit/rotation-*.test.ts`, `apps/teaching/tests/browser/station-rotation.spec.ts` |

Local walk: `npm run dev` in `apps/teaching`, then teacher `/lessons/lesson_rotation_reef` and student `/s/classes/class_2026_08sci/lessons/lesson_rotation_reef` (initials AB, CD, EF or GH). The local written-gate checker is a stand-in model; nothing leaves the machine.

## Decisions taken while building

- **Card roles are block settings.** A block's place on the station card (`recall`, `goal`, `step`, `hint`, `gate`, `after`, `done`, `exit`), its level and its gate view live in `block.settings`, set from the station tab's "On the station card" list. Blocks play in role order, so "blurred blocks come after the gate" holds by construction; publish instead refuses after-gate steps with no gate, and more than one gate.
- **The written gate is a station setting, not a new block kind.** A new block type touches a dozen registries, and keeping the answer key and model answer in the stored config (never in public blocks) is simpler this way. It plays in the gate slot of the card.
- **Exit checks collect on an answer, not only a pass.** A wrong exit check is shown with the right answer and recorded for growth, and the piece is still collected, so a student is never stuck. The gate is what stops a misconception.
- **Flagged hinge gates wait for the teacher.** After the back-up miss the student can't keep guessing; they go on with other stations until the teacher opens it or calls their group.
- **Technique names.** The class list has "Incremental Repetition" but not "Repetition", so the checker also accepts the head word of multi-word names and the teacher's answer-key techniques.

## Cost

About A$0.01 a check and about A$0.55 for 28 students at two checks each, computed with `estimateCostUsd` from typical tokens. **Still an estimate**: replace it with measured figures from the first real dry run (the usage log records each check's real cost as `rotation_written_gate`).

## Not yet done

- **Levels from the last unit quiz** when a student misses the pretest: they start at Core and can take the pretest later.
- **Markbook evidence feed:** pretest and exit-check answers are stored per student on the server but don't yet flow into the evidence and knowledge-piece views. Gates write nothing, as designed.

## Screenshots (invented data)

Student at 1280: [map](screens/1280-2-map.png) · [gate reteach](screens/1280-3-reteach.png) · [board](screens/1280-4-board.png) · [written gate](screens/1280-5-written.png) · [finale](screens/1280-6-finale.png). At 390: [map](screens/390-2-map.png) · [board](screens/390-4-board.png) · [finale](screens/390-6-finale.png). Teacher: [build 1280](screens/1280-teacher-build.png) · [live 1280](screens/1280-teacher-live.png) · [build 390](screens/390-teacher-build.png).
