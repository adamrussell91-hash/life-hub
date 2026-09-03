# MindWorks Maps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a working Maps rail tab in Tasks Hub: vertical tube diagrams, MindWorks 2026 seeded, edit/view/export.

**Architecture:** Map JSON in Netlify Blobs via `TasksStore`. Domain helpers own orthogonal paths, crossings, tick attach, seed layout, and HTML export. The view renders SVG (filled capsules, ticks, tunnels) with hub chrome.

**Tech Stack:** Vite + TypeScript, Zod, Vitest, existing Netlify Functions + Blobs, hub design kit tokens.

---

## Files

- Create: `src/schemas/map.ts` — Zod map / line / station / tick
- Create: `src/domain/maps.ts` — orthogonal, crossings, attach, current-year pick, export, capsule geometry
- Create: `src/domain/maps-seed.ts` — MindWorks 2026 layout
- Create: `src/views/maps.ts` — rail page
- Create: `netlify/functions/maps.mts` — `/api/maps`
- Create: `tests/unit/maps.test.ts`
- Modify: `src/storage/keys.ts`, `src/services/types.ts`, `src/services/store.ts`, `src/services/client-api.ts`, `scripts/mock-api.ts`, `src/shell/shell.ts`, `src/app/main.ts`, `src/styles/views.css`

### Task 1: Schema + domain + tests

- [x] Spec written
- [ ] Failing tests in `tests/unit/maps.test.ts`
- [ ] Implement schema and domain until tests pass

### Task 2: Store + API

- [ ] `listMaps` / `getMap` / `createMap` / `updateMap` / `deleteMap`
- [ ] If maps index is empty, seed MindWorks 2026 even on already-seeded stores
- [ ] Mock API + Netlify function

### Task 3: UI

- [ ] `#/maps` rail item
- [ ] Renderer: vertical lines, filled capsules (in/out, no through-stroke), ticks off line or capsule, tunnels, zoom
- [ ] Edit / view / drawer / confirm delete / export download

### Task 4: Verify

- [ ] `npm test` and `npx tsc -p tsconfig.json --noEmit`
- [ ] Commit and push
