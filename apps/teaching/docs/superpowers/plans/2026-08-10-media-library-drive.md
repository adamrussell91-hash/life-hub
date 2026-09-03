# Media Library + Drive Implementation Plan

**Status: Done**

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Teachers add files via upload or Google Drive picker into a Media library; binaries land in Netlify Blobs so students get working URLs without Google login.

**Architecture:** Extend `MediaSchema` (`direct` + `provider_file_id` + `sharing`). Teacher-auth CRUD + multipart upload write metadata under `media/{id}` and bytes under `media_files/{id}`. Public `GET /api/media/:id/file` serves bytes. Drive uses GIS token + Picker in the browser only; client downloads the file then POSTs the same upload API (server never holds Drive tokens). Google-native docs are metadata-only `google_drive` records with sharing status. Wire Resources + cover/image library; publish warns on restricted Drive link-outs.

**Tech Stack:** TypeScript, Zod, Netlify Functions + Blobs, Vitest, Google Identity Services + Picker (client)

**Spec:** `docs/superpowers/specs/2026-08-10-media-library-drive-design.md`

---

## File map

| Path | Responsibility |
|------|----------------|
| `src/schemas/media.ts` | Providers, sharing, `provider_file_id` |
| `src/storage/keys.ts` | `mediaFileKey(id)` |
| `netlify/functions/_shared/blobs.mts` | Re-export key; binary get/set helpers if needed |
| `netlify/functions/media.mts` | `GET` list optional / `POST` create metadata → `/api/media` |
| `netlify/functions/media-item.mts` | `GET`/`PATCH` metadata → `/api/media/:id` |
| `netlify/functions/media-upload.mts` | `POST` multipart → `/api/media/upload` |
| `netlify/functions/media-file.mts` | **Public** `GET` bytes → `/api/media/:id/file` |
| `scripts/mock-api.ts` + `scripts/mock-store.ts` | Dev parity |
| `src/teacher/media-api.ts` | Fetch helpers (create, patch, upload, list via curriculum) |
| `src/teacher/drive-picker.ts` | GIS + Picker; mirror upload or link create |
| `src/teacher/sections/resources.ts` | Upload / Drive / edit / archive UI |
| `src/teacher/cover-picker.ts` | Refresh library after add (caller passes fresh `media`) |
| `src/blocks/editors.ts` | Image (+ attachment if cheap) “Choose from library” |
| `src/teacher/publish-warnings.ts` (or publish UI hook) | Restricted Drive media warnings |
| `src/styles/app.css` | Minimal Resources toolbar styles |
| `tests/unit/schemas-media.test.ts` | Extended schema |
| `tests/unit/media-api.test.ts` | Upload/CRUD/file serve via mock-api |
| `tests/unit/drive-picker.test.ts` | Pure helpers: mime→media_type, sharing map |
| `tests/unit/publish-media-warnings.test.ts` | Warning detection |
| `docs/BUILD.md` | Ship note; Next up |

**Limits (v1):** max upload **10 MiB**; allowed MIME: `image/jpeg`, `image/png`, `image/webp`, `image/gif`, `application/pdf`, `audio/mpeg`, `audio/wav`, `application/zip`, `text/plain`. Reject others with `400 validation_error`.

**URL shape:** stored `preview_url` / `download_url` = absolute origin + `/api/media/{id}/file` (mock + Netlify same path).

---

### Task 1: Extend Media schema + file key

**Files:**
- Modify: `src/schemas/media.ts`
- Modify: `src/storage/keys.ts`
- Modify: `netlify/functions/_shared/blobs.mts`
- Modify: `scripts/mock-store.ts` (if it duplicates keys)
- Modify: `tests/unit/schemas-media.test.ts`

- [ ] **Step 1: Failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { MediaSchema } from '@/schemas/media';
import { mediaFileKey } from '@/storage/keys';

const base = {
  id: 'media_ono_extract',
  type: 'media' as const,
  title: 'Ono Extract',
  slug: 'ono_extract',
  provider: 'external' as const,
  media_type: 'pdf' as const,
  status: 'active' as const,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  schema_version: 1 as const
};

describe('MediaSchema extensions', () => {
  it('accepts direct provider with provider_file_id and sharing', () => {
    const parsed = MediaSchema.parse({
      ...base,
      provider: 'direct',
      provider_file_id: 'drive_abc',
      sharing: 'public_link',
      preview_url: 'https://example.com/api/media/media_ono_extract/file',
      mime_type: 'application/pdf'
    });
    expect(parsed.provider).toBe('direct');
    expect(parsed.provider_file_id).toBe('drive_abc');
    expect(parsed.sharing).toBe('public_link');
  });

  it('rejects invalid sharing', () => {
    expect(() => MediaSchema.parse({ ...base, sharing: 'open' })).toThrow();
  });
});

describe('mediaFileKey', () => {
  it('stores binaries under media_files/', () => {
    expect(mediaFileKey('media_1')).toBe('media_files/media_1');
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (missing fields / key)

```bash
npm run test:unit -- tests/unit/schemas-media.test.ts
```

- [ ] **Step 3: Implement**

`src/schemas/media.ts`:

```ts
export const MediaProviderSchema = z.enum(['external', 'google_drive', 'direct']);
export const MediaTypeSchema = z.enum(['pdf', 'image', 'video', 'link', 'other']);
export const MediaSharingSchema = z.enum([
  'public_link',
  'restricted',
  'unknown',
  'unavailable'
]);

export const MediaSchema = z.object({
  ...CommonFields,
  type: z.literal('media'),
  provider: MediaProviderSchema,
  media_type: MediaTypeSchema,
  mime_type: z.string().min(1).optional(),
  file_name: z.string().min(1).optional(),
  preview_url: z.string().min(1).optional(),
  download_url: z.string().min(1).optional(),
  thumbnail_url: z.string().min(1).optional(),
  provider_file_id: z.string().min(1).optional(),
  sharing: MediaSharingSchema.optional()
});
```

`src/storage/keys.ts` — add:

```ts
export function mediaFileKey(id: string): string {
  return `media_files/${id}`;
}
```

Re-export from `blobs.mts` (and mock-store if needed). Keep existing seed media valid (optional fields).

- [ ] **Step 4: Tests PASS**

- [ ] **Step 5: Commit** `feat(media): extend schema with direct provider and sharing`

---

### Task 2: Media metadata API (POST + PATCH) + mock

**Files:**
- Create: `netlify/functions/media.mts` — `POST /api/media`
- Create: `netlify/functions/media-item.mts` — `GET|PATCH /api/media/:id`
- Modify: `scripts/mock-api.ts`
- Create: `tests/unit/media-api.test.ts` (start with metadata cases)

Follow `compositions.mts` / `unit.mts` auth + CORS patterns (`getTeacherSession`, `guardRequestOrigin`, `MediaSchema`).

- [ ] **Step 1: Failing tests** — via mock-api harness used elsewhere (see `tests/unit/compositions-api.test.ts` or netlify content route tests):

```ts
it('POST /api/media creates external media when authenticated', async () => {
  const res = await mockFetch('/api/media', {
    method: 'POST',
    cookie: teacherCookie,
    body: {
      title: 'Paste PDF',
      provider: 'external',
      media_type: 'pdf',
      preview_url: 'https://example.com/a.pdf'
    }
  });
  expect(res.status).toBe(201);
  const body = await res.json();
  expect(body.provider).toBe('external');
  expect(body.id).toMatch(/^media_/);
});

it('POST /api/media requires auth', async () => {
  const res = await mockFetch('/api/media', { method: 'POST', body: { title: 'x' } });
  expect(res.status).toBe(401);
});

it('PATCH /api/media/:id archives', async () => {
  // create then PATCH { status: 'archived' }
  expect(patched.status).toBe('archived');
});
```

Adapt helpers to the repo’s actual mock-api test style (copy from nearest existing API test).

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement handlers**

`POST /api/media` body fields: `title` (required), `provider` (`external` | `google_drive`), `media_type`, optional URLs, `provider_file_id`, `sharing`, `mime_type`, `file_name`. Reject `provider: 'direct'` here (direct only via upload). Use `newId('media')`, `slugify(title)`, timestamps, `status: 'active'`, validate with `MediaSchema`, `setJSON(mediaKey(id))`.

`PATCH /api/media/:id`: allow `title`, `status` (`active`|`archived`|`trashed`), URL fields, `sharing`. Re-validate full record.

`GET /api/media/:id`: teacher-auth, return record.

Wire mock-api routes the same way.

- [ ] **Step 4: Tests PASS**

- [ ] **Step 5: Commit** `feat(media): add media metadata create and patch APIs`

---

### Task 3: Upload + public file serve

**Files:**
- Create: `netlify/functions/media-upload.mts` — `POST /api/media/upload`
- Create: `netlify/functions/media-file.mts` — `GET /api/media/:id/file` (**no teacher session**)
- Modify: `scripts/mock-api.ts` / mock-store binary support
- Modify: `tests/unit/media-api.test.ts`

- [ ] **Step 1: Failing tests**

```ts
it('POST /api/media/upload stores bytes and returns direct media', async () => {
  const form = new FormData();
  form.append('file', new Blob([pngBytes], { type: 'image/png' }), 'cover.png');
  form.append('title', 'Cover');
  // optional: form.append('provider_file_id', 'drive_1');
  const res = await mockFetch('/api/media/upload', {
    method: 'POST',
    cookie: teacherCookie,
    body: form
  });
  expect(res.status).toBe(201);
  const media = await res.json();
  expect(media.provider).toBe('direct');
  expect(media.media_type).toBe('image');
  expect(media.preview_url).toContain(`/api/media/${media.id}/file`);

  const fileRes = await mockFetch(`/api/media/${media.id}/file`, { method: 'GET' });
  expect(fileRes.status).toBe(200);
  expect(fileRes.headers.get('content-type')).toMatch(/image\/png/);
});

it('rejects oversized uploads', async () => { /* > 10 MiB → 400 */ });
it('rejects disallowed MIME', async () => { /* → 400 */ });
it('file GET returns 404 for archived media', async () => { /* archive then GET file */ });
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement**

Shared allowlist helper (can live in `netlify/functions/_shared/media-upload.mts` or `src/media/upload-rules.ts` imported by both server and tests):

```ts
export const MAX_MEDIA_BYTES = 10 * 1024 * 1024;
export const ALLOWED_MEDIA_MIME = new Set([/* as above */]);
export function mediaTypeFromMime(mime: string): 'image' | 'pdf' | 'other' { /* ... */ }
```

Upload handler:
1. Auth required
2. Parse multipart (`file` required; `title` optional → fallback to file name; `provider_file_id` optional)
3. Enforce size + MIME
4. `id = newId('media')`
5. `store.set(mediaFileKey(id), bytes, { metadata: { contentType: mime } })` (use Netlify Blobs binary API; mock-store: `setBinary` / `getBinary`)
6. Build Media: `provider: 'direct'`, `sharing: 'public_link'`, URLs from `new URL(`/api/media/${id}/file`, request.url).href`, save JSON
7. Return 201

File handler:
1. No auth
2. Load Media JSON; if missing or `status !== 'active'` → 404
3. Load bytes; if missing → 404
4. Respond with `Content-Type` from mime_type; `Cache-Control: public, max-age=86400`

- [ ] **Step 4: Tests PASS**

- [ ] **Step 5: Commit** `feat(media): upload to blobs and public file serving`

---

### Task 4: Teacher media-api client + Resources UI

**Files:**
- Create: `src/teacher/media-api.ts`
- Modify: `src/teacher/sections/resources.ts`
- Modify: `src/styles/app.css`
- Modify: `tests/unit/sections-resources.test.ts`

- [ ] **Step 1: Failing UI/API client tests**

```ts
it('renderResourcesIndex shows Upload and Add from Drive controls when editable', () => {
  // mount with onRefresh callback stubs; expect buttons
});

it('createExternalMedia posts JSON to /api/media', async () => {
  // mock fetch
});
```

- [ ] **Step 2: Implement `media-api.ts`**

```ts
export async function createMedia(body: Record<string, unknown>): Promise<Media> { /* POST /api/media */ }
export async function patchMedia(id: string, body: Record<string, unknown>): Promise<Media> { /* PATCH */ }
export async function uploadMediaFile(file: File, opts?: { title?: string; provider_file_id?: string }): Promise<Media> {
  const form = new FormData();
  form.append('file', file, file.name);
  if (opts?.title) form.append('title', opts.title);
  if (opts?.provider_file_id) form.append('provider_file_id', opts.provider_file_id);
  // POST /api/media/upload — credentials: 'include'
}
```

- [ ] **Step 3: Resources UI**

- Toolbar: **Upload** (hidden file input), **Add from Drive** (calls `openDrivePicker` from Task 5; stub disabled until Drive ready is OK for interim), **Add URL** (title + URL → `createMedia` external)
- Each row: Open (existing), **Archive** → `patchMedia({ status: 'archived' })` then refresh curriculum/media list via existing remount/cache invalidation pattern (`invalidateCurriculum` / remount from `main.ts` if available)
- After upload/create: invalidate curriculum cache and re-render Resources

- [ ] **Step 4: Tests PASS + Commit** `feat(media): resources library upload and archive UI`

---

### Task 5: Drive picker (client) + helpers

**Files:**
- Create: `src/teacher/drive-picker.ts`
- Create: `tests/unit/drive-picker.test.ts`
- Modify: Resources to enable Drive button
- Env docs: note in `docs/BUILD.md` or existing env section — `VITE_GOOGLE_CLIENT_ID`, `VITE_GOOGLE_PICKER_API_KEY` (and App ID if required)

- [ ] **Step 1: Pure helper tests**

```ts
describe('drive helpers', () => {
  it('maps Google Doc mime to google_drive link media_type link', () => {
    expect(isGoogleNativeMime('application/vnd.google-apps.document')).toBe(true);
  });
  it('maps image mime to mirror path', () => {
    expect(isGoogleNativeMime('image/png')).toBe(false);
  });
  it('normalizes sharing from capabilities', () => {
    expect(sharingFromDriveFile({ shared: true, capabilities: { canShare: true } }, true)).toBe('public_link');
    expect(sharingFromDriveFile({}, false)).toBe('restricted');
  });
});
```

- [ ] **Step 2: Implement picker module**

```ts
export async function openDrivePicker(): Promise<DrivePickResult | null>
// DrivePickResult =
//   | { kind: 'mirror'; file: File; provider_file_id: string; title: string }
//   | { kind: 'link'; title: string; provider_file_id: string; preview_url: string; sharing: MediaSharing; media_type: 'link' | 'other' }
```

Behaviour:
1. If `import.meta.env.VITE_GOOGLE_CLIENT_ID` / picker key missing → throw friendly error (Resources shows message; button can stay visible)
2. Load GIS + Picker scripts once
3. `google.accounts.oauth2.initTokenClient` with scope `https://www.googleapis.com/auth/drive.file` (or `drive.readonly` if picker requires — pick the minimum that works with Picker)
4. Show Picker; on cancel return `null`
5. On pick: `files.get` with `fields=id,name,mimeType,webViewLink,webContentLink,thumbnailLink,capabilities,shared`
6. If Google-native mime → `{ kind: 'link', ... sharing }` (probe “anyone with link” via permissions.list if cheap; else `unknown`/`restricted` from `shared` + whether `webViewLink` is usable — document choice in code comment)
7. Else fetch `alt=media` with bearer token → `File` blob → `{ kind: 'mirror', file, provider_file_id, title }`

Resources handler:

```ts
const pick = await openDrivePicker();
if (!pick) return;
if (pick.kind === 'mirror') await uploadMediaFile(pick.file, { title: pick.title, provider_file_id: pick.provider_file_id });
else await createMedia({ title: pick.title, provider: 'google_drive', media_type: pick.media_type, provider_file_id: pick.provider_file_id, preview_url: pick.preview_url, sharing: pick.sharing });
// invalidate + refresh
```

Local/mock without Google env: unit-test helpers only; manual Drive optional.

- [ ] **Step 3: Tests PASS + Commit** `feat(media): google drive picker with mirror upload`

---

### Task 6: Wire library into image editor (+ attachment if small)

**Files:**
- Modify: `src/blocks/editors.ts` (image editor; attachment if same pattern fits)
- Ensure cover picker callers pass updated `curriculum.media` after creates (Resources path already refreshes; lesson/class editors already pass media — confirm after curriculum invalidate)

- [ ] **Step 1: Test** — image editor exposes “Choose from library” that sets `content.url` from selected media preview URL (and optionally store nothing else in v1 — **YAGNI:** set URL from resolved media; do not invent new `media_id` on image block unless schema already has it)

Check image block schema: if only `url`/`alt`, set `url` from `resolveCoverUrl`-style media URL lookup.

```ts
it('image editor can apply media library url', () => {
  // mount editor with media list; click library item; expect onChange url
});
```

- [ ] **Step 2: Implement** — reuse cover-picker library list pattern or small shared `mountMediaLibraryPicker(host, { media, mediaTypes: ['image'], onPick })` in `src/teacher/media-library-picker.ts` if it avoids duplication; otherwise duplicate minimally in image editor.

- [ ] **Step 3: Commit** `feat(media): pick library images in block editor`

---

### Task 7: Publish warnings for restricted Drive media

**Files:**
- Create: `src/teacher/publish-media-warnings.ts`
- Create: `tests/unit/publish-media-warnings.test.ts`
- Modify: publish UI entry (find where publish is confirmed — `lesson-editor` / publish button) to show warnings list before/alongside existing publish

- [ ] **Step 1: Test**

```ts
import { collectRestrictedDriveMediaWarnings } from '@/teacher/publish-media-warnings';

it('warns when lesson blocks reference urls belonging to restricted google_drive media', () => {
  const media = [{
    id: 'media_doc',
    provider: 'google_drive',
    sharing: 'restricted',
    preview_url: 'https://docs.google.com/document/d/1',
    /* …required Media fields… */
  }];
  const warnings = collectRestrictedDriveMediaWarnings({
    blocks: [/* embed or attachment/html using that url */],
    media
  });
  expect(warnings.some((w) => w.includes('media_doc') || w.includes('restricted'))).toBe(true);
});

it('does not warn for direct mirrored media', () => {
  expect(collectRestrictedDriveMediaWarnings({
    blocks: [],
    media: [{ provider: 'direct', sharing: 'public_link', /* … */ }]
  })).toEqual([]);
});
```

v1 detection: any active `google_drive` media with `sharing` in `restricted` | `unavailable` | `unknown` that is referenced by lesson block URLs **or** listed in curriculum and linked from blocks. Simpler acceptable v1: warn if **any** such media appears in the provided `media` list that is referenced by scanning block JSON string for `provider_file_id` or preview_url. Even simpler acceptable: warn on publish if lesson’s used URLs intersect restricted drive media URLs.

- [ ] **Step 2: Wire into publish confirm UI** (non-blocking confirm is OK — show warnings, still allow publish)

- [ ] **Step 3: Commit** `feat(media): warn on restricted Drive links at publish`

---

### Task 8: BUILD.md + smoke verification

**Files:**
- Modify: `docs/BUILD.md`

- [ ] **Step 1: Update BUILD.md** — move Media library / Drive to History; set Next up to next backlog item (Search, or Templates lesson/unit — pick first unchecked platform item: **Search**); Latest note one line.

- [ ] **Step 2: Run full unit suite**

```bash
npm run test:unit
```

Expected: all pass (including new media tests).

- [ ] **Step 3: Manual smoke** (document in plan checkbox): upload image → Resources → set cover from library → student/class view shows image; without Google keys, Drive button errors gracefully.

- [ ] **Step 4: Commit** `docs: record media library drive slice in BUILD.md`

---

## Spec coverage check

| Spec item | Task |
|-----------|------|
| `direct` + sharing + provider_file_id | 1 |
| Metadata CRUD | 2 |
| Upload → Blobs + student file URL | 3 |
| Drive GIS + Picker; mirror binaries | 5 |
| Google-native link-out + sharing | 5 |
| Resources Upload/Drive/archive | 4 |
| Cover/image library use | 4–6 (cover already; image wire 6) |
| Publish restricted warning | 7 |
| No Drive tokens on student routes | 3 file GET public; 5 client-only token |
| Paste URL external remains | 2 + 4 Add URL |
| BUILD history | 8 |

## Out of scope (do not implement)

Refresh-token sync, folder browser, media binary versioning, forcing all blocks to `media_id`-only, AI Drive context.
