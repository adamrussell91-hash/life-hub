# Teaching Hub — Class Page Clinical Glass Refresh Design

**Date:** 2026-08-10  
**Status:** Implemented  
**Product name:** Teaching Hub  
**Slice:** Create refresh + covers + class page redesign + unit plan blocks  
**Parent roadmap:** `docs/BUILD.md` (product polish between block expansion and A4 print)  
**Not this slice:** Sidebar CTAs (1-1 / Study Hub / Homework / Assessments), Drive uploads, Notion aesthetic rewrite, new design tokens

## Goal

Teachers get a hybrid Clinical Glass class page (cover banner, announcements first, gallery unit cards), reliable create→list refresh, covers on class/unit/lesson, and a real unit plan page (overview blocks + lesson list) with matching student views.

## Locked decisions

- **Scope:** Full package in one pass
- **Visual:** Clinical Glass shell/tokens; screenshot-inspired cover banners + gallery cards; denser hierarchy (not a Notion white redesign)
- **Units:** Overview `blocks[]` + existing lesson list below
- **Covers:** URL paste + pick from image media library
- **Sidebar extras:** Out of scope — layout vibe only

## Data model

Shared optional cover on class, unit, and lesson:

```ts
{ url?: string; media_id?: string; alt_text?: string }
```

Display URL resolves `media_id` → media preview/thumbnail/download, else `url`. HTTP(S) validated via existing URL safety helpers. Cover may be cleared with `null` on PATCH.

Units gain optional `blocks[]` for the plan overview (default `[]` on read).

## Surfaces

| Surface | Teacher | Student |
|---------|---------|---------|
| Class page | Cover picker, announcements pinned first, schedule, unit gallery cards, remaining homepage regions | Same hierarchy; no edit controls |
| Unit page | Cover + plan block editor + lesson list | Cover + filtered overview blocks + lessons |
| Lesson editor | Cover picker in chrome (not a content block) | Published lesson may carry cover for index thumbs |
| Indexes | Cover thumbnails on class/unit tiles when set | — |

## Create refresh

Centralize curriculum cache invalidation. After successful create: invalidate → refetch → remount teacher chrome with fresh curriculum → navigate to the new entity. Never bail on a stale render token after a successful create.

## Out of scope

- Fake Homework / Assessments / Book 1-1 / Study Hub features
- File upload beyond URL + existing media library
- Full Notion aesthetic or token rewrite
- Month/Timeline Home work

## Success criteria

- Create class/unit/lesson → appears in rail/indexes without hard reload
- Set/clear/library-pick cover on class, unit, lesson; students see covers
- Announcements always first content region on class page
- Unit overview blocks save/reload; lessons still listed below
