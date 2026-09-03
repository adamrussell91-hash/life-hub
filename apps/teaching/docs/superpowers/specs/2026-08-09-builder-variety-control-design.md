# Teaching Hub — Builder Variety & Control Design

**Date:** 2026-08-09  
**Status:** Approved for implementation (blanket user approval)  
**Slice:** First teaching-focused builder expansion (Notion-inspired, not a clone)

## Goal

Give teachers far more block variety and per-block control in the lesson builder, aligned with the Teaching Day Book block system and Notion-like expectations, without databases/synced blocks.

## Out of scope (this slice)

- Notion databases / linked views / kanban  
- Columns layout engine, synced blocks, buttons-with-actions  
- Equation/LaTeX, gallery, flashcards, cloze, charts, mind maps  
- Full WYSIWYG rich-text (keep HTML + add a small format toolbar)

## New block types

| Type | Content (v1) |
|------|----------------|
| `quote` | quote, attribution?, source?, reference? |
| `divider` | (none — decorative rule) |
| `definition` | term, definition |
| `code` | code, language? |
| `audio` | url, title? |
| `attachment` | url, title, filename? |
| `accordion` | items[{ title, body }] — toggle sections |
| `table` | headers: string[], rows: string[][] |
| `question_set` | title?, questions[{ id, prompt, kind: 'short_answer' \| 'multiple_choice', options?: string[] }] |

## Controls on every block

- Delete  
- Duplicate (new id)  
- Visibility (existing)  
- Move up/down (existing)  
- Image/video size variant select: `small` \| `medium` \| `large`  
- Rich text: toolbar buttons for bold, italic, bullet list, numbered list (wrap selection / insert HTML snippets)

## Add Block menu

Grouped labels: Basic / Media / Teaching (quote, definition, accordion, table, question set, code, divider).

## Acceptance

1. Teacher can insert all new types from Add Block  
2. Student view renders them safely (accordion expands; teacher_only filtered)  
3. Publish validates audio/attachment URLs and question prompts when present  
4. Delete/duplicate work without losing other block state  
5. Existing lessons with old block types still load  
