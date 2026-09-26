# Retire the Tasks Hub "Network" Tab (Network + Corey) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete the Tasks Hub "Network" sidebar group entirely — the Network (StressFlag inbox) page, the Corey (capacity share) page, and the now-empty "Network" nav section left behind — while writing the reusable parts of the concept into `docs/AGENT_CAPABILITY_STRATEGY.md` so they resurface when agent automation work actually starts.

**Why:** The Network page is a read-only inbox of AI-generated "flags" routed to Hammond / Penelope / Vera, but nothing downstream ever consumes those routes (`networkBriefing` in `domain/network-desk.ts` is dead code — nothing calls it outside its own test). Its rule-based detection duplicates `domain/pinch.ts`, which already renders the same signal on Dashboard/Calendar with real one-tap actions. Corey's capacity-share page is being retired at Adam's request — it's no longer needed. Removing both empties the "Network" sidebar group, so that group goes too.

**Important — do not break the live assistant:** `netlify/functions/_shared/tasks-stress.mjs` and `netlify/functions/_shared/tasks-capacity.mjs` (pure detection/calculation, no storage) are **also** imported by `netlify/functions/_shared/domain-retrieval.mjs` and `domain-analysis.mjs`, which feed `getTasksOpenLoops` in the general cross-hub assistant (`chat.mjs` → `agent-kernel.mjs` → `evidence-packs.mjs`). Those two files must **not** be deleted — only their now-dead, Network/Corey-only exports (see Task 4). The persisted StressFlag store (`tasks-network.mjs`, the Netlify functions `stress-flags.mjs` / `capacity.mjs`) is a separate, unrelated layer that only the Network/Corey UI ever read — confirmed dead: `chat.mjs` hardcodes `stressFlags: []` into the assistant's evidence pack and never reads the persisted store. That whole layer is safe to delete.

**Tech Stack:** Tasks Hub SPA (TypeScript/Vite/vitest, `apps/tasks`), Netlify Functions (`.mjs`, `node --test`, `netlify/functions`), root `tests/`.

**Branch:** work on the current branch; commit per task as usual.

**Commands**
- Root tests: `npm test` from repo root
- Tasks unit tests: `cd apps/tasks && npx vitest run`
- Tasks typecheck: `cd apps/tasks && npx tsc --noEmit -p .`

**Baseline:** record `npm test` exit code and the current `tsc --noEmit` error count in Task 0 before changing anything. Neither may regress by the end.

---

## Confirmed footprint (verified against the code, not assumed)

| Layer | Delete entirely | Keep (used elsewhere) |
|---|---|---|
| Netlify functions | `stress-flags.mjs`, `capacity.mjs`, `_shared/tasks-network.mjs` | `_shared/tasks-stress.mjs`, `_shared/tasks-capacity.mjs` (used by `domain-retrieval.mjs`/`domain-analysis.mjs` for the assistant's "open loops"/focus digest) — only trim their Network/Corey-only exports |
| Root tests | `tests/integration/tasks-network.test.js` (imports the two deleted handlers) | `tests/unit/tasks-network.test.js` — **trim**, don't delete (2 of its 3 tests exercise the kept pure detectors); `tests/unit/capacity-model.test.js` — **unrelated**, it tests `apps/life/js/app/capacity-model.js` (sleep/mood capacity), do not touch |
| Tasks Hub views | `apps/tasks/src/views/stress.ts`, `apps/tasks/src/views/corey.ts` | — |
| Tasks Hub domain | `domain/stress.ts`, `domain/network-desk.ts`, `domain/intuitive-scan.ts`, `ai/intuitive-judge.ts`, `domain/intuitive-digest.ts` (confirmed: these four import each other and nothing else touches them) | `domain/pinch.ts` (unrelated, already live), `domain/capacity.ts` — **trim only** (`buildDayCapacity`/`CapacityLevel`/`DayCapacity` stay, used by `views/calendar.ts`; `CapacitySnapshot`/`capacityHeadlines`/`buildCapacitySnapshot`/`toCoreyPublicView` go) |
| Tasks Hub schemas | `schemas/stress.ts`, `schemas/capacity.ts` | — |
| Chat | Penelope + Vera entries in `chat/agents.ts` (their only reason to exist is StressFlag texture — no other file references the `'penelope'`/`'vera'` slugs); `clare-tools.ts`'s `list_inbox` tool + `AGENT_LIST_INBOX_TOOL`; the `list_inbox` line in `ai/clare-proposal-judge.ts`; `DEFAULT_PENELOPE_PROTOCOL`/`DEFAULT_VERA_PROTOCOL` and the Network-only parts of `DEFAULT_HAMMOND_PROTOCOL` in `domain/defaults/agent-protocols.ts` | Hammond's `CHAT_AGENTS` entry itself — **keep**, `apps/tasks/src/views/hammond-goal.ts` uses `agentBySlug('hammond').avatarSrc` for the (unrelated, actively developed) Goals feature. Strip Hammond's `protocols`/`inboxName` fields that only make sense with a StressFlag inbox; leave name/colour/accent/avatar/placeholder/waitLines. |
| Nav | `network` section, `stress`/`corey` route ids, their icons in `shell.ts` + `shell/icons.ts` | — |
| Styles | `.stress-*`, `.capacity-share`, `.capacity-hero`, `.capacity-grid`, `.capacity-day*`, `.capacity-public__*` in `styles/views.css` | `.calendar-meta .hub-calendar__capacity` — unrelated calendar rule, keep |

---

## Task 1: Preserve the reusable concept before deleting anything

**Files:**
- Modify: `docs/AGENT_CAPABILITY_STRATEGY.md` (append a new section; this doc's own status line already says it is "adopted as the implementation reference for agent capability work" — this is where future automation work will look)

- [ ] **Step 1: Record the commit that still has the full feature**

Before deleting, run and note the output somewhere in your task log (not in the doc):

```bash
git log -1 --format=%H -- apps/tasks/src/views/stress.ts
```

You'll reference this SHA in the doc so the original UI/behavior can be pulled back up (`git show <sha>:apps/tasks/src/views/stress.ts`) if it's ever worth resurrecting instead of rebuilding from scratch.

- [ ] **Step 2: Append this section to the end of `docs/AGENT_CAPABILITY_STRATEGY.md`**

```markdown
## Retired: Tasks Hub Network / Corey pages (2026-09-26)

The Tasks Hub had a "Network" sidebar group — a StressFlag inbox page and a
Corey capacity-share page — built ahead of any agent automation actually
consuming it. Removed because: its rule-based detection duplicated
`apps/tasks/src/domain/pinch.ts` (which is live, actionable, and rendered on
Dashboard/Calendar), and its cross-agent routing had no consumer —
`networkBriefing` in `domain/network-desk.ts` was never called outside its
own unit test. Full history: `git show <SHA_FROM_STEP_1>:apps/tasks/src/views/stress.ts`.

**What's worth reusing when agent automation is actually built:**

1. **The StressFlag shape** — a typed event a source agent raises with a
   specific, textured description (not "things are busy") and a
   `routed_to` list of downstream agents:
   ```ts
   type StressFlag = {
     id: string;
     source_project_or_task_id: string | null;
     pattern_description: string;   // specific, e.g. "Ethics Olympiad and
                                     // Da Vinci Decathlon overlapping in the
                                     // same fortnight"
     pattern_kind: 'overlapping_excursions' | 'dense_pinch' | 'missed_deadlines' | 'intuitive';
     raised_by: string;             // e.g. "Clare DeMind"
     routed_to: string[];           // e.g. ["General Hammond", "Penelope Rose Quillian", "Dr Vera Lenz"]
     recurrence_note: string | null;
     fingerprint: string;           // de-dupe key
     created_at: string;
   };
   ```
   Reuse this shape for any future typed event bus between agents rather than
   inventing a new one — it was designed against spec §5.8 of
   `apps/tasks/docs/specs/task-project-manager-hub-spec.md`.

2. **The routing idea (Clare → Hammond → Penelope → Vera) was directionally
   right, but a shared read-only inbox page was the wrong destination.**
   When each of those agents has a real home to write into — Hammond's
   year-on-year trend board, Penelope's diary, Vera's mental-health log —
   route flags there directly instead of building a shared inbox page again.
   Don't resurrect the inbox page pattern.

3. **The detection math already lives on and is already reused** —
   don't reimplement it. `netlify/functions/_shared/tasks-stress.mjs`
   (`detectOverlappingExcursions`, `detectDensePinches`,
   `detectMissedDeadlines`) and `_shared/tasks-capacity.mjs`
   (`buildCapacitySnapshot`) are still live, called from
   `domain-retrieval.mjs`/`domain-analysis.mjs` for the assistant's
   "open loops" / focus digest. Any future automation that needs to know
   about pinch points or overlapping excursions should call these, not
   duplicate them.

4. **The Corey capacity-share pattern is worth keeping as a pattern, not as
   code:** a rotating public token backing a redacted view (`toCoreyPublicView`
   stripped task titles, kept only day-level busy/free labels). If a future
   feature needs to share a read-only, redacted view of Life Hub state with
   someone outside the system, this token-rotation approach
   (`ensure_share` / `rotate_share` actions, `meta/capacity_share` blob key)
   is the reference implementation to crib from — see the commit in Step 1.
```

- [ ] **Step 2: Commit**

```bash
git add docs/AGENT_CAPABILITY_STRATEGY.md
git commit -m "$(cat <<'EOF'
docs: preserve StressFlag/Corey-share concepts before retiring Network tab

EOF
)"
```

---

## Task 2: Verify the ambiguous shared pieces before touching them

These four checks protect features this plan is *not* supposed to touch. Run them and confirm the expected result before Task 3 onward.

- [ ] **Step 1: Confirm `networkBriefing` really is unwired**

```bash
grep -rn "networkBriefing" apps/tasks/src apps/tasks/tests
```
Expected: only `domain/network-desk.ts` (definition) and `tests/unit/network-desk.test.ts`. If anything else shows up (e.g. `chat/clare-controller.ts`), stop and re-scope Task 5 — something got wired to it since this plan was written.

- [ ] **Step 2: Confirm Penelope/Vera chat slugs have no other caller**

```bash
grep -rn "'penelope'\|\"penelope\"\|'vera'\|\"vera\"" apps/tasks/src --include=*.ts
```
Expected matches only in `chat/agents.ts`, `domain/network-desk.ts`, `views/stress.ts`, `domain/defaults/agent-protocols.ts`, `domain/agent-protocol.ts`, `domain/clare-tools.ts` (a display-name lookup). If a goal/dashboard/other view references `'penelope'` or `'vera'` directly, keep that agent's `CHAT_AGENTS` entry and only strip its Network-specific protocols (same treatment as Hammond below).

- [ ] **Step 3: Confirm Hammond's `CHAT_AGENTS` entry is still needed**

```bash
grep -rn "chat/agents" apps/tasks/src/views/hammond-goal.ts
```
Expected: `agentBySlug('hammond').avatarSrc` only. Keep the `hammond` entry in `CHAT_AGENTS` (name/colour/accent/avatar/placeholder/waitLines); only its `protocols` array and `inboxName` field are Network-specific and get stripped in Task 5.

- [ ] **Step 4: Confirm `tasks-stress.mjs` / `tasks-capacity.mjs` are still imported by the assistant**

```bash
grep -rn "tasks-stress.mjs\|tasks-capacity.mjs" netlify/functions --include=*.mjs
```
Expected: `_shared/tasks-network.mjs` (being deleted), `_shared/domain-retrieval.mjs`, `_shared/domain-analysis.mjs` (both staying). Do not delete either file in Task 4 — only remove the dead exports named there.

---

## Task 3: Remove the "Network" nav section

**Files:**
- Modify: `apps/tasks/src/shell/shell.ts`
- Modify: `apps/tasks/src/shell/icons.ts`

- [ ] **Step 1:** In `shell.ts`, delete the nav group:
```ts
{
  id: 'network',
  title: 'Network',
  items: [
    { id: 'stress', label: 'Network', href: '#/stress' },
    { id: 'corey', label: 'Corey', href: '#/corey' }
  ]
}
```
Remove `'stress'` and `'corey'` from the route-id union (~line 59-60) and from wherever `#/stress`, `#/corey`, and `#/capacity/:token` (the public Corey share route, ~line 768) are parsed/mounted.

- [ ] **Step 2:** In `shell/icons.ts`, delete the `stress` and `corey` icon path entries.

- [ ] **Step 3:** Run `cd apps/tasks && npx tsc --noEmit -p .` — expect new errors pointing at `views/stress.ts`/`views/corey.ts` no longer being reachable from `main.ts`; that's expected and gets fixed in Tasks 4–5.

- [ ] **Step 4: Commit**
```bash
git add apps/tasks/src/shell/shell.ts apps/tasks/src/shell/icons.ts
git commit -m "$(cat <<'EOF'
chore(tasks): remove Network nav section and stress/corey routes

EOF
)"
```

---

## Task 4: Delete the Network (StressFlag) page and its exclusive code

**Files to delete:**
- `apps/tasks/src/views/stress.ts`
- `apps/tasks/src/domain/stress.ts`
- `apps/tasks/src/domain/network-desk.ts`
- `apps/tasks/src/domain/intuitive-scan.ts`
- `apps/tasks/src/ai/intuitive-judge.ts`
- `apps/tasks/src/domain/intuitive-digest.ts`
- `apps/tasks/src/schemas/stress.ts`
- `apps/tasks/tests/unit/stress.test.ts`
- `apps/tasks/tests/unit/network-desk.test.ts`
- `apps/tasks/tests/unit/intuitive-scan.test.ts`
- `apps/tasks/tests/unit/intuitive-digest.test.ts`
- `apps/tasks/tests/unit/intuitive-judge.test.ts`
- `netlify/functions/stress-flags.mjs`
- `netlify/functions/_shared/tasks-network.mjs`
- `tests/integration/tasks-network.test.js`

**Files to trim (remove Network-only pieces, keep the rest):**

- [ ] **`apps/tasks/src/app/main.ts`** — remove the `renderStressView` mount/import.
- [ ] **`apps/tasks/src/services/client-api.ts`** — remove `listStressFlags`, `loadStressFlags`, `listAgentInbox`, `scanStressFlags`, `scanIntuitiveFlags`, `raiseStressFlag`.
- [ ] **`apps/tasks/src/services/types.ts`** — remove the matching interface methods and the `StressFlag` import.
- [ ] **`apps/tasks/src/services/store.ts`** — remove `listStressFlags`, `listAgentInbox`, `raiseStressFlag`, `scanAndRaiseStressFlags`, the intuitive-scan methods, the `StressFlagSchema`/`DEFAULT_STRESS_ROUTE`/`detectStressPatterns` imports, and the `stressFlagKey`/`stressFlagsIndexKey` entries from the `keys` type.
- [ ] **`apps/tasks/src/storage/keys.ts`** — remove `stressFlagKey`, `stressFlagsIndexKey`.
- [ ] **`apps/tasks/src/schemas/templates.ts`** — remove `'stress_flag'` from the `entity_type` enum (line ~88) only after confirming (`grep -rn "'stress_flag'" apps/tasks/src`) nothing else writes that entity type.
- [ ] **`apps/tasks/src/domain/clare-tools.ts`** — remove the `list_inbox` tool definition, `AGENT_LIST_INBOX_TOOL`, the `listInbox` option, and the `StressFlag` import. Keep the `penelope`/`vera` display-name helper only if Task 5 keeps those agents; otherwise remove those two lines too.
- [ ] **`apps/tasks/src/ai/clare-proposal-judge.ts`** — remove the `list_inbox` line from the tool-listing prompt text.
- [ ] **`apps/tasks/src/domain/defaults/agent-protocols.ts`** — delete `DEFAULT_PENELOPE_PROTOCOL`, `DEFAULT_VERA_PROTOCOL`, and their entries in the export map. Rewrite `DEFAULT_HAMMOND_PROTOCOL` to drop the "Network sitrep" / stress-network framing — Hammond's protocol text should no longer promise inbox behavior that no longer exists (check callers in `domain/agent-protocol.ts` for how this string is consumed before rewriting).
- [ ] **`apps/tasks/src/domain/agent-protocol.ts`** — if Task 5 removes `penelope`/`vera` as chat agents, remove them from the `SLUGS` set (line ~17); otherwise leave as-is.
- [ ] **`apps/tasks/src/styles/views.css`** — remove `.stress-scan-status`, `.stress-scan-actions`, `.stress-card`, `.stress-card__body` (lines ~4081-4118 as of this writing; confirm current line numbers before editing).
- [ ] **`apps/tasks/scripts/mock-api.ts`** — remove the dev-mode stub routes for `listAgentInbox`, `listStressFlags`, `scanAndRaiseStressFlags`, `raiseStressFlag`.

- [ ] **Step: run tests, fix fallout**
```bash
cd apps/tasks && npx vitest run
npx tsc --noEmit -p .
cd ../.. && npm test
```
Fix any import errors from the deletions above before moving on.

- [ ] **Step: Commit**
```bash
git add -A
git commit -m "$(cat <<'EOF'
feat(tasks): remove the Network StressFlag inbox page

EOF
)"
```

---

## Task 5: Delete the Corey (capacity share) page and its exclusive code

**Files to delete:**
- `apps/tasks/src/views/corey.ts`
- `apps/tasks/src/schemas/capacity.ts`
- `netlify/functions/capacity.mjs`

**Files to trim:**

- [ ] **`apps/tasks/src/app/main.ts`** — remove the `renderCoreyView` mount/import and the public `#/capacity/:token` route mount.
- [ ] **`apps/tasks/src/domain/capacity.ts`** — remove `CapacitySnapshot`, `capacityHeadlines`, `buildCapacitySnapshot`, `toCoreyPublicView`. Keep `CapacityLevel`, `DayCapacity`, `buildDayCapacity`, `levelFromLoad`, `effort` — `views/calendar.ts` imports `buildDayCapacity` directly and is unrelated to Corey.
- [ ] **`apps/tasks/src/services/client-api.ts`** — remove `getCapacity`, `ensureCapacityShare`, `rotateCapacityShare`, `getPublicCapacity`.
- [ ] **`apps/tasks/src/services/types.ts`** — remove the matching interface methods and the `CapacityShare`/`CapacitySnapshot` imports (keep `CapacityLevel` if still referenced elsewhere in this file).
- [ ] **`apps/tasks/src/services/store.ts`** — remove `getCapacitySnapshot`, `getCapacityShare`, `ensureCapacityShare`, `rotateCapacityShare`, `getPublicCapacityByToken`, the `CapacityShareSchema` import, and `capacityShareKey` from the `keys` type.
- [ ] **`apps/tasks/src/storage/keys.ts`** — remove `capacityShareKey`.
- [ ] **`apps/tasks/src/shell/shell.ts`** — remove the `/** Public Corey share: \`#/capacity/<token>\` */` route handling (~line 768) if not already removed in Task 3.
- [ ] **`apps/tasks/src/styles/views.css`** — remove `.capacity-share`, `.capacity-hero`, `.capacity-hero__line`, `.capacity-grid`, `.capacity-day`, `.capacity-day--*`, `.capacity-day__name`, `.capacity-day__level`, `.capacity-public__title`, `.capacity-public__note` (lines ~458, 488, 4118-4210 as of this writing — confirm current numbers). **Do not touch** `.calendar-meta .hub-calendar__capacity` (~3885, ~5401) — unrelated calendar rule.
- [ ] **`apps/tasks/scripts/mock-api.ts`** — remove the dev-mode stub routes for capacity/share.
- [ ] **`apps/tasks/tests/unit/capacity-closure.test.ts`** — remove only the `describe('capacity (Corey)', ...)` block and its now-unused `buildCapacitySnapshot`/`toCoreyPublicView` import. **Keep** the `describe('closure loop', ...)` block — unrelated ReviewLog logic, same file.
- [ ] **`netlify/functions/_shared/tasks-capacity.mjs`** — remove `toCoreyPublicView` only (confirmed sole caller was `tasks-network.mjs`, already deleted in Task 4). Keep `buildDayCapacity`, `capacityHeadlines`, `buildCapacitySnapshot` — still imported by `domain-retrieval.mjs`/`domain-analysis.mjs`.
- [ ] **`netlify/functions/_shared/tasks-stress.mjs`** — after confirming (`grep -rn "DEFAULT_STRESS_ROUTE\|agentSlug(" netlify/functions --include=*.mjs`) neither is imported anywhere but the now-deleted `tasks-network.mjs`, remove `DEFAULT_STRESS_ROUTE` and `agentSlug`. Keep `detectOverlappingExcursions`, `detectDensePinches`, `detectMissedDeadlines` (imported individually by `domain-retrieval.mjs`/`domain-analysis.mjs`); `detectStressPatterns` (the combined wrapper) is also now dead — remove it too if the same grep confirms no other caller.
- [ ] **`tests/unit/tasks-network.test.js`** — remove only the third test (`'public capacity view strips task titles and counts'`) and the now-unused `toCoreyPublicView` import; keep the first two tests (`detectOverlappingExcursions`, `detectMissedDeadlines` against the kept `tasks-stress.mjs`). Consider renaming this file to `tasks-stress.test.js` since it no longer tests anything Corey/network-specific — optional, do it if it's a one-line `git mv`.

- [ ] **Step: run tests, fix fallout**
```bash
cd apps/tasks && npx vitest run
npx tsc --noEmit -p .
cd ../.. && npm test
```

- [ ] **Step: Commit**
```bash
git add -A
git commit -m "$(cat <<'EOF'
feat(tasks): remove the Corey capacity-share page

EOF
)"
```

---

## Task 6: Chat roster cleanup (Hammond/Penelope/Vera)

Only proceed with Penelope/Vera removal if Task 2 Step 2 confirmed no other caller.

- [ ] **`apps/tasks/src/chat/agents.ts`** — delete the `penelope` and `vera` entries from `CHAT_AGENTS`. On Hammond's entry: remove `inboxName` and replace `protocols` with content that doesn't reference a StressFlag inbox (or leave empty if the chat picker degrades gracefully — check `chat/render-agent-picker.ts` renders an empty `canEyebrow`/`protocols` list without crashing before shipping this). Keep `name`/`colour`/`accent`/`avatarSrc`/`placeholder`/`waitLines` — `hammond-goal.ts` and the general chat picker still need Hammond as a selectable persona.
- [ ] Update the file's own top comment (currently: *"Tasks Hub chat roster — Clare plus the StressFlag network, portraits from the sibling hubs."*) to reflect the new roster.
- [ ] **`apps/tasks/tests/unit/clare-view.test.ts`** — run it; fix any assertions that assumed 4 agents or Penelope/Vera-specific copy.

- [ ] **Step: run tests, fix fallout, commit**
```bash
cd apps/tasks && npx vitest run
cd ../.. && npm test
git add -A
git commit -m "$(cat <<'EOF'
chore(tasks): drop Penelope/Vera chat agents, detach Hammond from StressFlag inbox

EOF
)"
```

---

## Task 7: Full verification

- [ ] `cd apps/tasks && npx tsc --noEmit -p .` — error count must not exceed the Task 0 baseline.
- [ ] `cd apps/tasks && npx vitest run` — all pass.
- [ ] `npm test` (repo root) — all pass, same or better than Task 0 baseline.
- [ ] `grep -rn "stress-flags\|/api/capacity\|StressFlag\|networkBriefing\|toCoreyPublicView\|CapacityShare" apps/tasks/src netlify/functions --include=*.ts --include=*.mjs` — should return nothing except inside `_shared/tasks-stress.mjs` / `_shared/tasks-capacity.mjs` (the kept pure modules) and their two still-live importers.
- [ ] Manually load the Tasks Hub locally: sidebar has no "Network" group, `#/stress`, `#/corey`, and `#/capacity/:token` all 404 cleanly (no broken layout), Dashboard/Calendar pinch strips still work, the goal page still shows Hammond's avatar, and chat still opens with Clare + Hammond only.

---

## Self-review (plan vs ask)

| Ask | Task |
|---|---|
| Pop what's worth keeping somewhere in the repo for future agent automation | Task 1 |
| Kill the Network (StressFlag) page | Task 4 |
| Kill the Corey page | Task 5 |
| Kill the resulting empty "Network" tab | Task 3 |
| Don't break the live cross-hub assistant's capacity/stress signal | Footprint table + Task 2 verification gates |
| Don't break the actively-developed Goals feature's use of Hammond | Task 2 Step 3, Task 6 |
