# Brainstorm block Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `brainstorm` lesson block: students send short answers by join code, the teacher's board shows them as orbiting symbols, and reveals them as a grid, word cloud or AI groups.

**Architecture:** Server module `_shared/brainstorm.mjs` holds all rules (caps, safety modes, what students may see), exposed by an operator-gated teacher function and a public student function, modelled on peer feedback. Symbol hand-out moves out of `peer-feedback.mjs` into `_shared/class-symbols.mjs` so both blocks share it. The client block lives in `apps/teaching/src/blocks/brainstorm/` split by job: editor, teacher, student, board (orbit and layouts), word cloud.

**Tech Stack:** Netlify functions (ESM, Blobs store), node:test for server, Vite + TypeScript + Zod + Vitest for the teaching app.

Spec: `docs/superpowers/specs/2026-10-18-brainstorm-block-design.md`.

---

## File map

| File | Job |
|---|---|
| `netlify/functions/_shared/class-symbols.mjs` (new) | `IDENTITIES`, `claimSymbol(store, keys, tokenHash)`, `claimedIds` (moved from peer feedback) |
| `netlify/functions/_shared/peer-feedback.mjs` | import the moved helpers, no behaviour change |
| `netlify/functions/_shared/brainstorm.mjs` (new) | `brainstormAction(store, lesson, block, body, { teacher, env, fetchImpl })` |
| `netlify/functions/_shared/brainstorm-groups.mjs` (new) | `groupAnswers({ question, answers, apiKey, fetchImpl, model })`, `parseGroups(raw, ids)` |
| `netlify/functions/brainstorm.mjs` (new) | teacher route `/api/lessons/:id/brainstorm/:block` |
| `netlify/functions/published-brainstorm.mjs` (new) | student route `/api/published/brainstorm/:id/:block` |
| `netlify/functions/_shared/public-student-routes.mjs` | add the student route |
| `apps/teaching/src/schemas/block.ts` | `BrainstormBlockSchema`, type list, union |
| `netlify/functions/_shared/teaching-block-schema.mjs` | regenerated |
| `apps/teaching/src/blocks/brainstorm/{index,editor,teacher,student,board,cloud}.ts`, `brainstorm.css` (new) | client block |
| `create-block.ts`, `registry.ts`, `render.ts`, `editors.ts`, `block-meta.ts`, `search-text.ts`, `publish-block-issues.ts` | wiring |
| `tests/unit/brainstorm.test.js`, `tests/unit/brainstorm-groups.test.js` (new) | server tests |
| `apps/teaching/tests/unit/brainstorm-block.test.ts`, `brainstorm-cloud.test.ts` (new) | client tests |

## Task 1: Move symbol hand-out to a shared module

- [ ] Create `class-symbols.mjs` exporting `IDENTITIES`, `shuffle`, `claimedIds(store, claimKey)`, `claimSymbol(store, { claim, token }, tokenHash)` with the exact logic now in `peer-feedback.mjs` (`join`, `claimedIds`, `shuffle`).
- [ ] Point `peer-feedback.mjs` at it; keep `export { IDENTITIES }` from peer feedback for existing imports.
- [ ] Run `node --test tests/unit/peer-feedback.test.js tests/unit/peer-annotate.test.js`. Expected: all pass, unchanged.
- [ ] Commit `Peer feedback: symbol hand-out moves to a shared module`.

## Task 2: Server rules (`brainstorm.mjs`)

Blob keys under `brainstorm/{lesson}/{block}`: `active`, `{session}/claims/{symbol}`, `{session}/tokens/{hash}`, `{session}/answers/{symbol}/{n}` (create-only, students), `{session}/moderation/{symbol}-{n}` (teacher), `{session}/groups` (teacher).

Content read from the published block: `question`, `safety` (`instant | approve | reveal`), `per_student` (1, 3, 5 or 0 = unlimited, server hard cap 20), `max_length` (140), `layout`.

Answer status: moderation wins (`shown` or `removed`); otherwise flagged → `pending`; otherwise `instant` → `shown`, `approve` → `pending`, `reveal` → `shown` but hidden from everyone but the teacher until `activity.revealed`.

Teacher actions: `status, start, end, reveal, hide, layout, students_see, symbols, symbols_on_cards, approve, remove, group, move, rename_group`. Student actions: `status, join, submit`.

Student response: `{ session, open, joined, symbol (only when show_symbols), per_student, mine: [{ text, status }], board: null | { revealed, layout, answers: [{ id, text }], groups } }`. `board` is present only when `students_see === 'all'`; in `reveal` mode before reveal, `answers` is `[]`. Never a symbol on board answers.

Teacher response: `{ session, code, open, revealed, layout, students_see, show_symbols, symbols_on_cards, joined, answers: [{ id, symbol, text, flagged, status, created_at }], groups }`.

Tests in `tests/unit/brainstorm.test.js` (fixture store as in `peer-feedback.test.js`):

- [ ] cap: with `per_student: 3`, the 4th submit rejects `/answer limit/`; `per_student: 0` caps at 20.
- [ ] instant: clean answer `shown`, flagged (`sh1t`) `pending`.
- [ ] approve: every answer `pending` until `approve`.
- [ ] reveal mode: student `board.answers` empty before reveal, full (unflagged) after.
- [ ] remove: removed answer gone from student `board` and teacher status `removed`; student's own list shows `removed`.
- [ ] students_see `own`: `board` is null.
- [ ] no symbol on any student board answer; `symbol` null unless show_symbols.
- [ ] over-length text rejects; empty rejects; wrong code rejects; new session forces rejoin.
- [ ] Implement, run `node --test tests/unit/brainstorm.test.js`, commit `Brainstorm block: server rules`.

## Task 3: AI grouping

- [ ] `parseGroups(raw, ids)`: parse JSON (strip code fences), keep 1–6 groups with non-empty names ≤ 40 chars, drop unknown IDs, each ID in one group only, unplaced IDs into a final `Other` group.
- [ ] `groupAnswers`: `completeMessage` with model `env.BRAINSTORM_GROUP_MODEL || 'claude-haiku-4-5'`, system prompt asking for `{"groups":[{"name","ids"}]}`, sending only the question and `shown` answers as `[{id,text}]`.
- [ ] Teacher `group` action stores `{ groups: [{ id, name, answer_ids }], made_at }`; `move` and `rename_group` edit it; answers not in any group appear client-side under "New".
- [ ] Tests in `tests/unit/brainstorm-groups.test.js`: parse rejects unknown IDs and duplicates; `group` sends only shown text (fake `fetchImpl` captures body, asserts no pending or removed text and no symbols); missing API key returns 503 `ai_unavailable`.
- [ ] Commit `Brainstorm block: AI grouping`.

## Task 4: Routes

- [ ] `brainstorm.mjs` mirrors `peer-feedback.mjs` (operator gate), passing `env` for the API key. `published-brainstorm.mjs` mirrors `published-peer-feedback.mjs` (16 kB limit, rate limit).
- [ ] Add `/^\/api\/published\/brainstorm\/[^/]+\/[^/]+$/` to `PUBLIC_STUDENT_API_ROUTES`.
- [ ] Test: teacher handler without operator session is refused (copy the peer feedback handler test pattern).
- [ ] Commit `Brainstorm block: routes`.

## Task 5: Schema and wiring

- [ ] `BrainstormBlockSchema` content: `question` (max 500, default ''), `safety` enum default `approve`, `per_student` in `[0,1,3,5]` default 3, `max_length` int 20–280 default 140, `layout` enum `grid|cloud|groups` default `grid`.
- [ ] Add `'brainstorm'` beside `'question_drop'` in every list in `block.ts`, `create-block.ts` (Learning group, labels, HOMEPAGE_EXCLUDED, unit-plan filter, default content), `registry.ts`, `render.ts`, `editors.ts`, `block-meta.ts` (description; icon), `search-text.ts` (question), `publish-block-issues.ts` (empty question is an issue).
- [ ] `node scripts/generate-alchemy-schema.mjs`.
- [ ] Commit `Brainstorm block: schema and wiring`.

## Task 6: Client block

- [ ] `editor.ts`: question, safety (three options with hints), per student, answer length, default layout.
- [ ] `board.ts`: `mountBoard(host, opts)` returning `{ update(answers, view), destroy() }`. Orbit with `requestAnimationFrame`, eased positions (factor 0.07), two rings to 30, three above, shapes shrink above 60, reduced motion holds still. Reveal places cards in grid, cloud or group columns. Cards carry the symbol unless `symbols_on_cards` is off; teacher cards get Remove.
- [ ] `cloud.ts`: `cloudWords(texts)` → `[{ text, count }]` (≤3-word answers as phrases, else words minus stop words).
- [ ] `teacher.ts`: start, code with Show on board, toggles, queue, board, group/regroup, drag between groups, rename.
- [ ] `student.ts`: join, answer box with draft, counter, own list with statuses, board when `students_see` is `all`, corner symbol.
- [ ] Tests: `brainstorm-block.test.ts` (insertable, schema round-trip, editor saves, print shows question); `brainstorm-cloud.test.ts` (phrases vs words, counts, stop words).
- [ ] Commit `Brainstorm block: lesson block`.

## Task 7: Verify and ship

- [ ] Browser check on the local teaching preview: orbit with 10 and 70 answers, reveal and back, three layouts, queue, students-see toggle in a second tab, 390px, reduced motion.
- [ ] `npm run pre-pr-check` exit 0.
- [ ] Push, open ready PR, enable auto-merge (merge commit).
