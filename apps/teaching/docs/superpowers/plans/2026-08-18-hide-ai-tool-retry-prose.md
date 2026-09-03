# Hide AI Tool Retry Prose Implementation Plan

> **For agentic workers:** Implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep valid Ann/Hammond proposals, but never persist Anthropic retry apologies such as `Oops — response_space only accepts…` as teacher-visible chat text.

**Architecture:** `completeFastAgentJob` already rejects invalid tool calls and asks Anthropic to try again. The bug is that every streamed `text` fragment is concatenated into `job.response`, including the next-round apology. Track whether any tool call was rejected. If a later valid proposal is persisted, drop the accumulated prose so the UI falls back to the existing teacher-safe copy.

**Tech Stack:** TypeScript, Vitest, Netlify Functions, existing Anthropic SSE mock in `tests/unit/ai-job-complete.test.ts`.

---

### Task 1: Reproduce the leak

**Files:**
- Modify: `tests/unit/ai-job-complete.test.ts`

- [ ] **Step 1: Write the failing test**

Add a fast-agent test that:
1. First Anthropic round returns `propose_insert_blocks` with `response_space: "paragraph"`.
2. Second round streams `Oops — response_space only accepts none | short | medium | long | extended. Let me fix that and resubmit.` then a valid `question_set` proposal.
3. Assert `status: "done"`, proposal present, and `response` does not contain `Oops` or `response_space only accepts`.

- [ ] **Step 2: Run it and confirm it fails because the apology is persisted**

```bash
npx vitest run tests/unit/ai-job-complete.test.ts
```

### Task 2: Drop retry prose when a proposal succeeds

**Files:**
- Modify: `netlify/functions/_shared/ai-job-complete.mts`

- [ ] **Step 1: Implement the minimal fix**

When `executeTools` returns a tool error JSON string, set a `toolRetry` flag. On successful persist of a proposal, set `response` to `undefined` if that flag is true.

- [ ] **Step 2: Re-run the targeted test, then the full suite and build**

```bash
npx vitest run tests/unit/ai-job-complete.test.ts
npm test
npm run build
```
