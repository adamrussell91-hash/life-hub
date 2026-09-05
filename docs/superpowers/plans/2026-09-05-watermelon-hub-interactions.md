# Watermelon Hub Interactions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the approved Watermelon interaction patterns to the shared design kit (vanilla JS, tokens only) and wire them into Life, Teaching, Knowledge, and Tasks.

**Architecture:** New kit primitives live in `packages/design-kit/` as CSS + JS + `.d.ts` + snippets, mounted from `startHubMotion()` where markup-driven and called as APIs where imperative (toast, undo, command search). Hubs consume the same modules. No React, Tailwind, Framer Motion, or second morph/button system. Locked chrome (rail, sign-in, `.btn`, dates, morph APIs) stays untouched.

**Tech Stack:** Vanilla JS modules, closed design-kit tokens, node:test for kit unit tests, existing hub Vitest/node:test suites.

## Global Constraints

- Tokens only — nearest existing colour/type/space/radius; no new palette or Inter alternatives.
- Buttons remain `.btn` + `--primary` / `--secondary` / `--ghost` / `--decisive`.
- Display dates stay `dd/mm/yy` via `formatDisplayDate`.
- Agent writes still go through `.confirm-card`. Toast/undo are for user-initiated feedback, not a parallel proposal skin.
- Teaching/Knowledge/Tasks symlink `design-kit/` → `packages/design-kit`. Life loads kit CSS in `index.html` and caches it in `service-worker.js`.
- `startHubMotion()` stays the single mount entry. New auto-mounts go through its `scan()`.
- `prefers-reduced-motion: reduce` no-ops decorative motion.

---

### Already in kit (do not duplicate)

Adaptive slider, hub-compose (dump/schedule), card-swipe, time-grid, view-on-map, morphing closed-field popover, scroll-hide chrome.

---

### Task 1: Feedback — toast, copy confirm, timed undo

**Files:**
- Create: `packages/design-kit/hub-interactions.css`
- Create: `packages/design-kit/js/hub-feedback.js`
- Create: `packages/design-kit/js/hub-feedback.d.ts`
- Create: `packages/design-kit/snippets/hub-toast.html`
- Test: `tests/unit/hub-feedback.test.js`

**Interfaces:**
- Produces: `showHubToast(message, options?)`, `showCopyConfirm(trigger, text, options?)`, `offerTimedUndo(options)`, `resetHubFeedbackForTests()`

### Task 2: Contextual AI bar + agent select

**Files:**
- Create: `packages/design-kit/js/hub-ai-bar.js` + `.d.ts` + `snippets/hub-ai-bar.html`
- Modify: `hub-interactions.css`

**Interfaces:**
- Produces: `createContextualAiBar(options)`, `mountContextualAiBars(scope)`, `createSelectAiAgent(options)`, `mountSelectAiAgents(scope)`

### Task 3: Inline edit, chips, tags, create disclosure, capture

**Files:**
- Create: `packages/design-kit/js/hub-inline-edit.js` + `.d.ts`
- Create: `packages/design-kit/js/hub-create-disclosure.js` + `.d.ts`
- Create: `packages/design-kit/js/hub-capture.js` + `.d.ts`
- Create: matching snippets

**Interfaces:**
- Produces: `enhanceInlineEdit`, `createEditableChip`, `createTagList`, `createCreateDisclosure`, `createVoiceNote`, `createQuickPaste`, plus mount helpers

### Task 4: Command search + surfaces

**Files:**
- Create: `packages/design-kit/js/hub-command-search.js` + `.d.ts`
- Create: `packages/design-kit/js/hub-surfaces.js` + `.d.ts`
- Surfaces: pin list, schedule button, slot picker, event reminders, labeled progress, step indicator, run widget, task/activities/collection disclosure, scroll island, progressive input stack, journal nav, save toggle, status picker

### Task 5: Mount + load sheets

**Files:**
- Modify: `packages/design-kit/chrome.css`, `js/hub-motion.js`, `AGENTS.md`, `README.md`
- Modify: Life `index.html`, `service-worker.js`
- Modify: Teaching `src/design/tokens.css`
- Modify: Knowledge `src/tokens.css`

### Task 6: Wire hubs

- Knowledge `showToast` → `showHubToast`; compose + voice/paste; command search; archive pin; timeline journal nav
- Life toast/undo on logging; agent select class; AI bar on chat composer; run widget / progress / journal nav / activities
- Teaching command-search classes on existing palette; create disclosure; lesson inline title + save toggle; student scroll island; resources grid; trash undo + toast
- Tasks board complete undo + toast; status picker; pin; command search; task disclosure on overview tiles; create disclosure
