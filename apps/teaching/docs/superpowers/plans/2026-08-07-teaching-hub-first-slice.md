# Teaching Hub First Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Teaching Hub’s first vertical slice — sign in, navigate Year→Subject→Unit→Lesson, edit three block types, save draft, publish, and open a public student URL that shows only published student-visible content.

**Architecture:** Vite + TypeScript SPA (no React) on GitHub Pages; Netlify Functions + Blobs for auth and content; local mock `/api/*` with the same contract. Zod schemas are the source of truth for Year/Subject/Unit/Lesson/Block and published snapshots. Clinical Glass design tokens match Life Hub.

**Tech Stack:** Node 22+, Vite, TypeScript, Zod, Vitest, Playwright, Netlify Functions, Netlify Blobs, GitHub Pages Actions

**Spec:** `docs/superpowers/specs/2026-08-07-teaching-hub-first-slice-design.md`

---

## File map

| Path | Responsibility |
|------|----------------|
| `package.json` | Scripts: `dev`, `build`, `test`, `test:browser`, `generate:auth` |
| `tsconfig.json` / `vite.config.ts` | TS + Vite; mock API middleware on `/api` |
| `index.html` | SPA entry |
| `src/design/tokens.css` | Clinical Glass CSS variables |
| `src/styles/app.css` | Teacher + student layout |
| `src/schemas/*.ts` | Zod entities + inferred types |
| `src/blocks/visibility.ts` | Filter `teacher_only` for students |
| `src/blocks/sanitize.ts` | Allowlist sanitise rich text HTML |
| `src/blocks/registry.ts` | Block type → render/edit helpers |
| `src/blocks/render.ts` | Deterministic block HTML |
| `src/api/config.ts` | `API_BASE_URL` (blank local, Netlify in prod) |
| `src/api/client.ts` | `credentials: 'include'` fetch helpers |
| `src/auth/gate.ts` | Sign-in UI + session probe |
| `src/teacher/shell.ts` | Rail / context bar / canvas |
| `src/teacher/nav.ts` | Curriculum tree + localStorage expand state |
| `src/teacher/lesson-editor.ts` | Title + blocks editing |
| `src/teacher/save-publish.ts` | Save state + publish action |
| `src/student/lesson-view.ts` | `/s/lessons/:id` published render |
| `src/app/router.ts` | History router |
| `src/app/main.ts` | Boot |
| `fixtures/seed.json` | Y12 Eng Adv + Eng Std + unit + lessons |
| `scripts/mock-api.ts` | In-memory Blob store + auth for local/dev/tests |
| `scripts/generate-auth-secrets.mjs` | Scrypt verifier + session secret |
| `netlify/functions/_shared/*` | CORS, auth-security, blobs, validate |
| `netlify/functions/*.mts` | `/api/auth`, `/api/session`, `/api/logout`, curriculum + lesson + publish + published |
| `netlify.toml` | Functions only publish dir |
| `.github/workflows/pages.yml` | Build `dist/` → Pages |
| `tests/unit/*` | Schema, visibility, sanitize, keys |
| `tests/integration/*` | Auth → save → publish → student fetch |
| `tests/browser/*` | Playwright end-to-end |
| `docs/specs/*.md` | Imported RTF product specs |

**API contract (slice):**

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/api/auth` | no | Passphrase → session cookie |
| GET | `/api/session` | cookie | `{ authenticated, expiresAt }` |
| POST | `/api/logout` | cookie | Clear cookie |
| GET | `/api/curriculum` | teacher | Years/subjects/units/lesson summaries for nav |
| GET | `/api/lessons/:id` | teacher | Draft lesson |
| PUT | `/api/lessons/:id` | teacher | Save draft (Zod) |
| POST | `/api/lessons/:id/publish` | teacher | Write published snapshot |
| GET | `/api/published/lessons/:id` | public | Published snapshot only |

Local mock passphrase: `teaching-hub-local` (never a production credential).

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/app/main.ts`, `src/vite-env.d.ts`, `.env.example`, `README.md`

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "teaching-hub",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -p tsconfig.json --noEmit && vite build",
    "test": "vitest run",
    "test:unit": "vitest run tests/unit",
    "test:integration": "vitest run tests/integration",
    "test:browser": "playwright test",
    "generate:auth": "node scripts/generate-auth-secrets.mjs"
  },
  "engines": { "node": ">=22" },
  "dependencies": {
    "zod": "3.25.76"
  },
  "devDependencies": {
    "@netlify/blobs": "9.1.2",
    "@playwright/test": "1.54.2",
    "@types/node": "22.17.0",
    "typescript": "5.9.2",
    "vite": "7.1.2",
    "vitest": "3.2.4"
  }
}
```

Pin versions at install time if these exact versions are unavailable; prefer current stable matching Node 22.

- [ ] **Step 2: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["vite/client", "node"],
    "rootDir": ".",
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] }
  },
  "include": ["src", "scripts", "tests", "netlify"]
}
```

- [ ] **Step 3: Write minimal `vite.config.ts` and `index.html`**

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import path from 'node:path';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  build: { outDir: 'dist', emptyOutDir: true },
  server: { port: 5173 }
});
```

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Teaching Hub</title>
    <link rel="stylesheet" href="/src/design/tokens.css" />
    <link rel="stylesheet" href="/src/styles/app.css" />
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/app/main.ts"></script>
  </body>
</html>
```

```ts
// src/app/main.ts
const root = document.querySelector('#app');
if (root) root.textContent = 'Teaching Hub';
```

```ts
// src/vite-env.d.ts
/// <reference types="vite/client" />
```

```text
# .env.example — Netlify only; never commit real values
TEACHING_HUB_PASSPHRASE_HASH=
SESSION_SECRET=
SITE_ORIGIN=https://YOUR_USER.github.io
```

- [ ] **Step 4: Install and verify build**

Run: `npm install && npm run build`  
Expected: `dist/` created; no TS errors.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json tsconfig.json vite.config.ts index.html src .env.example README.md
git commit -m "chore: scaffold Teaching Hub Vite TypeScript project"
```

---

### Task 2: Import product specs from RTFs

**Files:**
- Create: `docs/specs/01_INFORMATION_ARCHITECTURE.md` … `10_ACCEPTANCE_TESTS.md` (convert from Downloads RTFs; note missing `00` and `08_SECURITY` — add a short `08_SECURITY.md` stub pointing at this slice’s security section)
- Create: `docs/specs/README.md` listing authority rules from RTF 09

- [ ] **Step 1: Convert each RTF with `textutil` and save under `docs/specs/`**

Run:

```bash
mkdir -p docs/specs
for n in 01 02 03 04 05 06 08 09 10; do
  textutil -convert txt -stdout "/Users/adamrussell/Downloads/$n.rtf" > "docs/specs/${n}_TMP.txt"
done
```

Rename to the names in RTF 09 (`01_INFORMATION_ARCHITECTURE.md`, etc.). File `08.rtf` content is **07 Storage** — save as `07_STORAGE_AND_PUBLISHING.md`. Create `08_SECURITY.md` with passphrase/session/CORS/Blob rules from the first-slice design.

- [ ] **Step 2: Commit**

```bash
git add docs/specs
git commit -m "docs: import Teaching Day Book product specs"
```

---

### Task 3: Design tokens and base CSS

**Files:**
- Create: `src/design/tokens.css`, `src/styles/app.css`

- [ ] **Step 1: Add tokens (Clinical Glass / Life Hub)**

```css
/* src/design/tokens.css */
:root {
  color-scheme: light;
  --warm-white: #FAF8F2;
  --depth: #0A1536;
  --marine: #142B51;
  --orca: #424860;
  --shallow: #A7ABB9;
  --wave: #376FB7;
  --high-sea: #F68620;
  --shore: #EAE7DA;
  --sand: #F0CFAC;
  --ink: #13213d;
  --muted: #657086;
  --line: rgba(20, 43, 81, 0.12);
  --glass: rgba(255, 255, 255, 0.72);
  --shadow: 0 1.4rem 3.5rem rgba(31, 53, 91, 0.09);
  --radius-lg: 1.5rem;
  --radius-md: 1.05rem;
  --rail-width: 15rem;
  font-family: "Source Serif 4", "Iowan Old Style", "Palatino Linotype", Palatino, serif;
  font-synthesis: none;
}
```

Use a purposeful serif for reading surfaces; pair UI chrome with `"Source Sans 3", ui-sans-serif, sans-serif` on controls via a `--font-ui` variable. Load fonts via Google Fonts link in `index.html` or self-host later.

- [ ] **Step 2: Minimal app shell CSS** (sign-in card, teacher grid: rail | main, student reading surface on `--warm-white`). Mirror Life Hub glass recipe for panels: warm white at controlled opacity, fine border, light shadow — not behind every paragraph.

- [ ] **Step 3: Commit**

```bash
git add src/design/tokens.css src/styles/app.css index.html
git commit -m "style: add Clinical Glass design tokens and base layout CSS"
```

---

### Task 4: Common + curriculum schemas (TDD)

**Files:**
- Create: `src/schemas/common.ts`, `src/schemas/year.ts`, `src/schemas/subject.ts`, `src/schemas/unit.ts`, `src/schemas/index.ts`
- Test: `tests/unit/schemas-curriculum.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { YearSchema, SubjectSchema, UnitSchema } from '@/schemas';

describe('curriculum schemas', () => {
  it('parses year_12 with subject refs', () => {
    const year = YearSchema.parse({
      id: 'year_12',
      type: 'year',
      title: 'Year 12',
      year_level: 12,
      slug: 'year_12',
      subject_ids: ['subject_y12_engadv', 'subject_y12_engstd'],
      status: 'active',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      schema_version: 1
    });
    expect(year.subject_ids).toHaveLength(2);
  });

  it('keeps English Advanced and Standard as separate subjects', () => {
    const adv = SubjectSchema.parse({
      id: 'subject_y12_engadv',
      type: 'subject',
      title: 'English Advanced',
      display_title: 'Year 12 English Advanced',
      slug: 'english_advanced',
      year_id: 'year_12',
      unit_ids: ['unit_aotfw'],
      outcome_ids: [],
      class_ids: [],
      status: 'active',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      schema_version: 1
    });
    const std = SubjectSchema.parse({
      ...adv,
      id: 'subject_y12_engstd',
      title: 'English Standard',
      display_title: 'Year 12 English Standard',
      slug: 'english_standard',
      unit_ids: []
    });
    expect(adv.id).not.toBe(std.id);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `npx vitest run tests/unit/schemas-curriculum.test.ts`  
Expected: FAIL (module not found)

- [ ] **Step 3: Implement schemas**

```ts
// src/schemas/common.ts
import { z } from 'zod';

export const StatusSchema = z.enum(['active', 'archived', 'trashed']);
export const IsoDateSchema = z.string().datetime();

export const CommonFields = {
  id: z.string().min(1),
  title: z.string().min(1),
  slug: z.string().min(1),
  status: StatusSchema,
  created_at: IsoDateSchema,
  updated_at: IsoDateSchema,
  schema_version: z.literal(1)
};
```

Implement `YearSchema`, `SubjectSchema`, `UnitSchema` per design/RTF 02 (unit includes `year_id`, `subject_id`, `lesson_ids`, optional `primary_term`, description fields as optional strings for slice).

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/schemas tests/unit/schemas-curriculum.test.ts
git commit -m "feat: add Zod schemas for year, subject, and unit"
```

---

### Task 5: Block + Lesson + PublishedLesson schemas (TDD)

**Files:**
- Create: `src/schemas/block.ts`, `src/schemas/lesson.ts`, `src/schemas/published-lesson.ts`
- Modify: `src/schemas/index.ts`
- Test: `tests/unit/schemas-lesson.test.ts`

- [ ] **Step 1: Write failing tests** for `rich_text` / `heading` / `callout` blocks, draft lesson with `blocks` array, reject unknown `block_type`, reject empty title on publish helper schema.

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement**

```ts
export const VisibilitySchema = z.enum(['student_teacher', 'teacher_only']);
export const BlockTypeSchema = z.enum(['rich_text', 'heading', 'callout']);

export const BlockBase = z.object({
  id: z.string().min(1),
  type: z.literal('block'),
  block_type: BlockTypeSchema,
  variant: z.string().default('medium'),
  visibility: VisibilitySchema,
  content: z.record(z.unknown()),
  layout: z.record(z.unknown()).default({}),
  print: z.record(z.unknown()).default({}),
  settings: z.record(z.unknown()).default({}),
  created_at: IsoDateSchema,
  updated_at: IsoDateSchema,
  schema_version: z.literal(1)
});
```

Discriminated refinements: `rich_text` content `{ html: string }`, `heading` `{ text: string }` + variant page|section|subsection, `callout` `{ style, title?, body }`.

`LessonSchema`: type `lesson`, `unit_id`, `sequence`, `blocks: BlockSchema[]`, optional `published_at`.

`PublishedLessonSchema`: snapshot with `lesson_id`, `title`, `unit_id`, `blocks` (student-safe copy already filtered or filtered at read), `published_at`.

- [ ] **Step 4: Tests PASS**

- [ ] **Step 5: Commit**

```bash
git add src/schemas tests/unit/schemas-lesson.test.ts
git commit -m "feat: add Zod schemas for blocks, lessons, and published snapshots"
```

---

### Task 6: Visibility filter + HTML sanitize (TDD)

**Files:**
- Create: `src/blocks/visibility.ts`, `src/blocks/sanitize.ts`
- Test: `tests/unit/visibility.test.ts`, `tests/unit/sanitize.test.ts`

- [ ] **Step 1: Failing tests**

```ts
it('drops teacher_only blocks for students', () => {
  const out = filterBlocksForStudent([
    { visibility: 'student_teacher', id: 'a' },
    { visibility: 'teacher_only', id: 'b' }
  ] as any);
  expect(out.map((b) => b.id)).toEqual(['a']);
});

it('strips script tags from rich text', () => {
  expect(sanitizeRichTextHtml('<p>Hi</p><script>alert(1)</script>')).toBe('<p>Hi</p>');
});
```

- [ ] **Step 2: Implement allowlist sanitiser** (tags: `p`, `br`, `strong`, `em`, `u`, `ul`, `ol`, `li`, `a[href]`, `blockquote`; strip `script`, `style`, event handlers). Prefer a small hand-rolled DOMParser allowlist for zero dependency, or `sanitize-html` if you add the dependency intentionally.

- [ ] **Step 3: Tests PASS + commit**

```bash
git commit -m "feat: filter teacher-only blocks and sanitize rich text HTML"
```

---

### Task 7: Seed fixtures

**Files:**
- Create: `fixtures/seed.json`
- Create: `tests/unit/seed.test.ts` (parse entire seed through Zod)

- [ ] **Step 1: Author seed** with:
  - `year_12`
  - `subject_y12_engadv`, `subject_y12_engstd` (Standard may have empty units)
  - `unit_aotfw` — Artist of the Floating World
  - Lessons `lesson_aotfw_001` … `_003` with mixed visibilities and all three block types
  - At least one `teacher_only` callout in lesson 008-style content (use `lesson_aotfw_008` as primary demo lesson per docs)

- [ ] **Step 2: Test seed parses; Eng Adv ≠ Eng Std IDs**

- [ ] **Step 3: Commit**

```bash
git commit -m "test: add Year 12 English Advanced seed fixtures"
```

---

### Task 8: Mock content store + key helpers (TDD)

**Files:**
- Create: `src/storage/keys.ts`, `scripts/mock-store.ts`
- Test: `tests/unit/storage-keys.test.ts`

- [ ] **Step 1: Tests for key helpers**

```ts
expect(draftLessonKey('lesson_aotfw_008')).toBe('lessons/lesson_aotfw_008');
expect(publishedLessonKey('lesson_aotfw_008')).toBe('published/lessons/lesson_aotfw_008');
```

- [ ] **Step 2: Implement `MockStore`** — Map of key → JSON string; `get/set/delete`; `loadSeed(seed)`; used by mock API and integration tests. Draft and published keys must remain distinct.

- [ ] **Step 3: Commit**

```bash
git commit -m "feat: add blob key helpers and in-memory mock store"
```

---

### Task 9: Mock API — auth + curriculum + lesson CRUD + publish (TDD)

**Files:**
- Create: `scripts/mock-api.ts`, `scripts/auth-local.ts`
- Create: `tests/integration/publish-flow.test.ts`
- Modify: `vite.config.ts` to mount middleware

- [ ] **Step 1: Write integration test**

```ts
it('auth → save draft → publish → student sees published only', async () => {
  const api = createMockApi({ seed: loadSeed(), passphrase: 'teaching-hub-local' });
  const auth = await api.request('POST', '/api/auth', { body: { passphrase: 'teaching-hub-local' } });
  expect(auth.status).toBe(200);
  const cookie = auth.headers.get('set-cookie');

  const draft = await api.request('GET', '/api/lessons/lesson_aotfw_008', { cookie });
  const lesson = await draft.json();
  lesson.data.title = 'Memory, Identity and Ono';
  lesson.data.blocks.push({ /* teacher_only callout */ });

  const saved = await api.request('PUT', '/api/lessons/lesson_aotfw_008', { cookie, body: lesson.data });
  expect(saved.status).toBe(200);

  const pub = await api.request('POST', '/api/lessons/lesson_aotfw_008/publish', { cookie });
  expect(pub.status).toBe(200);

  const student = await api.request('GET', '/api/published/lessons/lesson_aotfw_008');
  const snap = await student.json();
  expect(snap.data.blocks.every((b: any) => b.visibility === 'student_teacher')).toBe(true);
  expect(snap.data.title).toBe('Memory, Identity and Ono');

  // draft-only change after publish should not appear until re-publish
  lesson.data.title = 'DRAFT ONLY TITLE';
  await api.request('PUT', '/api/lessons/lesson_aotfw_008', { cookie, body: lesson.data });
  const student2 = await api.request('GET', '/api/published/lessons/lesson_aotfw_008');
  expect((await student2.json()).data.title).toBe('Memory, Identity and Ono');
});
```

Also test: unauthenticated GET draft → 401; invalid passphrase → 401; publish with empty title → 400; published GET never returns draft key fields like unpublished block drafts.

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement `createMockApi`** handling all routes in the contract table. Session: HMAC or HMAC-like token with `SESSION_SECRET=local-dev-secret`, httpOnly cookie name `teaching_hub_session`. Local passphrase compare plain equality to `teaching-hub-local` (production uses scrypt hash).

On publish: Zod-parse lesson; require non-empty title; `filterBlocksForStudent` + sanitize each rich_text; write `PublishedLesson` to published key; return `{ student_path: '/s/lessons/lesson_aotfw_008' }`.

- [ ] **Step 4: Wire Vite middleware** so browser `fetch('/api/...')` hits the mock during `npm run dev`.

```ts
// vite.config.ts (plugin sketch)
{
  name: 'mock-api',
  configureServer(server) {
    const api = createMockApi({ /* seed */ });
    server.middlewares.use(async (req, res, next) => {
      if (!req.url?.startsWith('/api/')) return next();
      await api.handleNodeRequest(req, res);
    });
  }
}
```

- [ ] **Step 5: Tests PASS + commit**

```bash
git commit -m "feat: add mock API for auth, draft save, and publish"
```

---

### Task 10: API client + config

**Files:**
- Create: `src/api/config.ts`, `src/api/client.ts`, `src/api/types.ts`
- Test: `tests/unit/api-client.test.ts` (mock fetch)

- [ ] **Step 1: Config**

```ts
const isLocalDev = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
export const API_BASE_URL = isLocalDev ? '' : 'https://YOUR_NETLIFY_SITE.netlify.app';
```

Document that production URL is committed like Life Hub (not a secret).

- [ ] **Step 2: Client helpers** — `apiPost/Get/Put` with `credentials: 'include'`, JSON parse, typed error `{ error: { code, message } }`.

- [ ] **Step 3: Commit**

```bash
git commit -m "feat: add Teaching Hub API client and base URL config"
```

---

### Task 11: Router

**Files:**
- Create: `src/app/router.ts`
- Test: `tests/unit/router.test.ts`

Routes:
- `/` → teacher home (auth required)
- `/lessons/:lessonId` → teacher lesson editor
- `/s/lessons/:lessonId` → student view (public)
- `/sign-in` → auth gate

- [ ] **Step 1: Implement History API router** with `navigate`, `mount`, `match`. Student routes skip auth redirect.

- [ ] **Step 2: Commit**

```bash
git commit -m "feat: add client-side router for teacher and student routes"
```

---

### Task 12: Auth gate UI

**Files:**
- Create: `src/auth/gate.ts`
- Modify: `src/app/main.ts`, `src/styles/app.css`

- [ ] **Step 1: Sign-in view** — brand “Teaching Hub”, passphrase field, submit → `POST /api/auth`, on success `navigate('/')`. On load, `GET /api/session`; if ok skip sign-in for teacher routes.

- [ ] **Step 2: Manual check** — `npm run dev`, sign in with `teaching-hub-local`.

- [ ] **Step 3: Commit**

```bash
git commit -m "feat: add passphrase auth gate for teacher workspace"
```

---

### Task 13: Teacher shell + curriculum nav

**Files:**
- Create: `src/teacher/shell.ts`, `src/teacher/nav.ts`, `src/teacher/home.ts`
- Modify: CSS

- [ ] **Step 1: Fetch `/api/curriculum`**, render left rail Year→Subject→Unit→Lesson. Persist expanded node IDs in `localStorage` key `teaching-hub.nav`.

- [ ] **Step 2: Home canvas** — Recently implied: list seed lessons + “Open” links (Today’s Classes deferred). Keep lightweight per UX spec.

- [ ] **Step 3: Context bar stub** on lesson route (title placeholder + save state slot).

- [ ] **Step 4: Commit**

```bash
git commit -m "feat: add teacher shell and curriculum navigation"
```

---

### Task 14: Block registry + renderers

**Files:**
- Create: `src/blocks/registry.ts`, `src/blocks/render.ts`, `src/blocks/editors.ts`
- Test: `tests/unit/render-blocks.test.ts`

- [ ] **Step 1: `renderBlock(block, mode: 'teacher' | 'student'): HTMLElement`** — heading levels, callout semantic classes mapped to tokens (Wave/Sand/High Sea sparingly), rich_text via `sanitizeRichTextHtml` + `innerHTML` only after sanitize.

- [ ] **Step 2: Teacher editors** — contenteditable or textarea for rich_text (textarea OK for slice); inputs for heading/callout; visibility select.

- [ ] **Step 3: Commit**

```bash
git commit -m "feat: add block registry, renderers, and teacher editors"
```

---

### Task 15: Lesson editor + save/publish controls

**Files:**
- Create: `src/teacher/lesson-editor.ts`, `src/teacher/save-publish.ts`
- Modify: `src/app/main.ts`

- [ ] **Step 1: Load draft via GET**, render title (inline edit), blocks list, Add Block menu (`rich_text` | `heading` | `callout`), reorder up/down, visibility toggle.

- [ ] **Step 2: Save state machine** — `saved` | `saving` | `unpublished_changes` | `published` | `save_failed`. Debounce 600ms autosave PUT. Manual Save button. Before `navigate` away, flush save.

- [ ] **Step 3: Publish button** — POST publish; on 400 show checklist from API error details; on 200 set state Published and show student URL link `/s/lessons/:id`.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat: add lesson editor with autosave and explicit publish"
```

---

### Task 16: Student lesson view

**Files:**
- Create: `src/student/lesson-view.ts`

- [ ] **Step 1: Route `/s/lessons/:lessonId`** loads public published API; 404 empty state if missing; render title + student blocks only; no teacher chrome, no auth.

- [ ] **Step 2: Manual verify** — publish from teacher, open student URL in private window.

- [ ] **Step 3: Commit**

```bash
git commit -m "feat: add public student lesson view from published snapshots"
```

---

### Task 17: Netlify shared auth + HTTP helpers

**Files:**
- Create: `netlify/functions/_shared/http.mts`, `auth-security.mts`, `blobs.mts`, `validate.mts`
- Create: `scripts/generate-auth-secrets.mjs`
- Test: port or duplicate passphrase verify unit tests under `tests/unit/auth-security.test.ts`

- [ ] **Step 1: Copy Life Hub patterns** — `guardRequestOrigin`, `withCors`, `preflightResponse`, scrypt verify against `TEACHING_HUB_PASSPHRASE_HASH`, session HMAC cookie `teaching_hub_session`, `SITE_ORIGIN` allow-list.

- [ ] **Step 2: `blobs.mts`** — getStore('teaching-hub') (or default); get/set JSON by key helpers from `src/storage/keys.ts` (share via relative import or duplicate thin wrappers to avoid bundling DOM code into functions).

- [ ] **Step 3: `generate-auth-secrets.mjs` prompts twice, prints env assignments.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat: add Netlify auth, CORS, and Blob helpers"
```

---

### Task 18: Netlify Functions for content API

**Files:**
- Create: `netlify/functions/auth.mts`, `session.mts`, `logout.mts`, `curriculum.mts`, `lesson.mts`, `publish.mts`, `published-lesson.mts`
- Create: `netlify.toml`, `netlify/public/index.html` (placeholder one-liner like Life Hub)
- Modify: `src/api/config.ts` comment for real API host

`netlify.toml`:

```toml
[build]
  publish = "netlify/public"
  functions = "netlify/functions"

[functions]
  node_bundler = "esbuild"
  external_node_modules = ["@netlify/blobs"]
```

Each function exports `config.path` matching the API contract. Teacher routes require session; `published-lesson` is public GET. Seed Blobs on first curriculum GET if empty (dev convenience) **or** document a one-shot `scripts/seed-blobs.mjs` — prefer explicit seed script so production does not auto-seed silently. For first deploy: run seed script with admin env locally against Blobs.

- [ ] **Step 1: Implement functions mirroring mock-api behaviour**

- [ ] **Step 2: Commit**

```bash
git commit -m "feat: add Netlify Functions for Teaching Hub content API"
```

---

### Task 19: GitHub Pages workflow

**Files:**
- Create: `.github/workflows/pages.yml`

- [ ] **Step 1: Workflow** — on push to `main`: Node 22, `npm ci`, `npm test`, `npm run build`, upload `dist/` with `actions/upload-pages-artifact`, deploy-pages. Same structure as Life Hub.

- [ ] **Step 2: Ensure `vite.config.ts` `base` works for project Pages (`/` for user/org site or `/Teaching-Hub/` for project pages). Default `base: '/'` and document custom domain / repo pages choice in README.

- [ ] **Step 3: Commit**

```bash
git commit -m "ci: deploy Teaching Hub dist to GitHub Pages"
```

---

### Task 20: Playwright acceptance test

**Files:**
- Create: `playwright.config.ts`, `tests/browser/publish.spec.ts`

- [ ] **Step 1: Config** — `webServer: { command: 'npm run dev', url: 'http://127.0.0.1:5173' }`, Chromium.

- [ ] **Step 2: Spec**

```ts
test('teacher publishes lesson visible on student URL', async ({ page, context }) => {
  await page.goto('/sign-in');
  await page.getByLabel('Passphrase').fill('teaching-hub-local');
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.getByRole('link', { name: /Artist of the Floating World/i }).click();
  await page.getByRole('link', { name: /lesson/i }).first().click();
  await page.getByLabel('Lesson title').fill('Memory, Identity and Ono');
  await page.getByRole('button', { name: /publish/i }).click();
  await expect(page.getByText(/published/i)).toBeVisible();
  const student = await context.newPage();
  await student.goto('/s/lessons/lesson_aotfw_008');
  await expect(student.getByRole('heading', { name: 'Memory, Identity and Ono' })).toBeVisible();
  await expect(student.getByText(/teacher only/i)).toHaveCount(0);
});
```

Adjust selectors to match implemented a11y labels.

- [ ] **Step 3: Run `npx playwright install chromium && npm run test:browser`** — PASS

- [ ] **Step 4: Commit**

```bash
git commit -m "test: add Playwright publish-to-student acceptance flow"
```

---

### Task 21: README + final verification

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Document** — local passphrase, `npm run dev`, test commands, Pages + Netlify split, env vars, seed script, link to design spec and `docs/specs/`.

- [ ] **Step 2: Run full suite**

```bash
npm test && npm run build && npm run test:browser
```

Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git commit -m "docs: add Teaching Hub README for local and deploy setup"
```

---

## Self-review (plan vs spec)

| Spec requirement | Task |
|------------------|------|
| Vite + TS, no React | 1 |
| GitHub Pages + Netlify Functions/Blobs | 18–19 |
| Passphrase auth | 9, 12, 17 |
| Year→Subject→Unit→Lesson | 4, 7, 13 |
| Blocks rich_text/heading/callout | 5, 14 |
| Draft vs publish separate keys | 8, 9, 15 |
| Student `/s/lessons/:id` public | 16, 9 |
| Clinical Glass tokens | 3 |
| No AI/Drive/scheduling | omitted by design |
| Unit/integration/Playwright tests | 4–6, 9, 20 |
| Import RTFs to docs/specs | 2 |
| Content edit ≠ site rebuild | Blobs + Pages split (18–19) |
| Eng Adv ≠ Eng Std | 4, 7 |
| Sanitize / no script | 6, 14 |

**Type names locked:** `YearSchema`, `SubjectSchema`, `UnitSchema`, `BlockSchema`, `LessonSchema`, `PublishedLessonSchema`, `filterBlocksForStudent`, `sanitizeRichTextHtml`, `draftLessonKey`, `publishedLessonKey`, `createMockApi`, cookie `teaching_hub_session`, passphrase `teaching-hub-local`.
