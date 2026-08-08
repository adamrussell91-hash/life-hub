# Workout Timer Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fitness logger opens idle with Start / Pause / Complete controls; Finish stays the save path.

**Architecture:** In-memory timer state machine in `fitness-logger-controller.js` (`idle → running ⇄ paused → completed`, undo → paused). Elapsed = accumulated running segments only. Render layer draws the control row under the header timer.

**Tech Stack:** Vanilla ES modules, node:test, existing fitness logger draft/render patterns.

**Spec:** `docs/superpowers/specs/2026-08-08-workout-timer-controls-design.md`

---

### Task 1: Failing controller tests for idle mount + state machine

**Files:**
- Modify: `tests/unit/fitness-logger-controller.test.js`

- [x] Write tests: mount stays idle (no interval / elapsed 0); Start→tick; Pause freezes across wall gap; Resume continues; Complete hidden until Start then works; Undo → paused; Finish still confirms
- [x] Run tests — expect FAIL
- [x] Implement controller + render + CSS until PASS
- [x] Bump service-worker cache; `npm run build`

### Task 2: Verify

- [x] `node --test tests/unit/fitness-logger-controller.test.js tests/unit/fitness-logger-draft.test.js`
- [ ] Manual: planned/template opens at 0:00 until Start
