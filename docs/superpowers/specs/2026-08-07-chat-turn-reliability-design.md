# Chat Turn Reliability (All Agents)

**Date:** 2026-08-07  
**Status:** Approved  
**Deploy rule:** Local commits only until Adam asks to push.  
**Slice:** Chat reliability first from the 2026-08-07 feedback dump (approach 1 — defense in depth).

## Problem

1. **Brisket (and any agent using `web_search`)** shows a 🔍 search chip, then goes quiet until Adam re-prompts. Observed: search chip → silence (no macros, no Confirm card).
2. **Chadwick (and others)** show “On it…” for ~20s, then the bubble disappears with **no error banner** and no reply. Re-prompt repeats the same pattern.
3. Prior fixes continued client tools (`save_food_library_entry`, `save_exercise_library_entry`) but did **not** handle Anthropic **server-tool** turns (`web_search` / `pause_turn`). The client also treats an empty successful stream as success and clears the working bubble.

This must work for **every personality**, not Chadwick- or Brisket-only nudges.

## Out of scope (queued)

- Chat hero crowding / Confirm button press feedback (UI slice B)
- Nutrition charts, macro-split advice slot, heatmap (slice C)
- Sodium / food-library prompt accuracy (slice D)
- Invalid Notion import event files (`invalid_event`)
- Auto-skip Confirm; raising Netlify function timeout as the primary fix
- Rewriting persona protocols except where a one-line reliability note is required

## Decisions

### 1. Anthropic loop — continue server-tool and client-tool turns correctly

Adam choice: approach **1** (defense in depth).

In `netlify/functions/_shared/anthropic-client.mjs`:

1. **Accumulate** assistant content blocks from the stream: `text`, `tool_use`, `server_tool_use`, and server result blocks (e.g. `web_search_tool_result`) in order, with enough fidelity to re-send.
2. Capture **`stop_reason`** from streaming `message_delta` (or equivalent final event). Today only `message_stop` → `{ type: 'done' }` is observed; that is insufficient.
3. **`pause_turn`:** append the assistant message content **as-is** to `messages` and request again with the **same tools**. Cap pause continuations (e.g. **3**) so a stuck server loop cannot run forever.
4. **`tool_use` (client tools):** keep `executeTools` → `tool_result` continuation, but rebuild the assistant message from the **full accumulated content** (not only client `tool_use` blocks), so mixed `web_search` + `save_*` rounds do not drop server blocks.
5. Raise **`MAX_TOOL_ROUNDS`** from **3 → 6** so a realistic path (search → save library → `log_entry` / narration) can finish in one user message.
6. Keep yielding existing client events (`text`, `tool_call`, `search`, `done`) so `chat.mjs` / UI stay compatible.

If `pause_turn` re-submit hits known API 400 edge cases (unpaired `server_tool_use`), fall back once by continuing without the unpaired trailing server block **or** by a controlled retry documented in tests — prefer the Anthropic-documented as-is path first; document the fallback if tests against mocks require it.

### 2. Client safety net — never silent empty turns

In `js/app/chat-controller.js` (all agents):

1. Track whether the turn produced **useful output**: assistant text, `record_proposal`, `record_rejected`, or a hard `error` event.
2. Status chips alone (`search`, `food_library_saved`, `exercise_library_saved`) do **not** count as a finished reply.
3. When the stream ends cleanly but useful output is missing: **do not** leave a blank thread. Replace/clear the working bubble with a durable assistant message, e.g.  
   **“I didn’t finish that reply — send again and I’ll pick it up.”**  
   (Exact copy may be tightened; must be visible and not ephemeral-only.)
4. Keep existing 90s abort → “That search took too long…” behaviour.
5. Keep existing `error` → “Chat is unavailable right now…” behaviour.
6. Broaden the library-save nudge: if a turn ends after `food_library_saved` or `exercise_library_saved` with no proposal and no text, the empty-turn message above covers it (persona-agnostic). Chadwick-specific nudge may remain as a secondary line only if it still helps; primary guarantee is the empty-turn rule.

### 3. Early stream heartbeat

In `netlify/functions/chat.mjs`:

1. Open the SSE response and send `{ type: 'agent', slug }` **before** finishing all GitHub blob loads **or** send a lightweight `{ type: 'status', text: '…' }` / reuse agent event as soon as routing is known — whichever is simpler without restructuring the whole handler.
2. Goal: Adam should not stare at a frozen “On it…” with zero stream activity while the function loads context; at minimum the stream should start and the client can keep or refresh working status when the first event arrives.
3. If moving GitHub loads after the first enqueue is too invasive for this slice, minimum bar: ensure empty/error paths always emit an `error` or the client safety net (§2) fires. Prefer early enqueue if a small patch can do it safely.

### 4. Approach summary

| Layer | Change |
|-------|--------|
| Server Anthropic client | `pause_turn` + full-content client-tool continuation; MAX_TOOL_ROUNDS 6 |
| Chat handler | Early SSE heartbeat if cheap; always close with done/error |
| Chat controller | Empty-turn recovery message for every agent |

No full chat rewrite. No Confirm / hero / nutrition work in this slice.

## Files (expected)

- `netlify/functions/_shared/anthropic-client.mjs` — stop_reason, content accumulation, pause_turn loop, full assistant replay, MAX_TOOL_ROUNDS
- `netlify/functions/chat.mjs` — early stream heartbeat if in scope
- `js/app/chat-controller.js` — empty-turn detection + durable recovery message; optional nudge cleanup
- `tests/unit/anthropic-client.test.js` — pause_turn continuation; mixed server+client tool replay; round cap
- `tests/unit/chat-controller.test.js` — empty stream → recovery message; search-only → recovery; text/proposal → no recovery
- `tests/integration/chat-function.test.js` — update if executeTools / stream contract changes
- `service-worker.js` — bump if client shell files change

## Success criteria

- A Brisket (or any agent) turn that runs `web_search` continues and produces text and/or a Confirm card in the **same** user turn without re-prompting, under normal conditions.
- A turn that still fails after continuations **never** ends as a vanished “On it…” with a blank thread — user always sees either a reply, a proposal, a known error, or the recovery message.
- Behaviour is **persona-agnostic** (not Chadwick-only / Brisket-only).
- Unit tests cover pause_turn continuation and empty-turn UI; existing chat tests still pass.
- Local commits only until Adam asks to push.

## Queued after this slice

1. Chat UI (hero crowding, Confirm press feedback)  
2. Nutrition panel redesign (charts, advice slot, heatmap)  
3. Food accuracy (sodium in library prompt / required fields)  
4. Notion import schema repair (`time`, empty exercises, bad paths)
