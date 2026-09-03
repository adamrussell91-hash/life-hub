# Teaching Hub — Search / Nav Acceleration Design

**Date:** 2026-08-11  
**Status:** Approved for implementation  
**Slice:** Search / nav acceleration (Phase 12 v1)  
**Parent roadmap:** `docs/BUILD.md` Next up; Phase 12 in `docs/specs/09_IMPLEMENTATION_PLAN.md`  
**Depends on:** Teacher auth, curriculum cache, create modal, lesson editor save/publish + A4 preview, router `/s/...` student paths  
**Not this slice:** Tags; curriculum outcomes; favourites/starring UI; student search; archive filters; dedicated search page; persistent server search index (may add later); AI

## Goal

Teachers can find Lessons, Units, Classes, and related teaching objects quickly via a **rail search control** and **⌘K / Ctrl+K**, including matches in block/body text, without leaving the current workflow.

## Locked decisions

| Topic | Choice |
|-------|--------|
| Surface | Full search panel (not titles-only quick switcher) |
| Entry | Rail search control + ⌘K / Ctrl+K → **same** panel |
| Audience | Teachers only; student routes unchanged |
| Index strategy | **Hybrid:** client title/metadata from curriculum; server content scan via `GET /api/search?q=` |
| Body corpus | Lesson `blocks[]`, unit plan `blocks[]`, composition `root` text |
| Titles/metadata corpus | Lessons, Units, Classes (title + code), Subjects, Years, Scope sequences + timeline note titles, Media (title / file name), Composition templates (title) |
| Empty state | Recent (localStorage) + common actions |
| Favourites | Deferred — no favourites storage exists yet |
| Tags / outcomes | Deferred — not in data model yet |
| Result layout | Flat ranked list with type badge, hierarchy breadcrumb, optional snippet |
| Visual | Centred Clinical Glass productivity panel — not a separate search app |

## Architecture

```
⌘K / rail ──► Search panel
                 │
                 ├─ q empty ──► Recent (localStorage) + Actions
                 │
                 └─ q typed ──► Client title hits (curriculum [+ compositions list])
                                      │
                                      └─ parallel GET /api/search?q=  (q length ≥ 2)
                                               │
                                               ▼
                                         Merge / rank → result rows
                                               │
                                               ▼
                                         navigate / run action → close
```

### Client modules

- `src/teacher/search/` — panel UI, keyboard nav, debounce, merge/rank, recent store, action registry
- Wire from `src/app/main.ts` + teacher rail (search trigger near primary nav)
- Record recent on successful teacher navigations to Lesson / Unit / Class
- Shared plain-text extractor over block trees (for server and any client helpers)

### API

- `GET /api/search?q=` — teacher auth required
- Min query length: 2 characters (shorter → empty content hits / 400 with clear message — prefer empty hits so UI stays quiet)
- Scans canonical Blobs (or mock store) for lesson, unit, and composition documents; extracts searchable text from blocks; returns typed hits with snippets
- v1: **on-demand scan** of canonical records (derived index later if needed; rebuildable from source)
- Mock parity in `scripts/mock-api.ts`

### Query flow

1. Debounce ~150ms while typing
2. Instant client title/metadata matches from current curriculum (+ compositions list if not already loaded)
3. When `q.length ≥ 2`, fire content search in parallel
4. Merge by `type + id`: client supplies title/hierarchy; server attaches `snippet` when the match is in body text
5. While server pending, keep showing title hits; subtle “Searching content…” status
6. Cap visible results (~20–30)

### Ranking (deterministic)

1. Title match  
2. Class code match  
3. Hierarchy label match (year / subject / unit names in breadcrumb fields)  
4. Body / snippet match  
5. Alphabetical by title within the same band  

Prefer a **flat** keyboard-friendly list over type-grouped sections.

## UI

### Panel

- Centred Glass modal: search input, then sections/list below
- Open: rail control or ⌘K / Ctrl+K (ignore shortcut when focus is in a text field that needs the letter, **except** we still honor the chord with meta/ctrl — standard command-palette behaviour)
- Close: Escape, backdrop click, or successful navigate/action
- Keyboard: ↑↓ select, Enter activate, Esc close

### Result row

- Title  
- Object type badge (Lesson, Unit, Class, Subject, Year, Scope, Note, Resource, Template, Action)  
- Hierarchy breadcrumb where applicable (e.g. Year → Subject → Unit)  
- Optional excerpt when match came from body text  

### Empty state

**Recent** (`localStorage` key e.g. `teaching-hub.recent`):

- Shape: `{ type, id, title, opened_at }[]`
- Push on navigate to teacher Lesson / Unit / Class; dedupe by type+id; newest first; cap ~10
- Corrupt/unavailable storage → empty list (silent)

**Actions** (shown under Recent when query empty; also appear in filtered results when the action label matches `q`):

| Action | Behaviour | Visibility |
|--------|-----------|------------|
| New Lesson / Unit / Class / Scope & Sequence | Existing create modal | Always |
| Open Home | `navigate('/')` | Always |
| Open Today’s class | Navigate to scheduled “today” class if resolvable from curriculum + schedule anchor; else omit | Only when resolvable |
| Open Student View | Open matching `/s/...` path | Only on lesson / unit / class teacher routes with a counterpart |
| Open A4 Preview | Trigger existing A4 preview | Only when lesson editor active |
| Publish Lesson | Existing publish path | Only when lesson editor active |

No favourites section until storage exists.

### Rail

- Always-visible search control near primary nav that opens the same panel (may pre-focus input; optional: mirror typed characters if we use an inline field that expands into the panel — either is fine as long as one panel owns results)

## Errors & edge cases

| Case | Behaviour |
|------|-----------|
| Content API fails | Keep client title results; one-line “Content search unavailable” |
| No title or content hits | “No matches” |
| Short query (`q` length 1) | Client title filter only; no content request |
| Unauthenticated | API 401; panel should not be reachable on signed-out routes |
| Duplicate title hits | Disambiguate via hierarchy breadcrumb |

## Testing

- **Unit:** recent store (dedupe, cap, corrupt JSON); rank/merge; block text extract; action visibility rules; keyboard selection helpers
- **API / mock:** `/api/search` finds block text; short `q`; auth required
- **UI (light):** open/close via shortcut and rail; activate result navigates

## Exit criteria

- Teacher can open search from rail and ⌘K / Ctrl+K
- Title search works offline against loaded curriculum
- Block-text matches appear with snippets for lessons (and units/compositions when bodies exist)
- Empty state shows recent + actions; recent updates after navigation
- Context actions (student view / A4 / publish) only when applicable
- Favourites, tags, outcomes still absent by design

## Spec self-review notes

- No TBD placeholders; tags/outcomes/favourites explicitly deferred  
- Hybrid paths (client vs server) and merge rules are explicit  
- Scope notes: title-only (timeline notes have no body field)  
- Media: title / file name only (no text body)  
- Single implementation-plan-sized slice  
