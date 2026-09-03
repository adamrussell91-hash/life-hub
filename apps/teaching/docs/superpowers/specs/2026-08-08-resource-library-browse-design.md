# Teaching Hub — Resource Library Browse Stub Design

**Date:** 2026-08-08  
**Status:** Approved for implementation planning  
**Product name:** Teaching Hub  
**Slice:** Teacher Resource Library browse list from seeded Media  
**Depends on:** Teacher rail `/resources` placeholder; curriculum API

## Goal

Replace the Resource Library “coming next” placeholder with a **read-only browse list** of seeded **Media** records from curriculum. Show title + type/provider meta and **Open** when a URL exists. No create/edit, Drive OAuth, or block wiring.

## Broader roadmap (context only)

1. Scope & Sequence timeline — done  
2. **This slice** — Resource Library browse stub  
3. Ops (push, re-seed, wall-clock today, multi-class seed)  

## Decisions

| Topic | Choice |
|-------|--------|
| Depth | Flat list only (no detail route) |
| Data | Seeded Media blobs + `GET /api/curriculum` |
| Open | Show Open when `preview_url` or `download_url` present (prefer preview) |
| Layout | Lesson-list rows (title, meta, Open) |
| Architecture | Slim Media schema; include `media` on curriculum |
| Mutations | None this slice |

## Out of scope

- Create / edit / delete Media UI  
- Google Drive OAuth or file picker  
- `/resources/:id` detail page  
- Student Resource Library  
- Wiring Blocks to `media_id`  
- Card grid layout  
- Uploads / blob file storage  

## Routes

| Path | Behavior |
|------|----------|
| `/resources` | Resource Library list (replaces placeholder) |

No new routes.

## Data model

### Media

```ts
{
  id: string;
  type: 'media';
  title: string;
  slug: string;
  provider: 'external' | 'google_drive';
  media_type: 'pdf' | 'image' | 'video' | 'link' | 'other';
  mime_type?: string;
  file_name?: string;
  preview_url?: string;
  download_url?: string;
  thumbnail_url?: string;
  status: 'active' | 'archived' | 'trashed';
  created_at: string;
  updated_at: string;
  schema_version: 1;
}
```

Storage key: `media/{id}`.

## APIs

### `GET /api/curriculum`

Include `media: Media[]` (active entries from seed/store). Mock-api + Netlify list `media/` prefix.

No Media PATCH/POST this slice.

## Seed

At least two (prefer three) demo Media items, e.g.:

1. PDF extract — `media_type: 'pdf'`, `provider: 'external'`, with `preview_url` or `download_url`  
2. External syllabus/link — `media_type: 'link'` with URL  
3. Optional image — `media_type: 'image'` with URL  

Use safe public example URLs (or well-known placeholder HTTPS links). Titles suitable for Eng Adv / AoTFW demo.

## Teacher UI

### `/resources`

1. Heading: **Resource Library**  
2. Sorted list by `title` (localeCompare)  
3. Each **active** row: title; meta line `media_type` · `provider` (humanize type label optionally); **Open** button/link if `preview_url ?? download_url` is a non-empty string  
4. Open: `target="_blank"`, `rel="noopener noreferrer"`  
5. Empty active list: “No resources yet.”  

Reuse existing `lesson-list` / button patterns where practical.

## Errors

| Case | Behavior |
|------|----------|
| Curriculum failure | Existing teacher load error handling |
| No active media | Empty copy |
| Missing URLs | No Open control |

## Testing

- Schema accepts Media; rejects bad provider/media_type  
- Seed loads; curriculum includes media  
- Resources page renders titles; Open href when URL present; omit Open when absent  
- Regression: other sections, Scope timeline, student routes  

## Success criteria

- `/resources` shows seeded media instead of “coming next”  
- Open works for items with URLs  
- No mutation APIs or Drive integration  

## Follow-ups

- Create/edit Media  
- Drive provider  
- Attach media to blocks / Class homepage  
- Ops: push origin; re-seed; wall-clock today; multi-class seed  
