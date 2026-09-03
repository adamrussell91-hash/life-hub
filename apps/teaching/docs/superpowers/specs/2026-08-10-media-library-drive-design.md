# Teaching Hub — Media Library + Drive Design

**Date:** 2026-08-10  
**Status:** Approved for implementation  
**Slice:** Media library uploads + Google Drive pick (v1)  
**Parent roadmap:** `docs/BUILD.md` Next up; Phase 10 in `docs/specs/09_IMPLEMENTATION_PLAN.md`  
**Depends on:** Existing `MediaSchema`, curriculum `media[]`, cover picker library UI, teacher auth, Netlify Blobs  
**Not this slice:** Stored Drive refresh tokens / re-sync; Drive folder browser; video transcode; CDN; AI Drive context; linked templates

## Goal

Teachers can add files to a real Media library via **upload** or **Google Drive picker**. Binary files are stored on Netlify Blobs so students get working URLs without Google login. Paste-URL (`external`) remains.

## Locked decisions

| Topic | Choice |
|-------|--------|
| Primary path | Upload + Drive → one Media library |
| Student delivery | Mirror binaries into Blobs at insert time |
| Drive auth | GIS short-lived token + Google Picker only (teacher app); no refresh-token storage |
| Google-native docs | `provider: google_drive` link-out + sharing status (no byte mirror) |
| Paste URL | Keep as `external` |
| Scope | Metadata CRUD + upload + picker + wire library into Resources / cover / image-like inserts |
| Auth boundary | Drive OAuth and write APIs teacher-only; never on student routes |

## Architecture

```
Teacher: Upload file ──► POST /api/media/upload ──► Blobs bytes + Media (direct)
Teacher: Drive Picker ──► (token) download/mirror OR link metadata
                              │
                              ▼
                    Media record in Blobs (media/{id})
                              │
          ┌───────────────────┼───────────────────┐
          ▼                   ▼                   ▼
   Resources list      Cover / image pick    Publish warning
   (curriculum)        (media_id)            (restricted Drive links)
```

### Providers

| Provider | Meaning |
|----------|---------|
| `direct` | Bytes in Netlify Blobs (upload or Drive-mirrored binary) |
| `google_drive` | Link-out only (Docs/Sheets/Slides/etc.); optional `provider_file_id` |
| `external` | Teacher paste URL (unchanged) |

### Schema extensions (`MediaSchema`)

- Add provider `direct`
- Optional: `provider_file_id`, `sharing` (`public_link` \| `restricted` \| `unknown` \| `unavailable`)
- Keep existing URL fields (`preview_url`, `download_url`, `thumbnail_url`) and common fields (`title`, `status`, …)
- Optional provenance: if mirrored from Drive, set `provider: direct` and keep `provider_file_id` for the source file id

### APIs (teacher-auth)

- `POST /api/media` — create metadata-only (`external` / `google_drive` link)
- `PATCH /api/media/:id` — title, archive/trash, URL tweaks
- `POST /api/media/upload` — multipart/binary → store blob + create `direct` Media
- `GET` already via curriculum `media[]`; single-get if useful for mock parity
- Public/student: serve mirrored files via authenticated-or-public blob/function URL pattern already used for content; no Drive credentials on student path

### Drive flow

1. Teacher clicks **Add from Drive** → Google Identity Services token client (scopes: enough for Picker + read selected file, e.g. `drive.file` or picker-recommended)
2. Google Picker → file metadata
3. If binary (image, PDF, common office downloads): download with token → same storage path as upload → Media `direct` + `provider_file_id`
4. If Google-native: Media `google_drive` + view/preview URLs + `sharing` from Drive metadata / permissions probe
5. Token discarded after request; not persisted

Env (teacher build / Netlify): Google OAuth client ID, Picker API key / App ID as required by Google Picker.

### UI

- **Resources:** Upload, Add from Drive, edit title, archive; keep Open for usable URLs
- **Cover picker / image (and similar library consumers):** refresh from curriculum/media after create; pick by `media_id`
- Paste URL controls stay where they exist today

### Publish / student

- Publish warns when student-visible blocks reference `google_drive` with `sharing` ≠ `public_link`
- `direct` and healthy `external` URLs need no Drive check
- Student render uses stored preview/download/thumbnail URLs only

## Error / edge cases

- Upload too large / unsupported type → clear teacher error
- Drive picker cancel → no-op
- Drive download/mirror fail → error; no half-written Media (or delete orphan blob)
- Restricted Drive link-out → save allowed; publish warning; student shows unavailable/restricted affordance where media is shown
- Missing Google env in local/mock → Drive button disabled or mock-picker path for tests

## Acceptance (v1 done when)

1. Teacher uploads a file → appears in Resource Library → usable as cover/image media  
2. Teacher picks a Drive image/PDF → mirrored → student sees it without Google login  
3. Teacher picks a Google Doc → library entry with link + sharing status; publish warns if restricted  
4. Paste URL media still works  
5. No Drive tokens on student routes; unit tests cover schema + media API happy paths

## Out of scope (explicit)

- Background Drive sync / “update from Drive”
- Folder trees, multi-select bulk UX polish beyond Picker defaults
- Replacing all block URL fields with media_id-only
- Versioning of media binaries
