# Game lessons — Phase 1 plan

Spec: `docs/superpowers/specs/2026-11-11-game-lessons-design.md` (§2, §4, §7, §9 Phase 1). Mockups: `docs/mockups/games/` (approved by Adam, 11 Nov).
Branch: `claude/game-lessons` (one long-running branch, phases as commits, one PR at the end).

Phase 1 gives the Game lesson type its data, publish path, solo endpoint, evidence and teacher/student shells. No game is playable yet: Phase 3 adds the first four players (crossword, find-a-word, Connections, Who said it), Phase 4 the live rooms.

Pattern to copy: Station Rotation (commit 836957f57 and `apps/teaching/src/rotation/`, `netlify/functions/_shared/rotation.mjs`, `rotation.mjs`, `published-rotation.mjs`, the publish branch in `lesson-publish.mjs`, the editor mount in `teacher/lesson-canvas/mount-page.ts`, the player mount in `student/lesson-view.ts`).

## Chunk A — data and server

1. **`apps/teaching/src/games/core/schema.ts`** (zod only).
   - Item shapes from spec §2.3: `TermItem`, `QuestionItem` (wraps `QuizQuestionDraftSchema` from `quiz/core.ts`, auto-markable kinds only), `QuoteItem` (+ `CastMember`), `GroupItem`. Every item has `id` and tags: `pieces` (kp regex as quiz), `outcomes`, `skills`, `tech`.
   - `Game` = `{ id, title, kind, ... }` discriminated on `kind` for all twelve kinds with the content and settings each needs per spec §6 (limits from the spec; team match `wrong_tap: 'back3' | 'start'` default `back3`; wager rules; etc.).
   - `GameLessonSchema = { games: Game[] (1–8), homework_closes_at?: string }` (draft), `PublicGameLessonSchema` (keys stripped).
2. **`games/core/model.ts`**: `gameIssues(lesson)` publish checks (spec §7 list), `splitGame(game) → { public, keys }`, `checkAnswer(itemKind, key, response)` (normalise case, accents, spacing, a/an/the; Question items use `markResponse`).
3. **`games/core/events.ts`**: `GameEvent` (spec §4.1), `eventsToEvidence(game, events) → EvidenceItem[]` with a `source: 'game'` marker and `strength`.
4. **Wire the lesson**: `LessonSchema.game`, `PublishableLessonSchema` issues hook, `PublishedLessonSchema` (`'game'` mode + `game`), `PLAYER_MODES` (+ server copy), `generate-alchemy-schema.mjs` entries → `_shared/game-schema.mjs`, `_shared/game-rules.mjs`. Regenerate.
5. **Server `_shared/games.mjs`**:
   - `prepareGamePublish` / `storeGameKeys` (`games/{lesson}/keys/{version}`), hooked in `lesson-publish.mjs`; `published-lesson.mjs` treats `game` like the other player modes for class context.
   - Student actions (`published-games.mjs`, `/api/published/game/:lesson`, public student gate, added to `public-student-routes.mjs`): `load` (arcade data: games, best/latest per game for this student), `solo_start` (play id), `solo_event` (batch ≤ 20 events, server checks each answer against stored keys, returns right/wrong), `solo_finish`.
   - Teacher actions (`games.mjs`, `/api/lessons/:lesson/game`, operator gate): `results` (per game: per item, per student, strength), `markbook_push`.
   - Storage per spec §4.1 (`games/{lesson}/{game_id}/plays|events|summary`).
   - **Organiser box 1** on finish: missed items whose `kp` piece is on an organiser line → that line to box 1, due tomorrow (reuse `organiser-model.mjs` and the etag write in `organiser.mjs`).
   - **Evidence**: game evidence reaches the class evidence and student profile readers as "right once" only. Games never count toward mastery: `evidence/mastery.ts` must ignore `source: 'game'` checkpoints (Adam, 11 Nov). Add a test that proves it.
6. **Tests**: app unit (schema limits, split never leaks keys, answer normalising, issues, events → evidence, mastery ignores games); server node:test (publish stores keys, student payloads never contain keys, solo batch marking, finish writes plays and box-1, results shape, markbook push).

## Chunk B — teacher and student screens

1. **Teacher editor** (`games/editor*.ts`), mounted in `mount-page.ts` like Rotation: tabs **Games · Settings · Results**.
   - Games tab: the lesson's games as a `createHubList` (add from a 12-kind picker with the mockup glyphs, rename, reorder, delete); selecting one opens its items editor: a table per item shape (inline edit, reorder, tags column, warnings inline). Per-kind settings (timer, mistakes, wrong tap, wager rules…) in a compact settings row.
   - **Build from this unit**: picker listing organiser Vocabulary/technique lines (keeps `piece_id` as `kp`), the unit's quiz questions, and quote blocks; tick to add. No AI.
   - Settings tab: homework close date.
   - Results tab: per game, per item and per student tables with Live/Team/Homework strength tags; Add to markbook.
2. **Student arcade** (`games/arcade.ts`), mounted in `lesson-view.ts`: game cards (glyph, title, kind, Solo/Live chips, best and latest result). Solo games say "Play" (opens the player in Phase 3; Phase 1 shows a "Coming next" state), live-only games say "Waiting for your teacher".
3. Eyebrow "Game"; dev preview page for the arcade and editor.
4. **Tests**: Vitest jsdom for editor (add/reorder/delete, Build from this unit adds tagged items) and arcade; one Playwright spec for the editor tabs at desktop and the arcade at 390.

## Gate

`npm run pre-pr-check` before the PR (end of the branch, not per phase). Per the no-grove rule, check the diff touches no grove/Tasks triggers.
