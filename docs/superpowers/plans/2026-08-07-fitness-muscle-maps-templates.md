# Fitness Muscle Maps + Template Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add muscle-map icon strips to Fitness sessions and a scrollable workout template library with detail sheet + Use today (planned confirm), with no Notion sync.

**Architecture:** Pure client mapping module + optimized assets; authenticated `GET /api/fitness/templates` loads GitHub templates + compact exercise-library index; Fitness UI renders rail/sheet; Use today builds a planned workout and confirms via existing `/api/chat/confirm`.

**Tech Stack:** Existing ESM PWA, Netlify Functions, GitHub Contents API, node:test.

---

## File map

| File | Responsibility |
|------|----------------|
| `assets/fitness/muscles/*.png` | Optimized highlight images |
| `js/app/muscle-maps.js` | Token → asset key resolution |
| `netlify/functions/fitness-templates.mjs` | Authenticated templates (+ library index) API |
| `js/app/fitness-templates-api.js` | Client fetch wrapper |
| `js/app/fitness-model.js` | Attach maps to hero; template rail model helpers as needed |
| `js/app/render-fitness.js` | Hero maps + templates rail |
| `js/app/fitness-template-sheet.js` | Detail sheet + Use today |
| `js/app/main.js` / `app-controller.js` | Wire load templates + confirm |
| `index.html` | Templates section + sheet markup |
| `css/app.css` | Rail, strip, sheet styles |
| `service-worker.js` | Precache muscle assets; bump cache |
| Tests under `tests/unit/` + `tests/integration/` | Mapping, API, render, candidate builder |

---

### Task 1: Muscle map resolver (TDD)

**Files:**
- Create: `js/app/muscle-maps.js`
- Create: `tests/unit/muscle-maps.test.js`

- [ ] **Step 1: Write failing tests** for coarse focus fallback, exercise-library fine tokens, dedupe, cap of 4, unknown → omit.

- [ ] **Step 2: Run** `node --test tests/unit/muscle-maps.test.js` — expect fail.

- [ ] **Step 3: Implement** `resolveMuscleMapKeys({ focus, exercises, libraryByName })` + `muscleAssetPath(key)` returning `/assets/fitness/muscles/${key}.png` (or scoped path matching app).

- [ ] **Step 4: Tests pass. Commit.**

```bash
git add js/app/muscle-maps.js tests/unit/muscle-maps.test.js
git commit -m "feat: resolve workout focus to muscle map asset keys"
```

---

### Task 2: Import and optimize muscle assets

**Files:**
- Create: `assets/fitness/muscles/*.png` (from Documents source art)
- Modify: `service-worker.js` (list new URLs; bump `CACHE_NAME`)

- [ ] **Step 1:** Copy/resize highlights with `sips` to max width ~480px into `assets/fitness/muscles/` using the kebab keys from the spec.

- [ ] **Step 2:** Add paths to `SHELL_FILES` / precache; bump shell cache version.

- [ ] **Step 3: Commit.**

```bash
git add assets/fitness/muscles service-worker.js
git commit -m "feat: add Fitness muscle highlight assets to shell precache"
```

---

### Task 3: Templates API

**Files:**
- Create: `netlify/functions/fitness-templates.mjs`
- Create: `tests/integration/fitness-templates-function.test.js` (mirror repo-manifest auth/GitHub mock pattern)

- [ ] **Step 1: Failing integration test** — unauthenticated 401; happy path returns templates with exercises + `libraryIndex` map of name → `{ target_area, focus_areas }`.

- [ ] **Step 2: Implement handler** at `/api/fitness/templates`: session verify, resolveTree, filter `isTemplatePath`, read blobs, `parseTemplateMarkdown`, read `EXERCISE_LIBRARY_PATH` for compact index.

- [ ] **Step 3: Tests pass. Commit.**

```bash
git add netlify/functions/fitness-templates.mjs tests/integration/fitness-templates-function.test.js
git commit -m "feat: expose authenticated Fitness templates API"
```

---

### Task 4: Client API + planned candidate helper

**Files:**
- Create: `js/app/fitness-templates-api.js`
- Create: `js/app/template-to-planned.js`
- Create: `tests/unit/template-to-planned.test.js`
- Create: `tests/unit/fitness-templates-api.test.js` (optional thin)

- [ ] **Step 1: Failing test** — `buildPlannedCandidateFromTemplate(template, { date, time })` yields confirmable workout fields.

- [ ] **Step 2: Implement** fetch + candidate builder (status planned, copy exercises/focus/day_type/session_kind/title).

- [ ] **Step 3: Commit.**

---

### Task 5: Fitness UI — maps on hero + template rail

**Files:**
- Modify: `index.html` (muscle strip container on hero; `#fitness-templates` rail)
- Modify: `js/app/render-fitness.js`
- Modify: `js/app/fitness-model.js` (optional: precompute map keys on hero)
- Modify: `css/app.css`
- Modify: `tests/unit/render-fitness.test.js` / `fitness-model.test.js`

- [ ] **Step 1: Failing render tests** for map imgs and empty/populated rail.

- [ ] **Step 2: Implement** render helpers (`renderMuscleStrip`, `renderTemplateRail`).

- [ ] **Step 3: Wire templates fetch in `main.js` / controller when Fitness loads or after refresh.

- [ ] **Step 4: Commit.**

---

### Task 6: Detail sheet + Use today

**Files:**
- Create: `js/app/fitness-template-sheet.js`
- Modify: `index.html`, `css/app.css`, `js/app/main.js` (or fitness controller)
- Create: `tests/unit/fitness-template-sheet.test.js`

- [ ] **Step 1: Failing tests** for open/close; Use today disabled when today completed; confirm called with planned candidate; overwrite prompt path when other planned exists.

- [ ] **Step 2: Implement** sheet + actions using `chatApi.confirm` and existing refresh hook.

- [ ] **Step 3: Precache any new JS modules in service worker; bump cache.

- [ ] **Step 4: Commit.**

---

### Task 7: Status doc + full verification

**Files:**
- Modify: `docs/IMPLEMENTATION_STATUS.md`

- [ ] **Step 1:** `npm test` — all pass.

- [ ] **Step 2:** Append Phase note for muscle maps + template library; Next Phase line.

- [ ] **Step 3: Commit.** Do **not** push unless Adam asks.
