# Teaching Hub — A4 Print Pipeline Design

**Date:** 2026-08-10  
**Status:** Approved for implementation  
**Product name:** Teaching Hub  
**Slice:** Teacher A4 preview + Print (v1)  
**Parent roadmap:** `docs/BUILD.md` Next up #1; Phase 9 in `docs/specs/09_IMPLEMENTATION_PLAN.md`  
**Depends on:** Existing block renderers; `response_space` on `question_set` short answers  
**Not this slice:** Landscape; student print; print metadata UI; canvas↔preview selection sync; page-break editing tools; PDF export service; Drive

## Goal

Teachers can preview a lesson as A4 portrait paper in the lesson editor and print it via the browser. Print is a **renderer** over the same lesson blocks — not a separate worksheet document.

## Locked decisions

| Topic | Choice |
|-------|--------|
| Scope | Preview + Print only; sensible defaults; no per-block print metadata UI |
| Audience | Teacher only |
| Orientation | Portrait only |
| Interactive/media | Minimal fallbacks (title + link/summary; expand accordion/tabs; reuse activity print stubs; draw `response_space` lines) |
| Architecture | Shared print renderer for preview panel and Print output |
| Margins / controls | Fixed defaults; no orientation/margin presets in UI |

## Architecture

```
Lesson draft (blocks)
        │
        ▼
 renderPrintLesson(lesson)  ──►  print document DOM
        │                              │
        ├─ A4 preview panel (scaled)   │
        └─ Print ──► iframe / window + window.print()
```

- New module owns print document construction (`src/print/…`).
- Extend block `RenderMode` with `'print'` so existing `renderBlock` paths can branch for paper (fallbacks, worksheet lines) without a second block tree.
- Screen lesson canvas stays screen-only (`teacher` mode). Glass/chrome never print.
- No writes to `block.print` metadata in this slice; empty `{}` continues to validate.

## UI (lesson editor)

- Right-side **A4 preview** panel beside the lesson canvas (new layout region for lesson editor only).
- Panel shows: scaled live preview of the print document, approximate page count, **Print** button.
- Preview refreshes when title or blocks change (same dirty path as autosave notify — rebuild print DOM from current in-memory lesson).
- Print opens a dedicated print window/iframe containing the **same** print HTML/CSS, then calls `window.print()`. Teacher shell is not printed.

## Print document model

- **Page:** A4 portrait (`210mm × 297mm`), fixed margins (e.g. `15mm`).
- **Content:** Lesson title, then blocks in order, student-visible content only (`visibility !== 'teacher_only'`).
- **Pagination (v1):** Continuous flow + CSS `@page` / `break-inside` heuristics. Preview uses an A4-width paper column; page count ≈ `ceil(contentHeight / printablePageHeight)`. No manual page-break tools.
- **Look:** Opaque white paper, no glass/blur/shadows. Clean borders where callouts need structure.

## Block behaviour in `print` mode

| Kind | Behaviour |
|------|-----------|
| Text / heading / callout / quote / definition / code / table / divider / equation / chart / diagram / mind_map / concept_map / image / attachment | Screen-like static render; strip interactive chrome |
| `question_set` | Prompts + MC options; short-answer draws ruled lines from `response_space` (`none` → no lines; `short`…`extended` → increasing line count). Missing `response_space` → treat as `medium` |
| `accordion` | All sections expanded, sequential |
| `tabs` | Panels as sequential headed sections |
| `columns` / `section` | Nested children in print mode; **columns stack vertically** on paper (v1) |
| `spacer` | Reduced / omit |
| `gallery` | Images in a simple vertical or grid list (no lightbox/carousel chrome) |
| `timeline` | Static event list |
| `collection` | Static link list |
| `video` / `audio` / `embed` / `html_app` | Title (or type label) + URL when available; no players/iframes |
| `html` | Sanitized HTML if safe; else title/note |
| `flashcards` / `cloze` / `self_check` | Prefer existing `__print` static summaries; hide interactive controls |

## Out of scope

- Student print / shared print route  
- Landscape; margin/orientation UI  
- `print` metadata editing (`allow_split`, `keep_together`, `start_new_page`, `include`, variants)  
- Canvas ↔ preview cross-selection  
- QR codes, PDF server, watermarking  
- Polished media cards beyond minimal fallbacks  
- Changing student on-screen `question_set` (lines are print-only)

## Success criteria

1. Open a lesson in the teacher editor → A4 preview shows title + blocks on paper.  
2. Edit blocks → preview updates without full page reload.  
3. Print → browser print dialog; output matches preview closely (same renderer).  
4. Short-answer `response_space` produces visible answer lines on paper.  
5. Teacher-only blocks omitted; interactive controls not on paper.  
6. Unit tests cover print renderer defaults, visibility filter, and response lines.

## Testing

- Unit: `renderPrintLesson` structure, visibility filtering, `response_space` line counts, media fallback presence.  
- Manual: print a mixed lesson (text, image, question_set, video, tabs) from the editor.
