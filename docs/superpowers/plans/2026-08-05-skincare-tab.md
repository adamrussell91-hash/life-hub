# Skincare Tab Implementation Plan

> **For agentic workers:** Execute task-by-task.

**Goal:** Ship a Skincare tab with preloaded AM/PM one-tap logging, note chips, extras, procedure card, and Hyaluronica chat.

**Architecture:** YAML routines config → skincare-model/render → direct chat confirm (hyaluronica). Mirror Nutrition/Fitness wiring in app-controller/main.

**Tech Stack:** Vanilla JS PWA, existing confirm API, node:test.

**Spec:** `docs/superpowers/specs/2026-08-05-skincare-tab-design.md`

---

## File map

| File | Role |
|------|------|
| `config/skincare-routines.yml` | AM/PM products, toggles, extras, note chips |
| `config/hyaluronica-protocol.md` | Short logging protocol |
| `js/app/skincare-routines.js` | Load/parse routines for client (or embed from sync) |
| `js/app/skincare-model.js` | Today’s AM/PM/other status from events |
| `js/app/skincare-log.js` | Build confirm payload from UI state |
| `js/app/render-skincare.js` | Dashboard UI |
| `js/app/skincare-controller.js` | Bind Done / procedure / chips; call confirm |
| `index.html` / `css/app.css` | Dashboard + styles |
| `app-controller.js` / `main.js` | Section wiring |
| Persona / chat.mjs / netlify.toml | Protocol inject + included_files |
| Tests + SW bump |

**Note:** Client cannot read YAML from disk; ship routines as `js/app/skincare-routines-data.js` generated from YAML **or** include routines JSON in sync from `config/`. Simplest v1: **`js/app/skincare-routines-data.js`** checked in mirroring the YAML (YAML is source of truth for humans; JS export for the client). Also load YAML server-side for Hyaluronica prompts if useful.

Actually simpler: put the data only in `js/app/skincare-routines-data.js` and a copy in `config/skincare-routines.yml` for docs — or just YAML in config and bake into a `.js` module by hand once. For v1 hand-maintain `skincare-routines-data.js` + yaml for agents.

Even simpler for Life Hub patterns: sync `config/skincare-routines.yml` like targets.yml via load-live-events. That needs repo-policy + parse. Prefer **static JS module** for v1 speed (routines rarely change) + yaml in config for Hyaluronica persona optional include.

Decision: **`config/skincare-routines.yml`** + **`js/app/skincare-routines-data.js`** (same content, client import). Server persona can read YAML via load helper like chadwick protocol.

---

### Tasks

1. Spec commit (done with this plan)
2. Routines YAML + JS data + hyaluronica protocol + persona wire
3. Model + log payload helpers + tests
4. Render + controller + HTML/CSS
5. App wiring + SW + status + tests + commit
