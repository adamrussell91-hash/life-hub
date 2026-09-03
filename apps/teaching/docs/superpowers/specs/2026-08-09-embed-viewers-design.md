# Teaching Hub — Map / Slides / Document Viewer Design

**Date:** 2026-08-09  
**Status:** Approved for implementation  
**Product name:** Teaching Hub  
**Slice:** Provider-aware `embed` behaviours for Map, Slides, Document, PDF  
**Depends on:** Existing `embed` block (URL + title); video-style URL helpers  
**Parent roadmap:** `docs/BUILD.md` Next up #1; `docs/specs/03_BLOCK_SYSTEM.md` §§21–25, 92–93  
**Not this slice:** Drive OAuth/uploads; Canva/Desmos/Padlet/ArcGIS; new primitive block types; A4 print

## Goal

Teachers can insert Maps, Slides, Documents, and PDFs via friendly Add-menu items or by pasting a Google/PDF URL into Embed. Students get a reliable in-lesson view: live iframe where it usually works (Slides, Maps), resource card where iframes often fail (Docs, PDF), always with an Open-in-new-tab link.

## Decisions

| Topic | Choice |
|-------|--------|
| Shape | Still one `embed` block — no `map` / `slides` / `document` / `pdf` primitives |
| Providers (v1) | `google_maps` \| `google_slides` \| `google_docs` \| `pdf` \| `generic` |
| Insert UX | Both: menu presets (Map / Slides / Document / PDF) **and** auto-detect on paste |
| Student render | Hybrid: iframe for Maps + Slides; card-first for Docs + PDF; `generic` keeps today’s iframe + link |
| Supply | Paste share / file URL only (no Drive picker, no upload) |
| Legacy embeds | Missing `provider` → treat as `generic` |
| Publish | Unchanged rule: valid http(s) `url` required |

## Out of scope

- Google Drive auth, media library, uploads  
- Extra providers (Canva, Desmos, Padlet, ArcGIS, PowerPoint web, website X-Frame detection)  
- Detecting iframe load failure at runtime (no postMessage probe)  
- Separate block types  
- A4 / print-specific viewers  
- Changing Attachment block behaviour  

## Data model

```ts
EmbedProviderSchema = z.enum([
  'google_maps',
  'google_slides',
  'google_docs',
  'pdf',
  'generic'
])

EmbedBlock.content = {
  url: string              // teacher paste / share URL (required)
  title?: string
  provider?: EmbedProvider // optional; omit = legacy generic
  embed_url?: string       // optional derived iframe src when applicable
}
```

### Rules

| Situation | Behaviour |
|-----------|-----------|
| Create via Embed | `provider: 'generic'`, empty `url` |
| Create via Map / Slides / Document / PDF | Matching `provider`, empty `url` |
| Paste / edit URL | Re-run detection; update `provider` + `embed_url` (unless teacher locked provider — v1: always re-detect from URL when URL changes; menu preset only seeds empty blocks) |
| URL does not match known pattern | Keep current `provider` if preset was chosen and URL empty→partial; if URL parses as unknown http(s), set `provider: 'generic'` and clear `embed_url` |
| Publish | Require http(s) `url` only; `provider` / `embed_url` optional |

## URL detection & embed derivation

New module `src/blocks/embed-url.ts` (mirror `video-url.ts`):

| Input pattern | Provider | `embed_url` |
|---------------|----------|-------------|
| `docs.google.com/presentation/...` | `google_slides` | `.../d/{id}/embed` (from `/d/{id}/`) |
| `docs.google.com/document/...` | `google_docs` | omit (card-only) |
| `drive.google.com/file/d/{id}/...` | `pdf` | omit (card-only; Drive files treated as document viewer PDF path) |
| URL path ends with `.pdf` (http/https) | `pdf` | omit |
| `google.com/maps`, `maps.google.com`, `goo.gl/maps` host patterns | `google_maps` | Prefer existing embed URLs; else `@lat,lng` → maps embed; else `maps?q=…&output=embed` |
| Anything else http(s) | `generic` | omit (renderer uses `url` in iframe) |

Detection is best-effort. Teachers remain responsible for share settings (“anyone with the link” / published to web where required).

## Insert menu

Under **Media**, keep Embed and add:

- **Map** → `createBlock` embed with `provider: 'google_maps'`  
- **Slides** → `provider: 'google_slides'`  
- **Document** → `provider: 'google_docs'`  
- **PDF** → `provider: 'pdf'`  

Implementation: extend the add-menu model with insert aliases that still produce `block_type: 'embed'` (not new `NewBlockType` values). Same aliases available in lesson editor, nested column/section/tab editors, and homepage editor Media group.

## Editor

`createEmbedEditor`:

1. URL + title fields (existing).  
2. Read-only (or select) **Provider** status showing detected/preset label.  
   - v1: show a `<select>` so teachers can override if auto-detect is wrong; changing provider clears `embed_url` and re-derives when possible from current URL.  
3. On URL `input`/`change`: `parseEmbedInput(url)` → write `provider` + `embed_url`.  
4. Short hint under the URL field: sharing must allow viewers; Docs/PDF open as a card with an external link.

## Student / teacher render

| Provider | Primary UI | Always |
|----------|------------|--------|
| `google_slides` | Lazy sandboxed iframe (`embed_url` or derived) | Open link uses `url` |
| `google_maps` | Lazy sandboxed iframe (`embed_url` or derived) | Open link uses `url` |
| `google_docs` | Resource card (title or “Google Doc”, provider label) | Open link |
| `pdf` | Resource card (title or “PDF”, provider label) | Open link |
| `generic` / missing | Current iframe-on-`url` behaviour | Open link |
| Invalid URL | “Embed unavailable.” | — |

CSS: reuse `.block-embed__frame` / `__open`; add `.block-embed__card` for Docs/PDF (title, meta, open action — not a dashboard card cluster; one resource surface).

Lazy load iframes (`loading="lazy"`) unchanged. Failures of external providers are accepted; Open link is the recovery path (no JS iframe-error probe in v1).

## Architecture / modules

| Module | Responsibility |
|--------|----------------|
| `src/schemas/block.ts` | `EmbedProviderSchema`; extend embed content |
| `src/blocks/embed-url.ts` | Detect provider + derive `embed_url` |
| `src/blocks/create-block.ts` | Embed defaults; insert aliases + labels for Media menu |
| `src/blocks/editors.ts` | Embed editor: detect on paste, provider control |
| `src/blocks/render.ts` | Hybrid iframe vs card |
| `src/styles/app.css` | Resource card styles |
| `src/teacher/lesson-editor.ts` (+ homepage / nested) | Resolve insert aliases → create embed |
| Tests | `embed-url` parse matrix; schema; render iframe vs card; create/menu defaults |

## Testing

- Parse: Slides / Docs / Drive file / `.pdf` / Maps place / Maps embed / generic  
- Schema: accepts legacy `{ url }` without provider; accepts all providers  
- Create: Map/Slides/Document/PDF aliases set provider  
- Render: Slides/Maps → iframe src is embed URL; Docs/PDF → card, no iframe; generic → iframe on url  
- Publish: still requires http(s) url  

## BUILD.md updates (end of slice)

- History: Map / Slides / Document viewer  
- Next up: A4 print (or remaining platform tracks)  
- Tick Content/media → Map / Slides / Document viewer  
- Phase 5 note: viewers done  
- Latest note  

## Success criteria

1. Teachers can add Map / Slides / Document / PDF from the Media menu or paste into Embed.  
2. Known Google/PDF URLs get the correct provider and student surface (iframe vs card).  
3. Every usable embed still exposes Open in new tab.  
4. No new block primitives; legacy embeds keep working as generic.  
