# Alchemy Lab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put Alchemy Lab in Teaching Hub’s lesson editor and remove the Knowledge Hub Alchemist rail, keeping `/api/lesson-alchemist` as the archive capability.

**Architecture:** Teaching Hub `POST /api/alchemy-lab` (teacher session) proxies to Knowledge Hub `/api/lesson-alchemist` with `x-alchemist-secret`. The lesson editor opens a Lab panel in the existing right column. Knowledge Hub adds `#page/<id>` so cards can open a note.

**Tech Stack:** TypeScript, Vitest, Vite, Netlify Functions, Cotton Glass tokens. Two repos: `teaching-hub` (this plan’s home) and `knowledge-hub`.

**Worktrees:** `/Users/adamrussell/Teaching Hub/.worktrees/alchemy-lab` (`feature/alchemy-lab`) and `/Users/adamrussell/Projects/knowledge-hub/.worktrees/alchemy-lab` (`feature/alchemy-lab`).

**Specs:** `docs/superpowers/specs/2026-08-19-alchemy-lab-design.md` (this repo) and Knowledge Hub `docs/superpowers/specs/2026-08-19-alchemist-off-the-rail-design.md`.

**Block text fields (schema, not the spec’s first draft):** `rich_text` → strip `html`; `heading`/`cloze` → `text`; `quote` → `quote`; `callout` → `title` + `body`; `definition` → `term` + `definition`; `code` → `code`.

---

## File map

**Knowledge Hub**

- Create: `src/routing/pageHash.ts`, `src/routing/pageHash.test.ts`
- Modify: `src/main.ts` (hash + drop Alchemist rail)
- Modify: `src/api/client.ts` (delete `runAlchemist`)

**Teaching Hub**

- Create: `src/alchemy/blockQueryText.ts`, `src/alchemy/connections.ts`, `src/alchemy/client.ts`
- Create: `src/teacher/alchemy-lab-panel.ts`
- Create: `netlify/functions/alchemy-lab.mts`
- Create: tests under `tests/unit/`
- Modify: `scripts/mock-api.ts`, `src/teacher/lesson-editor.ts`, `src/styles/app.css`, `.env.example`

---

### Task 1: Knowledge Hub `#page/` parser

**Files:**
- Create: `src/routing/pageHash.ts`
- Test: `src/routing/pageHash.test.ts`

- [ ] **Step 1: Failing tests** for `pageIdFromHash` accepting `#page/note_1`, decoding `%2F`, rejecting `#page/`, `#alchemist`, `#/page/x`.
- [ ] **Step 2: Implement** `pageIdFromHash(hash: string): string | null`.
- [ ] **Step 3:** `npx vitest run src/routing/pageHash.test.ts` PASS
- [ ] **Step 4: Commit** `Add #page/ hash parsing for archive deep links.`

### Task 2: Knowledge Hub honour hash on boot

**Files:** Modify `src/main.ts`

- [ ] After `listPages()`, if `pageIdFromHash(location.hash)` is set, `openPage(id)` instead of list.
- [ ] `openPage` sets `location.hash = #page/<id>`.
- [ ] `hashchange` listener applies the same helper.
- [ ] Non-page rails clear a `#page/` hash only.
- [ ] Failed `getPage`: toast `That note isn't in the archive.`, stay on list.
- [ ] Commit `Open archive notes from #page/ after sign-in.`

### Task 3: Remove Knowledge Hub Alchemist rail

**Files:** Modify `src/main.ts`, `src/api/client.ts`

- [ ] Drop `"alchemist"` view, rail button, icon, state, `renderAlchemist`.
- [ ] Delete `runAlchemist` and `AlchemistConnection` / `AlchemistResult` from `src/api/client.ts` if unused.
- [ ] Keep `netlify/functions/lesson-alchemist.ts` and tests.
- [ ] Test: `src/main.ts` has no `data-nav="alchemist"` (file read assertion) OR grep in a small test.
- [ ] `npx vitest run netlify/functions/lesson-alchemist.test.ts` PASS
- [ ] Commit `Remove the Alchemist rail; keep the archive API.`

### Task 4: Teaching Hub `blockQueryText`

**Files:**
- Create: `src/alchemy/blockQueryText.ts`
- Test: `tests/unit/alchemy-block-query-text.test.ts`

- [ ] Heading text, rich_text html stripped, section children joined, null → `""`, cap 8000.
- [ ] Commit `Extract lesson-block text for Alchemy Lab queries.`

### Task 5: Connection parse + Knowledge Hub URL

**Files:**
- Create: `src/alchemy/connections.ts`
- Test: `tests/unit/alchemy-connections.test.ts`

- [ ] `parseAlchemyResult(raw)` keeps items with `sourcePageId` + `summary`, slices to 5.
- [ ] `knowledgeHubPageUrl(origin, id)` → `{origin}/#page/{id}`.
- [ ] Commit `Parse Alchemy Lab connections and Knowledge Hub note URLs.`

### Task 6: `POST /api/alchemy-lab` proxy

**Files:**
- Create: `netlify/functions/alchemy-lab.mts`
- Test: `tests/unit/alchemy-lab-route.test.ts` (mirror `ai-chat-route` env/session pattern)

- [ ] OPTIONS, 401, 503 if URL/secret missing, 400 empty text, forward secret header, 502 on KH 401.
- [ ] `export const config = { path: '/api/alchemy-lab', timeout: 60 }`
- [ ] Commit `Proxy Alchemy Lab through the teacher session.`

### Task 7: Mock API

**Files:** Modify `scripts/mock-api.ts`; Test: `tests/unit/alchemy-lab-mock.test.ts`

- [ ] Auth required; empty text 400; three fixture cards `mode: "local"`.
- [ ] Commit `Mock Alchemy Lab for local lesson editing.`

### Task 8: Lab panel

**Files:**
- Create: `src/teacher/alchemy-lab-panel.ts`
- Test: `tests/unit/alchemy-lab-panel.test.ts`
- Modify: `src/styles/app.css`

- [ ] Prefill on open; selection change does not overwrite; Find disabled when empty; hide; cards + Open links; busy label Finding links….
- [ ] Cotton Glass: `.alchemy-lab`, `.alchemy-lab-card`, `.btn`.
- [ ] Commit `Add the Alchemy Lab results panel.`

### Task 9: Wire lesson editor

**Files:** Modify `src/teacher/lesson-editor.ts`; Test: `tests/unit/lesson-editor.test.ts` (extend)

- [ ] Context-bar **Alchemy Lab** ghost button.
- [ ] Opens right column, hides AI panel; chat FAB shows AI again; Lab hide shelves column.
- [ ] `apiPost('/api/alchemy-lab', { lessonText })`.
- [ ] `.env.example` `KNOWLEDGE_ALCHEMIST_URL`, `ALCHEMIST_SHARED_SECRET`, `VITE_KNOWLEDGE_HUB_ORIGIN`.
- [ ] Commit `Open Alchemy Lab from the lesson editor.`

### Task 10: Verify both repos

- [ ] KH: `npx vitest run src/routing/pageHash.test.ts netlify/functions/lesson-alchemist.test.ts`
- [ ] TH: `npx vitest run tests/unit/alchemy-block-query-text.test.ts tests/unit/alchemy-connections.test.ts tests/unit/alchemy-lab-route.test.ts tests/unit/alchemy-lab-mock.test.ts tests/unit/alchemy-lab-panel.test.ts tests/unit/lesson-editor.test.ts`
- [ ] `npx tsc -p tsconfig.json --noEmit` in Teaching Hub
