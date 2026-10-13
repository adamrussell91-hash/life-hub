# Alchemy Block Assistant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Ann contextual block suggestions and editable conversations in lesson and unit editors with bounded passive API usage.
**Architecture:** A shared authenticated block-analysis endpoint uses conditional blob writes for budgets, idempotency and cached assessments. A shared browser controller batches revisions while visible; editor controls open a focused review dialog and apply validated replacements through existing save paths.
**Tech Stack:** TypeScript DOM/Vite, Netlify functions, Netlify Blobs conditional writes, Anthropic Messages API, Node tests and Vitest.
**Spec:** ../specs/2026-10-13-alchemy-block-assistant-design.md

## Global Constraints
- Visible app only; no closed-app jobs. Passive: 6 attempts/hour, 24/day; 8,000 input tokens and 1,200 output tokens per attempt.
- 20s server total deadline; 23s browser deadline; one provider request per teacher; global passive spacing 3 minutes; editor quiet period 30 seconds; editor idle cutoff 5 minutes.
- Manual: 10 attempts/10 minutes and 100/day. Failed attempts count; bounded retries on later eligible slots only.
- Four blocks/batch, six evidence excerpts; conservative token reservation; conditional persistence must fail closed.
- Explicit acceptance, stale rejection, nested identities, undo; preserve media and unrelated content. Deleted means gone.
- Single-operator app authentication currently has no teacher account identity: use one installation-wide operator budget rather than session jti, so devices cannot multiply the cap.
- Work proceeds inline under approved scope; plan review is not a second permission gate.

## Review Focus
- Concurrent tabs/devices and expired leases cannot duplicate provider dispatch (Task 1).
- Timed-out calls must remain counted and late writes cannot replace newer results (Tasks 1–2).
- Large or Unicode input and malicious evidence stay bounded and cannot corrupt a block (Tasks 2–3).
- User types between suggestion generation and acceptance: reject stale edit (Task 3).
- Hidden app and route disposal stop passive work, while due-soon batches remain bounded (Task 4).

### Task 1: Durable attempt coordination
**Files:** netlify/functions/_shared/alchemy-budget.mjs; tests/unit/alchemy-budget.test.js
**Interfaces:** createAlchemyBudget(store, {now,timeZone}) produces reserve({key,mode}), finish(ticket,{result,error,usage}), and cached(key); each uses conditional strong writes.
- [ ] Write assertions for duplicate-key exclusion, global one-in-flight, six/hour, 24/day, failure counting, manual separation, expired leases, retry-after and token reservations.
- [ ] Run node --test tests/unit/alchemy-budget.test.js; expected failures for missing exports/behaviour.
- [ ] Implement atomic bounded counters/results, leases, cache, cooldown and breaker; daily reset uses Australia/Sydney.
- [ ] Run same command; expected PASS. Commit task.

### Task 2: Bounded contextual teaching API
**Files:** netlify/functions/alchemy-blocks.mjs; netlify/functions/_shared/alchemy-analysis.mjs; tests/integration/alchemy-blocks.test.js; netlify.toml; .env.example
**Interfaces:** POST /api/alchemy-blocks accepts {kind,id,blocks,mode,instruction?,previous?}; response {proposals,assessed,contextRevision,mode}. analyzeAlchemy consumes authoritative parent/unit, current selected block snapshots, Ann voice and live Knowledge excerpts; proposals include blockId, original, contextRevision, rationale, replacement and source IDs.
- [ ] Write endpoint tests for authentication, deleted parents, nested selection, missing configuration, cached no-suggestion, bounded batch/payload, invalid source/replacement output, hanging retrieval/provider, rate limiting and no duplicate dispatch.
- [ ] Run node --test tests/integration/alchemy-blocks.test.js; expected RED.
- [ ] Implement total abort deadline, conservative prompt bounds, live bounded retrieval, no-candidate short-circuit, configurable cheap model, durable reservation before provider dispatch and structured errors.
- [ ] Run endpoint and budget tests; expected PASS. Document model/provider limit configuration and commit.

### Task 3: Block controls and conversational acceptance
**Files:** apps/teaching/src/alchemy/block-assistant.ts; apps/teaching/src/alchemy/block-revision.ts; apps/teaching/src/teacher/lesson-canvas/mount-page.ts; apps/teaching/src/blocks/editors.ts; apps/teaching/src/blocks/render.ts; apps/teaching/src/styles/alchemy-assistant.css; apps/teaching/src/main.ts; apps/teaching/tests/unit/alchemy-assistant.test.ts
**Interfaces:** mountBlockAssistant({host,kind,id,getEntity,flush,apply}) returns open(blockId), changed(), dispose(); createAlchemyButton(blockId) dispatches scoped DOM events. Replacement validated by BlockSchema; content-only merge preserves metadata/IDs/media and container structure.
- [ ] Write tests for stable canonical revisions, nested lookup/apply, invalid replacement, stale rejection, accessible button, cached badge and chat refinement with retained proposal.
- [ ] Run Teaching Vitest for this file; expected RED.
- [ ] Implement Ann/beaker control on teacher previews and nested editors, dialog with sources, refinement/accept/dismiss, safe undo and inline errors, 44px docked actions at 390px.
- [ ] Run tests; expected PASS. Commit task.

### Task 4: Passive scheduling and lesson/unit integration
**Files:** apps/teaching/src/alchemy/passive-scheduler.ts; apps/teaching/src/alchemy/passive-app.ts; apps/teaching/src/teacher/lesson-editor.ts; apps/teaching/src/teacher/sections/units.ts; apps/teaching/scripts/mock-api.ts; apps/teaching/tests/unit/alchemy-passive.test.ts
**Interfaces:** PassiveScheduler accepts injected clock/activity/run; changed snapshots coalesce. App queue reads existing curriculum/schedule data and submits only bounded eligible saved revisions. Shared server budget enforces global limits across controllers.
- [ ] Fake-clock tests: 30s quiet, three-minute spacing, idle/hidden/offline/disposal pause, repeated unchanged reopen, four-block batch, failure cooldown and suppression after acceptance/dismissal; schedule timezone boundaries.
- [ ] Run Teaching Vitest for this file; expected RED.
- [ ] Wire lesson and unit controller lifecycle, latest snapshots, flush before manual requests, existing persistence + undo, due-soon visible-app queue and local mock route.
- [ ] Run all new tests; expected PASS. Commit task.

### Task 5: End-to-end verification and review
**Files:** outputs/alchemy-validation.md (user-facing record); docs/superpowers/plans/2026-10-13-alchemy-ledger.md
- [ ] Run root npm test, Teaching Vitest/typecheck/build and npm run pre-pr-check; preserve logs and report baseline failures by name.
- [ ] Use local browser with fixture lesson and unit to exercise button, source, refinement, acceptance, undo, passive badge and 390px docked controls. No production content writes.
- [ ] Dispatch whole-branch reviewer; fix material findings with regression tests and re-run affected checks.
- [ ] Export patch and concise validation report; ask only if publication is blocked or explicit external authorization is needed. Do not merge/deploy without authorization.
