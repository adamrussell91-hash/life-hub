# Fitness Muscle Maps + Template Library

**Date:** 2026-08-07  
**Status:** Approved  
**Deploy rule:** Local commits only until Adam asks to push.  
**Product rule:** Life Hub never syncs with Notion — GitHub + chat only (standing rule, not a deferral).

## Problem

Fitness is chart- and text-heavy. Workouts and templates do not show *what* they train visually. Templates exist only in Chadwick’s chat prompt (`data/fitness/templates/`), so re-doing a known session means asking him rather than browsing.

Adam has muscle-group highlight images ready to use as visual cues.

## Goals (this slice)

1. Show **icon-strip muscle maps** on today’s session (hero / logger) from focus + exercise library inference.
2. Add a **horizontal scrollable template library** under the Fitness hero.
3. Tap a template → **detail sheet** (maps + exercises) with **Use today**.
4. **Use today** writes a `planned` workout via the existing confirm path (no LLM), then mounts the logger.

## Non-goals

- Full-body AI personality portraits (separate later idea)
- Collage / multi-region body tiles on cards
- In-tab template editing or deleting
- Notion sync of any kind
- Changing template upsert rules (still completed-session only)
- Replacing Chadwick chat planning — library is an additional redo path

## Decisions (locked)

| Topic | Choice |
|-------|--------|
| Scope | Library + muscle maps together |
| Card visual | Icon strip (one small highlight image per resolved focus) |
| Library placement | Below today’s hero; charts stay below |
| Template open | Detail sheet; separate **Use today** |
| Image resolution | Infer finer highlights from exercise library (`focus_areas` / `target_area`); coarse `focus[]` fallback |
| Data access | New authenticated templates API; keep templates out of dated event manifest |
| Use today | Client-built `planned` candidate → `/api/chat/confirm` |
| Portraits | Out of scope |

## Assets

- Source art: Adam’s muscle highlight PNGs (local Documents folder).
- Ship under `assets/fitness/muscles/` with stable kebab keys, e.g.:
  - `chest-whole`, `chest-upper`, `chest-lower`, `chest-inner`, `chest-traps`
  - `back-full`, `back-upper`, `back-lower`, `back-triceps`
  - `abs-full`, `abs-upper`, `abs-lower`, `abs-obliques`
  - `shoulders`, `arm-bicep`, `arm-forearm`
  - `thighs-front`, `thighs-back`, `glutes`, `calves`
- Optimize for UI (downscale for ~40–120px display). Precache via service worker with other shell assets.
- Missing file → omit that icon (never broken `<img>`).

## Mapping

Module: `js/app/muscle-maps.js` (pure, unit-tested).

**Inputs:** `focus: string[]`, `exercises: { name }[]`, optional exercise-library lookup table.

**Algorithm:**

1. For each exercise name, resolve library entry → collect `focus_areas` / `target_area` tokens.
2. Map tokens → muscle asset keys via a fixed dictionary (normalize case/spacing).
3. If none resolved, map each session/template `focus` string through a coarse dictionary (`chest`→`chest-whole`, `arms`→`arm-bicep`, `back`→`back-full`, `legs`→`thighs-front`, `shoulders`→`shoulders`, `core`→`abs-full`, …).
4. Dedupe preserving order; cap strip length (e.g. 4) for card density.

## API

Authenticated `GET /api/fitness/templates` (session cookie, same private cache posture as other APIs):

- Scan `data/fitness/templates/*.md` (reuse `workout-templates.mjs` parse helpers).
- Return JSON list of templates including: `title`, `path`, `session_kind`, `day_type`, `focus`, `source_session_date`, `exercises` (prescription needed for detail + Use today).
- Optionally embed a compact exercise-library highlight index in the same response **or** a sibling `GET` — prefer one round-trip if size stays reasonable.

No Notion; GitHub Contents/tree only.

## UI

**Hero / logger:** Icon strip above or beside focus pills for the resolved today’s session.

**Templates rail:** Section heading “Templates”; horizontal scroll of cards (icon strip + title + last actuals date). Empty: “Finish a workout and it’ll show up here.” Error: “Templates unavailable” + retry.

**Detail sheet:** Larger strip, focus pills, read-only exercise summary, **Use today**, dismiss.

## Use today behaviour

1. Build candidate: `type: workout`, `status: planned`, today’s Sydney date, fields from template (title, focus, day_type, session_kind, exercises).
2. Confirm with Chadwick slug via existing confirm API.
3. If a **different** planned session already exists for today → one prompt, then overwrite that plan.
4. If today already has a **completed** session → disable Use today: “Today’s already logged.”
5. Success → close sheet, `onRecordWritten` / force refresh, logger mounts on new plan.

## Testing

- Unit: muscle-maps resolution + fallbacks + cap/dedupe.
- Unit/integration: templates endpoint (mocked GitHub); planned candidate from template.
- Unit: Fitness model/render includes rail + maps for fixtures.
- Browser (optional light): rail visible with fixture/mocked templates.

## Follow-ons (explicitly later)

- Personality full-profile images in chat / agent picker
- Finer manual highlight tags on templates
- Vertical template browser / search
