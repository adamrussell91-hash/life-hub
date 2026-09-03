# Teaching Hub — Builder Blocks (URL Media + HTML) Design

**Date:** 2026-08-08  
**Status:** Approved for implementation planning  
**Product name:** Teaching Hub  
**Slice:** Lesson builder block types — `image`, `video`, `embed`, `html`  
**Depends on:** First slice (rich_text / heading / callout + publish) — shipped; teacher rail — shipped

## Goal

Let teachers add image, video, embed, and HTML blocks in the lesson editor; save drafts; publish; and have students see correct, safe renderings — using paste-URL / paste-HTML only (no Media Library).

## Broader roadmap (context only)

1. Teacher rail + section shells — done  
2. **This slice** — builder blocks (video, image, embed, HTML)  
3. Published student nav  
4. Teacher home dashboard  

## Decisions

| Topic | Choice |
|-------|--------|
| Block set | `image`, `video`, `embed`, `html` (plus existing three) |
| Media supply | Paste URLs / paste HTML only |
| HTML safety | Same sanitiser as rich text (`sanitizeRichTextHtml`) — no scripts/iframes |
| Architecture | Extend existing Zod schemas + block registry + lesson-editor Add menu |
| Video vs embed | Keep both: `video` = YouTube/Vimeo player; `embed` = generic URL iframe or link card |
| Media References / Drive / uploads | Out of scope |
| Sandboxed `html_app` | Out of scope (this `html` block is sanitised markup only) |

## Out of scope

- Media Library, Netlify Blob uploads, Google Drive  
- Gallery, Audio, Attachment, Chart, Question set, Columns, etc.  
- Full Interactive HTML App (`html_app`) with sandboxed app payloads  
- Student nav chrome, home dashboard  
- AI block generation  

## Block content schemas

Shared block base (unchanged): `id`, `type: "block"`, `block_type`, `variant`, `visibility`, `layout`, `print`, `settings`, timestamps, `schema_version: 1`.

### `image`

```ts
content: {
  url: string;       // http(s) only
  alt_text: string;  // required for publish
  caption?: string;
}
variant: string; // default "large"
```

### `video`

```ts
content: {
  provider: 'youtube' | 'vimeo';
  external_id: string;  // canonical id after URL parse
  url?: string;         // optional original paste, for editor display
  title?: string;
  caption?: string;
}
variant: string; // default "large"
```

Teacher may paste a full watch URL or bare id; a small `video-url` helper normalises to `provider` + `external_id`.

### `embed`

```ts
content: {
  url: string;    // http(s) only
  title?: string;
}
variant: string; // default "large"
```

No required `embed_url` in this slice — renderer derives iframe eligibility from `url` (or shows link card).

### `html`

```ts
content: {
  html: string; // stored draft may be raw; sanitise on render and on publish
}
variant: string; // default "medium"
```

## Teacher editor

- Add-block control gains: **Image**, **Video**, **Embed**, **HTML**.  
- Editors are simple forms (URL / alt / caption / title / HTML textarea) — same reorder, visibility, delete as existing blocks.  
- Video editor: URL (or id) field; on change, parse into `provider` + `external_id`; show a short status if unrecognised.  
- Default visibility: `student_teacher`.

## Student / published render

| Type | Render |
|------|--------|
| image | `<figure>` / `<img src>` with `alt`; caption if present |
| video | Lazy iframe to YouTube/Vimeo embed URL from `provider` + `external_id` |
| embed | Lazy iframe (`sandbox` appropriate for generic embeds) for http(s) `url`, plus an “Open in new tab” link using `title` or hostname. If the URL is invalid, show link card only (or validation blocks publish). |
| html | Sanitised HTML (same allowlist as rich text) |

`teacher_only` blocks remain filtered for students.

### iframe hygiene

- `loading="lazy"`  
- Reasonable `referrerpolicy`  
- `allow` attributes limited for video providers  
- Do not inject teacher auth into embeds  

## Publish validation

Reject publish (checklist issues) when:

| Type | Rule |
|------|------|
| image | Missing/invalid `url` (must be http/https) or empty `alt_text` |
| video | Missing/unrecognised provider id |
| embed | Missing/invalid http(s) `url` |
| html | Empty after sanitise |

On successful publish (mock-api + Netlify `publish.mts`):

- Sanitise `rich_text` and `html` block content with `sanitizeRichTextHtml` before writing the published snapshot (extend existing rich_text sanitise path).

Draft PUT continues to Zod-validate structure (including http/https URL shape where applicable). Publish re-checks the rules above and sanitises HTML.

## Architecture / modules

| Module | Responsibility |
|--------|----------------|
| `src/schemas/block.ts` | Zod schemas + `Block` union |
| `src/blocks/video-url.ts` | Parse YouTube/Vimeo URL or id → `{ provider, external_id }` |
| `src/blocks/url-safety.ts` | `isHttpUrl` shared by image/embed editors, renderers, and publish validation |
| `src/blocks/editors.ts` | Teacher field editors |
| `src/blocks/render.ts` | Deterministic renderers |
| `src/blocks/registry.ts` | Wire render + editor |
| `src/teacher/lesson-editor.ts` | `NEW_BLOCK_TYPES`, labels, `createBlock` |
| `scripts/mock-api.ts` + `netlify/functions/publish.mts` | Validate + sanitise html on publish |
| `src/styles/app.css` | Figure / iframe / embed-card styles |
| Tests | Schema, video-url parse, render, editors, publish sanitise/validation |

No new public routes. No Blob schema for media objects.

## Testing

- Unit: Zod accept/reject for each new type  
- Unit: YouTube/Vimeo URL parsing (watch, youtu.be, vimeo.com)  
- Unit: render output smoke (img src/alt; video iframe src; embed link fallback; html sanitise strips script)  
- Unit/integration: publish with new blocks succeeds; invalid video/image fails with issues  
- Existing lesson-editor / Playwright publish flow still green (extend seed or editor test to add one new block type if practical; not required to cover all four in Playwright this slice)

## Non-goals for “done”

Done means teachers can build lessons with the four new blocks via URLs/HTML paste and students see safe published output. It does not mean a media library or interactive HTML apps.

## Open follow-ups

- Media Reference objects + uploads  
- Gallery / Attachment / Audio  
- True `html_app` sandbox  
- Richer embed provider matrix (Slides, Desmos, …) with dedicated iframe templates  
- Image hotlink → stored media migration  
