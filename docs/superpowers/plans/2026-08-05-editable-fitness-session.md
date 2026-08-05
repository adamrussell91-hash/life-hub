# Editable Fitness Session (Core Logger) Implementation Plan

> **For agentic workers:** Execute task-by-task. Checkbox steps for tracking.

**Goal:** When today’s Fitness hero is `planned`, show a StrengthLog-style editable logger with local-first debounced autosave and a finish button that writes `completed` via `/api/chat/confirm`.

**Architecture:** Pure draft helpers + logger controller; reuse `chatApi.confirm` with overwrite. Fitness model attaches `path` + `notes` from events. Read-only hero remains for `completed`.

**Tech Stack:** Vanilla JS PWA, Netlify confirm API, `localStorage`, node:test.

**Spec:** `docs/superpowers/specs/2026-08-05-editable-fitness-session-design.md`

**Deploy:** Local commits only; no push unless asked.

---

## File map

| File | Responsibility |
|------|----------------|
| `js/app/fitness-model.js` | Hero includes `path` + `notes` from event |
| `js/app/fitness-logger-draft.js` | Clone draft, localStorage, candidate/slug, dirty, finish label |
| `js/app/render-fitness-logger.js` | DOM for timer / exercises / sets / notes / finish |
| `js/app/fitness-logger-controller.js` | Bind inputs, debounce autosave, finish, visibility flush |
| `js/app/render-fitness.js` | Toggle logger vs read-only hero |
| `js/app/app-controller.js` / `main.js` | Wire controller + chatApi |
| `index.html` / `css/app.css` | Logger mount + styles |
| `service-worker.js` | Cache bump |
| Tests | draft + model + controller basics |

---

### Task 1: Hero path + notes

- [ ] Update `buildFitnessModel` so `heroSession` carries `path` and `notes` (from `event.body`)
- [ ] Unit tests
- [ ] Commit

### Task 2: Draft helpers

- [ ] `fitness-logger-draft.js`: cloneSession, storage key, load/save/clear, `toConfirmPayload`, `finishLabel`, `draftsEqual`
- [ ] Unit tests
- [ ] Commit

### Task 3: Logger UI + controller

- [ ] Markup `#fitness-logger` in `index.html`
- [ ] `render-fitness-logger.js` + CSS
- [ ] Controller: mount planned only; 45s debounce + visibility; finish → completed
- [ ] Wire `renderFitness` + app-controller / main
- [ ] Tests for finish label / payload
- [ ] SW bump, IMPLEMENTATION_STATUS, commit

### Task 4: Verify

- [ ] `npm test`
- [ ] No push
