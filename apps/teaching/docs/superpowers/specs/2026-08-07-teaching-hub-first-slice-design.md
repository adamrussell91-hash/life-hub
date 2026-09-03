# Teaching Hub — First Slice Design

**Date:** 2026-08-07  
**Status:** Approved for implementation planning  
**Product name:** Teaching Hub (docs may still say “Teaching Day Book” as the internal product metaphor)

## Goal

Ship an end-to-end vertical slice: **create → edit → save draft → publish → open student URL**, using the curriculum and block model from the Teaching Day Book RTFs, and Life Hub patterns for hosting, auth, and local mock APIs.

Out of scope for this slice: AI, Google Drive, class scheduling, Scope and Sequence, A4 print, templates, search, version restore UI, multi-teacher roles.

## Decisions

| Topic | Choice |
|-------|--------|
| First deliverable | Lesson publish vertical slice |
| Stack | TypeScript + Vite, no React |
| Hosting | GitHub Pages (static shell) + Netlify Functions/Blobs (API + content) |
| Auth | Single-user passphrase + httpOnly session cookie (Life Hub style) |
| Design language | Clinical Glass tokens from Life Hub / RTF 05 (Depth, Marine, Wave, High Sea, Warm White, etc.) |
| Architecture approach | Spec-shaped typed core + Life Hub infra |

## Architecture

### Hosting split

- **GitHub Pages** serves the Vite `dist/` shell (teacher workspace + student lesson routes). Public repo holds application code only — no production secrets, no live teaching content.
- **Netlify** deploys Functions only (and Blob storage). `SITE_ORIGIN` allow-lists the Pages origin. Passphrase hash, session secret, and any future Anthropic key live only in Netlify env.
- **Netlify Blobs** store structured JSON teaching content. Editing or publishing a lesson must **not** trigger a site rebuild.

### Application shape

- One TypeScript codebase built with Vite.
- Teacher and student experiences share **schemas** and **block renderers**; they use different shells and routes.
- Teacher layout (from UX spec): left navigation rail, top context bar, main canvas. Right context panel may exist as an empty stub.
- Student lesson pages: no login; load published snapshots only.

### Domain (slice minimum)

Hierarchy used in navigation and ownership:

`Year → Subject → Unit → Lesson → Block[]`

Deferred entities: Class, Scheduled Lesson, Scope and Sequence, Media Reference, Templates, Redirect Record, Tag (beyond basic needs).

Seed data: one realistic path (recommended: Year 12 English Advanced → one Unit → several Lessons) so acceptance tests use real teaching shape, not dummy lorem alone.

## Data model

### Principles

- One source of truth per reusable object; relationships by ID.
- Immutable human-readable IDs (e.g. `subject_y12_engadv`, `lesson_aotfw_008`).
- Draft content separate from published student content.
- JSON is the canonical format; Zod validates on write and (where useful) on read.

### Common fields

`id`, `type`, `title`, `slug`, `status` (`active` | `archived` | `trashed`), `created_at`, `updated_at`, `schema_version`.

### Blocks (initial set only)

Shared base: `id`, `type`, `block_type`, `variant`, `visibility`, `content`, `layout`, `print`, `settings`, `schema_version`.

| block_type | Purpose |
|------------|---------|
| `rich_text` | Primary written content (sanitised HTML or equivalent) |
| `heading` | Document hierarchy (`page` / `section` / `subsection`) |
| `callout` | Semantic callouts (`information`, `important`, `warning`, `extension`, `scaffold`, `example`, `remember`, `teacher`) |

`visibility`: `student_teacher` | `teacher_only`. Student renderer excludes `teacher_only`.

### Draft vs publish

- **Save** updates the draft Lesson record in Blobs.
- **Publish** is explicit: validate → write an immutable **PublishedLesson** snapshot (blocks + metadata needed for student render) → return stable student URL.
- Students never read draft keys.

### Blob keying (logical)

One Blob store with prefixed keys for the slice (split into multiple stores later if needed):

- `years/year_12`
- `subjects/subject_y12_engadv`
- `units/unit_aotfw`
- `lessons/lesson_aotfw_008` (draft)
- `published/lessons/lesson_aotfw_008` (published snapshot)

## Components / modules

| Module | Responsibility |
|--------|----------------|
| `AuthGate` | Passphrase sign-in; session check; logout |
| `TeacherShell` | Rail, context bar, canvas chrome |
| `CurriculumNav` | Year → Subject → Unit → Lesson tree (collapse/expand; local persistence of expanded state) |
| `LessonEditor` | Inline title edit; block list; add / reorder; visibility toggle |
| `SavePublishControls` | Save state labels; manual save; publish with validation checklist |
| `StudentLessonView` | Fetch published snapshot; render student-visible blocks |
| `block-registry` | Schema + teacher editor + renderer per `block_type` |
| `api` client | Same contract for local mock and Netlify Functions |
| Design tokens | CSS variables aligned with Clinical Glass / Life Hub |

## Data flow

1. Teacher authenticates → Function verifies passphrase → httpOnly session cookie; CORS/`Origin` checked against `SITE_ORIGIN`.
2. Teacher opens a Lesson → Function returns draft JSON (auth required).
3. Edits update in-memory state; debounced autosave `PUT`s draft (Zod validate server-side). Navigation away with dirty state triggers immediate save attempt.
4. Publish → server validates → writes published snapshot → confirms success in UI (“Published” vs “Saved. Unpublished changes.”).
5. Student opens public URL → Function returns published snapshot only → client renders.

### Student URL (slice)

Public route: `/s/lessons/:lessonId` where `:lessonId` is the permanent lesson ID (e.g. `lesson_aotfw_008`). Slug may be shown in the page title but is not required for resolution. Redirect records deferred.

## Error handling

- Invalid save/publish payloads: reject; do not overwrite last good draft; do not partially publish.
- Publish blocked when title missing or blocks invalid: show checklist, no soft publish.
- Save/network failure: context bar shows Save Failed; retry available; do not silently discard dirty state.
- Expired/missing teacher session: re-prompt auth; student routes remain public.
- Missing published lesson: clear student 404/empty state (no draft leakage).

## Security (slice)

- Secrets only on Netlify: `TEACHING_HUB_PASSPHRASE_HASH`, `SESSION_SECRET`, later `ANTHROPIC_API_KEY`.
- Pages artifact contains no tokens or passphrase verifier.
- Teacher API requires valid session; student published-read endpoints are public but return published data only.
- Rich text sanitised; no arbitrary script execution in student render.

## Local development

- `npm run dev`: Vite + mock API implementing the same `/api/*` contract (fixtures under repo), passphrase isolated to local mock (Life Hub pattern).
- `npm run build`: produces Pages-deployable `dist/`.
- Tests do not require production Netlify or live Blobs.

## Testing

### Automated

- **Unit:** Zod schemas; visibility filtering; draft vs published key separation.
- **Integration:** mock auth → save draft → publish → student fetch excludes teacher-only and draft fields.
- **Browser (Playwright):** edit lesson → save → publish → open student URL → assert published student-visible content only.

### Acceptance (P0 for slice)

Aligned with RTF acceptance themes without Classes yet:

- English Advanced and English Standard remain separate Subject objects when both exist in seed/nav.
- Rename lesson title/slug does not change permanent ID.
- Student view never shows draft or `teacher_only` blocks.
- Content edit does not require application redeploy.

## Explicit non-goals (later phases)

AI agent (reuse Life Hub chat patterns when added), Google Drive media, scheduling / “today’s lessons”, Scope and Sequence timeline, A4 print, full block library, templates, version browser, Ann O’Tation / teaching agents from Life Hub Central Node.

## Source specs

Full product RTFs (01–06, 08 storage, 09 plan, 10 acceptance) in Downloads inform this design. They should be imported into `docs/specs/` during foundation work as the long-term source of truth. Where this slice design deliberately narrows scope, the slice wins until a later phase expands it.

## Success criteria

A teacher can sign in, open a seeded Unit, edit a Lesson with the three block types, see save state, publish, and open a public student URL that shows only published student-visible content — all without rebuilding the GitHub Pages site.
