# Resource Library Browse Stub Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Resource Library placeholder with a read-only list of seeded Media from curriculum, with Open when a URL is present.

**Architecture:** Add Zod `Media` schema and `media/{id}` blobs; include `media` on `GET /api/curriculum`; render a lesson-list-style browse page at `/resources`. No mutation APIs.

**Tech Stack:** TypeScript, Zod, Vite, Vitest, existing curriculum/mock-api/Netlify patterns

**Spec:** `docs/superpowers/specs/2026-08-08-resource-library-browse-design.md`

---

## File map

| Path | Responsibility |
|------|----------------|
| `src/schemas/media.ts` | Media Zod schema |
| `src/schemas/index.ts` | Re-exports |
| `src/storage/keys.ts` | `mediaKey` |
| `fixtures/seed.json` | `media` array (2–3 items) |
| `scripts/mock-store.ts` | Load media |
| `scripts/seed-blobs.mjs` | Write media blobs |
| `scripts/mock-api.ts` | Curriculum includes media |
| `netlify/functions/curriculum.mts` | List `media/` |
| `netlify/functions/_shared/blobs.mts` | Re-export `mediaKey` if needed |
| `src/teacher/nav.ts` | `media` on CurriculumResponse |
| `src/teacher/sections/resources.ts` | Browse list UI |
| `src/app/main.ts` | Wire resources route |
| `src/teacher/sections/placeholders.ts` | Remove or stop using resources placeholder |
| Tests | schema, seed, curriculum, resources UI |

---

### Task 1: Media schema

**Files:**
- Create: `src/schemas/media.ts`
- Modify: `src/schemas/index.ts`
- Create: `tests/unit/schemas-media.test.ts`

- [ ] **Step 1: Failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { MediaSchema } from '@/schemas/media';

const sample = {
  id: 'media_ono_extract',
  type: 'media' as const,
  title: 'Ono Extract',
  slug: 'ono_extract',
  provider: 'external' as const,
  media_type: 'pdf' as const,
  mime_type: 'application/pdf',
  file_name: 'ono-extract.pdf',
  preview_url: 'https://example.com/ono-extract.pdf',
  status: 'active' as const,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  schema_version: 1 as const
};

describe('MediaSchema', () => {
  it('accepts a valid media record', () => {
    expect(MediaSchema.parse(sample).id).toBe('media_ono_extract');
  });

  it('rejects invalid provider', () => {
    expect(() => MediaSchema.parse({ ...sample, provider: 'dropbox' })).toThrow();
  });

  it('rejects invalid media_type', () => {
    expect(() => MediaSchema.parse({ ...sample, media_type: 'audio' })).toThrow();
  });
});
```

- [ ] **Step 2: Implement**

```ts
import { z } from 'zod';
import { CommonFields } from './common';

export const MediaProviderSchema = z.enum(['external', 'google_drive']);
export const MediaTypeSchema = z.enum(['pdf', 'image', 'video', 'link', 'other']);

export const MediaSchema = z.object({
  ...CommonFields,
  type: z.literal('media'),
  provider: MediaProviderSchema,
  media_type: MediaTypeSchema,
  mime_type: z.string().min(1).optional(),
  file_name: z.string().min(1).optional(),
  preview_url: z.string().min(1).optional(),
  download_url: z.string().min(1).optional(),
  thumbnail_url: z.string().min(1).optional()
});

export type Media = z.infer<typeof MediaSchema>;
```

Re-export from `src/schemas/index.ts`.

- [ ] **Step 3: Tests PASS → Commit**

```bash
git commit -m "feat: add Media schema"
```

---

### Task 2: Storage key, seed, mock-store, seed-blobs

**Files:**
- Modify: `src/storage/keys.ts`, `fixtures/seed.json`, `scripts/mock-store.ts`, `scripts/seed-blobs.mjs`
- Modify: `tests/unit/storage-keys.test.ts`, `tests/unit/seed.test.ts`

- [ ] **Step 1: Key**

```ts
export function mediaKey(id: string): string {
  return `media/${id}`;
}
```

- [ ] **Step 2: Seed** — add top-level `"media": [ ... ]` with three items, e.g.:

1. `media_ono_extract` — pdf, external, `preview_url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf'` (or similar stable HTTPS PDF)
2. `media_syllabus_link` — link, external, `preview_url: 'https://educationstandards.nsw.edu.au/'` (or example.com)
3. `media_cover_image` — image, external, `preview_url: 'https://picsum.photos/seed/teachinghub/640/360'` (or omit URL to test no-Open row — prefer all three with URLs; optionally add a fourth without URL in tests only)

Use CommonFields timestamps matching other seed entities.

- [ ] **Step 3: mock-store + seed-blobs** — same pattern as `scope_sequences`

- [ ] **Step 4: Tests + commit**

```bash
git commit -m "feat: seed Media blobs for Resource Library"
```

---

### Task 3: Curriculum includes `media`

**Files:**
- Modify: `src/teacher/nav.ts`, `scripts/mock-api.ts`, `netlify/functions/curriculum.mts`, `netlify/functions/_shared/blobs.mts`
- Update curriculum fixtures in tests that construct `CurriculumResponse` (add `media: []` or seeded media)
- Extend `tests/unit/netlify-content-routes.test.ts` to assert media id present

- [ ] **Step 1:** `CurriculumResponse.media: Media[]`

- [ ] **Step 2:** mock-api + Netlify list/parse with `MediaSchema` (prefer listing active only, or filter `status === 'active'` when building response)

- [ ] **Step 3:** Tests PASS → Commit

```bash
git commit -m "feat: include media in curriculum API"
```

---

### Task 4: Resources browse UI + wire

**Files:**
- Create: `src/teacher/sections/resources.ts`
- Create: `tests/unit/sections-resources.test.ts`
- Modify: `src/app/main.ts`
- Modify: `tests/unit/sections-placeholders.test.ts` (drop or keep Classes-only if resources placeholder removed from use)
- Optionally remove `renderResourcesPlaceholder` if unused

- [ ] **Step 1: Failing UI tests**

```ts
it('lists active media titles sorted and Open when URL present', () => {
  // curriculum with two media: A with preview_url, B without
  renderResourcesIndex(canvas, curriculum);
  expect(canvas.textContent).toContain('Resource Library');
  // Open href = preview_url, target _blank, rel noopener
});

it('shows empty copy when no active media', () => {
  renderResourcesIndex(canvas, { ...curriculum, media: [] });
  expect(canvas.textContent).toContain('No resources yet');
});
```

- [ ] **Step 2: Implement**

```ts
export function openUrlForMedia(media: Media): string | undefined {
  const url = media.preview_url ?? media.download_url;
  return url && url.trim() !== '' ? url : undefined;
}

export function renderResourcesIndex(
  canvas: HTMLElement,
  curriculum: CurriculumResponse
): void {
  // heading Resource Library
  // filter status === 'active', sort by title
  // lesson-list rows: title, meta `${media_type} · ${provider}`, Open if openUrlForMedia
}
```

- [ ] **Step 3: Wire main.ts**

```ts
void loadNavAndHandleErrors(refs, token, 'resources', undefined, (curriculum) => {
  renderResourcesIndex(refs.canvas, curriculum);
});
```

- [ ] **Step 4: Commit**

```bash
git commit -m "feat: render Resource Library browse list"
```

---

### Task 5: Full regression

- [ ] **Step 1:** `npm run test:unit` — all pass  
- [ ] **Step 2:** `npx tsc -p tsconfig.json --noEmit`  
- [ ] **Step 3:** Fix fallout; commit only if needed  

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| Media schema | 1 |
| Seed + storage | 2 |
| Curriculum `media` | 3 |
| List UI + Open | 4 |
| Placeholder replaced | 4 |
| No mutations / Drive | (by omission) |

---

## Execution notes

- Prefer worktree under `.worktrees/` for subagent-driven development  
- Do not push unless asked  
